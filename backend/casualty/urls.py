from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import CasualtyLogViewSet

router = DefaultRouter()
router.register(r'logs', CasualtyLogViewSet, basename='casualty-logs')

urlpatterns = [
    path('', include(router.urls)),
]
