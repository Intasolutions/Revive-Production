from django.db import transaction
from rest_framework import serializers
from .models import (
    Supplier, PharmacyStock, PurchaseInvoice, PurchaseItem,
    PharmacySale, PharmacySaleItem
)


class SupplierSerializer(serializers.ModelSerializer):
    supplier_id = serializers.UUIDField(source='id', read_only=True)

    class Meta:
        model = Supplier
        fields = '__all__'
        read_only_fields = ['supplier_id', 'created_at', 'updated_at']


class PharmacyStockSerializer(serializers.ModelSerializer):
    med_id = serializers.UUIDField(source='id', read_only=True)

    class Meta:
        model = PharmacyStock
        fields = '__all__'
        read_only_fields = ['med_id', 'created_at', 'updated_at']


class PurchaseItemSerializer(serializers.ModelSerializer):
    item_id = serializers.UUIDField(source='id', read_only=True)

    class Meta:
        model = PurchaseItem
        fields = '__all__'
        read_only_fields = ['item_id', 'purchase', 'created_at', 'updated_at']


class PurchaseInvoiceSerializer(serializers.ModelSerializer):
    purchase_id = serializers.UUIDField(source='id', read_only=True)
    # ✅ make items writable (bulk upload via JSON)
    items = PurchaseItemSerializer(many=True, write_only=True)
    items_detail = PurchaseItemSerializer(source='items', many=True, read_only=True)

    class Meta:
        model = PurchaseInvoice
        fields = '__all__'
        read_only_fields = ['purchase_id', 'created_by', 'created_at', 'updated_at', 'total_amount']

    @transaction.atomic
    def create(self, validated_data):
        items_data = validated_data.pop('items', [])
        
        # Calculate total_amount if items are present
        total_amount = sum(
            (float(item.get('purchase_rate', 0)) * int(item.get('qty', 0))) 
            for item in items_data
        )
        validated_data['total_amount'] = total_amount

        request = self.context.get('request')
        user = getattr(request, 'user', None) if request else None

        invoice = PurchaseInvoice.objects.create(
            created_by=user if user and user.is_authenticated else None,
            **validated_data
        )

        # Create purchase items + Update/Create stock
        for item in items_data:
            PurchaseItem.objects.create(purchase=invoice, **item)

            tps = item.get('tablets_per_strip', 1)
            qty_in = ((item.get('qty') or 0) + (item.get('free_qty') or 0)) * tps

            # Stock match logic (MANDATORY): product_name + batch_no + expiry + supplier
            stock, created = PharmacyStock.objects.get_or_create(
                name=item['product_name'],
                batch_no=item['batch_no'],
                expiry_date=item['expiry_date'],
                supplier=invoice.supplier,
                defaults={
                    'barcode': item.get('barcode', '') or '',
                    'mrp': item['mrp'],
                    'selling_price': item['mrp'], # User Rule: Sell at MRP
                    'purchase_rate': item.get('purchase_rate', 0),
                    'qty_available': qty_in,
                    'tablets_per_strip': tps,
                    'hsn': item.get('hsn', '') or '',
                    'gst_percent': item.get('gst_percent', 0) or 0,
                    'manufacturer': item.get('manufacturer', '') or '',
                    'is_deleted': False,
                }
            )

            if not created:
                stock.qty_available = stock.qty_available + qty_in
                stock.tablets_per_strip = tps # Update if changed
                if item.get('barcode'):
                    stock.barcode = item['barcode']
                stock.mrp = item['mrp']
                stock.selling_price = item['mrp'] # User Rule: Sell at MRP
                stock.purchase_rate = item.get('purchase_rate', stock.purchase_rate)
                stock.hsn = item.get('hsn', stock.hsn)
                stock.gst_percent = item.get('gst_percent', stock.gst_percent)
                stock.manufacturer = item.get('manufacturer', stock.manufacturer)
                stock.is_deleted = False
                stock.save()

        return invoice


class PharmacySaleItemSerializer(serializers.ModelSerializer):
    item_id = serializers.UUIDField(source='id', read_only=True)
    med_name = serializers.CharField(source='med_stock.name', read_only=True)
    batch_no = serializers.CharField(source='med_stock.batch_no', read_only=True)
    expiry_date = serializers.DateField(source='med_stock.expiry_date', read_only=True)

    class Meta:
        model = PharmacySaleItem
        fields = '__all__'
        read_only_fields = ['item_id', 'created_at', 'updated_at', 'amount', 'sale']


class PharmacySaleSerializer(serializers.ModelSerializer):
    sale_id = serializers.UUIDField(source='id', read_only=True)
    # allow creating items in same request
    items = PharmacySaleItemSerializer(many=True)

    class Meta:
        model = PharmacySale
        fields = '__all__'
        read_only_fields = ['sale_id', 'sale_date', 'created_at', 'updated_at', 'total_amount']

    @transaction.atomic
    def create(self, validated_data):
        items_data = validated_data.pop('items', [])

        sale = PharmacySale.objects.create(total_amount=0, **validated_data)

        total = 0
        for item in items_data:
            med_stock = item['med_stock']
            qty = item['qty']

            if med_stock.is_deleted:
                raise serializers.ValidationError("Selected medicine stock is deleted.")

            if med_stock.qty_available < qty:
                raise serializers.ValidationError(
                    f"Not enough stock for {med_stock.name} ({med_stock.batch_no}). Available: {med_stock.qty_available}"
                )

            unit_price = item.get('unit_price')
            if not unit_price:
                # Calculate per-tablet price from strip selling price
                unit_price = med_stock.selling_price / med_stock.tablets_per_strip
            
            amount = float(unit_price) * qty
            gst_percent = item.get('gst_percent', 0)
            total += amount

            # reduce stock
            med_stock.qty_available -= qty
            med_stock.save()

            PharmacySaleItem.objects.create(
                sale=sale,
                med_stock=med_stock,
                qty=qty,
                unit_price=unit_price,
                amount=amount,
                gst_percent=gst_percent
            )

        sale.total_amount = total
        sale.save()

        # --- FIX: Ensure manual sales appear in Billing ---
        # If no visit or visit is closed, we need to ensure there is an OPEN visit assigned to BILLING
        # so the Billing module (which fetches visits) picks it up.
        from patients.models import Visit
        
        target_visit = sale.visit
        patient = sale.patient

        if not target_visit and patient:
            # Check for an existing OPEN visit for this patient today to attach to
            # This avoids creating multiple visits if the patient is already wandering around via Reception
            # Priority: BILLING > DOCTOR > RECEPTION
            open_visit = Visit.objects.filter(
                patient=patient, 
                status='OPEN'
            ).order_by('-updated_at').first()

            if open_visit:
                target_visit = open_visit
            else:
                # Create a specialized visit for this pharmacy transaction
                target_visit = Visit.objects.create(
                    patient=patient,
                    assigned_role='BILLING',
                    status='OPEN',
                    vitals={'note': 'Auto-created from Pharmacy Manual Sale'}
                )
            
            # Link the sale to this visit
            sale.visit = target_visit
            sale.save()

        # Force the visit to be 'BILLING' ready if it's not already
        if target_visit:
             # If the visit was with Doctor or Lab, and now Pharmacy is done, send to Billing.
             # If it was alrdy Billing, it stays Billing.
             if target_visit.status != 'CLOSED':
                 target_visit.assigned_role = 'BILLING'
                 target_visit.status = 'OPEN' 
                 target_visit.save()

        # Notify via Socket.IO
        try:
            from asgiref.sync import async_to_sync
            from revive_cms.sio import sio
            print(f"Emitting socket event for sale {sale.id}")
            async_to_sync(sio.emit)('pharmacy_sale_update', {
                'sale_id': str(sale.id),
                'visit_id': str(sale.visit.id) if sale.visit else None,
                'patient_id': str(sale.patient.id) if sale.patient else None
            })
        except Exception as e:
            print(f"Socket emit error: {e}")

        return sale
