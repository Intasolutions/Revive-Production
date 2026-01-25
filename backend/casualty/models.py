from django.db import models
from core.models import BaseModel
from patients.models import Visit
from pharmacy.models import PharmacyStock

class CasualtyLog(BaseModel):
    visit = models.ForeignKey(Visit, on_delete=models.CASCADE, related_name='casualty_logs')
    transfer_path = models.TextField()
    treatment_notes = models.TextField()
    vitals = models.JSONField(default=dict, blank=True)

    def __str__(self):
        return f"Casualty Log {self.id}"

class CasualtyServiceDefinition(BaseModel):
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    base_charge = models.DecimalField(max_digits=10, decimal_places=2)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.name} (₹{self.base_charge})"

class CasualtyService(BaseModel):
    visit = models.ForeignKey(Visit, on_delete=models.CASCADE, related_name='casualty_services')
    service_definition = models.ForeignKey(CasualtyServiceDefinition, on_delete=models.PROTECT)
    qty = models.PositiveIntegerField(default=1)
    unit_charge = models.DecimalField(max_digits=10, decimal_places=2)
    total_charge = models.DecimalField(max_digits=10, decimal_places=2)
    notes = models.TextField(blank=True)

    def save(self, *args, **kwargs):
        self.total_charge = self.unit_charge * self.qty
        super().save(*args, **kwargs)

class CasualtyMedicine(BaseModel):
    visit = models.ForeignKey(Visit, on_delete=models.CASCADE, related_name='casualty_medicines')
    med_stock = models.ForeignKey(PharmacyStock, on_delete=models.PROTECT)
    qty = models.PositiveIntegerField(default=1)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    total_price = models.DecimalField(max_digits=10, decimal_places=2)
    dosage = models.CharField(max_length=100, blank=True)
    administered_at = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        self.total_price = self.unit_price * self.qty
        super().save(*args, **kwargs)

class CasualtyObservation(BaseModel):
    visit = models.ForeignKey(Visit, on_delete=models.CASCADE, related_name='casualty_observations')
    start_time = models.DateTimeField(auto_now_add=True)
    end_time = models.DateTimeField(null=True, blank=True)
    planned_duration_minutes = models.PositiveIntegerField(default=60)
    observation_notes = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
