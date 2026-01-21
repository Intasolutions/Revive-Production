import uuid
from django.db import models
from django.core.validators import MinValueValidator
from core.models import BaseModel
from patients.models import Visit


class LabInventory(BaseModel):
    item_name = models.CharField(max_length=255)
    category = models.CharField(max_length=50)
    qty = models.PositiveIntegerField(default=0)
    cost_per_unit = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    reorder_level = models.PositiveIntegerField(default=10)

    def __str__(self):
        return self.item_name

    @property
    def is_low_stock(self):
        return self.qty <= self.reorder_level


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


class LabTest(BaseModel):
    CATEGORY_CHOICES = (
        ('HAEMATOLOGY', 'Haematology'),
        ('IMMUNO_HAEMATOLOGY', 'Immuno Haematology'),
        ('BIOCHEMISTRY', 'Biochemistry'),
        ('URINE', 'Urine Test'),
        ('STOOL', 'Stool Test'),
        ('MICROBIOLOGY', 'Microbiology'),
        ('SEROLOGY', 'Serology'),
        ('HORMONE', 'Hormone Assay'),
        ('XRAY', 'X-Ray'),
        ('OTHERS', 'Others'),
    )

    name = models.CharField(max_length=255)
    category = models.CharField(max_length=50, choices=CATEGORY_CHOICES)
    price = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    normal_range = models.TextField(blank=True, null=True)

    def __str__(self):
        return f"{self.name} ({self.get_category_display()})"


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
