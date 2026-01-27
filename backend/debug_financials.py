
import os
import django
from django.conf import settings
from django.utils import timezone
from django.db.models import Sum

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'revive_cms.settings')
django.setup()

from billing.models import Invoice, PaymentTransaction
from pharmacy.models import PurchaseInvoice, PurchaseItem, PharmacySale
from lab.models import LabPurchase, LabInventoryLog

def check_financials():
    now = timezone.now()
    start_date = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    end_date = now
    
    output = []
    output.append(f"Checking Financials for period: {start_date} to {end_date}")
    
    # 1. Invoices
    invoices = Invoice.objects.filter(created_at__gte=start_date, created_at__lte=end_date)
    output.append(f"Total Invoices: {invoices.count()}")
    
    paid_invoices = invoices.filter(payment_status='PAID')
    output.append(f"PAID Invoices: {paid_invoices.count()}")
    
    total_rev = paid_invoices.aggregate(total=Sum('total_amount'))['total'] or 0
    output.append(f"Revenue from invoices: {total_rev}")
    
    # 2. Payments
    payments = PaymentTransaction.objects.filter(created_at__gte=start_date, created_at__lte=end_date)
    output.append(f"Total Payment Transactions: {payments.count()}")
    output.append(f"Total Collected Amount: {payments.aggregate(Sum('amount'))['amount__sum'] or 0}")
    
    # 3. Pharmacy Purchases (Expenses)
    output.append("\n--- DEBUGGING PURCHASE INVOICES ---")
    all_purchases = PurchaseInvoice.objects.all()
    output.append(f"Total Purchase Invoices in DB: {all_purchases.count()}")
    for p in all_purchases:
        output.append(f"ID: {p.id}, InvNo: {p.supplier_invoice_no}, Date: {p.invoice_date}, Amount: {p.total_amount}")
    
    purchases = PurchaseInvoice.objects.filter(invoice_date__gte=start_date.date(), invoice_date__lte=end_date.date())
    output.append(f"Filtered Purchase Invoices (Jan 1 - {end_date.date()}): {purchases.count()}")
    output.append(f"Total Purchase Amount (Filtered): {purchases.aggregate(Sum('total_amount'))['total_amount__sum'] or 0}")
    
    # 4. Lab Purchases
    lab_purchases = LabPurchase.objects.filter(invoice_date__gte=start_date.date(), invoice_date__lte=end_date.date())
    output.append(f"Total Lab Purchases: {lab_purchases.count()}")
    
    # 5. Lab Logs
    logs = LabInventoryLog.objects.filter(created_at__gte=start_date, created_at__lte=end_date, transaction_type='STOCK_IN')
    output.append(f"Total Lab Stock-In Logs: {logs.count()}")
    output.append(f"Total Lab Stock-In Cost: {logs.aggregate(Sum('cost'))['cost__sum'] or 0}")

    with open('debug_results.txt', 'w') as f:
        f.write('\n'.join(output))

if __name__ == "__main__":
    check_financials()
