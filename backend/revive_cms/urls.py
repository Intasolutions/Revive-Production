from django.contrib import admin
from django.urls import path, include
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/auth/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/users/', include('users.urls')),
    path('api/reception/', include('patients.urls')),
    path('api/medical/', include('medical.urls')),
    path('api/pharmacy/', include('pharmacy.urls')),
    path('api/lab/', include('lab.urls')),
    path('api/casualty/', include('casualty.urls')),
    path('api/billing/', include('billing.urls')),
    path('api/core/', include('core.urls')),
    path('api/reports/', include('reports.urls')),
]
