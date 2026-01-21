import csv
from django.http import HttpResponse

def export_to_csv(queryset, filename, fields):
    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = f'attachment; filename="{filename}.csv"'
    
    writer = csv.writer(response)
    writer.writerow(fields)
    
    for obj in queryset:
        row = []
        for field in fields:
            val = getattr(obj, field, "")
            if callable(val): val = val()
            row.append(val)
        writer.writerow(row)
        
    return response
