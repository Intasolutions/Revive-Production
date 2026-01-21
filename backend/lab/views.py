from rest_framework import viewsets, permissions, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from django.db import models

from billing.models import Invoice, InvoiceItem
from .models import LabInventory, LabCharge, LabInventoryLog, LabTest
from .serializers import LabInventorySerializer, LabChargeSerializer, LabInventoryLogSerializer, LabTestSerializer



class IsLabOrAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        # Allow LAB, ADMIN, and DOCTOR (doctors need to search lab tests for requisitions)
        return request.user.is_superuser or getattr(request.user, "role", None) in ["LAB", "ADMIN", "DOCTOR"]


class LabTestViewSet(viewsets.ModelViewSet):
    queryset = LabTest.objects.all().order_by('category', 'name')
    serializer_class = LabTestSerializer
    permission_classes = [IsLabOrAdmin]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name', 'category']
    ordering_fields = ['category', 'name', 'price']
    pagination_class = None



class LabInventoryViewSet(viewsets.ModelViewSet):
    queryset = LabInventory.objects.all().order_by('item_name')
    serializer_class = LabInventorySerializer
    permission_classes = [IsLabOrAdmin]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['item_name', 'category']
    ordering_fields = ['qty', 'reorder_level']

    @action(detail=False, methods=['get'], url_path='low-stock')
    def low_stock(self, request):
        qs = LabInventory.objects.filter(qty__lte=models.F('reorder_level')).order_by('qty')
        return Response(self.get_serializer(qs, many=True).data)

    @action(detail=True, methods=['post'], url_path='stock-in')
    def stock_in(self, request, pk=None):
        item = self.get_object()
        qty = int(request.data.get('qty', 0))
        cost = request.data.get('cost', 0)
        user = request.user.full_name if hasattr(request.user, 'full_name') else str(request.user)

        if qty <= 0:
            return Response({'error': 'Quantity must be positive'}, status=status.HTTP_400_BAD_REQUEST)

        # Update Stock
        item.qty += qty
        item.save()

        # Log
        LabInventoryLog.objects.create(
            item=item,
            transaction_type='STOCK_IN',
            qty=qty,
            cost=cost,
            performed_by=user,
            notes=request.data.get('notes', '')
        )

        return Response(self.get_serializer(item).data)

    @action(detail=True, methods=['post'], url_path='stock-out')
    def stock_out(self, request, pk=None):
        item = self.get_object()
        qty = int(request.data.get('qty', 0))
        user = request.user.full_name if hasattr(request.user, 'full_name') else str(request.user)

        if qty <= 0:
            return Response({'error': 'Quantity must be positive'}, status=status.HTTP_400_BAD_REQUEST)
        
        if item.qty < qty:
            return Response({'error': 'Insufficient stock'}, status=status.HTTP_400_BAD_REQUEST)

        # Update Stock
        item.qty -= qty
        item.save()

        # Log
        LabInventoryLog.objects.create(
            item=item,
            transaction_type='STOCK_OUT',
            qty=qty,
            performed_by=user,
            notes=request.data.get('notes', '')
        )

        return Response(self.get_serializer(item).data)


class LabChargeViewSet(viewsets.ModelViewSet):
    queryset = LabCharge.objects.all().order_by('-created_at')
    serializer_class = LabChargeSerializer
    permission_classes = [IsLabOrAdmin]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    search_fields = ['test_name', 'visit__patient__full_name', 'visit__patient__phone']
    filterset_fields = ['visit', 'status']

    def perform_update(self, serializer):
        instance = serializer.save()
        
        # Trigger Billing & Inventory if status matches COMPLETED
        if instance.status == 'COMPLETED':
            # --- INVENTORY DEDUCTION LOGIC ---
            try:
                # Check if specific consumption data was sent (Wastage Handling)
                consumed_items = self.request.data.get('consumed_items')
                
                if consumed_items and isinstance(consumed_items, list):
                    # Manual/Actual Consumption Provided
                    for item in consumed_items:
                        inv_id = item.get('inventory_item')
                        qty_used = int(item.get('qty', 0))
                        
                        if inv_id and qty_used > 0:
                            inv_item = LabInventory.objects.get(id=inv_id)
                            inv_item.qty = max(0, inv_item.qty - qty_used)
                            inv_item.save()
                            
                            LabInventoryLog.objects.create(
                                item=inv_item,
                                transaction_type='STOCK_OUT',
                                qty=qty_used,
                                performed_by=instance.technician_name or 'System (Auto)',
                                notes=f'Test Consumption: {instance.test_name} (Patient: {instance.visit.patient.full_name})'
                            )
                else:
                    # Fallback to Default Recipe
                    lab_test = LabTest.objects.filter(name=instance.test_name).first()
                    if lab_test:
                        for requirement in lab_test.required_items.all():
                            inventory_item = requirement.inventory_item
                            qty_needed = requirement.qty_per_test
                            
                            # Deduct Stock
                            inventory_item.qty = max(0, inventory_item.qty - qty_needed)
                            inventory_item.save()
                            
                            # Log Transaction
                            LabInventoryLog.objects.create(
                                item=inventory_item,
                                transaction_type='STOCK_OUT',
                                qty=qty_needed,
                                performed_by=instance.technician_name or 'System (Auto)',
                                notes=f'Auto-deduction for Test: {instance.test_name} (Patient: {instance.visit.patient.full_name})'
                            )
            except Exception as e:
                print(f"Inventory Auto-Stockout Error: {e}")

            # --- BILLING LOGIC ---
            # 1. Get/Create Invoice for this Visit
            # We look for a pending invoice for this visit, or create one.
            invoice, created = Invoice.objects.get_or_create(
                visit=instance.visit,
                payment_status='PENDING',
                defaults={
                    'patient_name': instance.visit.patient.full_name if instance.visit.patient else 'Unknown',
                    'total_amount': 0
                }
            )

            # 2. Add Invoice Item
            InvoiceItem.objects.create(
                invoice=invoice,
                dept='LAB',
                description=instance.test_name,
                qty=1,
                unit_price=instance.amount,
                amount=instance.amount
            )

            # 3. Update Invoice Total
            # Recalculate total to be safe
            total = sum(item.amount for item in invoice.items.all())
            invoice.total_amount = total
            invoice.save()
