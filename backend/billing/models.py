from django.db import models
from core.models import BaseModel
from patients.models import Visit

class Invoice(BaseModel):
    PAYMENT_STATUS = (('PAID', 'Paid'), ('PENDING', 'Pending'))
    visit = models.ForeignKey(Visit, on_delete=models.SET_NULL, null=True, related_name='invoices')
    patient_name = models.CharField(max_length=255, null=True, blank=True)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2)
    payment_status = models.CharField(max_length=20, default='PENDING', choices=PAYMENT_STATUS)

    def __str__(self):
        return f"Invoice {self.id} - {self.total_amount}"

class InvoiceItem(BaseModel):
    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name='items')
    item_id = models.UUIDField(null=True, blank=True) # Generic reference to source (lab, pharmacy op)
    dept = models.CharField(max_length=50) # 'PHARMACY', 'LAB', 'CONSULTATION', 'CASUALTY'
    description = models.CharField(max_length=255)
    
    # Detailed Billing Fields
    qty = models.IntegerField(default=1)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    hsn = models.CharField(max_length=20, null=True, blank=True)
    batch = models.CharField(max_length=50, null=True, blank=True)
    expiry = models.CharField(max_length=20, null=True, blank=True) # Store as string for flexibility in manual entry
    dosage = models.CharField(max_length=50, null=True, blank=True) # e.g. "1-0-1"
    duration = models.CharField(max_length=50, null=True, blank=True) # e.g. "5 Days"
    gst_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    
    amount = models.DecimalField(max_digits=10, decimal_places=2)

    def __str__(self):
        return f"{self.dept}: {self.description}"
