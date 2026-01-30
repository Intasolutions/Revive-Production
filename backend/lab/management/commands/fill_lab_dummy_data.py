from django.core.management.base import BaseCommand
from lab.models import (
    LabCategory, LabSupplier, LabInventory, LabTest, LabTestRequiredItem, 
    LabCharge, LabInventoryLog
)
from patients.models import Patient, Visit
from users.models import User
from django.utils import timezone
import random
from decimal import Decimal

class Command(BaseCommand):
    help = 'Populate Laboratory Module with Dummy Data'

    def handle(self, *args, **kwargs):
        self.stdout.write('Populating Lab Data...')

        # 1. Categories
        categories = ['HAEMATOLOGY', 'BIOCHEMISTRY', 'SEROLOGY', 'MICROBIOLOGY']
        cat_objs = {}
        for c in categories:
            obj, _ = LabCategory.objects.get_or_create(name=c, defaults={'description': f'{c} Tests'})
            cat_objs[c] = obj
        self.stdout.write(f'- {len(categories)} Categories Verified')

        # 2. Suppliers
        suppliers = ['MediSupply Corp', 'BioTest Systems', 'Apex Lab Equipments']
        for s in suppliers:
            LabSupplier.objects.get_or_create(supplier_name=s, defaults={'phone': '9876543210', 'gst_no': 'GST12345'})
        self.stdout.write(f'- {len(suppliers)} Suppliers Verified')

        # 3. Inventory
        inventory_data = [
            {'name': 'Glucose Kit', 'cat': 'REAGENT', 'qty': 50, 'cost': 500, 'unit': 'kits', 'mrp': 800},
            {'name': 'Cholesterol Kit', 'cat': 'REAGENT', 'qty': 30, 'cost': 1200, 'unit': 'kits', 'mrp': 1500},
            {'name': 'Test Tubes (Vacuum)', 'cat': 'CONSUMABLE', 'qty': 500, 'cost': 5, 'unit': 'pcs', 'mrp': 10},
            {'name': 'Syringes 5ml', 'cat': 'CONSUMABLE', 'qty': 1000, 'cost': 3, 'unit': 'pcs', 'mrp': 5},
            {'name': 'Microscope Slides', 'cat': 'EQUIPMENT', 'qty': 200, 'cost': 50, 'unit': 'box', 'mrp': 100},
            {'name': 'HIV Test Kit', 'cat': 'REAGENT', 'qty': 20, 'cost': 200, 'unit': 'kits', 'mrp': 400},
        ]

        inv_objs = {}
        for item in inventory_data:
            obj, created = LabInventory.objects.get_or_create(
                item_name=item['name'],
                defaults={
                    'category': item['cat'],
                    'qty': item['qty'],
                    'cost_per_unit': item['cost'],
                    'unit': item['unit'],
                    'mrp': item['mrp']
                }
            )
            inv_objs[item['name']] = obj
        self.stdout.write(f'- {len(inventory_data)} Inventory Items Verified')

        # 4. Lab Tests
        tests_data = [
            {
                'name': 'CBC', 'sub': 'Complete Blood Count', 'cat': 'HAEMATOLOGY', 'price': 350, 
                'normal': 'Hemoglobin: 13-17\nWBC: 4000-11000',
                'req': [{'item': 'Test Tubes (Vacuum)', 'qty': 1}]
            },
            {
                'name': 'BLOOD SUGAR', 'sub': 'Fasting/PP/Random', 'cat': 'BIOCHEMISTRY', 'price': 80, 
                'normal': '70-110 mg/dL',
                'req': [{'item': 'Glucose Kit', 'qty': 1}, {'item': 'Syringes 5ml', 'qty': 1}]
            },
            {
                'name': 'LIPID PROFILE', 'sub': 'Complete Lipid Analysis', 'cat': 'BIOCHEMISTRY', 'price': 650, 
                'normal': 'Cholesterol < 200',
                'req': [{'item': 'Cholesterol Kit', 'qty': 1}]
            },
            {
                'name': 'HIV SCREENING', 'sub': 'Rapid Test', 'cat': 'SEROLOGY', 'price': 400, 
                'normal': 'Non-Reactive',
                'req': [{'item': 'HIV Test Kit', 'qty': 1}]
            },
        ]

        for t in tests_data:
            test_obj, created = LabTest.objects.get_or_create(
                name=t['name'],
                defaults={
                    'sub_name': t['sub'],
                    'category': t['cat'],
                    'price': t['price'],
                    'normal_range': t['normal']
                }
            )
            # Link requirements
            if created or not test_obj.required_items.exists():
                for r in t['req']:
                    if r['item'] in inv_objs:
                        LabTestRequiredItem.objects.create(
                            test=test_obj,
                            inventory_item=inv_objs[r['item']],
                            qty_per_test=r['qty']
                        )
        self.stdout.write(f'- {len(tests_data)} Tests Verified')

        # 5. Bulk Generate 150 Random Lab Requests
        self.stdout.write(f'Generating 150 Random Lab Requests...')
        
        first_names = ['James', 'John', 'Robert', 'Michael', 'William', 'David', 'Richard', 'Joseph', 'Thomas', 'Charles', 'Mary', 'Patricia', 'Jennifer', 'Linda', 'Elizabeth', 'Barbara', 'Susan', 'Jessica', 'Sarah', 'Karen']
        last_names = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez']
        
        statuses = ['PENDING', 'COMPLETED', 'CANCELLED']
        
        for i in range(150):
            f_name = random.choice(first_names)
            l_name = random.choice(last_names)
            full_name = f"{f_name} {l_name} Lab-{i+1}"
            
            pat, _ = Patient.objects.get_or_create(
                phone=f"8{random.randint(100000000, 999999999)}",
                defaults={
                    'full_name': full_name, 
                    'age': random.randint(10, 80), 
                    'gender': random.choice(['M', 'F']), 
                    'address': 'Test City'
                }
            )
            
            visit = Visit.objects.create(
                patient=pat,
                assigned_role='LAB',
                status='OPEN'
            )
            
            # Add 1-3 tests per visit
            num_tests = random.randint(1, 3)
            current_tests = random.sample(tests_data, num_tests)
            
            status_choice = random.choices(statuses, weights=[60, 30, 10], k=1)[0]
            
            for t in current_tests:
                charge = LabCharge.objects.create(
                    visit=visit, 
                    test_name=t['name'], 
                    amount=t['price'], 
                    status=status_choice
                )
                
                if status_choice == 'COMPLETED':
                    charge.technician_name = 'Auto Bot'
                    if 'SUGAR' in t['name']:
                         charge.results=[{'name': 'Glucose', 'value': str(random.randint(70, 140)), 'unit': 'mg/dL', 'normal': '70-110'}]
                    elif 'LIPID' in t['name']:
                         charge.results=[{'name': 'Cholesterol', 'value': str(random.randint(150, 250)), 'unit': 'mg/dL', 'normal': '< 200'}]
                    else:
                         charge.results=[{'name': 'Result', 'value': 'Normal', 'unit': '-', 'normal': '-'}]
                    charge.report_date = timezone.now()
                    charge.save()

        self.stdout.write(self.style.SUCCESS('Successfully populated dummy lab data with 150 records!'))
