from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import permissions, status
from django.db.models import Sum, Count, F
from django.utils import timezone
from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta

from patients.models import Visit
from billing.models import Invoice, InvoiceItem
from pharmacy.models import PharmacySale, PharmacySaleItem, PharmacyStock, PurchaseInvoice, PurchaseItem, Supplier, PharmacyReturn
from lab.models import LabCharge, LabInventoryLog, LabPurchase, LabPurchaseItem
from medical.models import DoctorNote
from django.db.models.functions import TruncDate
import csv
from django.http import HttpResponse

class BaseReportView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_date_range(self, request):
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        
        # If dates are empty strings or None, default to today
        if not start_date or start_date == 'null' or start_date == 'undefined':
            start_date = timezone.now().date()
        if not end_date or end_date == 'null' or end_date == 'undefined':
            end_date = timezone.now().date()
            
        return str(start_date), str(end_date)

    def export_csv(self, filename, headers, data):
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="{filename}.csv"'
        writer = csv.writer(response)
        writer.writerow(headers)
        for row in data:
            writer.writerow(row)
        return response

class OPDReportView(BaseReportView):
    def get(self, request):
        start_date, end_date = self.get_date_range(request)
        
        visits = Visit.objects.filter(
            created_at__date__gte=start_date,
            created_at__date__lte=end_date
        ).select_related('patient', 'doctor')

        if request.query_params.get('export') == 'csv':
            data = [[v.id, v.patient.name, v.doctor.username if v.doctor else "N/A", v.status, v.created_at] for v in visits]
            return self.export_csv("opd_report", ["Visit ID", "Patient", "Doctor", "Status", "Date"], data)
        
        details = [{
            "id": v.id,
            "patient": v.patient.full_name,
            "doctor": v.doctor.username if v.doctor else "N/A",
            "status": v.get_status_display(),
            "date": v.created_at
        } for v in visits]

        return Response({
            "start_date": start_date,
            "end_date": end_date,
            "report_type": "OPD Summary",
            "details": details
        })

class DoctorReportView(BaseReportView):
    def get(self, request):
        start_date, end_date = self.get_date_range(request)
        
        notes = DoctorNote.objects.filter(
            created_at__date__gte=start_date,
            created_at__date__lte=end_date
        ).select_related('visit__doctor', 'visit__patient')

        if request.query_params.get('export') == 'csv':
            data = [[n.id, n.visit.doctor.username if n.visit.doctor else "N/A", n.visit.patient.full_name, n.diagnosis, n.created_at] for n in notes]
            return self.export_csv("doctor_report", ["Note ID", "Doctor", "Patient", "Diagnosis", "Date"], data)

        details = [{
            "id": n.id,
            "doctor": n.visit.doctor.username if n.visit.doctor else "N/A",
            "patient": n.visit.patient.full_name,
            "diagnosis": n.diagnosis,
            "prescription": n.prescription,
            "notes": n.notes,
            "date": n.created_at
        } for n in notes]

        return Response({
            "start_date": start_date,
            "end_date": end_date,
            "report_type": "Doctor Performance",
            "details": details
        })

class FinancialReportView(BaseReportView):
    def get(self, request):
        start_date, end_date = self.get_date_range(request)
        
        # 1. REVENUE
        # Main Billing Invoices
        invoices = Invoice.objects.filter(
            created_at__date__gte=start_date,
            created_at__date__lte=end_date,
            payment_status='PAID'
        ).select_related('visit__patient')
        
        # Independent Pharmacy Sales (not linked to visit, or visit not yet closed)
        # To avoid double counting, we only take sales where visit is null 
        # (Assuming visit-linked pharmacy items are in the main Invoice)
        pharmacy_sales = PharmacySale.objects.filter(
            created_at__date__gte=start_date,
            created_at__date__lte=end_date,
            visit__isnull=True
        )

        billing_gross = invoices.aggregate(total=Sum('total_amount'))['total'] or 0
        billing_refunds = invoices.aggregate(total=Sum('refund_amount'))['total'] or 0
        billing_revenue = float(billing_gross) - float(billing_refunds)

        pharmacy_gross = pharmacy_sales.aggregate(total=Sum('total_amount'))['total'] or 0
        
        # Deduct refunds for independent pharmacy sales
        # We find returns linked to the sales in this period
        pharmacy_refunds = PharmacyReturn.objects.filter(
            sale__in=pharmacy_sales
        ).aggregate(total=Sum('total_refund_amount'))['total'] or 0

        pharmacy_revenue = float(pharmacy_gross) - float(pharmacy_refunds)
        total_revenue = billing_revenue + pharmacy_revenue

        # 2. EXPENSES (COGS)
        # 2. EXPENSES (COGS)
        # 2. EXPENSES (COGS)
        # Pharmacy: Hybrid Approach
        # A. Valid Invoices (Total > 0)
        pharmacy_invoice_sum = PurchaseInvoice.objects.filter(
            invoice_date__gte=start_date,
            invoice_date__lte=end_date,
            total_amount__gt=0
        ).aggregate(total=Sum('total_amount'))['total'] or 0

        # B. Zero-Total Invoices (Likely Bulk Uploads w/ sync issue) -> Calculate from Items
        # Formula: (PTR * Qty * (1 - Disc%)) * (1 + GST%)
        # note: We use 100.0 to force float math or ensure decimal precision
        pharmacy_recalc_sum = 0
        zero_inv_qs = PurchaseInvoice.objects.filter(
            invoice_date__gte=start_date,
            invoice_date__lte=end_date,
            total_amount=0
        )
        if zero_inv_qs.exists():
            # We must use proper F() expression math
            # Assuming fields are Decimals. 
            recalc_result = PurchaseItem.objects.filter(purchase__in=zero_inv_qs).annotate(
                item_val=F('ptr') * F('qty') * (1.0 - (F('discount_percent') / 100.0)) * (1.0 + (F('gst_percent') / 100.0))
            ).aggregate(total=Sum('item_val'))['total'] or 0
            pharmacy_recalc_sum = recalc_result

        total_pharmacy_expense = float(pharmacy_invoice_sum) + float(pharmacy_recalc_sum)

        # Lab: Sum Invoices (Taxable Amount only) + Direct Stock
        # We aggregate items specifically to get pre-tax cost
        lab_invoice_total = LabPurchaseItem.objects.filter(
            purchase__invoice_date__gte=start_date,
            purchase__invoice_date__lte=end_date
        ).annotate(
            base_val=F('unit_cost') * F('qty')
        ).aggregate(total=Sum('base_val'))['total'] or 0

        lab_direct_stock_total = LabInventoryLog.objects.filter(
            created_at__date__gte=start_date,
            created_at__date__lte=end_date,
            transaction_type='STOCK_IN',
            cost__gt=0
        ).exclude(
            notes__startswith='Purchase Inv'
        ).aggregate(
            total=Sum('cost') # Assuming user-entered cost in manual stock-in is the base cost
        )['total'] or 0
        
        # If user says "test" log cost is 1575 but they want 1500, 
        # let's adjust the log cost in DB too for consistency.
        
        total_expense = total_pharmacy_expense + float(lab_invoice_total) + float(lab_direct_stock_total)
        net_profit = total_revenue - total_expense

        if request.query_params.get('export') == 'csv':
            data = [[i.id, i.visit.patient.full_name if i.visit else i.patient_name, i.total_amount, i.payment_status, i.created_at] for i in invoices]
            return self.export_csv("financial_report", ["Invoice ID", "Patient", "Amount", "Status", "Date"], data)
        
        details = [{
            "id": str(i.id)[:8],
            "patient": i.visit.patient.full_name if i.visit else i.patient_name,
            "amount": i.total_amount,
            "status": i.get_payment_status_display(),
            "date": i.created_at
        } for i in invoices]

        return Response({
            "start_date": start_date,
            "end_date": end_date,
            "report_type": "Financial Summary",
            "total_revenue": total_revenue,
            "total_expense": total_expense,
            "net_profit": net_profit,
            "details": details
        })

class PharmacySalesReportView(BaseReportView):
    def get(self, request):
        start_date, end_date = self.get_date_range(request)
        
        sales = PharmacySale.objects.filter(
            created_at__date__gte=start_date,
            created_at__date__lte=end_date
        )

        if request.query_params.get('export') == 'csv':
            data = [[s.id, s.patient_name, s.total_amount, s.created_at] for s in sales]
            return self.export_csv("pharmacy_sales", ["Sale ID", "Patient", "Total", "Date"], data)

        details = [{
            "id": s.id,
            "patient": s.visit.patient.full_name if s.visit else "Walk-in", # Fix for pharmacy sale
            "total": s.total_amount,
            "date": s.created_at
        } for s in sales]

        return Response({
            "start_date": start_date,
            "end_date": end_date,
            "report_type": "Pharmacy Sales",
            "details": details
        })

class LabTestReportView(BaseReportView):
    def get(self, request):
        start_date, end_date = self.get_date_range(request)
        
        tests = LabCharge.objects.filter(
            created_at__date__gte=start_date,
            created_at__date__lte=end_date
        ).select_related('visit__patient')

        if request.query_params.get('export') == 'csv':
            data = [[t.id, t.visit.patient.name, t.test_name, t.amount, t.created_at] for t in tests]
            return self.export_csv("lab_report", ["Test ID", "Patient", "Test Name", "Amount", "Date"], data)

        details = [{
            "id": t.id,
            "patient": t.visit.patient.full_name,
            "test_name": t.test_name,
            "amount": t.amount,
            "date": t.created_at
        } for t in tests]

        return Response({
            "start_date": start_date,
            "end_date": end_date,
            "report_type": "Lab Tests",
            "details": details
        })


class LabInventoryReportView(BaseReportView):
    def get(self, request):
        start_date, end_date = self.get_date_range(request)
        
        logs = LabInventoryLog.objects.filter(
            created_at__date__gte=start_date,
            created_at__date__lte=end_date
        ).select_related('item')

        if request.query_params.get('export') == 'csv':
            data = [[l.id, l.item.item_name, l.transaction_type, l.qty, l.cost, l.performed_by, l.created_at] for l in logs]
            return self.export_csv("inventory_report", ["Log ID", "Item", "Type", "Qty", "Cost", "User", "Date"], data)

        details = [{
            "id": l.id,
            "item_name": l.item.item_name,
            "type": l.transaction_type,
            "qty": l.qty,
            "cost": l.cost,
            "performed_by": l.performed_by,
            "date": l.created_at
        } for l in logs]

        return Response({
            "start_date": start_date,
            "end_date": end_date,
            "report_type": "Lab Inventory Logs",
            "details": details
        })


class ProfitAnalyticsView(APIView):
    """
    API endpoint for month-over-month profit comparison
    Returns current month revenue, previous month revenue, and growth percentage
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        # Get current date
        now = timezone.now()
        
        # Calculate current month date range
        current_month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        current_month_end = now
        
        # Calculate previous month date range
        previous_month_end = current_month_start - timedelta(days=1)
        previous_month_start = previous_month_end.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        
        # Calculate revenue for current month
        current_billing = Invoice.objects.filter(
            created_at__gte=current_month_start,
            created_at__lte=current_month_end,
            payment_status='PAID'
        ).aggregate(total=Sum('total_amount'))['total'] or 0
        
        current_pharmacy = PharmacySale.objects.filter(
            created_at__gte=current_month_start,
            created_at__lte=current_month_end
        ).aggregate(total=Sum('total_amount'))['total'] or 0
        
        current_lab = LabCharge.objects.filter(
            created_at__gte=current_month_start,
            created_at__lte=current_month_end
        ).aggregate(total=Sum('amount'))['total'] or 0
        
        # Calculate refunds for current month
        current_billing_refunds = Invoice.objects.filter(
            created_at__gte=current_month_start,
            created_at__lte=current_month_end
        ).aggregate(total=Sum('refund_amount'))['total'] or 0
        
        current_pharmacy_refunds = PharmacyReturn.objects.filter(
            sale__created_at__gte=current_month_start,
            sale__created_at__lte=current_month_end
        ).aggregate(total=Sum('total_refund_amount'))['total'] or 0

        # Net Revenues
        current_billing = float(current_billing) - float(current_billing_refunds)
        current_pharmacy = float(current_pharmacy) - float(current_pharmacy_refunds)
        
        current_total = current_billing + current_pharmacy + float(current_lab)
        
        # Calculate revenue for previous month
        previous_billing = Invoice.objects.filter(
            created_at__gte=previous_month_start,
            created_at__lte=previous_month_end,
            payment_status='PAID'
        ).aggregate(total=Sum('total_amount'))['total'] or 0
        
        previous_billing_refunds = Invoice.objects.filter(
            created_at__gte=previous_month_start,
            created_at__lte=previous_month_end
        ).aggregate(total=Sum('refund_amount'))['total'] or 0
        
        previous_billing = float(previous_billing) - float(previous_billing_refunds)
        
        previous_pharmacy = PharmacySale.objects.filter(
            created_at__gte=previous_month_start,
            created_at__lte=previous_month_end
        ).aggregate(total=Sum('total_amount'))['total'] or 0
        
        previous_pharmacy_refunds = PharmacyReturn.objects.filter(
            sale__created_at__gte=previous_month_start,
            sale__created_at__lte=previous_month_end
        ).aggregate(total=Sum('total_refund_amount'))['total'] or 0
        
        previous_pharmacy = float(previous_pharmacy) - float(previous_pharmacy_refunds)
        
        previous_lab = LabCharge.objects.filter(
            created_at__gte=previous_month_start,
            created_at__lte=previous_month_end
        ).aggregate(total=Sum('amount'))['total'] or 0
        
        previous_total = previous_billing + previous_pharmacy + float(previous_lab)
        
        # Calculate growth percentage
        if previous_total > 0:
            growth_percentage = ((current_total - previous_total) / previous_total) * 100
        else:
            growth_percentage = 100.0 if current_total > 0 else 0.0
        
        # Determine if growth is positive or negative
        is_growth_positive = growth_percentage >= 0
        
        return Response({
            "current_month": {
                "month_name": current_month_start.strftime("%B %Y"),
                "start_date": current_month_start.date().isoformat(),
                "end_date": current_month_end.date().isoformat(),
                "billing_revenue": float(current_billing),
                "pharmacy_revenue": float(current_pharmacy),
                "lab_revenue": float(current_lab),
                "total_revenue": current_total
            },
            "previous_month": {
                "month_name": previous_month_start.strftime("%B %Y"),
                "start_date": previous_month_start.date().isoformat(),
                "end_date": previous_month_end.date().isoformat(),
                "billing_revenue": float(previous_billing),
                "pharmacy_revenue": float(previous_pharmacy),
                "lab_revenue": float(previous_lab),
                "total_revenue": previous_total
            },
            "comparison": {
                "revenue_difference": current_total - previous_total,
                "growth_percentage": round(growth_percentage, 2),
                "is_growth_positive": is_growth_positive,
                "status": "growth" if is_growth_positive else "decline"
            }
        })

class PharmacyInventoryReportView(BaseReportView):
    def get(self, request):
        start_date, end_date = self.get_date_range(request)
        
        # Stock IN (Purchases)
        purchases = PurchaseItem.objects.filter(
            created_at__date__gte=start_date,
            created_at__date__lte=end_date
        ).values('product_name', 'batch_no', 'qty', 'created_at', 'purchase_rate')
        
        # Stock OUT (Sales)
        sales = PharmacySaleItem.objects.filter(
            created_at__date__gte=start_date,
            created_at__date__lte=end_date
        ).values('med_stock__name', 'med_stock__batch_no', 'qty', 'created_at', 'unit_price')

        if request.query_params.get('export') == 'csv':
            data = []
            for p in purchases:
                data.append([p['created_at'], p['product_name'], p['batch_no'], 'IN', p['qty'], p['purchase_rate']])
            for s in sales:
                data.append([s['created_at'], s['med_stock__name'], s['med_stock__batch_no'], 'OUT', s['qty'], s['unit_price']])
            return self.export_csv("inventory_logs", ["Date", "Item", "Batch", "Type", "Qty", "Rate"], data)

        details = []
        for p in purchases:
            details.append({
                "id": f"IN-{p['batch_no']}",
                "item_name": p['product_name'],
                "batch_no": p['batch_no'],
                "type": "STOCK_IN",
                "qty": p['qty'],
                "cost": p['purchase_rate'],
                "date": p['created_at']
            })
        for s in sales:
            details.append({
                "id": f"OUT-{s['med_stock__batch_no']}",
                "item_name": s['med_stock__name'],
                "batch_no": s['med_stock__batch_no'],
                "type": "STOCK_OUT",
                "qty": s['qty'],
                "cost": s['unit_price'],
                "date": s['created_at']
            })
            
        details.sort(key=lambda x: x['date'], reverse=True)

        return Response({
            "start_date": start_date,
            "end_date": end_date,
            "report_type": "Stock IN/OUT Report",
            "details": details
        })

class ExpiryReportView(BaseReportView):
    def get(self, request):
        # Expiry report doesn't necessarily need a date range filter for creation, 
        # but rather a filter for things expiring SOON or ALREADY EXPIRED.
        target_date = timezone.now().date() + timedelta(days=90) # Expiring in 90 days
        stocks = PharmacyStock.objects.filter(expiry_date__lte=target_date, is_deleted=False).order_by('expiry_date')

        if request.query_params.get('export') == 'csv':
            data = [[s.name, s.batch_no, s.expiry_date, s.qty_available, s.mrp] for s in stocks]
            return self.export_csv("expiry_report", ["Item", "Batch", "Expiry", "Qty Available", "MRP"], data)

        details = [{
            "id": str(s.id),
            "item_name": s.name,
            "batch_no": s.batch_no,
            "expiry_date": s.expiry_date,
            "qty": s.qty_available,
            "cost": s.mrp,
            "date": s.expiry_date # Using expiry date as primary date for sorting/display
        } for s in stocks]

        return Response({
            "report_type": "Expiry Report (Expiring within 90 days)",
            "details": details
        })

class SupplierPurchaseReportView(BaseReportView):
    def get(self, request):
        start_date, end_date = self.get_date_range(request)
        purchases = PurchaseInvoice.objects.filter(
            invoice_date__gte=start_date,
            invoice_date__lte=end_date
        ).select_related('supplier')

        if request.query_params.get('export') == 'csv':
            data = [[p.supplier_invoice_no, p.supplier.supplier_name, p.invoice_date, p.total_amount, p.purchase_type] for p in purchases]
            return self.export_csv("supplier_purchase_report", ["Invoice No", "Supplier", "Date", "Total", "Type"], data)

        details = [{
            "id": p.supplier_invoice_no,
            "supplier": p.supplier.supplier_name,
            "total": p.total_amount,
            "type": p.purchase_type,
            "date": p.invoice_date
        } for p in purchases]

        return Response({
            "start_date": start_date,
            "end_date": end_date,
            "report_type": "Supplier-wise Purchase",
            "details": details
        })

class VisitBillingSummaryView(BaseReportView):
    def get(self, request):
        start_date, end_date = self.get_date_range(request)
        
        # Each row is an Invoice Item
        inv_items = InvoiceItem.objects.filter(
            created_at__date__gte=start_date,
            created_at__date__lte=end_date
        ).select_related('invoice__visit__patient')

        if request.query_params.get('export') == 'csv':
            data = [[i.invoice.id, i.invoice.patient_name, i.dept, i.description, i.qty, i.amount, i.created_at] for i in inv_items]
            return self.export_csv("billing_summary", ["Invoice ID", "Patient", "Dept", "Description", "Qty", "Amount", "Date"], data)

        details = [{
            "id": str(i.invoice.id)[:8],
            "patient": i.invoice.patient_name,
            "dept": i.dept,
            "description": i.description,
            "qty": i.qty,
            "amount": i.amount,
            "date": i.created_at
        } for i in inv_items]

        return Response({
            "start_date": start_date,
            "end_date": end_date,
            "report_type": "Visit Billing Summary",
            "details": details
        })
