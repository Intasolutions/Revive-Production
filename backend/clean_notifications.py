
import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "revive_cms.settings")
django.setup()

from core.models import Notification
from pharmacy.models import PharmacyStock
from django.db.models import Q

def clean_notifications():
    print("Checking for stuck notifications...")
    
    # Get all low stock notifications
    alerts = Notification.objects.filter(message__icontains="Low stock alert")
    print(f"Found {alerts.count()} potential low stock alerts.")
    
    deleted_count = 0
    
    stocks = PharmacyStock.objects.filter(is_deleted=False)
    
    for stock in stocks:
        if stock.qty_available > stock.reorder_level:
            # Healthy stock, ensure no alerts exist
            # Matches "Low stock alert: {NAME} (Batch: {BATCH})..."
            
            # 1. Exact Name + Batch match
            qs = Notification.objects.filter(
                Q(message__icontains=f"Low stock alert: {stock.name}") &
                Q(message__icontains=stock.batch_no)
            )
            
            cnt = qs.count()
            if cnt > 0:
                print(f"Deleting {cnt} stale alerts for {stock.name} ({stock.batch_no}) - Current Qty: {stock.qty_available}")
                qs.delete()
                deleted_count += cnt

    print(f"Done. Deleted {deleted_count} stale notifications.")

if __name__ == "__main__":
    clean_notifications()
