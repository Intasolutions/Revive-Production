from rest_framework import serializers
from .models import (
    CasualtyLog, CasualtyServiceDefinition, 
    CasualtyService, CasualtyMedicine, CasualtyObservation
)

class CasualtyLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = CasualtyLog
        fields = '__all__'

class CasualtyServiceDefinitionSerializer(serializers.ModelSerializer):
    class Meta:
        model = CasualtyServiceDefinition
        fields = '__all__'

class CasualtyServiceSerializer(serializers.ModelSerializer):
    name = serializers.ReadOnlyField(source='service_definition.name')
    total_charge = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)

    class Meta:
        model = CasualtyService
        fields = '__all__'

class CasualtyMedicineSerializer(serializers.ModelSerializer):
    name = serializers.ReadOnlyField(source='med_stock.name')
    batch = serializers.ReadOnlyField(source='med_stock.batch_no')
    total_price = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)

    class Meta:
        model = CasualtyMedicine
        fields = '__all__'

class CasualtyObservationSerializer(serializers.ModelSerializer):
    class Meta:
        model = CasualtyObservation
        fields = '__all__'
