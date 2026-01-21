from django.db import models
from core.models import BaseModel
from patients.models import Visit

class CasualtyLog(BaseModel):
    visit = models.ForeignKey(Visit, on_delete=models.CASCADE, related_name='casualty_logs')
    transfer_path = models.TextField()
    treatment_notes = models.TextField()

    def __str__(self):
        return f"Casualty Log {self.id}"
