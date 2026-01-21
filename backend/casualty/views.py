from rest_framework import viewsets, permissions, filters
from django_filters.rest_framework import DjangoFilterBackend
from .models import CasualtyLog
from .serializers import CasualtyLogSerializer
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
    ordering_fields = ['created_at']

    def get_queryset(self):
        return CasualtyLog.objects.all().order_by('-created_at')
