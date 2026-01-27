from rest_framework import serializers
from .models import DoctorNote


class DoctorNoteSerializer(serializers.ModelSerializer):
    note_id = serializers.UUIDField(source='id', read_only=True)
    visit_id = serializers.UUIDField(source='visit.id', read_only=True)

    created_by = serializers.UUIDField(source='created_by.id', read_only=True)
    created_by_name = serializers.CharField(source='created_by.username', read_only=True)

    class Meta:
        model = DoctorNote
        fields = ['note_id', 'visit', 'visit_id', 'diagnosis', 'prescription', 'notes', 'lab_referral_details', 'lab_results', 'created_by', 'created_by_name', 'created_at', 'updated_at']
        read_only_fields = ['note_id', 'created_at', 'updated_at']

    lab_results = serializers.SerializerMethodField()
    
    def get_lab_results(self, obj):
        try:
            return obj.visit.lab_charges.filter(status='COMPLETED').values(
                'test_name', 'results', 'technician_name', 'report_date'
            )
        except:
            return []

    def create(self, validated_data):
        note = super().create(validated_data)
        self._sync_pharmacy_sale(note)
        self.emit_socket_update(note)
        return note

    def update(self, instance, validated_data):
        note = super().update(instance, validated_data)
        self._sync_pharmacy_sale(note)
        self.emit_socket_update(note)
        return note

    def _sync_pharmacy_sale(self, note):
        """
        Safely creates/updates a Pending Pharmacy Sale based on the prescription.
        This ensures POS/Billing sees the medicines immediately.
        """
        try:
            from pharmacy.models import PharmacySale, PharmacySaleItem, PharmacyStock
            from django.db import transaction

            # Only proceed if there is a prescription
            if not note.prescription:
                return

            with transaction.atomic():
                # Get/Create Pending Sale for this visit
                sale, created = PharmacySale.objects.get_or_create(
                    visit=note.visit,
                    payment_status='PENDING',
                    defaults={
                        'patient': note.visit.patient,
                        'total_amount': 0
                    }
                )

                # If sale is already PAID, do not modify it (safety check)
                if sale.payment_status == 'PAID':
                    return

                # Validate data structure
                if not isinstance(note.prescription, dict):
                    return

                # Clear existing items to sync with current prescription state
                # (Simple overwrite strategy for PENDING sales)
                sale.items.all().delete()

                total_amt = 0

                for med_name, details in note.prescription.items():
                    # Parse Qty: "Dosage | Duration | Qty: 10"
                    try:
                        qty = 0
                        if "Qty:" in details:
                            parts = details.split("Qty:")
                            if len(parts) > 1:
                                qty_str = parts[1].strip().split(" ")[0] # Handle cases like "10 (Tabs)"
                                qty = int(qty_str)
                        
                        if qty <= 0:
                            continue

                        # Find Stock (Best effort by name, usually doctor selects generic name)
                        # We pick the batch with earliest expiry or just first available
                        stock_item = PharmacyStock.objects.filter(
                            name__iexact=med_name, 
                            qty_available__gt=0,
                            is_deleted=False
                        ).order_by('expiry_date').first()

                        # If no stock with qty, just pick any stock record for price reference? 
                        # Or fallback to stock with 0 qty.
                        if not stock_item:
                             stock_item = PharmacyStock.objects.filter(
                                name__iexact=med_name,
                                is_deleted=False
                            ).first()

                        if stock_item:
                            price = stock_item.selling_price if stock_item.selling_price > 0 else stock_item.mrp
                            amount = price * qty
                            
                            PharmacySaleItem.objects.create(
                                sale=sale,
                                med_stock=stock_item,
                                qty=qty,
                                unit_price=price,
                                amount=amount,
                                gst_percent=stock_item.gst_percent
                            )
                            total_amt += amount
                    except Exception as e:
                        print(f"Error syncing med {med_name}: {e}")
                        continue

                sale.total_amount = total_amt
                sale.save()

        except Exception as e:
            print(f"Error in _sync_pharmacy_sale: {e}")

    def emit_socket_update(self, note):
        try:
            from asgiref.sync import async_to_sync
            from revive_cms.sio import sio
            
            data = {
                'visit_id': str(note.visit.id),
                'note_id': str(note.id),
                'has_prescription': bool(note.prescription),
                'has_lab': bool(note.lab_referral_details)
            }
            async_to_sync(sio.emit)('doctor_notes_update', data)
        except Exception as e:
            print(f"Socket emit error: {e}")


