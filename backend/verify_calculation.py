
import os
import django
import sys
from decimal import Decimal

# Setup Django
sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'revive_cms.settings')
django.setup()

from pharmacy.models import PurchaseInvoice, PurchaseItem, Supplier

def verify_logic():
    print("--- Verifying Pharmacy Calculation Logic (Strict Decimal) ---")
    
    supplier, _ = Supplier.objects.get_or_create(supplier_name="Test Supplier Decimal")
    
    inv = PurchaseInvoice.objects.create(
        supplier=supplier,
        supplier_invoice_no="TEST-DECIMAL-002",
        invoice_date="2024-01-01",
        purchase_type="CASH",
        cash_discount=Decimal("2045.00"),
        total_amount=0
    )
    
    # Item A (5%) - 17642
    item_a = PurchaseItem.objects.create(
        purchase=inv,
        product_name="Med 5%",
        batch_no="B1",
        expiry_date="2025-01-01",
        qty=1,
        purchase_rate=Decimal("17642.00"),
        ptr=Decimal("17642.00"),
        mrp=20000,
        gst_percent=5
    )
    
    # Item B (18%) - 260
    item_b = PurchaseItem.objects.create(
        purchase=inv,
        product_name="Med 18%",
        batch_no="B2",
        expiry_date="2025-01-01",
        qty=1,
        purchase_rate=Decimal("260.00"),
        ptr=Decimal("260.00"),
        mrp=300,
        gst_percent=18
    )
    
    # Run Calculation
    total = inv.calculate_distribution()
    
    item_a.refresh_from_db()
    item_b.refresh_from_db()
    
    print(f"\nInvoice ID: {inv.id}")
    print(f"Final Total (Decimal): {total}")
    
    # Verification Logic
    # 5% Item Discounted Taxable should be: 15626.70 (Rounded from 15626.696...)
    # 5% Item GST: 15626.70 * 0.05 = 781.335 -> 781.34 (ROUND_HALF_UP)
    
    print(f"Item A Taxable: {item_a.taxable_amount}")
    print(f"Item A GST: {item_a.gst_amount}")
    
    # Test Edge Case: 1.666 -> 1.67
    # Create dummy item with taxable 33.32, 5% GST -> 1.666
    print("\n-- Edge Case Test --")
    item_edge = PurchaseItem.objects.create(
        purchase=inv,
        product_name="Edge Case",
        batch_no="EDGE",
        expiry_date="2025-01-01",
        qty=1,
        purchase_rate=Decimal("33.32"),
        ptr=Decimal("33.32"),
        mrp=100,
        gst_percent=5 # 33.32 * 0.05 = 1.666
    )
    
    # Re-run calc (will redistribute discount lightly, but let's check GST mostly)
    # We set cash discount to 0 for this specific check to isolate GST rounding
    inv.cash_discount = 0
    inv.save() 
    
    inv.calculate_distribution()
    item_edge.refresh_from_db()
    
    print(f"Edge Item Taxable: {item_edge.taxable_amount} (Should be 33.32)")
    print(f"Edge Item GST (expect 1.67 from 1.666): {item_edge.gst_amount}")
    
    if str(item_edge.gst_amount) == "1.67":
        print("✅ SUCCESS: 1.666 rounded to 1.67")
    else:
        print(f"❌ FAILURE: Got {item_edge.gst_amount}")

    inv.delete()

if __name__ == "__main__":
    verify_logic()
