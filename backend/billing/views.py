from rest_framework import viewsets, permissions, filters
from rest_framework.decorators import action
from rest_framework.response import Response
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
    permission_classes = [IsAdminOrReception]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['visit__patient__full_name', 'patient_name', 'payment_status']
    filterset_fields = ['payment_status', 'visit__doctor', 'visit__patient', 'visit__patient__id']
    ordering_fields = ['created_at', 'total_amount']

    def perform_create(self, serializer):
        invoice = serializer.save()
        self._deduct_stock(invoice)
        
        # Close the visit and reset role to prevent it from showing in 'Ready for Billing'
        if invoice.visit:
            visit = invoice.visit
            visit.status = 'CLOSED'
            # visit.assigned_role = 'DOCTOR' # Optional: Reset role or leave as BILLING but status CLOSED hides it
            visit.save()

    def perform_update(self, serializer):
        invoice = serializer.save()
        self._deduct_stock(invoice)

    def _deduct_stock(self, invoice):
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
                    stock = PharmacyStock.objects.filter(name__iexact=name, batch_no__iexact=batch).first()
                if not stock:
                    stock = PharmacyStock.objects.filter(name__iexact=name).first()
                
                if stock:
                    # Perform stock adjustment
                    stock.qty_available -= delta
                    if stock.qty_available < 0:
                        stock.qty_available = 0
                    stock.save()
                    
                    # Update item tracking
                    item.deducted_qty = current_qty
                    item.stock_deducted = True
                    item.save()

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
        current_month = timezone.now().month
        current_year = timezone.now().year
        
        # Revenue Today (Sum of payments made TODAY, regardless of invoice date? Or invoices created today?)
        # Usually "Today's Collection" refers to actual money received today.
        # "Today's Revenue" might mean invoices generated. 
        # Let's stick to previous logic: Invoices created today that are fully paid.
        # OR better: Sum of PaymentTransactions created today.
        
        # Let's match User Request: "total amount credited with monthly wise"
        
        # 1. Total Collection This Month (Sum of all PaymentTransactions in current month)
        monthly_payments = PaymentTransaction.objects.filter(
            created_at__month=current_month,
            created_at__year=current_year
        )
        total_monthly_collection = monthly_payments.aggregate(Sum('amount'))['amount__sum'] or 0
        
        # 2. Breakdown
        cash_monthly = monthly_payments.filter(mode='CASH').aggregate(Sum('amount'))['amount__sum'] or 0
        upi_monthly = monthly_payments.filter(mode='UPI').aggregate(Sum('amount'))['amount__sum'] or 0
        card_monthly = monthly_payments.filter(mode='CARD').aggregate(Sum('amount'))['amount__sum'] or 0

        # Note: Original code was "Billed Today". Let's keep supporting "today's stats" for original cards, 
        # and add "monthly_stats" for the new request.
        
        # Revenue Today (Invoices generated today that are paid) - OLD LOGIC
        # revenue_today = Invoice.objects.filter(created_at__date=today, payment_status='PAID').aggregate(Sum('total_amount'))['total_amount__sum'] or 0
        
        # Collection Today (Actual payments received today) - BETTER LOGIC
        collection_today = PaymentTransaction.objects.filter(created_at__date=today).aggregate(Sum('amount'))['amount__sum'] or 0

        # Pending Amount
        pending = Invoice.objects.filter(payment_status='PENDING').aggregate(Sum('total_amount'))['total_amount__sum'] or 0
        
        # Subtract partial payments from pending total?
        # Detailed logic: Sum(Invoice Total) - Sum(Payments for Pending Invoices)
        # Simplified: Just sum invoice totals for now, or refine if needed.
        
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
