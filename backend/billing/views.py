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
        return request.user.is_authenticated and (request.user.role in ['ADMIN', 'RECEPTION'] or request.user.is_superuser)

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
        
        # Deduct Stock based on request data (preserves stock_deducted flag)
        items_data = serializer.initial_data.get('items', [])
        
        for item in items_data:
            # Check if item is from Pharmacy dept and NOT already deducted
            if item.get('dept') == 'PHARMACY' and not item.get('stock_deducted'):
                name = item.get('description')
                batch = item.get('batch')
                try:
                    qty = int(item.get('qty', 0))
                except (ValueError, TypeError):
                    qty = 0
                
                if name and qty > 0:
                    # Find Stock - prefer batch match, fallback to just name
                    stock = None
                    if batch:
                        stock = PharmacyStock.objects.filter(name=name, batch_no=batch).first()
                    
                    if not stock:
                        stock = PharmacyStock.objects.filter(name=name).first() # Fallback
                    
                    if stock:
                        if stock.qty_available >= qty:
                            # Avoid F() expression because it crashes signal handlers
                            stock.qty_available -= qty 
                            stock.save()
                        else:
                            # Partial deduct or just set to 0? 
                            # Let's just deduct available
                            stock.qty_available = 0
                            stock.save()

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
        # Pending Billing: Closed Visits that have pharmacy sales but no invoice yet
        visits = Visit.objects.filter(
            status='CLOSED', 
            pharmacy_sales__isnull=False,  # Must have pharmacy sales
            invoices__isnull=True  # No invoice yet
        ).distinct().order_by('-updated_at')
        serializer = VisitSerializer(visits, many=True)
        return Response(serializer.data)
