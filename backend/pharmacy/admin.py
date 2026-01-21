from django.contrib import admin
from .models import Supplier, PurchaseInvoice, PurchaseItem, PharmacyStock, PharmacySale, PharmacySaleItem

@admin.register(Supplier)
class SupplierAdmin(admin.ModelAdmin):
    list_display = ('supplier_name', 'phone', 'gst_no', 'is_active')

class PurchaseItemInline(admin.TabularInline):
    model = PurchaseItem
    extra = 1

@admin.register(PurchaseInvoice)
class PurchaseInvoiceAdmin(admin.ModelAdmin):
    list_display = ('supplier_invoice_no', 'supplier', 'invoice_date', 'total_amount')
    inlines = [PurchaseItemInline]

@admin.register(PharmacyStock)
class PharmacyStockAdmin(admin.ModelAdmin):
    list_display = ('name', 'batch_no', 'expiry_date', 'qty_available', 'mrp', 'selling_price')
    search_fields = ('name', 'batch_no', 'barcode')
    list_filter = ('expiry_date',)

class PharmacySaleItemInline(admin.TabularInline):
    model = PharmacySaleItem
    extra = 1

@admin.register(PharmacySale)
class PharmacySaleAdmin(admin.ModelAdmin):
    list_display = ('id', 'visit', 'total_amount', 'payment_status', 'sale_date')
    inlines = [PharmacySaleItemInline]
