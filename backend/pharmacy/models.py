import uuid
from django.db import models
from django.conf import settings
from django.core.validators import MinValueValidator
from core.models import BaseModel
from patients.models import Visit, Patient


class Supplier(BaseModel):
    supplier_name = models.CharField(max_length=255)
    phone = models.CharField(max_length=20, blank=True)
    address = models.TextField(blank=True)
    gst_no = models.CharField(max_length=20, blank=True)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.supplier_name


class PurchaseInvoice(BaseModel):
    PURCHASE_TYPE_CHOICES = (
        ('CASH', 'Cash'),
        ('CREDIT', 'Credit'),
    )

    supplier = models.ForeignKey(Supplier, on_delete=models.PROTECT, related_name='purchases')
    supplier_invoice_no = models.CharField(max_length=50)
    invoice_date = models.DateField()
    credit_days = models.PositiveIntegerField(default=0)
    purchase_type = models.CharField(max_length=10, choices=PURCHASE_TYPE_CHOICES)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(0)])
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)

    def __str__(self):
        return f"Inv {self.supplier_invoice_no} - {self.supplier.supplier_name}"


class PharmacyStock(BaseModel):
    name = models.CharField(max_length=255)
    barcode = models.CharField(max_length=100, blank=True)
    batch_no = models.CharField(max_length=50)
    expiry_date = models.DateField()

    mrp = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(0)])
    selling_price = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(0)])
    purchase_rate = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(0)], default=0)

    qty_available = models.PositiveIntegerField(default=0)
    reorder_level = models.PositiveIntegerField(default=10)
    supplier = models.ForeignKey(Supplier, on_delete=models.SET_NULL, null=True, blank=True)

    # Added for billing details
    hsn = models.CharField(max_length=20, blank=True)
    gst_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    manufacturer = models.CharField(max_length=255, blank=True)

    tablets_per_strip = models.PositiveIntegerField(default=1)

    # Spec: soft delete
    is_deleted = models.BooleanField(default=False)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['name', 'batch_no', 'expiry_date', 'supplier'],
                name='unique_stock_name_batch_exp_supplier'
            )
        ]

    def __str__(self):
        return f"{self.name} ({self.batch_no})"


class PurchaseItem(BaseModel):
    purchase = models.ForeignKey(PurchaseInvoice, on_delete=models.CASCADE, related_name='items')

    product_name = models.CharField(max_length=255)
    barcode = models.CharField(max_length=100, blank=True)
    batch_no = models.CharField(max_length=50)
    expiry_date = models.DateField()

    qty = models.PositiveIntegerField()
    free_qty = models.PositiveIntegerField(default=0)

    purchase_rate = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(0)])
    mrp = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(0)])
    ptr = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(0)])

    manufacturer = models.CharField(max_length=255, blank=True)
    hsn = models.CharField(max_length=20, blank=True)
    tablets_per_strip = models.PositiveIntegerField(default=1)

    def __str__(self):
        return f"{self.product_name} - {self.batch_no}"


class PharmacySale(BaseModel):
    PAYMENT_STATUS = (
        ('PAID', 'Paid'),
        ('PENDING', 'Pending'),
    )

    # Direct Patient Link (Primary fallback)
    patient = models.ForeignKey(
        Patient,
        on_delete=models.SET_NULL, # Don't delete sale if patient deleted? Or CASCADE? SET_NULL safer.
        null=True,
        blank=True,
        related_name='pharmacy_sales'
    )

    # Visit sale or walk-in sale (visit = null)
    visit = models.ForeignKey(
        Visit,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='pharmacy_sales'
    )

    sale_date = models.DateTimeField(auto_now_add=True)
    total_amount = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(0)])
    payment_status = models.CharField(max_length=20, default='PENDING', choices=PAYMENT_STATUS)

    def __str__(self):
        return f"Sale {self.id}"


class PharmacySaleItem(BaseModel):
    sale = models.ForeignKey(PharmacySale, on_delete=models.CASCADE, related_name='items')
    med_stock = models.ForeignKey(PharmacyStock, on_delete=models.PROTECT)  # exact batch stock

    qty = models.PositiveIntegerField()
    unit_price = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(0)])
    amount = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(0)])
    gst_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)  # GST rate applied at sale time

    def __str__(self):
        return f"{self.med_stock.name} x {self.qty}"
