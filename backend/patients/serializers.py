from rest_framework import serializers
from .models import Patient, Visit


class PatientSerializer(serializers.ModelSerializer):
    p_id = serializers.UUIDField(source='id', read_only=True)

    total_visits = serializers.SerializerMethodField()

    class Meta:
        model = Patient
        fields = ['id', 'p_id', 'full_name', 'age', 'gender', 'phone', 'address', 'id_proof', 'total_visits', 'last_consulted_doctor', 'created_at', 'updated_at']
        read_only_fields = ['id', 'p_id', 'created_at', 'updated_at']

    def get_total_visits(self, obj):
        return obj.visits.count()

    def validate_phone(self, value):
        cleaned = value.strip()
        # simple validation; adjust for your country format if needed
        if not cleaned.isdigit():
            raise serializers.ValidationError("Phone must contain only digits.")
        if len(cleaned) < 8 or len(cleaned) > 15:
            raise serializers.ValidationError("Phone length must be between 8 and 15 digits.")
        return cleaned

    last_consulted_doctor = serializers.SerializerMethodField()

    def get_last_consulted_doctor(self, obj):
        # Find the last visit that actually had a doctor assigned
        last_visit = obj.visits.filter(doctor__isnull=False).order_by('-created_at').first()
        if last_visit:
            return {
                "id": last_visit.doctor.id,
                "name": f"Dr. {last_visit.doctor.first_name} {last_visit.doctor.last_name}"
            }
        return None


class VisitSerializer(serializers.ModelSerializer):
    v_id = serializers.UUIDField(source='id', read_only=True)
    patient_name = serializers.CharField(source='patient.full_name', read_only=True)
    doctor_name = serializers.SerializerMethodField()
    consultation_fee = serializers.SerializerMethodField()
    patient_age = serializers.IntegerField(source='patient.age', read_only=True)
    patient_gender = serializers.CharField(source='patient.gender', read_only=True)

    class Meta:
        model = Visit
        fields = [
            'id', 'v_id', 'patient', 'patient_name', 'doctor', 'doctor_name', 'consultation_fee', 'assigned_role',
            'status', 'vitals', 'prescription', 'lab_referral_details', 'pharmacy_items', 'lab_results', 'patient_age', 'patient_gender', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'v_id', 'created_at', 'updated_at']

    prescription = serializers.SerializerMethodField()
    lab_referral_details = serializers.SerializerMethodField()
    pharmacy_items = serializers.SerializerMethodField()
    lab_results = serializers.SerializerMethodField()
    
    def get_doctor_name(self, obj):
        # Get doctor name from visit.doctor FK
        if obj.doctor:
            # Try to get full name if available
            if hasattr(obj.doctor, 'first_name') and hasattr(obj.doctor, 'last_name'):
                full_name = f"{obj.doctor.first_name} {obj.doctor.last_name}".strip()
                if full_name:
                    return full_name
            return obj.doctor.username
        return None
    
    def get_consultation_fee(self, obj):
        # Get doctor's consultation fee
        if obj.doctor and hasattr(obj.doctor, 'consultation_fee'):
            return float(obj.doctor.consultation_fee)
        return 500.00  # Default fee

    def get_pharmacy_items(self, obj):
        # Return list of items from all PENDING pharmacy sales
        try:
            # Fetch ALL pharmacy sales for this visit to be safe (billing can filter if needed)
            sales = obj.pharmacy_sales.all()
        except Exception:
            return []
        
        items = []
        
        # Get prescription data for dosage/duration
        prescription_map = {}
        try:
            if hasattr(obj, 'doctor_note') and obj.doctor_note and hasattr(obj.doctor_note, 'prescription'):
                if isinstance(obj.doctor_note.prescription, dict):
                    prescription_map = obj.doctor_note.prescription
        except Exception:
            pass # prescription fetch is optional
        
        for sale in sales:
            # Iterate through items safely
            try:
                sale_items = sale.items.all()
            except Exception:
                continue

            for item in sale_items:
                try:
                    med_stock = item.med_stock
                    med_name = med_stock.name
                    
                    # Try to get dosage/duration from prescription
                    dosage = ""
                    duration = ""
                    if med_name in prescription_map:
                        details = prescription_map.get(med_name, "")
                        if details:
                            parts = details.split('|')
                            if len(parts) >= 1:
                                dosage = parts[0].strip()
                            if len(parts) >= 2:
                                duration = parts[1].strip()
                    
                    # Safe GST calculation
                    gst = 0
                    try:
                        if item.gst_percent > 0:
                            gst = float(item.gst_percent)
                        elif med_stock.gst_percent:
                            gst = float(med_stock.gst_percent)
                    except:
                        gst = 0

                    items.append({
                        "med_id": med_stock.id,
                        "name": med_name,
                        "qty": item.qty,
                        "unit_price": float(item.unit_price) if item.unit_price else 0.0,
                        "amount": float(item.amount) if item.amount else 0.0,
                        "batch": med_stock.batch_no,
                        "hsn": med_stock.hsn,
                        "gst": gst,
                        "dosage": dosage,
                        "duration": duration
                    })
                except Exception as e:
                    # Log error but skip this item so others can load
                    print(f"Error processing pharmacy item {item.id if item else '?'}: {e}")
                    continue
        return items

    def get_lab_referral_details(self, obj):
        try:
            if hasattr(obj, 'doctor_note') and obj.doctor_note:
                return obj.doctor_note.lab_referral_details
        except:
            pass
        return None

    def get_prescription(self, obj):
        # Safely get prescription from related DoctorNote
        try:
            if hasattr(obj, 'doctor_note') and obj.doctor_note:
                return obj.doctor_note.prescription
        except:
            pass
        return None

    def get_lab_results(self, obj):
        # Return completed lab results for this visit
        try:
            charges = obj.lab_charges.filter(status='COMPLETED')
            results = []
            for c in charges:
                results.append({
                    "test_name": c.test_name,
                    "results": c.results,
                    "technician": c.technician_name,
                    "date": c.report_date
                })
            return results
        except:
            return []

    def validate_doctor(self, doctor):
        # Allow doctor to be null or any user
        # The frontend should ensure only doctors are selectable
        return doctor

    def create(self, validated_data):
        visit = super().create(validated_data)
        self.emit_socket_update(visit)
        return visit

    def update(self, instance, validated_data):
        visit = super().update(instance, validated_data)
        self.emit_socket_update(visit)
        return visit

    def emit_socket_update(self, visit):
        try:
            from asgiref.sync import async_to_sync
            from revive_cms.sio import sio
            
            data = {
                'visit_id': str(visit.id),
                'doctor_id': str(visit.doctor.id) if visit.doctor else None,
                'status': visit.status
            }
            print(f"--- ATTEMPTING SOCKET EMIT: visit_update --- Data: {data}")
            # Emit to all clients (broadcast)
            async_to_sync(sio.emit)('visit_update', data)
        except Exception as e:
            # Non-blocking error logging
            print(f"Socket emit error: {e}")
