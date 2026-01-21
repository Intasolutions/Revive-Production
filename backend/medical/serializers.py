from rest_framework import serializers
from .models import DoctorNote


class DoctorNoteSerializer(serializers.ModelSerializer):
    note_id = serializers.UUIDField(source='id', read_only=True)
    visit_id = serializers.UUIDField(source='visit.id', read_only=True)

    created_by = serializers.UUIDField(source='created_by.id', read_only=True)
    created_by_name = serializers.CharField(source='created_by.username', read_only=True)

    class Meta:
        model = DoctorNote
        fields = ['note_id', 'visit', 'visit_id', 'diagnosis', 'prescription', 'notes', 'lab_referral_details', 'created_by', 'created_by_name', 'created_at', 'updated_at']
        read_only_fields = ['note_id', 'created_at', 'updated_at']

    def create(self, validated_data):
        note = super().create(validated_data)
        self.emit_socket_update(note)
        return note

    def update(self, instance, validated_data):
        note = super().update(instance, validated_data)
        self.emit_socket_update(note)
        return note

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


