from rest_framework import viewsets, permissions, filters
from django_filters.rest_framework import DjangoFilterBackend
from .models import (
    CasualtyLog, CasualtyServiceDefinition, 
    CasualtyService, CasualtyMedicine, CasualtyObservation
)
from .serializers import (
    CasualtyLogSerializer, CasualtyServiceDefinitionSerializer,
    CasualtyServiceSerializer, CasualtyMedicineSerializer,
    CasualtyObservationSerializer
)
from core.permissions import IsHospitalStaff

class IsCasualtyOrAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        return getattr(request.user, "role", None) in ["CASUALTY", "ADMIN", "DOCTOR"] or request.user.is_superuser

class CasualtyLogViewSet(viewsets.ModelViewSet):
    serializer_class = CasualtyLogSerializer
    permission_classes = [IsCasualtyOrAdmin]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['transfer_path', 'treatment_notes', 'visit__patient__full_name']
    filterset_fields = ['visit']
    ordering_fields = ['created_at']

    def get_queryset(self):
        return CasualtyLog.objects.all().order_by('-created_at')

class CasualtyServiceDefinitionViewSet(viewsets.ModelViewSet):
    queryset = CasualtyServiceDefinition.objects.filter(is_active=True)
    serializer_class = CasualtyServiceDefinitionSerializer
    permission_classes = [IsCasualtyOrAdmin]
    filter_backends = [filters.SearchFilter]
    search_fields = ['name']

class CasualtyServiceViewSet(viewsets.ModelViewSet):
    serializer_class = CasualtyServiceSerializer
    permission_classes = [IsCasualtyOrAdmin]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['visit']

    def get_queryset(self):
        return CasualtyService.objects.all().order_by('-created_at')

class CasualtyMedicineViewSet(viewsets.ModelViewSet):
    serializer_class = CasualtyMedicineSerializer
    permission_classes = [IsCasualtyOrAdmin]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['visit']

    def get_queryset(self):
        return CasualtyMedicine.objects.all().order_by('-created_at')

    def perform_create(self, serializer):
        from rest_framework.exceptions import ValidationError
        stock = serializer.validated_data['med_stock']
        qty = serializer.validated_data['qty']

        if stock.qty_available < qty:
            raise ValidationError({"med_stock": f"Insufficient stock. Available: {stock.qty_available}"})

        stock.qty_available -= qty
        stock.save()
        serializer.save()

class CasualtyObservationViewSet(viewsets.ModelViewSet):
    serializer_class = CasualtyObservationSerializer
    permission_classes = [IsCasualtyOrAdmin]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['visit', 'is_active']

    def get_queryset(self):
        return CasualtyObservation.objects.all().order_by('-created_at')
