import os
import django
import sys

# Setup Django Environment
sys.path.append(r'c:\Users\91811\OneDrive\Desktop\Revive-Latest\backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'revive_cms.settings')
django.setup()

from patients.models import Patient, Visit

def create_casualty_patient():
    print("Creating Test Patient for Casualty...")
    
    # Check if patient exists to avoid dupes
    p, created = Patient.objects.get_or_create(
        phone="9999999999",
        defaults={
            "full_name": "Test Verify Fix",
            "age": 30,
            "gender": "M",
            "address": "123 Test St",
        }
    )
    
    if created:
        print(f"Patient created: {p.full_name}")
    else:
        print(f"Patient found: {p.full_name}")

    # Create Visit
    v = Visit.objects.create(
        patient=p,
        assigned_role='CASUALTY',
        status='OPEN',
        vitals={'bp': '120/80', 'temp': '98.6'}
    )
    
    print(f"Visit created: {v.id} for CASUALTY")

if __name__ == "__main__":
    create_casualty_patient()
