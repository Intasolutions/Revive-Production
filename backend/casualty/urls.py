from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    CasualtyLogViewSet, CasualtyServiceDefinitionViewSet,
    CasualtyServiceViewSet, CasualtyMedicineViewSet,
    CasualtyObservationViewSet
)

router = DefaultRouter()
router.register(r'logs', CasualtyLogViewSet, basename='casualty-logs')
router.register(r'service-definitions', CasualtyServiceDefinitionViewSet, basename='casualty-service-definitions')
router.register(r'services', CasualtyServiceViewSet, basename='casualty-services')
router.register(r'medicines', CasualtyMedicineViewSet, basename='casualty-medicines')
router.register(r'observations', CasualtyObservationViewSet, basename='casualty-observations')

urlpatterns = [
    path('', include(router.urls)),
]
