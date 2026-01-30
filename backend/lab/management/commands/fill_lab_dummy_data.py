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

        # 5. Patients & Visits
        patients_data = [
            {'name': 'John Doe', 'age': 45, 'gender': 'M', 'phone': '9999999991'},
            {'name': 'Jane Smith', 'age': 32, 'gender': 'F', 'phone': '9999999992'},
            {'name': 'Alice Johnson', 'age': 28, 'gender': 'F', 'phone': '9999999993'},
            {'name': 'Bob Brown', 'age': 55, 'gender': 'M', 'phone': '9999999994'},
        ]

        visits = []
        for p in patients_data:
            pat, _ = Patient.objects.get_or_create(
                phone=p['phone'],
                defaults={'full_name': p['name'], 'age': p['age'], 'gender': p['gender'], 'address': 'Local City'}
            )
            
            # Create OPEN Visit assigned to LAB
            visit = Visit.objects.create(
                patient=pat,
                assigned_role='LAB',
                status='OPEN'
            )
            visits.append(visit)
        
        self.stdout.write(f'- {len(visits)} Visits Created for Testing')

        # 6. Lab Charges (Requests)
        
        # Visit 0: Pending Tests
        LabCharge.objects.create(visit=visits[0], test_name='CBC', amount=350, status='PENDING')
        LabCharge.objects.create(visit=visits[0], test_name='BLOOD SUGAR', amount=80, status='PENDING')

        # Visit 1: Completed Test
        lc = LabCharge.objects.create(
            visit=visits[1], test_name='LIPID PROFILE', amount=650, status='COMPLETED',
            technician_name='System Admin',
            results=[
                {'name': 'Cholesterol', 'value': '180', 'unit': 'mg/dL', 'normal': '< 200'},
                {'name': 'Triglycerides', 'value': '140', 'unit': 'mg/dL', 'normal': '< 150'}
            ],
            report_date=timezone.now()
        )
        # Note: Inventory should be deducted via views logic usually, but manual here is fine for dummy data or we let it fly.
        
        # Visit 2: Pending
        LabCharge.objects.create(visit=visits[2], test_name='HIV SCREENING', amount=400, status='PENDING')

        # Visit 3: Completed
        LabCharge.objects.create(
            visit=visits[3], test_name='BLOOD SUGAR', amount=80, status='COMPLETED',
            technician_name='System Admin',
            results=[{'name': 'Fasting Glucose', 'value': '95', 'unit': 'mg/dL', 'normal': '70-110'}],
            report_date=timezone.now()
        )

        self.stdout.write(self.style.SUCCESS('Successfully populated dummy lab data!'))
