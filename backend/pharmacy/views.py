import csv
import io
from datetime import datetime
from django.db import transaction, models
from django.db.models import Q
from rest_framework import viewsets, permissions, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.parsers import MultiPartParser

from .models import Supplier, PharmacyStock, PurchaseInvoice, PurchaseItem, PharmacySale
from patients.models import Visit
from patients.serializers import VisitSerializer
from .serializers import (
    SupplierSerializer, PharmacyStockSerializer,
    PurchaseInvoiceSerializer, PharmacySaleSerializer
)


class IsPharmacyOrAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        return request.user.is_superuser or getattr(request.user, "role", None) in ["PHARMACY", "ADMIN", "DOCTOR", "RECEPTION"]


class PharmacyBulkUploadView(APIView):
    permission_classes = [IsPharmacyOrAdmin]
    parser_classes = [MultiPartParser]

    @transaction.atomic
    def post(self, request, format=None):
        file_obj = request.FILES.get('file')
        supplier_name = request.data.get('supplier_name')

        if not file_obj:
            return Response({"error": "No file uploaded."}, status=status.HTTP_400_BAD_REQUEST)
        if not supplier_name:
            return Response({"error": "Supplier name is required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            supplier, _ = Supplier.objects.get_or_create(supplier_name=supplier_name.strip())
            
            decoded_file = file_obj.read().decode('utf-8')
            io_string = io.StringIO(decoded_file)
            reader = csv.reader(io_string)

            invoice = None
            headers = []
            items_created = 0

            for row in reader:
                if not row: continue
                line_type = row[0].strip().upper()

                if line_type == 'H':
                    # Parse H line
                    # H,MediWMS,1.0,InvNo,Date,,,Type,CreditDays,...
                    inv_no = row[3] if len(row) > 3 else "Unknown"
                    inv_date_str = row[4] if len(row) > 4 else ""
                    p_type = row[7].upper() if len(row) > 7 else "CASH"
                    c_days = 0
                    try: 
                        c_days = int(row[8]) if len(row) > 8 and row[8] else 0
                    except: pass

                    # Convert date dd/mm/yyyy to yyyy-mm-dd
                    try:
                        inv_date = datetime.strptime(inv_date_str, '%d/%m/%Y').date()
                    except:
                        inv_date = datetime.now().date()

                    invoice = PurchaseInvoice.objects.create(
                        supplier=supplier,
                        supplier_invoice_no=inv_no,
                        invoice_date=inv_date,
                        credit_days=c_days,
                        purchase_type='CREDIT' if 'CREDIT' in p_type else 'CASH',
                        total_amount=0, # Will update later
                        created_by=request.user
                    )

                elif line_type == 'TH':
                    headers = [h.strip() for h in row]

                elif line_type == 'T':
                    if not invoice or not headers: continue
                    
                    # Process rows
                    # Normalize keys (strip whitespace, etc)
                    # Create a dictionary from headers and row, then normalize keys
                    raw_data = dict(zip(headers, row))
                    data = {k.strip(): v for k, v in raw_data.items() if k}
                    
                    # Helper to find key case-insensitively
                    def get_val(keys_list, default=''):
                        for k in data.keys():
                            if k.lower() in [x.lower() for x in keys_list]:
                                return data[k]
                        return default

                    p_name = get_val(['Product Name', 'Item Name', 'Particulars'], 'Unknown')
                    batch = get_val(['Batch', 'Batch No'], 'N/A')
                    exp_str = get_val(['Expiry', 'Exp', 'Exp Date'], '')
                    
                    qty_val = get_val(['Qty', 'Quantity'], 0)
                    try: qty = float(qty_val)
                    except: qty = 0
                    
                    free_val = get_val(['Free', 'Free Qty'], 0)
                    try: free = float(free_val)
                    except: free = 0
                    
                    rate_val = get_val(['Rate', 'Price'], 0)
                    try: rate = float(rate_val)
                    except: rate = 0
                    
                    ptr_val = get_val(['PTR', 'Purchase Rate'], 0)
                    try: ptr = float(ptr_val)
                    except: ptr = 0
                    
                    mrp_val = get_val(['MRP'], 0)
                    try: mrp = float(mrp_val)
                    except: mrp = 0

                    if qty and qty > 0:
                        # Logic removed: CSV contains UNIT rates, not total amounts.
                        # rate = round(rate / qty, 2)
                        # mrp = round(mrp / qty, 2)
                        # if ptr > 0: ptr = round(ptr / qty, 2)
                        pass

                    
                    hsn = get_val(['HSN', 'HSN Code'], '')
                    manufacturer = get_val(['Manufacturer Name', 'Manufacturer.Name', 'Mfr Name', 'Mfr'], '')
                    barcode = get_val(['Product Code', 'Barcode', 'Code'], '')
                    
                    # New: Tablets per strip
                    strip_size_val = get_val(['Packing', 'ItemPerPack', 'Strip Size', 'Tablets per Strip', 'TPS', 'Unit'], 1)
                    try:
                        # Extract number from packing like "10S" or "10 Tablets"
                        import re
                        match = re.search(r'(\d+)', str(strip_size_val))
                        tps = int(match.group(1)) if match else 1
                    except:
                        tps = 1

                    # Parse Expiry (mm/yyyy)
                    try:
                        # Assuming end of month or 1st of month
                        exp_date = datetime.strptime(exp_str, '%m/%Y').date()
                    except:
                        exp_date = None

                    # Create PurchaseItem
                    PurchaseItem.objects.create(
                        purchase=invoice,
                        product_name=p_name,
                        barcode=barcode,
                        batch_no=batch,
                        expiry_date=exp_date,
                        qty=qty,
                        free_qty=free,
                        purchase_rate=rate,
                        mrp=mrp,
                        ptr=ptr,
                        manufacturer=manufacturer,
                        hsn=hsn,
                        tablets_per_strip=tps
                    )

                    # Update/Create Stock
                    # User clarified that both 'Qty' and 'Free' are strips
                    total_qty_in = (qty + free) * tps
                    
                    # Try to parse GST if available in common headers
                    gst_val = 0
                    for key in ['GST', 'GST%', 'Tax', 'Tax %', 'IGST', 'TaxPerc']:
                        if key in data and data[key]:
                            try:
                                val_str = str(data[key]).replace('%', '').strip()
                                gst_val = float(val_str)
                                break
                            except: pass

                    # Calculate Selling Price
                    # User confirmed "mrp price is sale price" (Selling at MRP)
                    calculated_selling_price = mrp

                    stock, created = PharmacyStock.objects.get_or_create(
                        name=p_name,
                        batch_no=batch,
                        expiry_date=exp_date,
                        supplier=supplier,
                        defaults={
                            'barcode': barcode,
                            'mrp': mrp,
                            'selling_price': calculated_selling_price,
                            'purchase_rate': rate,
                            'qty_available': total_qty_in,
                            'tablets_per_strip': tps,
                            'manufacturer': manufacturer,
                            'hsn': hsn,
                            'gst_percent': gst_val
                        }
                    )
                    if not created:
                        stock.qty_available += total_qty_in
                        # Update metadata fields if they are better/newer
                        stock.mrp = mrp
                        stock.gst_percent = gst_val
                        stock.selling_price = calculated_selling_price
                        stock.purchase_rate = rate
                        stock.tablets_per_strip = tps
                        if manufacturer: stock.manufacturer = manufacturer
                        if hsn: stock.hsn = hsn
                        stock.save()

                    items_created += 1

                elif line_type == 'F':
                    # Parse final amount from footer if needed, or calculate from T lines
                    # For now, let's just sum T line amounts (Rate * Qty)
                    pass

            if invoice:
                # Recalculate total amount from items
                total_inv = PurchaseItem.objects.filter(purchase=invoice).aggregate(
                    total=models.Sum(models.F('purchase_rate') * models.F('qty'))
                )['total'] or 0
                invoice.total_amount = total_inv
                invoice.save()

            return Response({
                "message": "Bulk upload successful",
                "items_processed": items_created,
                "invoice_no": invoice.supplier_invoice_no if invoice else None
            }, status=status.HTTP_201_CREATED)

        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class SupplierViewSet(viewsets.ModelViewSet):
    queryset = Supplier.objects.all().order_by('-created_at')
    serializer_class = SupplierSerializer
    permission_classes = [IsPharmacyOrAdmin]
    filter_backends = [filters.SearchFilter]
    search_fields = ['supplier_name', 'phone', 'gst_no']


# ✅ Read-only: stock should enter system only through supplier invoices
class PharmacyStockViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = PharmacyStockSerializer
    permission_classes = [IsPharmacyOrAdmin]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name', 'barcode', 'batch_no', 'supplier__supplier_name']
    ordering_fields = ['expiry_date', 'qty_available', 'updated_at', 'supplier__supplier_name']
    ordering = ['expiry_date']

    def get_queryset(self):
        qs = PharmacyStock.objects.filter(is_deleted=False)
        supplier_id = self.request.query_params.get('supplier')
        if supplier_id:
            qs = qs.filter(supplier_id=supplier_id)
        return qs.order_by('expiry_date')

    @action(detail=False, methods=['get'], url_path='low-stock')
    def low_stock(self, request):
        """
        Optional: shows items where qty <= reorder threshold.
        If you don't have reorder_level in pharmacy stock, remove this endpoint
        or add reorder_level field.
        """
        if not hasattr(PharmacyStock, "reorder_level"):
            return Response(
                {"detail": "reorder_level not configured in PharmacyStock model."},
                status=status.HTTP_400_BAD_REQUEST
            )

        qs = self.get_queryset().filter(qty_available__lte=models.F('reorder_level')).order_by('qty_available')
        return Response(self.get_serializer(qs, many=True).data)

    @action(detail=False, methods=['post'], url_path='scan')
    def scan_barcode(self, request):
        """
        Barcode Sales Flow (FIFO nearest expiry):
        Input: { "barcode": "xxxx", "qty": 1 }
        Output: auto-selected stock batch (nearest expiry) if available.
        """
        barcode = (request.data.get("barcode") or "").strip()
        qty = int(request.data.get("qty") or 1)

        if not barcode:
            return Response({"barcode": ["This field is required."]}, status=status.HTTP_400_BAD_REQUEST)
        if qty <= 0:
            return Response({"qty": ["Quantity must be greater than 0."]}, status=status.HTTP_400_BAD_REQUEST)

        stock = (
            self.get_queryset()
            .filter(barcode=barcode, qty_available__gte=qty)
            .order_by('expiry_date')
            .first()
        )

        if not stock:
            return Response(
                {"detail": "No stock found for this barcode (or insufficient quantity)."},
                status=status.HTTP_404_NOT_FOUND
            )

        return Response(self.get_serializer(stock).data, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], url_path='doctor-search')
    def doctor_search(self, request):
        """
        Aggregates stock by medicine name for Doctor's search.
        Returns: [ { "id": "Name", "name": "Name", "qty_available": TotalQty } ]
        """
        query = request.query_params.get('search', '').strip()
        if len(query) < 2:
            return Response([])

        from django.db.models import Sum
        qs = (
            PharmacyStock.objects
            .filter(is_deleted=False, name__icontains=query)
            .values('name')
            .annotate(total_qty=Sum('qty_available'))
            .order_by('name')
        )

        results = []
        for item in qs:
            results.append({
                # Use name as ID to unique key it in frontend lists
                'id': item['name'],
                'name': item['name'],
                'qty_available': item['total_qty'] or 0
            })
        
        return Response(results)


class PurchaseInvoiceViewSet(viewsets.ModelViewSet):
    queryset = PurchaseInvoice.objects.all().order_by('-invoice_date')
    serializer_class = PurchaseInvoiceSerializer
    permission_classes = [IsPharmacyOrAdmin]

    def get_serializer_context(self):
        # needed so serializer can set created_by from request.user
        ctx = super().get_serializer_context()
        ctx["request"] = self.request
        return ctx


class PharmacySaleViewSet(viewsets.ModelViewSet):
    queryset = PharmacySale.objects.all().order_by('-sale_date')
    serializer_class = PharmacySaleSerializer
    permission_classes = [IsPharmacyOrAdmin]
    filter_backends = [filters.OrderingFilter]
    ordering_fields = ['sale_date', 'total_amount']


    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx["request"] = self.request
        return ctx

    @action(detail=False, methods=['get'], url_path='pending_by_patient')
    def pending_by_patient(self, request):
        patient_id = request.query_params.get('patient_id')
        if not patient_id:
            return Response({"error": "Patient ID required"}, status=status.HTTP_400_BAD_REQUEST)

        # Sales that are PENDING and belong to this patient
        sales = PharmacySale.objects.filter(patient_id=patient_id, payment_status='PENDING')

        items_list = []
        for sale in sales:
            for item in sale.items.all().select_related('med_stock'):
                items_list.append({
                    "id": item.id,
                    "name": item.med_stock.name,
                    "qty": item.qty,
                    "unit_price": item.unit_price,
                    "amount": item.amount,
                    "hsn": item.med_stock.hsn,
                    "batch": item.med_stock.batch_no,
                    "gst": item.med_stock.gst_percent,
                    "dosage": "",
                    "duration": ""
                })
        
        return Response(items_list)


class PharmacyQueueViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Lists visits assigned to PHARMACY.
    """
    permission_classes = [IsPharmacyOrAdmin]
    serializer_class = VisitSerializer # Import this at top if not present, checking imports... it wasn't validly imported likely. Wait, I need to check imports.
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['patient__full_name', 'patient__phone']
    ordering_fields = ['updated_at']

    def get_queryset(self):
        # Visits assigned to PHARMACY
        # OR assigned to LAB but have a prescription in doctor_note
        return Visit.objects.filter(
            Q(assigned_role='PHARMACY') | 
            (Q(assigned_role='LAB') & ~Q(doctor_note__prescription={}) & Q(doctor_note__prescription__isnull=False))
        ).exclude(status='CLOSED').order_by('updated_at')

    @action(detail=True, methods=['post'])
    def dispense(self, request, pk=None):
        visit = self.get_object()
        
        # Mark as CLOSED so it shows up in billing "Ready for Billing"
        # And maybe change assigned role to RECEPTION or NULL
        visit.status = 'CLOSED'
        visit.assigned_role = 'RECEPTION' # Hand off to reception for billing
        visit.save()
        
        return Response({"status": "Dispensed and sent to Billing"}, status=status.HTTP_200_OK)
