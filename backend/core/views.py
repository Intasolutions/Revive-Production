from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import permissions
from django.utils import timezone
from django.db.models import Sum

from patients.models import Patient, Visit
from billing.models import Invoice
from pharmacy.models import PharmacyStock

from lab.models import LabCharge
from django.db.models.functions import TruncDate
from datetime import timedelta

class DashboardStatsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        today = timezone.now().date()
        last_week = today - timedelta(days=7)

        # 1. Patient & Visit Stats
        new_patients_today = Patient.objects.filter(created_at__date=today).count()
        active_visits = Visit.objects.filter(status__in=['OPEN', 'IN_PROGRESS']).count()
        
        # 2. Recent Activity (Visits)
        recent_visits = Visit.objects.select_related('patient').order_by('-created_at')[:5]
        recent_visits_data = [{
            "patient_name": v.patient.full_name,
            "status": v.status,
            "time": v.created_at,
            "id": v.id
        } for v in recent_visits]

        # 3. Financials (Today & Weekly Trend)
        revenue_today = Invoice.objects.filter(
            created_at__date=today, 
            payment_status='PAID'
        ).aggregate(Sum('total_amount'))['total_amount__sum'] or 0

        weekly_revenue = Invoice.objects.filter(
            created_at__date__gte=last_week,
            payment_status='PAID'
        ).annotate(date=TruncDate('created_at')).values('date').annotate(total=Sum('total_amount')).order_by('date')

        # 4. Lab Stats
        pending_labs = LabCharge.objects.filter(status='PENDING').count()

        # 5. Inventory Alerts (using F expressions for reorder check)
        from django.db.models import F
        low_stock_count = PharmacyStock.objects.filter(qty_available__lte=F('reorder_level'), is_deleted=False).count()

        data = {
            "patients_today": new_patients_today,
            "active_visits": active_visits,
            "revenue_today": float(revenue_today),
            "pharmacy_low_stock": low_stock_count,
            "pending_labs": pending_labs,
            "recent_visits": recent_visits_data,
            "revenue_trend": [{ "date": item['date'], "amount": float(item['total']) } for item in weekly_revenue]
        }

        return Response(data)

from rest_framework import viewsets, status
from rest_framework.decorators import action
from .models import Notification
from .serializers import NotificationSerializer

class NotificationViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = NotificationSerializer

    def get_queryset(self):
        return Notification.objects.filter(recipient=self.request.user).order_by('-created_at')

    @action(detail=False, methods=['post'])
    def mark_read(self, request):
        ids = request.data.get('ids', [])
        if ids:
            self.get_queryset().filter(id__in=ids).update(is_read=True)
        return Response({'status': 'ok'})
