from django.core.management.base import BaseCommand
from django.db import transaction
from patients.models import Patient, Visit
from medical.models import DoctorNote
from casualty.models import CasualtyLog
from lab.models import LabCharge, LabInventory
from pharmacy.models import Supplier, PharmacyStock, PurchaseInvoice, PharmacySale
from billing.models import Invoice

class Command(BaseCommand):
    help = 'Clears all transactional data (Patients, Visits, Records, Inventory, Bills) but KEEPS Users.'

    def handle(self, *args, **options):
        self.stdout.write("Starting data cleanup...")

        try:
            with transaction.atomic():
                # Billing (InvoiceItems cascade)
                count, _ = Invoice.objects.all().delete()
                self.stdout.write(f"Deleted {count} Invoices.")

                # Lab (Results inside LabCharge JSON or cascade? LabCharge is it).
                count, _ = LabCharge.objects.all().delete()
                self.stdout.write(f"Deleted {count} Lab Charges.")
                
                count, _ = LabInventory.objects.all().delete()
                self.stdout.write(f"Deleted {count} Lab Inventory items.")

                # Medical (DoctorNote, CasualtyLog cascade from Visit usually, but explicit is good)
                count, _ = DoctorNote.objects.all().delete()
                self.stdout.write(f"Deleted {count} Doctor Notes.")
                
                count, _ = CasualtyLog.objects.all().delete()
                self.stdout.write(f"Deleted {count} Casualty Logs.")

                # Pharmacy
                # Delete Sales (Items cascade)
                count, _ = PharmacySale.objects.all().delete()
                self.stdout.write(f"Deleted {count} Pharmacy Sales.")
                
                # Delete Purchases (Items cascade)
                count, _ = PurchaseInvoice.objects.all().delete()
                self.stdout.write(f"Deleted {count} Purchase Invoices.")
                
                # Delete Stock
                count, _ = PharmacyStock.objects.all().delete()
                self.stdout.write(f"Deleted {count} Pharmacy Stock items.")
                
                # Delete Suppliers
                count, _ = Supplier.objects.all().delete()
                self.stdout.write(f"Deleted {count} Suppliers.")

                # Patients (Visits cascade from Patient? Let's check. Visit has FK to Patient. Patient delete cascades Visits? Usually.)
                # But let's delete Visits first to be clean.
                count, _ = Visit.objects.all().delete()
                self.stdout.write(f"Deleted {count} Visits.")
                
                count, _ = Patient.objects.all().delete()
                self.stdout.write(f"Deleted {count} Patients.")

                self.stdout.write(self.style.SUCCESS("Successfully cleared all data (except Users)."))
        
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"Error clearing data: {str(e)}"))
