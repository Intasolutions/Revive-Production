from rest_framework import serializers
from .models import Invoice, InvoiceItem

class InvoiceItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = InvoiceItem
        fields = '__all__'
        read_only_fields = ['invoice']

class InvoiceSerializer(serializers.ModelSerializer):
    items = InvoiceItemSerializer(many=True, required=False)
    patient_display = serializers.SerializerMethodField()
    patient_id = serializers.SerializerMethodField()
    registration_number = serializers.SerializerMethodField()

    class Meta:
        model = Invoice
        fields = ['id', 'visit', 'patient_name', 'total_amount', 'payment_status', 'items', 'patient_display', 'patient_id', 'registration_number', 'created_at']

    def get_patient_display(self, obj):
        if obj.visit and obj.visit.patient:
            return obj.visit.patient.full_name
        return obj.patient_name or "Walking Patient"

    def get_patient_id(self, obj):
        if obj.visit and obj.visit.patient:
            return obj.visit.patient.id
        return None

    def get_registration_number(self, obj):
        if obj.visit and obj.visit.patient:
            return obj.visit.patient.registration_number
        return "N/A"

    def create(self, validated_data):
        items_data = validated_data.pop('items', [])
        invoice = Invoice.objects.create(**validated_data)
        for item_data in items_data:
            InvoiceItem.objects.create(invoice=invoice, **item_data)
        
        # Emit Socket Event
        try:
            from asgiref.sync import async_to_sync
            from revive_cms.sio import sio
            async_to_sync(sio.emit)('billing_update', {
                'invoice_id': str(invoice.id),
                'amount': float(invoice.total_amount),
                'status': invoice.payment_status
            })
        except Exception as e:
            print(f"Socket emit error: {e}")

        return invoice

    def update(self, instance, validated_data):
        items_data = validated_data.pop('items', None)
        
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if items_data is not None:
            # Sync Items: Keep existing, create new, remove missing
            keep_ids = []
            for item_data in items_data:
                item_id = item_data.get('id')
                if item_id:
                    item_instance = InvoiceItem.objects.filter(id=item_id, invoice=instance).first()
                    if item_instance:
                        for attr, value in item_data.items():
                            setattr(item_instance, attr, value)
                        item_instance.save()
                        keep_ids.append(item_instance.id)
                    else:
                        # Fallback: create if ID not found but provided (unlikely)
                        new_item = InvoiceItem.objects.create(invoice=instance, **item_data)
                        keep_ids.append(new_item.id)
                else:
                    # New item
                    new_item = InvoiceItem.objects.create(invoice=instance, **item_data)
                    keep_ids.append(new_item.id)
            
            # Remove missing items
            instance.items.exclude(id__in=keep_ids).delete()
        
        # Emit Socket Event
        try:
            from asgiref.sync import async_to_sync
            from revive_cms.sio import sio
            async_to_sync(sio.emit)('billing_update', {
                'invoice_id': str(instance.id),
                'amount': float(instance.total_amount),
                'status': instance.payment_status
            })
        except Exception as e:
            print(f"Socket emit error: {e}")

        return instance
