import uuid
from django.db import models

class BaseModel(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_deleted = models.BooleanField(default=False)


    class Meta:
        abstract = True

class Notification(BaseModel):
    recipient = models.ForeignKey('users.User', on_delete=models.CASCADE, related_name='notifications')
    message = models.TextField()
    is_read = models.BooleanField(default=False)
    type = models.CharField(max_length=50, default='INFO') # e.g., VISIT_ASSIGNED
    related_id = models.UUIDField(null=True, blank=True)

    def __str__(self):
        return f"Notification for {self.recipient}: {self.message}"
