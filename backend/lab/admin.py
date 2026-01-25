from django.contrib import admin
from .models import LabInventory, LabCharge, LabTest, LabCategory, LabSupplier, LabBatch, LabPurchase, LabPurchaseItem, LabInventoryLog

@admin.register(LabSupplier)
class LabSupplierAdmin(admin.ModelAdmin):
    list_display = ('supplier_name', 'phone', 'is_active')
    search_fields = ('supplier_name',)

@admin.register(LabBatch)
class LabBatchAdmin(admin.ModelAdmin):
    list_display = ('inventory_item', 'batch_no', 'expiry_date', 'qty')
    search_fields = ('batch_no', 'inventory_item__item_name')

class LabPurchaseItemInline(admin.TabularInline):
    model = LabPurchaseItem
    extra = 1

@admin.register(LabPurchase)
class LabPurchaseAdmin(admin.ModelAdmin):
    list_display = ('supplier_invoice_no', 'supplier', 'invoice_date', 'total_amount')
    inlines = [LabPurchaseItemInline]

@admin.register(LabInventoryLog)
class LabInventoryLogAdmin(admin.ModelAdmin):
    list_display = ('item', 'transaction_type', 'qty', 'performed_by', 'created_at')
    list_filter = ('transaction_type',)

@admin.register(LabCategory)
class LabCategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'id')
    search_fields = ('name',)

@admin.register(LabInventory)
class LabInventoryAdmin(admin.ModelAdmin):
    list_display = ('item_name', 'category', 'qty', 'reorder_level')
    list_filter = ('category',)
    search_fields = ('item_name',)

@admin.register(LabCharge)
class LabChargeAdmin(admin.ModelAdmin):
    list_display = ('test_name', 'amount', 'visit', 'created_at')

@admin.register(LabTest)
class LabTestAdmin(admin.ModelAdmin):
    list_display = ('name', 'category', 'price')
    list_filter = ('category',)
    search_fields = ('name',)
