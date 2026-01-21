from rest_framework import permissions

class IsReceptionistOrAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        # Staff (needs to see patients/visits) OR Admin
        allowed_roles = ['RECEPTION', 'DOCTOR', 'LAB', 'PHARMACY', 'ADMIN']
        return request.user.role in allowed_roles or request.user.is_superuser
