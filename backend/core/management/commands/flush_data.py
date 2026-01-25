from django.core.management.base import BaseCommand
from django.db import transaction
from patients.models import Patient, Visit
from casualty.models import CasualtyLog, CasualtyMedicine, CasualtyService, CasualtyObservation
from medical.models import DoctorNote
from lab.models import LabCharge
from pharmacy.models import PharmacySale
from billing.models import Invoice

class Command(BaseCommand):
    help = 'Flush all transactional data but keep Users, Stock, and Definitions'

    def handle(self, *args, **options):
        self.stdout.write("Flushing transactional data...")
        
        with transaction.atomic():
            # 1. Casualty
            CasualtyLog.objects.all().delete()
            CasualtyMedicine.objects.all().delete()
            CasualtyService.objects.all().delete()
            CasualtyObservation.objects.all().delete()
            self.stdout.write("- Casualty transactions cleared.")

            # 2. Medical / Doctor
            DoctorNote.objects.all().delete()
            self.stdout.write("- Doctor notes cleared.")

            # 3. Lab (LabCharge holds requests and results)
            LabCharge.objects.all().delete()
            self.stdout.write("- Lab requests/results cleared.")

            # 4. Pharmacy
            PharmacySale.objects.all().delete()
            self.stdout.write("- Pharmacy sales history cleared.")

            # 5. Billing
            Invoice.objects.all().delete()
            self.stdout.write("- Billing data cleared.")

            # 6. Core Patients & Visits
            # Deleting visits first to handle SET_NULL relations smoothly if any
            Visit.objects.all().delete()
            Patient.objects.all().delete()
            self.stdout.write("- Patients and Visits cleared.")

        self.stdout.write(self.style.SUCCESS("Successfully flushed all transactional data (Valid Users & Stock preserved)."))
