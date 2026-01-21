from django.urls import path
from .views import (
    OPDReportView, FinancialReportView, DoctorReportView,
    PharmacySalesReportView, LabTestReportView, LabInventoryReportView,
    ProfitAnalyticsView, PharmacyInventoryReportView, ExpiryReportView,
    SupplierPurchaseReportView, VisitBillingSummaryView
)

urlpatterns = [
    path('opd/', OPDReportView.as_view(), name='opd-report'),
    path('financial/', FinancialReportView.as_view(), name='financial-report'),
    path('doctor/', DoctorReportView.as_view(), name='doctor-report'),
    path('pharmacy/', PharmacySalesReportView.as_view(), name='pharmacy-report'),
    path('lab/', LabTestReportView.as_view(), name='lab-report'),
    path('inventory/', LabInventoryReportView.as_view(), name='inventory-report'),
    path('profit-analytics/', ProfitAnalyticsView.as_view(), name='profit-analytics'),
    
    # New Reports
    path('pharmacy-inventory/', PharmacyInventoryReportView.as_view(), name='pharmacy-inventory-report'),
    path('expiry/', ExpiryReportView.as_view(), name='expiry-report'),
    path('supplier-purchase/', SupplierPurchaseReportView.as_view(), name='supplier-purchase-report'),
    path('billing-summary/', VisitBillingSummaryView.as_view(), name='billing-summary-report'),
]
