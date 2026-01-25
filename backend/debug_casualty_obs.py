
import os
import django
from django.conf import settings

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'revive_cms.settings')
django.setup()

from patients.models import Visit
from patients.serializers import VisitSerializer
from  rest_framework.test import APIRequestFactory

def debug_visits():
    print("--- Debugging Casualty Visits ---")
    
    # Simulate the query used by fetchQueue
    queryset = Visit.objects.filter(
        assigned_role='CASUALTY',
        status__in=['IN_PROGRESS', 'OPEN']
    ).order_by('-created_at')
    
    print(f"Found {queryset.count()} active casualty visits.")
    
    serializer = VisitSerializer(queryset, many=True)
    data = serializer.data
    
    for v in data:
        print(f"\nVisit ID: {v['id']}")
        print(f"Patient: {v['patient_name']}")
        print(f"Obs Data (Raw): {v.get('casualty_observations')}")
        obs_list = v.get('casualty_observations', [])
        
        has_active = any(o.get('is_active') for o in obs_list)
        print(f"Has Active Obs? {has_active}")
        
        if obs_list:
            for o in obs_list:
                print(f" - Obs ID: {o.get('id')}, Active: {o.get('is_active')}, Start: {o.get('start_time')}")

if __name__ == "__main__":
    debug_visits()
