from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    u_id = serializers.UUIDField(source='id', read_only=True)
    password = serializers.CharField(write_only=True, required=False)

    class Meta:
        model = User
        fields = ['id', 'u_id', 'username', 'email', 'role', 'consultation_fee', 'is_active', 'date_joined', 'password']
        read_only_fields = ['id', 'u_id', 'date_joined']


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)
    u_id = serializers.UUIDField(source='id', read_only=True)

    class Meta:
        model = User
        fields = ['u_id', 'username', 'password']   # role removed from public registration
        read_only_fields = ['u_id']

    def validate_password(self, value):
        validate_password(value)
        return value

    def create(self, validated_data):
        user = User.objects.create_user(
            username=validated_data['username'],
            password=validated_data['password'],
            role='RECEPTION'  # force safe default role
        )
        return user
