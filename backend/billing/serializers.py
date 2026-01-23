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

    class Meta:
        model = Invoice
        fields = ['id', 'visit', 'patient_name', 'total_amount', 'payment_status', 'items', 'patient_display', 'patient_id', 'created_at']

    def get_patient_display(self, obj):
        if obj.visit and obj.visit.patient:
            return obj.visit.patient.full_name
        return obj.patient_name or "Walking Patient"

    def get_patient_id(self, obj):
        if obj.visit and obj.visit.patient:
            return obj.visit.patient.id
        return None

    def create(self, validated_data):
        try:
            items_data = validated_data.pop('items', [])
            invoice = Invoice.objects.create(**validated_data)
            for item_data in items_data:
                # Remove non-model fields that might be sent from frontend
                item_data.pop('stock_deducted', None) 
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
        except Exception as e:
            print(f"Error creating invoice: {str(e)}")
            raise serializers.ValidationError(f"Creation failed: {str(e)}")

    def update(self, instance, validated_data):
        items_data = validated_data.pop('items', None)
        
        # Update Invoice Instance
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        # Update Items if provided
        if items_data is not None:
            # Simplest approach: Remove old items and re-create new ones
            instance.items.all().delete()
            for item_data in items_data:
                item_data.pop('stock_deducted', None)
                InvoiceItem.objects.create(invoice=instance, **item_data)
        
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
