from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import PharmacyStock
from core.models import Notification
from django.contrib.auth import get_user_model

User = get_user_model()

@receiver(post_save, sender=PharmacyStock)
def check_low_stock(sender, instance, **kwargs):
    if instance.qty_available < instance.reorder_level:
        # Check if a recent notification already exists to avoid spam
        # This is a basic implementation. Ideally we'd have a 'last_notified' field.
        # check if active notification exists for this stock
        exists = Notification.objects.filter(
            message__contains=f"Low stock alert: {instance.name}",
            is_read=False
        ).exists()

        if not exists:
            # Notify all Pharmacy and Admin users
            # For simplicity, let's notify the first Admin or all admins
            # In a real app, we might have a group or specific role query
            
            # Find users with role 'PHARMACY' or 'ADMIN'
            recipients = User.objects.filter(role__in=['PHARMACY', 'ADMIN'], is_active=True)
            
            for user in recipients:
                Notification.objects.create(
                    recipient=user,
                    message=f"Low stock alert: {instance.name} (Batch: {instance.batch_no}) has only {instance.qty_available} units left.",
                    type='WARNING'
                )
