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
    
    STATUS_CHOICES = (
        ('DRAFT', 'Draft'),
        ('COMPLETED', 'Completed'),
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='COMPLETED')
    
    # Extra Expenses
    cash_discount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    courier_charge = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)

    def calculate_total(self):
        """Deprecated: Use calculate_distribution instead for accurate GST/Discount logic."""
        return self.calculate_distribution()

    def calculate_distribution(self):
        """
        DISTRIBUTION LOGIC (Refined for Strict 2-Decimal Precision):
        Uses Decimal with ROUND_HALF_UP to ensure 1.666 -> 1.67
        
        Alignment with User Requirement:
        1. Calculate Taxable After Discount for each item.
        2. Calculate GST = Taxable * Rate.
        3. Round GST immediately (d_round).
        4. Sum(Rounded GST) + Sum(Taxable) = Final Total.
        """
        from decimal import Decimal, ROUND_HALF_UP
        
        items = self.items.all()
        if not items.exists():
            self.total_amount = 0
            self.save(update_fields=['total_amount'])
            return 0

        # Helper for STRICT consistent rounding
        def d_round(val):
            if isinstance(val, float): val = str(val)
            return Decimal(val).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

        # Step 1: Calculate Base Taxable (Gross) using Decimals
        total_taxable_pool = Decimal(0)
        item_calcs = []

        for item in items:
            # Convert inputs to decimal first
            ptr = Decimal(str(item.ptr))
            qty = Decimal(item.qty)
            
            gross_amount = ptr * qty
            
            # Trade Discount
            disc_pct = Decimal(str(item.discount_percent))
            trade_disc_amt = gross_amount * (disc_pct / Decimal(100))
            
            # Base Taxable (After Trade Disc) - Keep precision high, round at end of step? 
            # User wants values of ALL medicines to be rounded. So we round intermediate Taxable.
            base_taxable = d_round(gross_amount - trade_disc_amt)
            
            total_taxable_pool += base_taxable
            item_calcs.append({
                'item': item,
                'base_taxable': base_taxable
            })

        # Step 2 & 3: Distribute Cash Discount & Calculate GST
        remaining_discount = Decimal(str(self.cash_discount)) # No rounding involved yet, just input
        final_invoice_total = Decimal(0)
        
        courier = Decimal(str(self.courier_charge))
        
        for i, obj in enumerate(item_calcs):
            item = obj['item']
            base_taxable = obj['base_taxable']

            # Proportional Discount
            if total_taxable_pool > 0:
                if i == len(item_calcs) - 1:
                    # Last item takes remainder to fix exact matching of input discount
                    allocated_discount = remaining_discount
                else:
                    allocated_discount = (base_taxable / total_taxable_pool) * Decimal(str(self.cash_discount))
                    # NO Rounding on allocated discount here (High precision for logic)
                    remaining_discount -= allocated_discount
            else:
                allocated_discount = Decimal(0)

            # Store allocated discount (Round for DB storage)
            item.cash_discount_amount = d_round(allocated_discount)
            
            # Discounted Taxable Value (Unrounded - High Precision for GST Calc)
            unrounded_taxable = base_taxable - allocated_discount
            if unrounded_taxable < 0: unrounded_taxable = Decimal(0)
            
            # Calculate GST on UNROUNDED Taxable Value (User Requirement)
            gst_pct = Decimal(str(item.gst_percent))
            # gst = unrounded * rate
            gst_raw = unrounded_taxable * (gst_pct / Decimal(100))
            # gst = round(gst) (User Requirement)
            item.gst_amount = d_round(gst_raw)
            
            # Now Round Taxable for DB Storage
            item.taxable_amount = d_round(unrounded_taxable)

            # Item Total = Rounded Taxable + Rounded GST
            item.total_amount = item.taxable_amount + item.gst_amount
            
            # Save Item
            item.save()
            
            final_invoice_total += item.total_amount

        # Final Total
        # Use simple addition, NOT rounding to whole number.
        self.total_amount = final_invoice_total + courier
        # self.total_amount is already 2 decimal due to components.
        
        self.save(update_fields=['total_amount'])
        
        return self.total_amount

    def save(self, *args, **kwargs):
        # We can't access self.items.all() on first save (no ID yet)
        # So we only recalculate if ID exists, or rely on view to call save() again after adding items.
        # Ideally views should handle specific updates or use signals.
        # But for safety, we allow manual recalc.
        # self.calculate_distribution() # Loop risk if save() called inside. Avoid auto-call.
        super().save(*args, **kwargs)

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
    
    # Track Original Bill Price (PTR) separate from Effective Purchase Rate
    ptr = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(0)], default=0)

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
                fields=['name', 'batch_no'],
                name='unique_stock_name_batch'
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
    gst_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    discount_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    tablets_per_strip = models.PositiveIntegerField(default=1)

    # Calculated Fields (Persisted for Accuracy/Returns)
    taxable_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0, help_text="(PTR*Qty) - TradeDisc - CashDiscShare")
    cash_discount_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0, help_text="Proportional share of invoke cash discount")
    gst_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)

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


class PharmacyReturn(BaseModel):
    STATUS_CHOICES = (
        ('APPROVED', 'Approved'),
        ('COMPLETED', 'Completed'),
        ('CANCELLED', 'Cancelled'),
    )

    sale = models.ForeignKey(PharmacySale, on_delete=models.CASCADE, related_name='returns')
    return_date = models.DateTimeField(auto_now_add=True)
    total_refund_amount = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(0)])
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='COMPLETED')
    reason = models.TextField(blank=True, null=True)
    processed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)

    def __str__(self):
        return f"Return {self.id} (Inv: {self.sale.id})"


class PharmacyReturnItem(BaseModel):
    return_record = models.ForeignKey(PharmacyReturn, on_delete=models.CASCADE, related_name='items')
    sale_item = models.ForeignKey(PharmacySaleItem, on_delete=models.CASCADE, related_name='returned_items')
    med_stock = models.ForeignKey(PharmacyStock, on_delete=models.PROTECT) # Restock to this batch

    qty_returned = models.PositiveIntegerField()
    refund_amount = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(0)])
    gst_reversed = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    def __str__(self):
        return f"Ret: {self.med_stock.name} x {self.qty_returned}"
