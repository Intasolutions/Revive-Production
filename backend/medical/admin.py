from django.contrib import admin
from .models import DoctorNote

@admin.register(DoctorNote)
class DoctorNoteAdmin(admin.ModelAdmin):
    list_display = ('id', 'visit', 'created_at')
    search_fields = ('visit__patient__full_name',)


