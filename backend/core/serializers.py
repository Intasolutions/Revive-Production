from rest_framework import serializers
from .models import Notification

class NotificationSerializer(serializers.ModelSerializer):
    timestamp = serializers.DateTimeField(source='created_at', read_only=True)
    
    class Meta:
        model = Notification
        fields = ['id', 'recipient', 'message', 'is_read', 'type', 'related_id', 'timestamp']
        read_only_fields = ['recipient', 'created_at']
