from django.db.models.signals import post_save
from django.dispatch import receiver
from patients.models import Visit
from .models import Invoice, InvoiceItem

@receiver(post_save, sender=Visit)
def create_or_update_consultation_invoice(sender, instance, created, **kwargs):
    # Determine the correct fee
    amount = 500.00
    if instance.doctor and hasattr(instance.doctor, 'consultation_fee'):
        amount = instance.doctor.consultation_fee
    
    if created:
        # Create new invoice
        invoice = Invoice.objects.create(
            visit=instance,
            patient_name=instance.patient.full_name,
            total_amount=amount,
            payment_status='PENDING'
        )
        InvoiceItem.objects.create(
            invoice=invoice,
            dept='CONSULTATION',
            description='General Consultation Fee',
            amount=amount,
            unit_price=amount
        )
    else:
        # Update existing PENDING invoice if doctor/fee changed
        # We look for an existing PENDING invoice for this visit
        invoice = Invoice.objects.filter(visit=instance, payment_status='PENDING').first()
        if invoice:
            # Find the consultation item
            cons_item = InvoiceItem.objects.filter(invoice=invoice, dept='CONSULTATION').first()
            if cons_item:
                # If the amount differs (e.g. doctor assigned/changed), update it
                if cons_item.amount != amount:
                    cons_item.amount = amount
                    cons_item.unit_price = amount
                    cons_item.save()
                    
                    # Update Invoice Total
                    # Re-sum all items to ensure accuracy
                    invoice.total_amount = sum(item.amount for item in invoice.items.all())
                    invoice.save()
