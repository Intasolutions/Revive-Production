from django.contrib import admin
from .models import Patient, Visit

@admin.register(Patient)
class PatientAdmin(admin.ModelAdmin):
    list_display = ('full_name', 'phone', 'age', 'gender', 'created_at')
    search_fields = ('full_name', 'phone')
    list_filter = ('gender',)

@admin.register(Visit)
class VisitAdmin(admin.ModelAdmin):
    list_display = ('id', 'patient', 'doctor', 'status', 'created_at')
    list_filter = ('status', 'created_at')
    search_fields = ('patient__full_name', 'doctor__username')
