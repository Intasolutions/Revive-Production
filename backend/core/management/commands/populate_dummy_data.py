from django.core.management.base import BaseCommand
from django.utils import timezone
from decimal import Decimal
import random
from datetime import timedelta

from lab.models import LabCategory, LabTest, LabInventory, LabSupplier, LabBatch
from pharmacy.models import Supplier as PharmacySupplier, PharmacyStock

class Command(BaseCommand):
    help = 'Populates the database with dummy data for Lab and Pharmacy apps'

    def handle(self, *args, **options):
        self.stdout.write('Starting dummy data population...')
        
        self.populate_lab_data()
        self.populate_pharmacy_data()
        
        self.stdout.write(self.style.SUCCESS('Successfully populated dummy data.'))

    def populate_lab_data(self):
        self.stdout.write('Populating Lab data...')

        # 1. Lab Categories
        categories = ['Hematology', 'Biochemistry', 'Microbiology', 'Pathology', 'Serology']
        cat_objs = {}
        for cat_name in categories:
            obj, created = LabCategory.objects.get_or_create(name=cat_name, defaults={'description': f'{cat_name} tests'})
            cat_objs[cat_name] = obj
            if created:
                self.stdout.write(f'Created LabCategory: {cat_name}')

        # 2. Lab Suppliers
        lab_suppliers = ['MediLab Supplies', 'BioTech Distributors', 'LabCorp India']
        for name in lab_suppliers:
            LabSupplier.objects.get_or_create(
                supplier_name=name,
                defaults={
                    'phone': '9876543210',
                    'address': '123 Lab Street, Science City',
                    'gst_no': '29ABCDE1234F1Z5'
                }
            )

        # 3. Lab Tests
        tests = [
            {'name': 'Complete Blood Count', 'sub_name': 'CBC', 'category': 'Hematology', 'price': 350.00, 'normal_range': 'N/A'},
            {'name': 'Hemoglobin', 'sub_name': 'Hb', 'category': 'Hematology', 'price': 150.00, 'normal_range': '12-16 g/dL'},
            {'name': 'Blood Glucose Fasting', 'sub_name': 'FBS', 'category': 'Biochemistry', 'price': 100.00, 'normal_range': '70-110 mg/dL'},
            {'name': 'Lipid Profile', 'sub_name': '', 'category': 'Biochemistry', 'price': 800.00, 'normal_range': 'See detailed report'},
            {'name': 'Urine Routine', 'sub_name': 'Urine R/E', 'category': 'Pathology', 'price': 200.00, 'normal_range': 'N/A'},
        ]

        for test_data in tests:
            LabTest.objects.get_or_create(
                name=test_data['name'],
                defaults={
                    'sub_name': test_data['sub_name'],
                    'category': test_data['category'], # Using string as per model definition
                    'price': test_data['price'],
                    'normal_range': test_data['normal_range']
                }
            )

        # 4. Lab Inventory & Batches
        inventory_items = [
            {'name': 'CBC Reagent Kit', 'cat': 'Reagent', 'cost': 5000.00},
            {'name': 'Glucose Strips', 'cat': 'Consumable', 'cost': 2500.00},
            {'name': 'Microscope Slides', 'cat': 'Glassware', 'cost': 200.00},
            {'name': 'Syringes 5ml', 'cat': 'Consumable', 'cost': 5.00},
        ]

        for item in inventory_items:
            inv_obj, created = LabInventory.objects.get_or_create(
                item_name=item['name'],
                defaults={
                    'category': item['cat'],
                    'cost_per_unit': item['cost'],
                    'qty': 100,
                    'reorder_level': 20
                }
            )
            
            # Create a batch for each inventory item
            if created or not inv_obj.batches.exists():
                LabBatch.objects.create(
                    inventory_item=inv_obj,
                    batch_no=f'BATCH-{random.randint(1000, 9999)}',
                    expiry_date=timezone.now().date() + timedelta(days=365),
                    qty=50,
                    mrp=item['cost'] * 1.5,
                    purchase_rate=item['cost']
                )

    def populate_pharmacy_data(self):
        self.stdout.write('Populating Pharmacy data...')

        # 1. Suppliers
        suppliers = ['HealthFine Pharma', 'CureWell Distributors', 'City Pharma Agency']
        supplier_objs = []
        for name in suppliers:
            obj, _ = PharmacySupplier.objects.get_or_create(
                supplier_name=name,
                defaults={
                    'phone': '9988776655',
                    'address': '456 Pharma Road, Med Town',
                    'gst_no': '29VWXYZ9876A1Z3'
                }
            )
            supplier_objs.append(obj)

        # 2. Pharmacy Stock (Medicines)
        medicines = [
            {'name': 'Paracetamol 500mg', 'type': 'TABLET', 'mrp': 2.00, 'sp': 2.00, 'ptr': 1.50, 'gst': 12},
            {'name': 'Amoxicillin 500mg', 'type': 'TABLET', 'mrp': 10.00, 'sp': 10.00, 'ptr': 7.50, 'gst': 12},
            {'name': 'Cough Syrup 100ml', 'type': 'SYRUP', 'mrp': 120.00, 'sp': 120.00, 'ptr': 90.00, 'gst': 12},
            {'name': 'Cetirizine 10mg', 'type': 'TABLET', 'mrp': 5.00, 'sp': 5.00, 'ptr': 3.00, 'gst': 12},
            {'name': 'Pain Relief Gel', 'type': 'GEL', 'mrp': 85.00, 'sp': 85.00, 'ptr': 60.00, 'gst': 12},
            {'name': 'Vitamin C Drops', 'type': 'DROP', 'mrp': 45.00, 'sp': 45.00, 'ptr': 30.00, 'gst': 12},
            {'name': 'Azithromycin 500mg', 'type': 'TABLET', 'mrp': 25.00, 'sp': 25.00, 'ptr': 18.00, 'gst': 12},
            {'name': 'Pantoprazole 40mg', 'type': 'TABLET', 'mrp': 9.00, 'sp': 9.00, 'ptr': 6.00, 'gst': 12},
        ]

        for i, med in enumerate(medicines):
            batch_no = f'BAT-{timezone.now().year}-{i+100}'
            if not PharmacyStock.objects.filter(name=med['name'], batch_no=batch_no).exists():
                PharmacyStock.objects.create(
                    name=med['name'],
                    batch_no=batch_no,
                    expiry_date=timezone.now().date() + timedelta(days=random.randint(180, 730)),
                    mrp=Decimal(med['mrp']),
                    selling_price=Decimal(med['sp']),
                    purchase_rate=Decimal(med['ptr']), # Assuming purchase rate ~ ptr for simplicity
                    ptr=Decimal(med['ptr']),
                    qty_available=random.randint(50, 500),
                    reorder_level=50,
                    medicine_type=med['type'],
                    supplier=random.choice(supplier_objs),
                    hsn='3004',
                    gst_percent=Decimal(med['gst']),
                    manufacturer='Generic Pharma Co.',
                    tablets_per_strip=10 if med['type'] == 'TABLET' else 1
                )
                self.stdout.write(f"Added Medicine: {med['name']}")
