from django.core.management.base import BaseCommand
from django.db import transaction
from patients.models import Patient, Visit
from medical.models import DoctorNote
from casualty.models import CasualtyLog, CasualtyMedicine, CasualtyService, CasualtyObservation, CasualtyServiceDefinition
from lab.models import LabCharge, LabInventory, LabPurchase, LabPurchaseItem, LabBatch, LabSupplier, LabInventoryLog
from pharmacy.models import Supplier, PharmacyStock, PurchaseInvoice, PurchaseItem, PharmacySale, PharmacyReturn, PharmacyReturnItem
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

                count, _ = LabInventoryLog.objects.all().delete()
                self.stdout.write(f"Deleted {count} Lab Inventory Logs.")

                count, _ = LabPurchaseItem.objects.all().delete()
                self.stdout.write(f"Deleted {count} Lab Purchase Items.")

                count, _ = LabPurchase.objects.all().delete()
                self.stdout.write(f"Deleted {count} Lab Purchases.")
                
                count, _ = LabBatch.objects.all().delete()
                self.stdout.write(f"Deleted {count} Lab Batches.")
                
                count, _ = LabInventory.objects.all().delete()
                self.stdout.write(f"Deleted {count} Lab Inventory items.")

                count, _ = LabSupplier.objects.all().delete()
                self.stdout.write(f"Deleted {count} Lab Suppliers.")

                # Medical (DoctorNote, CasualtyLog cascade from Visit usually, but explicit is good)
                count, _ = DoctorNote.objects.all().delete()
                self.stdout.write(f"Deleted {count} Doctor Notes.")
                
                # Casualty - Delete transactional items first to avoid ProtectedError on Stock/Definitions
                count, _ = CasualtyMedicine.objects.all().delete()
                self.stdout.write(f"Deleted {count} Casualty Medicines.")
                
                count, _ = CasualtyService.objects.all().delete()
                self.stdout.write(f"Deleted {count} Casualty Services.")
                
                count, _ = CasualtyObservation.objects.all().delete()
                self.stdout.write(f"Deleted {count} Casualty Observations.")

                count, _ = CasualtyLog.objects.all().delete()
                self.stdout.write(f"Deleted {count} Casualty Logs.")

                count, _ = CasualtyServiceDefinition.objects.all().delete()
                self.stdout.write(f"Deleted {count} Casualty Service Definitions.")

                # Pharmacy
                # Delete Sales (Items cascade)
                # Delete Returns First (FK to Sale)
                count, _ = PharmacyReturnItem.objects.all().delete()
                self.stdout.write(f"Deleted {count} Pharmacy Return Items.")
                count, _ = PharmacyReturn.objects.all().delete()
                self.stdout.write(f"Deleted {count} Pharmacy Returns.")

                count, _ = PharmacySale.objects.all().delete()
                self.stdout.write(f"Deleted {count} Pharmacy Sales.")
                
                # Delete Purchases (Items cascade)
                count, _ = PurchaseItem.objects.all().delete() # Explicit delete items first just in case
                self.stdout.write(f"Deleted {count} Purchase Items.")
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
