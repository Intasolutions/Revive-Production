from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import PatientViewSet, VisitViewSet

router = DefaultRouter()
router.register(r'patients', PatientViewSet)
router.register(r'visits', VisitViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
