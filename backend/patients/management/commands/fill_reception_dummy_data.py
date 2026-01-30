from django.core.management.base import BaseCommand
from patients.models import Patient
import random
import uuid

class Command(BaseCommand):
    help = 'Populate Reception (Patient) Module with Dummy Data'

    def handle(self, *args, **kwargs):
        self.stdout.write('Populating Patient Data...')

        first_names = ['James', 'John', 'Robert', 'Michael', 'William', 'David', 'Richard', 'Joseph', 'Thomas', 'Charles', 'Mary', 'Patricia', 'Jennifer', 'Linda', 'Elizabeth', 'Barbara', 'Susan', 'Jessica', 'Sarah', 'Karen']
        last_names = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson']
        
        addresses = ['123 Main St', '456 Oak Ave', '789 Pine Ln', '321 Maple Dr', '654 Elm St', '987 Cedar Rd', '246 Birch Blvd', '135 Walnut Way']
        
        patients_to_create = []
        
        for i in range(150): # Generate 150 patients
            f_name = random.choice(first_names)
            l_name = random.choice(last_names)
            full_name = f"{f_name} {l_name} {i+1}" # Unique name kind of
            
            phone = f"9{random.randint(100000000, 999999999)}"
            age = random.randint(18, 90)
            gender = random.choice(['M', 'F'])
            
            # Generate a custom Reg Number (optional logic)
            reg_num = f"OP-{random.randint(2024, 2026)}-{1000+i}"

            patients_to_create.append(
                Patient(
                    full_name=full_name,
                    registration_number=reg_num,
                    age=age,
                    age_months=0,
                    gender=gender,
                    phone=phone,
                    address=random.choice(addresses),
                )
            )

        Patient.objects.bulk_create(patients_to_create)
        
        self.stdout.write(self.style.SUCCESS(f'Successfully created {len(patients_to_create)} dummy patients!'))
