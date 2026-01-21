from django.core.management.base import BaseCommand
from django.db import transaction
from patients.models import Patient, Visit
from billing.models import Invoice
from pharmacy.models import PharmacySale, PharmacyStock, PurchaseInvoice
from lab.models import LabInventory, LabCharge
from casualty.models import CasualtyLog
from medical.models import DoctorNote
from core.models import Notification

class Command(BaseCommand):
    help = 'Flushes validation/transactional data but keeps Users.'

    def handle(self, *args, **kwargs):
        self.stdout.write("Flushing data...")
        
        with transaction.atomic():
            # 1. Billing & Sales (Independent or Linked via SET_NULL)
            deleted_invoices, _ = Invoice.objects.all().delete()
            self.stdout.write(f"Deleted {deleted_invoices} Invoices")

            deleted_sales, _ = PharmacySale.objects.all().delete()
            self.stdout.write(f"Deleted {deleted_sales} Pharmacy Sales")

            # 2. Inventory & Purchases
            deleted_stock, _ = PharmacyStock.objects.all().delete()
            self.stdout.write(f"Deleted {deleted_stock} Pharmacy Stock Items")

            deleted_purchases, _ = PurchaseInvoice.objects.all().delete()
            self.stdout.write(f"Deleted {deleted_purchases} Purchase Invoices")

            deleted_lab_inv, _ = LabInventory.objects.all().delete()
            self.stdout.write(f"Deleted {deleted_lab_inv} Lab Inventory Items")

            # 3. Main Patient Data (Cascades Visits -> Notes, Logs, LabCharges)
            # Verify Cascade for safety or explicit delete if unsure.
            # Visit cascades: DoctorNote, CasualtyLog, LabCharge
            
            # Explicitly delete visits first to see count? No, Patient delete is cleaner.
            deleted_patients, _ = Patient.objects.all().delete() 
            self.stdout.write(f"Deleted {deleted_patients} Patients (and cascaded Visits/Logs/Notes)")

            # 4. Notifications
            deleted_notifs, _ = Notification.objects.all().delete()
            self.stdout.write(f"Deleted {deleted_notifs} Notifications")

        self.stdout.write(self.style.SUCCESS('Successfully flushed all transactional data.'))
