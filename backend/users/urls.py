from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import RegisterView, UserProfileView, UserViewSet

router = DefaultRouter()
router.register('management', UserViewSet, basename='user-management')

urlpatterns = [
    path('', include(router.urls)),
    path('register/', RegisterView.as_view(), name='register'),
    path('me/', UserProfileView.as_view(), name='profile'),
]
