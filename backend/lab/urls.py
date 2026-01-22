from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import LabInventoryViewSet, LabChargeViewSet, LabTestViewSet, LabCategoryViewSet

router = DefaultRouter()
router.register(r'categories', LabCategoryViewSet)
router.register(r'inventory', LabInventoryViewSet)
router.register(r'charges', LabChargeViewSet)
router.register(r'tests', LabTestViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
