from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import DoctorNoteViewSet

router = DefaultRouter()
router.register(r'doctor-notes', DoctorNoteViewSet, basename='doctor-notes')


urlpatterns = [
    path('', include(router.urls)),
]
