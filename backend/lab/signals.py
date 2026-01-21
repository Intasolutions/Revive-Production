from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import LabInventory
from core.models import Notification
from django.contrib.auth import get_user_model

User = get_user_model()

@receiver(post_save, sender=LabInventory)
def check_lab_low_stock(sender, instance, **kwargs):
    if instance.qty < instance.reorder_level:
        # Check active notification
        pass_check = Notification.objects.filter(
            message__contains=f"Lab Low Stock: {instance.item_name}",
            is_read=False
        ).exists()

        if not pass_check:
            recipients = User.objects.filter(role__in=['LAB', 'ADMIN'], is_active=True)
            notifications = [
                Notification(
                    recipient=u,
                    message=f"Lab Low Stock: {instance.item_name} has only {instance.qty} units left.",
                    type='WARNING'
                ) for u in recipients
            ]
            Notification.objects.bulk_create(notifications)
