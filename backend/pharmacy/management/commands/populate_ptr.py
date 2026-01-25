from django.core.management.base import BaseCommand
from pharmacy.models import PharmacyStock, PurchaseItem

class Command(BaseCommand):
    help = 'Populates ptr field in PharmacyStock from latest PurchaseItem'

    def handle(self, *args, **kwargs):
        stocks = PharmacyStock.objects.filter(is_deleted=False)
        updated_count = 0

        for stock in stocks:
            # Find the latest purchase item for this batch
            last_purchase = PurchaseItem.objects.filter(
                product_name=stock.name, 
                batch_no=stock.batch_no
            ).order_by('-created_at').first()

            if last_purchase:
                # Use the PTR from the invoice history
                # If PTR was 0 in history, fall back to current purchase_rate (safeguard)
                new_ptr = last_purchase.ptr if last_purchase.ptr > 0 else stock.purchase_rate
                
                if new_ptr > 0:
                    stock.ptr = new_ptr
                    stock.save()
                    updated_count += 1
                    self.stdout.write(f"Updated {stock.name}: PTR {new_ptr}")
            else:
                # No purchase history found (maybe manual stock entry?), leave as is or set to current rate?
                # If we leave as 0, frontend falls back to purchase_rate anyway.
                # But let's set it to purchase_rate to be clean if purchase_rate > 0
                if stock.ptr == 0 and stock.purchase_rate > 0:
                    # Wait, if we set it to purchase_rate (38.22), it defeats the purpose if the goal was to find 76.43
                    # But if no history exists, we can't find 76.43.
                    # So finding history is the only way to "recover" the higher price.
                    pass

        self.stdout.write(self.style.SUCCESS(f'Successfully updated {updated_count} stock items'))
