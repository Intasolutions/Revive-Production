import os
import django
from decimal import Decimal
from datetime import date, timedelta

# Set up Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'revive_cms.settings')
django.setup()

from pharmacy.models import Supplier, PharmacyStock
from lab.models import LabSupplier, LabInventory, LabCategory, LabTest, LabTestParameter

def create_pharmacy_data():
    print("Creating Pharmacy dummy data...")
    # Create Suppliers
    s1, _ = Supplier.objects.get_or_create(
        supplier_name="LifeLine Pharma",
        defaults={"phone": "9876543210", "address": "123 Pharma St, Mumbai", "gst_no": "27AAAAA0000A1Z5"}
    )
    s2, _ = Supplier.objects.get_or_create(
        supplier_name="Global Health Care",
        defaults={"phone": "8765432109", "address": "456 Health Ave, Delhi", "gst_no": "07BBBBB1111B1Z6"}
    )

    # Create Pharmacy Stock
    pharmacy_items = [
        {
            "name": "Paracetamol 500mg",
            "batch_no": "BATCH001",
            "expiry_date": date(2026, 12, 31),
            "mrp": Decimal("40.00"),
            "selling_price": Decimal("35.00"),
            "purchase_rate": Decimal("25.00"),
            "ptr": Decimal("22.00"),
            "qty_available": 500,
            "reorder_level": 50,
            "medicine_type": "TABLET",
            "gst_percent": Decimal("12.00"),
            "manufacturer": "Cipla",
            "supplier": s1,
            "tablets_per_strip": 10
        },
        {
            "name": "Amoxicillin 250mg",
            "batch_no": "BATCH002",
            "expiry_date": date(2025, 6, 30),
            "mrp": Decimal("120.00"),
            "selling_price": Decimal("110.00"),
            "purchase_rate": Decimal("80.00"),
            "ptr": Decimal("75.00"),
            "qty_available": 200,
            "reorder_level": 20,
            "medicine_type": "TABLET",
            "gst_percent": Decimal("18.00"),
            "manufacturer": "GSK",
            "supplier": s2,
            "tablets_per_strip": 6
        },
        {
            "name": "Cough Syrup 100ml",
            "batch_no": "BATCH003",
            "expiry_date": date(2025, 8, 15),
            "mrp": Decimal("85.00"),
            "selling_price": Decimal("80.00"),
            "purchase_rate": Decimal("60.00"),
            "ptr": Decimal("55.00"),
            "qty_available": 100,
            "reorder_level": 15,
            "medicine_type": "SYRUP",
            "gst_percent": Decimal("12.00"),
            "manufacturer": "Dabur",
            "supplier": s1,
            "tablets_per_strip": 1
        },
        {
            "name": "Insulin Injection",
            "batch_no": "BATCH004",
            "expiry_date": date(2025, 3, 20),
            "mrp": Decimal("450.00"),
            "selling_price": Decimal("420.00"),
            "purchase_rate": Decimal("350.00"),
            "ptr": Decimal("330.00"),
            "qty_available": 50,
            "reorder_level": 10,
            "medicine_type": "INJECTION",
            "gst_percent": Decimal("5.00"),
            "manufacturer": "Novo Nordisk",
            "supplier": s2,
            "tablets_per_strip": 1
        }
    ]

    for item_data in pharmacy_items:
        PharmacyStock.objects.update_or_create(
            name=item_data["name"],
            batch_no=item_data["batch_no"],
            defaults=item_data
        )

def create_lab_data():
    print("Creating Lab dummy data...")
    # Create Lab Suppliers
    ls1, _ = LabSupplier.objects.get_or_create(
        supplier_name="BioTech Solutions",
        defaults={"phone": "7654321098", "address": "789 Lab Rd, Bangalore", "gst_no": "29CCCCC2222C1Z7"}
    )

    # Create Lab Inventory
    lab_items = [
        {
            "item_name": "Vacutainer Tube (Gold)",
            "category": "Disposable",
            "qty": 1000,
            "cost_per_unit": Decimal("15.00"),
            "reorder_level": 100,
            "manufacturer": "BD",
            "unit": "pieces",
            "mrp": Decimal("20.00"),
            "gst_percent": Decimal("18.00")
        },
        {
            "item_name": "Glucose Reagent 500ml",
            "category": "Reagent",
            "qty": 10,
            "cost_per_unit": Decimal("2500.00"),
            "reorder_level": 2,
            "manufacturer": "Siemens",
            "unit": "bottle",
            "is_liquid": True,
            "pack_size": "500ml",
            "mrp": Decimal("3000.00"),
            "gst_percent": Decimal("12.00")
        }
    ]

    for item_data in lab_items:
        LabInventory.objects.update_or_create(
            item_name=item_data["item_name"],
            defaults=item_data
        )

    # Create Lab Categories
    categories = ["Hematology", "Biochemistry", "Serology", "Urine Analysis"]
    for cat_name in categories:
        LabCategory.objects.get_or_create(name=cat_name)

    # Create Lab Tests
    tests = [
        {
            "name": "Complete Blood Count",
            "sub_name": "CBC",
            "category": "Hematology",
            "price": Decimal("350.00"),
            "gender": "B",
            "parameters": [
                {"name": "Hemoglobin", "unit": "g/dL", "normal_range": "13.5-17.5"},
                {"name": "WBC Count", "unit": "cells/mcL", "normal_range": "4500-11000"},
                {"name": "Platelet Count", "unit": "cells/mcL", "normal_range": "150000-450000"}
            ]
        },
        {
            "name": "Blood Glucose (Fasting)",
            "sub_name": "FBS",
            "category": "Biochemistry",
            "price": Decimal("100.00"),
            "gender": "B",
            "parameters": [
                {"name": "Glucose", "unit": "mg/dL", "normal_range": "70-100"}
            ]
        },
        {
            "name": "Lipid Profile",
            "sub_name": None,
            "category": "Biochemistry",
            "price": Decimal("800.00"),
            "gender": "B",
            "parameters": [
                {"name": "Total Cholesterol", "unit": "mg/dL", "normal_range": "<200"},
                {"name": "HDL Cholesterol", "unit": "mg/dL", "normal_range": ">40"},
                {"name": "LDL Cholesterol", "unit": "mg/dL", "normal_range": "<100"},
                {"name": "Triglycerides", "unit": "mg/dL", "normal_range": "<150"}
            ]
        }
    ]

    for test_data in tests:
        params = test_data.pop("parameters")
        test, _ = LabTest.objects.update_or_create(
            name=test_data["name"],
            defaults=test_data
        )
        for p_data in params:
            LabTestParameter.objects.update_or_create(
                test=test,
                name=p_data["name"],
                defaults=p_data
            )

if __name__ == "__main__":
    create_pharmacy_data()
    create_lab_data()
    print("Dummy data added successfully!")
