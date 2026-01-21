from rest_framework import generics, permissions, viewsets, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from django.contrib.auth import get_user_model

from .serializers import UserSerializer, RegisterSerializer

User = get_user_model()


class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    permission_classes = [permissions.AllowAny]
    serializer_class = RegisterSerializer


class UserProfileView(generics.RetrieveUpdateAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = UserSerializer

    def get_object(self):
        return self.request.user


from core.permissions import IsAdminRole

class UserViewSet(viewsets.ModelViewSet):
    """
    CRUD for Admins to manage all hospital staff.
    """
    queryset = User.objects.all().order_by('-date_joined')
    serializer_class = UserSerializer
    permission_classes = [IsAdminRole]
    filter_backends = [filters.SearchFilter]
    search_fields = ['username', 'email', 'role']

    @action(detail=False, methods=['get'], permission_classes=[permissions.IsAuthenticated])
    def doctors(self, request):
        doctors = User.objects.filter(role='DOCTOR', is_active=True)
        # doctors = self.filter_queryset(doctors)  <-- Removed to prevent unexpected filtering
        serializer = self.get_serializer(doctors, many=True)
        return Response(serializer.data)

    def perform_create(self, serializer):
        password = serializer.validated_data.pop('password', None)
        user = serializer.save()
        if password:
            user.set_password(password)
            user.save()

    def perform_update(self, serializer):
        password = serializer.validated_data.pop('password', None)
        user = serializer.save()
        if password:
            user.set_password(password)
            user.save()
