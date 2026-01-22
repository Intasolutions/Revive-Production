from django.contrib import admin

from .models import CasualtyLog

@admin.register(CasualtyLog)
class CasualtyLogAdmin(admin.ModelAdmin):
    list_display = ('id', 'visit', 'created_at')
    search_fields = ('visit__patient__full_name',)
