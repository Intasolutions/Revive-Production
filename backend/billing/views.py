from rest_framework import viewsets, permissions, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Sum, F
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from patients.models import Visit
from patients.serializers import VisitSerializer
from .models import Invoice
from .serializers import InvoiceSerializer
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

    @action(detail=False, methods=['get'])
    def stats(self, request):
        today = timezone.now().date()
        
        # Revenue Today (Sum of paid invoices)
        revenue = Invoice.objects.filter(
            created_at__date=today, 
            payment_status='PAID'
        ).aggregate(Sum('total_amount'))['total_amount__sum'] or 0

        # Pending Amount (Sum of all pending invoices)
        pending = Invoice.objects.filter(
            payment_status='PENDING'
        ).aggregate(Sum('total_amount'))['total_amount__sum'] or 0

        # Invoices Count Today
        count = Invoice.objects.filter(created_at__date=today).count()

        return Response({
            'revenue_today': revenue,
            'pending_amount': pending,
            'invoices_today': count
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
