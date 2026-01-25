
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'revive_cms.settings')
django.setup()

from django.conf import settings
from rest_framework.test import APIRequestFactory
from patients.views import VisitViewSet

def test_filter():
    print("Testing status__in filter...")
    factory = APIRequestFactory()
    # Mock request with status__in
    request = factory.get('/reception/visits/', {'assigned_role': 'CASUALTY', 'status__in': 'IN_PROGRESS,OPEN'})
    
    view = VisitViewSet.as_view({'get': 'list'})
    response = view(request)
    
    print(f"Status Code: {response.status_code}")
    results = response.data.get('results', response.data)
    print(f"Count: {len(results)}")
    
    for v in results:
        print(f"ID: {v['id']}, Status: {v['status']}, Patient: {v['patient_name']}")

if __name__ == "__main__":
    test_filter()
