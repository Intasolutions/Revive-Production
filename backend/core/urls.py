from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import DashboardStatsView, NotificationViewSet

router = DefaultRouter()
router.register('notifications', NotificationViewSet, basename='notifications')

urlpatterns = [
    path('dashboard/stats/', DashboardStatsView.as_view(), name='dashboard-stats'),
    path('', include(router.urls)),
]
