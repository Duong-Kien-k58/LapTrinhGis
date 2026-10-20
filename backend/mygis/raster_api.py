from django.http import JsonResponse  # Dùng để trả dữ liệu JSON về frontend

def error(message, status=400):  # Hàm trả kết quả lỗi
    return JsonResponse({"success": False, "message": message}, status=status)  # success=False và mã lỗi HTTP

def success(message, **data):  # Hàm trả kết quả thành công
    return JsonResponse({"success": True, "message": message, **data})  # Gộp thêm dữ liệu cần trả về