from rest_framework import permissions

class IsHospitalStaff(permissions.BasePermission):
    """
    Generic permission for any authenticated hospital staff.
    Roles: RECEPTION, DOCTOR, LAB, PHARMACY, ADMIN
    """
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        allowed_roles = ['RECEPTION', 'DOCTOR', 'LAB', 'PHARMACY', 'ADMIN', 'CASUALTY']
        return request.user.role in allowed_roles or request.user.is_superuser

class IsAdminRole(permissions.BasePermission):
    """
    Strict permission for ADMIN role only.
    """
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and (request.user.role == 'ADMIN' or request.user.is_superuser))
