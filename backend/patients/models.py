import uuid
from django.db import models
from django.conf import settings
from django.core.validators import MinValueValidator
from core.models import BaseModel


class Patient(BaseModel):
    GENDER_CHOICES = (
        ('M', 'Male'),
        ('F', 'Female'),
        ('O', 'Other'),
    )

    full_name = models.CharField(max_length=255)
    age = models.PositiveIntegerField(validators=[MinValueValidator(0)])
    gender = models.CharField(max_length=1, choices=GENDER_CHOICES)
    phone = models.CharField(max_length=15, unique=True)
    address = models.TextField()
    id_proof = models.CharField(max_length=50, blank=True, null=True)

    def __str__(self):
        return f"{self.full_name} ({self.phone})"


class Visit(BaseModel):
    STATUS_CHOICES = (
        ('OPEN', 'Open'),
        ('IN_PROGRESS', 'In Progress'),
        ('CLOSED', 'Closed'),
    )

    patient = models.ForeignKey(Patient, on_delete=models.CASCADE, related_name='visits')
    doctor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='assigned_visits'
    )
    assigned_role = models.CharField(
        max_length=20, 
        choices=(
            ('ADMIN', 'Admin'),
            ('RECEPTION', 'Reception'),
            ('DOCTOR', 'Doctor'),
            ('LAB', 'Lab'),
            ('PHARMACY', 'Pharmacy'),
            ('CASUALTY', 'Casualty'),
        ), 
        default='DOCTOR'
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='OPEN')
    vitals = models.JSONField(default=dict, blank=True)

    def __str__(self):
        return f"Visit {self.id} - {self.patient.full_name}"
