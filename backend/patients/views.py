from rest_framework import viewsets, permissions, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from revive_cms.utils import export_to_csv

from .models import Patient, Visit
from .serializers import PatientSerializer, VisitSerializer


from core.permissions import IsHospitalStaff

class PatientViewSet(viewsets.ModelViewSet):
    queryset = Patient.objects.all().order_by('-created_at')
    serializer_class = PatientSerializer
    permission_classes = [IsHospitalStaff]

    filter_backends = [filters.SearchFilter]
    search_fields = ['full_name', 'phone']

    def get_queryset(self):
        qs = Patient.objects.all().order_by('-created_at')
        
        # Filter Logic: Exclude active patients if requested
        exclude_active = self.request.query_params.get('exclude_active')
        if exclude_active == 'true':
            # Exclude patients who have any active visit
            active_statuses = ['OPEN', 'IN_PROGRESS', 'WAITING']
            qs = qs.exclude(visits__status__in=active_statuses)
            
        return qs

    @action(detail=False, methods=['get'], url_path='export')
    def export_csv(self, request):
        return export_to_csv(
            self.get_queryset(), 
            "patients", 
            ['id', 'full_name', 'age', 'gender', 'phone', 'created_at']
        )

    @action(detail=False, methods=['post'], url_path='register')
    def register(self, request):
        """
        Flow:
        - Search by phone
        - If exists -> return existing patient
        - Else -> create new patient
        """
        phone = (request.data.get("phone") or "").strip()
        if not phone:
            return Response({"phone": ["This field is required."]}, status=status.HTTP_400_BAD_REQUEST)

        existing = Patient.objects.filter(phone=phone).first()
        if existing:
            return Response(PatientSerializer(existing).data, status=status.HTTP_200_OK)

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        patient = serializer.save()
        return Response(PatientSerializer(patient).data, status=status.HTTP_201_CREATED)


class VisitViewSet(viewsets.ModelViewSet):
    queryset = Visit.objects.all().order_by('-created_at')
    serializer_class = VisitSerializer
    permission_classes = [IsHospitalStaff]

    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = {
        'status': ['exact', 'in'],
        'patient': ['exact'], 
        'doctor': ['exact'],
        'assigned_role': ['exact']
    }
    search_fields = ['patient__full_name', 'patient__phone']
    ordering_fields = ['created_at', 'updated_at']

    def perform_create(self, serializer):
        visit = serializer.save()
        match_role = None
        
        # Determine who to notify
        if visit.assigned_role and visit.assigned_role != 'DOCTOR':
            match_role = visit.assigned_role
        elif visit.doctor:
            # Single doctor notification (legacy/specific)
            from core.models import Notification
            Notification.objects.create(
                recipient=visit.doctor,
                message=f"New patient assigned: {visit.patient.full_name}",
                type='VISIT_ASSIGNED',
                related_id=visit.id
            )
            return

        if match_role:
            from core.models import Notification
            from django.contrib.auth import get_user_model
            User = get_user_model()
            
            # Broadcast to all active users in that role
            recipients = User.objects.filter(role=match_role, is_active=True)
            notifications = [
                Notification(
                    recipient=u,
                    message=f"New Patient in Queue: {visit.patient.full_name}",
                    type='VISIT_ASSIGNED',
                    related_id=visit.id
                ) for u in recipients
            ]
            Notification.objects.bulk_create(notifications)

    def perform_update(self, serializer):
        old_doctor = serializer.instance.doctor
        old_role = serializer.instance.assigned_role
        
        # DEBUG LOGGING
        print(f"\n=== VISIT UPDATE DEBUG ===")
        print(f"Visit ID: {serializer.instance.id}")
        print(f"Request data: {self.request.data}")
        print(f"Old doctor: {old_doctor}")
        print(f"Validated data doctor: {serializer.validated_data.get('doctor')}")
        
        visit = serializer.save()
        
        print(f"After save - visit.doctor: {visit.doctor}")
        print(f"=========================\n")
        
        # Check for Doctor change
        if visit.doctor and visit.doctor != old_doctor:
            from core.models import Notification
            Notification.objects.create(
                recipient=visit.doctor,
                message=f"Transferred patient: {visit.patient.full_name}",
                type='VISIT_ASSIGNED',
                related_id=visit.id
            )
            
        # Check for Role change (Referral)
        if visit.assigned_role and visit.assigned_role != old_role and visit.assigned_role != 'DOCTOR':
            from core.models import Notification
            from django.contrib.auth import get_user_model
            User = get_user_model()
            
            recipients = User.objects.filter(role=visit.assigned_role, is_active=True)
            notifications = [
                Notification(
                    recipient=u,
                    message=f"New Referral: {visit.patient.full_name} (from {old_role or 'Reception'})",
                    type='VISIT_ASSIGNED',
                    related_id=visit.id
                ) for u in recipients
            ]
            Notification.objects.bulk_create(notifications)
