from rest_framework import viewsets, permissions, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db import transaction, models
from django.db.models import Sum, F
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from patients.models import Visit
from patients.serializers import VisitSerializer
from .models import Invoice, PaymentTransaction
from .serializers import InvoiceSerializer, PaymentTransactionSerializer
from pharmacy.models import PharmacyStock

class IsAdminOrReception(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and (request.user.role in ['ADMIN', 'RECEPTION', 'PHARMACY'] or request.user.is_superuser)

class InvoiceViewSet(viewsets.ModelViewSet):
    queryset = Invoice.objects.all().order_by('-created_at')
    serializer_class = InvoiceSerializer

    def get_queryset(self):
        queryset = Invoice.objects.all().order_by('-created_at')
        
        month = self.request.query_params.get('month')
        year = self.request.query_params.get('year')
        
        if month and year:
            try:
                queryset = queryset.filter(created_at__month=month, created_at__year=year)
            except ValueError:
                pass
                
        return queryset

    @transaction.atomic
    def perform_create(self, serializer):
        invoice = serializer.save()
        self._deduct_stock(invoice)
        
        # Close the visit and reset role to prevent it from showing in 'Ready for Billing'
        if invoice.visit:
            visit = invoice.visit
            visit.status = 'CLOSED'
            visit.save()

    @transaction.atomic
    def perform_update(self, serializer):
        invoice = serializer.save()
        self._deduct_stock(invoice)

    def _deduct_stock(self, invoice):
        from django.db import transaction
        from rest_framework import serializers

        items = invoice.items.all()
        for item in items:
            if item.dept == 'PHARMACY':
                name = item.description.strip() if item.description else ""
                batch = item.batch.strip() if item.batch else ""
                current_qty = int(item.qty)
                already_deducted = int(item.deducted_qty)
                delta = current_qty - already_deducted
                
                if delta == 0:
                    continue
                    
                # Find Stock
                stock = None
                if batch:
                    # Strict match by name and batch
                    stock = PharmacyStock.objects.select_for_update().filter(
                        name__iexact=name, 
                        batch_no__iexact=batch,
                        is_deleted=False
                    ).first()
                
                if not stock and not batch:
                    # Fallback to name only if batch is not provided (should be avoided in UI)
                    stock = PharmacyStock.objects.select_for_update().filter(
                        name__iexact=name,
                        is_deleted=False
                    ).order_by('expiry_date').first()
                
                if stock:
                    if stock.qty_available < delta:
                        raise serializers.ValidationError({
                            "error": f"Insufficient stock for {name} (Batch: {batch or 'Any'}). Available: {stock.qty_available}, Requested: {delta}"
                        })
                        
                    # Perform stock adjustment
                    stock.qty_available -= delta
                    stock.save()
                    
                    # Update item tracking
                    item.deducted_qty = current_qty
                    item.stock_deducted = True
                    item.save()
                else:
                    # If it's a new manual entry and no stock found, we should probably warn or block
                    # unless it's a non-pharmacy item mislabeled as dept='PHARMACY'
                    if delta > 0:
                         raise serializers.ValidationError({
                            "error": f"No stock record found for {name} (Batch: {batch or 'N/A'})."
                        })

    @action(detail=True, methods=['post'])
    def add_payment(self, request, pk=None):
        from decimal import Decimal
        invoice = self.get_object()
        
        # Support both new list-based payload and old single-entry payload
        payments_list = request.data.get('payments', [])
        
        # If no list provided, try old format
        if not payments_list:
            amount = request.data.get('amount')
            mode = request.data.get('mode')
            if amount and mode:
                payments_list = [{'amount': amount, 'mode': mode}]
        
        if not payments_list:
            return Response({'error': 'No payment details provided'}, status=400)
            
        remarks = request.data.get('remarks', '')

        from django.db import transaction
        
        with transaction.atomic():
            for payment in payments_list:
                amount_val = payment.get('amount')
                mode_val = payment.get('mode')
                
                if not amount_val:
                    continue
                    
                try:
                    amount_float = float(amount_val)
                    if amount_float <= 0:
                        continue
                except ValueError:
                    continue
                    
                # Create Transaction
                PaymentTransaction.objects.create(
                    invoice=invoice,
                    amount=amount_float,
                    mode=mode_val,
                    remarks=remarks 
                )

        # Recalculate Totals
        total_paid = sum(p.amount for p in invoice.payments.all())
        
        # Update Invoice Status
        # Allow small buffer for float errors (converted to Decimal)
        if total_paid >= invoice.total_amount - Decimal('0.5'):
            invoice.payment_status = 'PAID'
        else:
            invoice.payment_status = 'PENDING'
            
        invoice.save()
        
        # Emit Socket Update
        try:
             from asgiref.sync import async_to_sync
             from revive_cms.sio import sio
             async_to_sync(sio.emit)('billing_update', {
                 'invoice_id': str(invoice.id),
                 'amount': float(invoice.total_amount),
                 'status': invoice.payment_status,
                 'paid': float(total_paid)
             })
        except:
            pass

        return Response(InvoiceSerializer(invoice).data)

    @action(detail=False, methods=['get'])
    def stats(self, request):
        today = timezone.now().date()
        
        # Get query params for month/year, default to current
        try:
            current_month = int(request.query_params.get('month', timezone.now().month))
            current_year = int(request.query_params.get('year', timezone.now().year))
        except ValueError:
            current_month = timezone.now().month
            current_year = timezone.now().year

        # 1. Total Collection This Month (Sum of all PaymentTransactions in filtered month)
        monthly_payments = PaymentTransaction.objects.filter(
            created_at__month=current_month,
            created_at__year=current_year
        )
        total_monthly_collection = monthly_payments.aggregate(Sum('amount'))['amount__sum'] or 0
        
        # 2. Breakdown
        cash_monthly = monthly_payments.filter(mode='CASH').aggregate(Sum('amount'))['amount__sum'] or 0
        upi_monthly = monthly_payments.filter(mode='UPI').aggregate(Sum('amount'))['amount__sum'] or 0
        card_monthly = monthly_payments.filter(mode='CARD').aggregate(Sum('amount'))['amount__sum'] or 0

        # Collection Today (Actual payments received today) - Always TODAY regardless of filter?
        # User request: "IF SELECT JAN SHOW JAN FULL DATA"
        # Since 'revenue_today' is specifically 'today', it might be confusing if it shows January data when looking at January in March.
        # But 'revenue_today' explicitly says TODAY. 
        # However, typically filters apply to the whole view. 
        # If filtering for a past month, 'revenue_today' (meaning 'revenue on that day') is ambiguous.
        # It's safest to leave 'revenue_today' as ACTUALLY TODAY, because the user can see monthly totals in the summary.
        # Or should 'revenue_today' become 'Revenue for Selected Period'?
        # The UI shows "Financial Overview - [Current Date]". 
        # Let's keep 'revenue_today' as ACTUAL TODAY to avoid confusion with the header date which is current date.
        
        collection_today = PaymentTransaction.objects.filter(created_at__date=today).aggregate(Sum('amount'))['amount__sum'] or 0

        # Pending Amount (Global or Monthly?) -> "Pending" is usually a current state of liability.
        # Filtering it by month means "Invoices created in this month that are still pending".
        # Let's filter pending by the selected month/year too to keep context.
        pending_query = Invoice.objects.filter(payment_status='PENDING')
        if request.query_params.get('month') and request.query_params.get('year'):
             pending_query = pending_query.filter(created_at__month=current_month, created_at__year=current_year)
             
        pending = pending_query.aggregate(Sum('total_amount'))['total_amount__sum'] or 0
        
        count = Invoice.objects.filter(created_at__date=today).count()

        return Response({
            'revenue_today': collection_today,
            'pending_amount': pending,
            'invoices_today': count,
            'monthly_total': total_monthly_collection,
            'monthly_breakdown': {
                'CASH': cash_monthly,
                'UPI': upi_monthly,
                'CARD': card_monthly
            }
        })

    @action(detail=False, methods=['get'])
    def pending_visits(self, request):
        from django.db.models import Q
        # Pending Billing: Visits that have unbilled pharmacy sales OR casualty items
        # And no invoice yet
        visits = Visit.objects.filter(
            invoices__isnull=True  # No invoice yet
        ).filter(
            Q(pharmacy_sales__isnull=False) |
            Q(casualty_medicines__isnull=False) |
            Q(casualty_services__isnull=False)
        ).distinct().order_by('-updated_at')
        serializer = VisitSerializer(visits, many=True)
        return Response(serializer.data)
