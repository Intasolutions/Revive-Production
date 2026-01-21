from django.contrib import admin
from .models import Invoice, InvoiceItem

class InvoiceItemInline(admin.TabularInline):
    model = InvoiceItem
    extra = 1

@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    list_display = ('id', 'visit', 'total_amount', 'payment_status', 'created_at')
    list_filter = ('payment_status', 'created_at')
    inlines = [InvoiceItemInline]
