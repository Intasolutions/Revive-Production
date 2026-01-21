from rest_framework import serializers
from .models import CasualtyLog

class CasualtyLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = CasualtyLog
        fields = '__all__'
