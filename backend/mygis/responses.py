"""Shared JSON responses for GIS APIs."""
from django.http import JsonResponse

def error(message, status=400):
    return JsonResponse({"success": False, "message": message}, status=status)

def success(message, **data):
    return JsonResponse({"success": True, "message": message, **data})
