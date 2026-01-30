from django.db import transaction
from django.db.models import Q
from rest_framework import serializers
from .models import (
    Supplier, PharmacyStock, PurchaseInvoice, PurchaseItem,
    PharmacySale, PharmacySaleItem,
    PharmacyReturn, PharmacyReturnItem
)


class SupplierSerializer(serializers.ModelSerializer):
    supplier_id = serializers.UUIDField(source='id', read_only=True)

    class Meta:
        model = Supplier
        fields = '__all__'
        read_only_fields = ['supplier_id', 'created_at', 'updated_at']


class PharmacyStockSerializer(serializers.ModelSerializer):
    med_id = serializers.UUIDField(source='id', read_only=True)
    supplier_name = serializers.SerializerMethodField()

    class Meta:
        model = PharmacyStock
        fields = '__all__'
        read_only_fields = ['med_id', 'created_at', 'updated_at', 'supplier_name']

    def get_supplier_name(self, obj):
        return obj.supplier.supplier_name if obj.supplier else None


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
        total_amount = 0
        # for item in items_data: ... (Logic moved to model)
        # We just skip calc here and let calculate_distribution handle it via model method later
        
        validated_data['total_amount'] = 0 # Temporary
        
        request = self.context.get('request')
        user = getattr(request, 'user', None) if request else None

        invoice = PurchaseInvoice.objects.create(
            created_by=user if user and user.is_authenticated else None,
            **validated_data
        )

        for item in items_data:
            PurchaseItem.objects.create(purchase=invoice, **item)

        # Calculate Distribution (GST, Disc)
        invoice.calculate_distribution()
        invoice.refresh_from_db()

        # Conditionally Update Stock
        if invoice.status == 'COMPLETED':
            self._process_stock_for_invoice(invoice)

        return invoice

    @transaction.atomic
    def update(self, instance, validated_data):
        items_data = validated_data.pop('items', None)
        
        # Update fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        if items_data is not None:
             # Logic for updating items (Full replace for simplicity in drafts)
             # If status was already COMPLETED, blocking edits is safer, but for now we assume draft edits.
             if instance.status == 'DRAFT':
                 instance.items.all().delete()
                 total_amount = 0
                 for item in items_data:
                    PurchaseItem.objects.create(purchase=instance, **item)
                 
                 # Recalculate everything
                 instance.calculate_distribution()
                 instance.refresh_from_db()

        instance.save()

        # If transitioning to COMPLETED (or initially saving as COMPLETED if update allowed on final)
        # Note: Frontend sends status='COMPLETED' to finalize.
        if instance.status == 'COMPLETED':
             # Re-fetch items if we didn't just replace them, to be safe
             # But items_data is expected to be passed if editing. 
             # If finalizing without editing items, we need to fetch them.
             
             self._process_stock_for_invoice(instance)

        # Emit Socket
        try:
            from asgiref.sync import async_to_sync
            from revive_cms.sio import sio
            async_to_sync(sio.emit)('pharmacy_inventory_update', {
                'invoice_id': str(instance.id),
                'amount': float(instance.total_amount)
            })
        except: pass

        return instance

    def _process_stock_for_invoice(self, invoice):
        from decimal import Decimal, ROUND_HALF_UP
        
        def d_round(val):
            if isinstance(val, float): val = str(val)
            return Decimal(val).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

        # Iterate over ACTUAL database items which have calculated values
        for item in invoice.items.all():
            tps = item.tablets_per_strip
  
            qty_strips = Decimal(item.qty)
            free_strips = Decimal(item.free_qty)
            
            # TOTAL QTY in Units (Tablets)
            qty_in = (qty_strips + free_strips) * tps

            # Effective Purchase Rate Calculation
            # Logic: (Total Net Cost of Line) / (Total Strips including Free)
            
            total_net_cost = Decimal(item.taxable_amount) # Already Decimal from DB ideally
            
            if (qty_strips + free_strips) > 0:
                effective_purch_rate = total_net_cost / (qty_strips + free_strips)
            else:
                effective_purch_rate = Decimal(item.purchase_rate)
            
            # Round the rate to 2 decimals as requested "all values rounded"
            effective_purch_rate = d_round(effective_purch_rate)

            stock, created = PharmacyStock.objects.get_or_create(
                name=item.product_name,
                batch_no=item.batch_no,
                defaults={
                    'expiry_date': item.expiry_date,
                    'supplier': invoice.supplier,
                    'barcode': item.barcode or '',
                    'mrp': item.mrp,
                    'selling_price': item.mrp, 
                    'purchase_rate': effective_purch_rate,
                    'ptr': item.ptr, 
                    'qty_available': qty_in,
                    'tablets_per_strip': tps,
                    'hsn': item.hsn,
                    'gst_percent': item.gst_percent,
                    'manufacturer': item.manufacturer,
                    'is_deleted': False,
                    'medicine_type': item.medicine_type,
                }
            )

            if not created:
                stock.qty_available = stock.qty_available + qty_in
                stock.tablets_per_strip = tps 
                if item.barcode: stock.barcode = item.barcode
                stock.mrp = item.mrp
                # stock.selling_price = item.mrp # Don't overwrite SP if exists? User pref? 
                # Let's keep existing SP if not created, unless MRP changed drastically? 
                # Safer to update SP to MRP for new batches or keep logic consistent.
                # Current logic was overwriting. Let's stick to overwriting to ensure consistency.
                stock.selling_price = item.mrp 
                
                stock.purchase_rate = round(effective_purch_rate, 2)
                stock.ptr = item.ptr
                stock.hsn = item.hsn or stock.hsn
                stock.gst_percent = item.gst_percent
                stock.manufacturer = item.manufacturer or stock.manufacturer
                stock.is_deleted = False
                stock.medicine_type = item.medicine_type
                stock.save()

            # --- Notification Cleanup ---
            try:
                # If stock is now healthy (above reorder level + buffer), clear low stock alerts
                if stock.qty_available > stock.reorder_level:
                    from core.models import Notification
                    # Use Q for cleaner syntax
                    Notification.objects.filter(
                        Q(message__icontains=f"Low stock alert: {stock.name}") &
                        Q(message__icontains=stock.batch_no)
                    ).delete()
            except Exception as e:
                print(f"Failed to clear notifications: {e}")


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
    patient_name = serializers.CharField(source='patient.full_name', read_only=True)
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


class PharmacyReturnItemSerializer(serializers.ModelSerializer):
    return_item_id = serializers.UUIDField(source='id', read_only=True)
    med_name = serializers.CharField(source='med_stock.name', read_only=True)
    batch_no = serializers.CharField(source='med_stock.batch_no', read_only=True)

    class Meta:
        model = PharmacyReturnItem
        fields = '__all__'
        read_only_fields = ['return_item_id', 'created_at', 'updated_at', 'return_record', 'gst_reversed', 'refund_amount']


class PharmacyReturnSerializer(serializers.ModelSerializer):
    return_id = serializers.UUIDField(source='id', read_only=True)
    # Allows creating return items in the same call
    items = PharmacyReturnItemSerializer(many=True, read_only=True)
    items_data = serializers.ListField(child=serializers.DictField(), write_only=True)

    class Meta:
        model = PharmacyReturn
        fields = '__all__'
        read_only_fields = ['return_id', 'return_date', 'total_refund_amount', 'created_at', 'updated_at', 'status', 'processed_by']

    @transaction.atomic
    def create(self, validated_data):
        items_payload = validated_data.pop('items_data', [])
        request = self.context.get('request')
        user = getattr(request, 'user', None) if request else None

        # 1. Create Return Record
        ret_record = PharmacyReturn.objects.create(
            total_refund_amount=0,
            status='COMPLETED',
            processed_by=user,
            **validated_data
        )

        total_refund = 0
        
        for item in items_payload:
            sale_item_id = item.get('sale_item_id')
            return_qty = int(item.get('qty', 0))

            if return_qty <= 0:
                continue

            sale_item = PharmacySaleItem.objects.select_for_update().get(id=sale_item_id)
            
            # Validation: Check if already returned
            already_returned = sum(item.qty_returned for item in sale_item.returned_items.all())
            if (already_returned + return_qty) > sale_item.qty:
                 raise serializers.ValidationError(
                    f"Cannot return {return_qty} for {sale_item.med_stock.name}. Sold: {sale_item.qty}, Already Returned: {already_returned}"
                )

            # Calculation using ORIGINAL sale price and gst
            # !CRITICAL: DO NOT CHANGE. Must refund what was paid (Original Unit Price).
            refund_amt = sale_item.unit_price * return_qty
            gst_rev = refund_amt * (sale_item.gst_percent / 100)
            
            total_refund += refund_amt

            # 2. Update Inventory (Restock to SAME Batch)
            # !CRITICAL: DO NOT CHANGE. Must restore to the EXACT batch sold.
            med_stock = sale_item.med_stock
            med_stock.qty_available += return_qty
            med_stock.save()

            # 3. Create Return Item Entry
            PharmacyReturnItem.objects.create(
                return_record=ret_record,
                sale_item=sale_item,
                med_stock=med_stock,
                qty_returned=return_qty,
                refund_amount=refund_amt,
                gst_reversed=gst_rev
            )

        ret_record.total_refund_amount = total_refund
        ret_record.save()

        # --- SYNC: Update Billing Invoice ---
        try:
            sale = ret_record.sale
            if sale.visit:
                # Find linked invoices
                from billing.models import Invoice
                # Update all invoices linked to this visit (usually just one)
                # or find the specific one. For now, updating the sum on the main invoice.
                invoice = Invoice.objects.filter(visit=sale.visit).order_by('-created_at').first()
                if invoice:
                    invoice.refund_amount += total_refund
                    invoice.save()
        except Exception as e:
            print(f"Failed to sync refund to billing: {e}")

        return ret_record
