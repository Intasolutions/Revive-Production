import uuid
from django.db import models
from django.conf import settings
from django.core.validators import MinValueValidator
from core.models import BaseModel
from patients.models import Visit


class LabSupplier(BaseModel):
    supplier_name = models.CharField(max_length=255)
    phone = models.CharField(max_length=20, blank=True)
    address = models.TextField(blank=True)
    gst_no = models.CharField(max_length=20, blank=True)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.supplier_name


class LabInventory(BaseModel):
    item_name = models.CharField(max_length=255)
    category = models.CharField(max_length=50)
    qty = models.PositiveIntegerField(default=0)
    cost_per_unit = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    reorder_level = models.PositiveIntegerField(default=10)

    # New Premium Fields
    manufacturer = models.CharField(max_length=255, blank=True)
    unit = models.CharField(max_length=50, default='units')  # e.g. ml, strips, count
    is_liquid = models.BooleanField(default=False)
    pack_size = models.CharField(max_length=50, blank=True) # e.g. "1x100ml"
    
    # Financial defaults
    gst_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    discount_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    hsn = models.CharField(max_length=20, blank=True)
    mrp = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)

    def __str__(self):
        return self.item_name

    @property
    def is_low_stock(self):
        return self.qty <= self.reorder_level


class LabBatch(BaseModel):
    """
    Specific batches of LabInventory items.
    Used for FIFO consumption and expiry tracking.
    """
    inventory_item = models.ForeignKey(LabInventory, on_delete=models.CASCADE, related_name='batches')
    batch_no = models.CharField(max_length=50)
    expiry_date = models.DateField()
    
    qty = models.PositiveIntegerField(default=0)
    mrp = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    purchase_rate = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    
    supplier = models.ForeignKey(LabSupplier, on_delete=models.SET_NULL, null=True, blank=True)

    def __str__(self):
        return f"{self.inventory_item.item_name} ({self.batch_no})"


class LabPurchase(BaseModel):
    PURCHASE_TYPE_CHOICES = (
        ('CASH', 'Cash'),
        ('CREDIT', 'Credit'),
    )

    supplier = models.ForeignKey(LabSupplier, on_delete=models.PROTECT, related_name='purchases')
    supplier_invoice_no = models.CharField(max_length=50)
    invoice_date = models.DateField()
    credit_days = models.PositiveIntegerField(default=0)
    purchase_type = models.CharField(max_length=10, choices=PURCHASE_TYPE_CHOICES)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(0)])
    
    # Extra Expenses
    cash_discount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    courier_charge = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)

    def __str__(self):
        return f"Inv {self.supplier_invoice_no} - {self.supplier.supplier_name}"


class LabPurchaseItem(BaseModel):
    purchase = models.ForeignKey(LabPurchase, on_delete=models.CASCADE, related_name='items')
    inventory_item = models.ForeignKey(LabInventory, on_delete=models.CASCADE, related_name='purchase_items')
    batch = models.ForeignKey(LabBatch, on_delete=models.SET_NULL, null=True, blank=True)
    
    batch_no = models.CharField(max_length=50)
    expiry_date = models.DateField()
    
    qty = models.PositiveIntegerField() # Quantity purchased
    free_qty = models.PositiveIntegerField(default=0)
    
    mrp = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(0)])
    unit_cost = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(0)]) # Purchase Rate
    
    gst_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    discount_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)

    def __str__(self):
        return f"{self.inventory_item.item_name} - {self.qty}"


class LabInventoryLog(BaseModel):
    TRANSACTION_CHOICES = (
        ('STOCK_IN', 'Stock In'),
        ('STOCK_OUT', 'Stock Out'),
    )

    item = models.ForeignKey(LabInventory, on_delete=models.CASCADE, related_name='logs')
    transaction_type = models.CharField(max_length=20, choices=TRANSACTION_CHOICES)
    qty = models.PositiveIntegerField()
    # For Stock In: Cost per unit or total cost. Interpreted as Total Cost for the batch.
    cost = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    performed_by = models.CharField(max_length=255, blank=True, null=True) # Name of user
    notes = models.TextField(blank=True, null=True)

    def __str__(self):
        return f"{self.item.item_name} - {self.transaction_type} - {self.qty}"


class LabCharge(BaseModel):
    STATUS_CHOICES = (
        ('PENDING', 'Pending'),
        ('COMPLETED', 'Completed'),
        ('CANCELLED', 'Cancelled'),
    )
    visit = models.ForeignKey(Visit, on_delete=models.CASCADE, related_name='lab_charges')
    test_name = models.CharField(max_length=255)
    amount = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(0)])
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    
    # Store dynamic test results (e.g. {"Cholesterol": {"value": "142", "unit": "mg/dl", "normal": "Up to 200 mg/dl"}})
    results = models.JSONField(null=True, blank=True)
    report_date = models.DateTimeField(null=True, blank=True)
    technician_name = models.CharField(max_length=255, blank=True, null=True)
    specimen = models.CharField(max_length=100, default='BLOOD', blank=True, null=True)

    def __str__(self):
        return f"{self.test_name} - {getattr(self.visit, 'id', self.visit.id)}"


class LabCategory(BaseModel):
    name = models.CharField(max_length=50, unique=True)
    description = models.TextField(blank=True, null=True)

    def __str__(self):
        return self.name


class LabTest(BaseModel):
    name = models.CharField(max_length=255)
    category = models.CharField(max_length=50) # Managed via LabCategory, but kept loose for flexibility
    price = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    normal_range = models.TextField(blank=True, null=True)

    def __str__(self):
        return f"{self.name} ({self.category})"


class LabTestParameter(BaseModel):
    test = models.ForeignKey(LabTest, on_delete=models.CASCADE, related_name='parameters')
    name = models.CharField(max_length=255)
    unit = models.CharField(max_length=50, blank=True, null=True)
    normal_range = models.TextField(blank=True, null=True)

    def __str__(self):
        return f"{self.name} ({self.test.name})"


class LabTestRequiredItem(BaseModel):
    test = models.ForeignKey(LabTest, on_delete=models.CASCADE, related_name='required_items')
    inventory_item = models.ForeignKey(LabInventory, on_delete=models.CASCADE)
    qty_per_test = models.PositiveIntegerField(default=1)

    def __str__(self):
        return f"{self.test.name} needs {self.qty_per_test} x {self.inventory_item.item_name}"
