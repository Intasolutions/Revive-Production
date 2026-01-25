from django.contrib import admin

from .models import CasualtyLog, CasualtyServiceDefinition, CasualtyService, CasualtyMedicine, CasualtyObservation

@admin.register(CasualtyLog)
class CasualtyLogAdmin(admin.ModelAdmin):
    list_display = ('id', 'visit', 'created_at')
    search_fields = ('visit__patient__full_name',)
@admin.register(CasualtyServiceDefinition)
class CasualtyServiceDefinitionAdmin(admin.ModelAdmin):
    list_display = ('name', 'base_charge', 'is_active')
    search_fields = ('name',)

@admin.register(CasualtyService)
class CasualtyServiceAdmin(admin.ModelAdmin):
    list_display = ('visit', 'service_definition', 'qty', 'total_charge')

@admin.register(CasualtyMedicine)
class CasualtyMedicineAdmin(admin.ModelAdmin):
    list_display = ('visit', 'med_stock', 'qty', 'total_price', 'administered_at')

@admin.register(CasualtyObservation)
class CasualtyObservationAdmin(admin.ModelAdmin):
    list_display = ('visit', 'start_time', 'end_time', 'is_active')
    list_filter = ('is_active',)
