from rest_framework import viewsets, permissions, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from django.db import models

from billing.models import Invoice, InvoiceItem
from .models import (
    LabInventory, LabCharge, LabInventoryLog, LabTest, LabCategory, 
    LabSupplier, LabPurchase, LabBatch
)
from .serializers import (
    LabInventorySerializer, LabChargeSerializer, LabInventoryLogSerializer, 
    LabTestSerializer, LabCategorySerializer, LabSupplierSerializer, LabPurchaseSerializer
)


class IsLabOrAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        # Allow LAB, ADMIN, and DOCTOR (doctors need to search lab tests for requisitions)
        return request.user.is_superuser or getattr(request.user, "role", None) in ["LAB", "ADMIN", "DOCTOR"]


class LabCategoryViewSet(viewsets.ModelViewSet):
    queryset = LabCategory.objects.all().order_by('name')
    serializer_class = LabCategorySerializer
    permission_classes = [IsLabOrAdmin]
    pagination_class = None


class LabSupplierViewSet(viewsets.ModelViewSet):
    queryset = LabSupplier.objects.all().order_by('supplier_name')
    serializer_class = LabSupplierSerializer
    permission_classes = [IsLabOrAdmin]
    search_fields = ['supplier_name', 'phone', 'gst_no']


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
    search_fields = ['item_name', 'category', 'manufacturer']
    ordering_fields = ['qty', 'reorder_level', 'item_name']

    @action(detail=False, methods=['get'], url_path='low-stock')
    def low_stock(self, request):
        qs = LabInventory.objects.filter(qty__lte=models.F('reorder_level')).order_by('qty')
        return Response(self.get_serializer(qs, many=True).data)

    @action(detail=True, methods=['post'], url_path='stock-in')
    def stock_in(self, request, pk=None):
        """
        Simple quick stock-in without invoice details.
        Updates master qty and logs it. 
        Note: Checks for default batch or creates a general one if needed.
        """
        item = self.get_object()
        qty = int(request.data.get('qty', 0))
        cost = request.data.get('cost', 0)
        user = request.user.full_name if hasattr(request.user, 'full_name') else str(request.user)

        if qty <= 0:
            return Response({'error': 'Quantity must be positive'}, status=status.HTTP_400_BAD_REQUEST)

        # Update Stock
        item.qty += qty
        # Update cost if provided
        if float(cost) > 0:
            item.cost_per_unit = cost
        item.save()

        # Log
        LabInventoryLog.objects.create(
            item=item,
            transaction_type='STOCK_IN',
            qty=qty,
            cost=cost,
            performed_by=user,
            notes=request.data.get('notes', 'Quick adjustment')
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
        
        # Deduct from batches (FIFO)
        remaining_to_deduct = qty
        batches = LabBatch.objects.filter(inventory_item=item, qty__gt=0).order_by('expiry_date')
        
        for batch in batches:
            if remaining_to_deduct <= 0:
                break
            
            deduct = min(batch.qty, remaining_to_deduct)
            batch.qty -= deduct
            batch.save()
            remaining_to_deduct -= deduct

        # Log
        LabInventoryLog.objects.create(
            item=item,
            transaction_type='STOCK_OUT',
            qty=qty,
            performed_by=user,
            notes=request.data.get('notes', 'Quick adjustment')
        )

        return Response(self.get_serializer(item).data)


class LabPurchaseViewSet(viewsets.ModelViewSet):
    """
    Handles Lab Purchases (Invoices).
    Creation logic is handled by LabPurchaseSerializer.
    """
    queryset = LabPurchase.objects.all().order_by('-invoice_date', '-created_at')
    serializer_class = LabPurchaseSerializer
    permission_classes = [IsLabOrAdmin]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['supplier__supplier_name', 'supplier_invoice_no']
    ordering_fields = ['invoice_date', 'total_amount']

    def get_queryset(self):
        qs = super().get_queryset()
        supplier_id = self.request.query_params.get('supplier_id')
        if supplier_id:
            qs = qs.filter(supplier__id=supplier_id)
        return qs


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
                            
                            # FIFO Logic for batches
                            remaining_to_deduct = qty_used
                            batches = LabBatch.objects.filter(inventory_item=inv_item, qty__gt=0).order_by('expiry_date')
                            for batch in batches:
                                if remaining_to_deduct <= 0: break
                                deduct = min(batch.qty, remaining_to_deduct)
                                batch.qty -= deduct
                                batch.save()
                                remaining_to_deduct -= deduct

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
                            
                            # Deduct Stock (Master)
                            inventory_item.qty = max(0, inventory_item.qty - qty_needed)
                            inventory_item.save()
                            
                            # FIFO Logic for batches
                            remaining_to_deduct = qty_needed
                            batches = LabBatch.objects.filter(inventory_item=inventory_item, qty__gt=0).order_by('expiry_date')
                            for batch in batches:
                                if remaining_to_deduct <= 0: break
                                deduct = min(batch.qty, remaining_to_deduct)
                                batch.qty -= deduct
                                batch.save()
                                remaining_to_deduct -= deduct
                            
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

            # --- AUTO RETURN TO DOCTOR ---
            # If status became COMPLETED, send patient back to Doctor's queue
            # so they can see the results.
            # UPDATE: Only send back if the valid referral came from doctor.
            if instance.visit and instance.visit.assigned_role == 'LAB':
                should_notify = False
                
                # Check Doctor Note for this test
                try:
                    if hasattr(instance.visit, 'doctor_note'):
                        note = instance.visit.doctor_note
                        referral_text = (note.lab_referral_details or "").lower()
                        # Normalize test name for permissive matching
                        current_test = instance.test_name.lower().strip()
                        
                        # Basic substring check - effective enough for now
                        if current_test in referral_text:
                            should_notify = True
                except Exception:
                    pass

                if should_notify:
                    instance.visit.assigned_role = 'DOCTOR'
                    instance.visit.status = 'OPEN' 
                    instance.visit.save()
                    
                    # Notify Doctor
                    from core.models import Notification
                    if instance.visit.doctor:
                        Notification.objects.create(
                            recipient=instance.visit.doctor,
                            message=f"Lab Results Ready: {instance.visit.patient.full_name} ({instance.test_name})",
                            type='LAB_RESULT',
                            related_id=instance.visit.id
                        )

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
