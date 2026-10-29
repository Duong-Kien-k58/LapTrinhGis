from django.db import models  # Công cụ tạo model trong Django

class RasterMetadata(models.Model):  # Model lưu thông tin mô tả raster
    """Thông tin raster đã được publish; GeoServer chỉ đảm nhiệm cung cấp WMS."""

    class PresentationType(models.TextChoices):
        SATELLITE = "satellite", "Ảnh vệ tinh"
        AERIAL = "aerial", "Ảnh hàng không"
        DEM = "dem", "Dữ liệu DEM"
        DSM = "dsm", "Mô hình số bề mặt DSM"
        DTM = "dtm", "Mô hình số địa hình DTM"
        UAV = "uav", "Ảnh UAV"
        THEMATIC = "thematic", "Raster chuyên đề"

    name = models.CharField(max_length=63, unique=True)  # Tên raster, không được trùng
    title = models.CharField(max_length=150)  # Tên hiển thị của raster
    crs = models.CharField(max_length=64, blank=True)  # Hệ tọa độ, ví dụ EPSG:4326
    bbox = models.JSONField(default=list)  # Phạm vi không gian của raster
    width = models.PositiveIntegerField(null=True, blank=True)  # Chiều rộng ảnh theo pixel
    height = models.PositiveIntegerField(null=True, blank=True)  # Chiều cao ảnh theo pixel
    source_filename = models.CharField(max_length=255, blank=True)  # Tên file raster gốc
    presentation_type = models.CharField(
        max_length=16,
        choices=PresentationType.choices,
        default=PresentationType.THEMATIC,
    )  # Nhóm trình bày của raster trên giao diện
    technical_metadata = models.JSONField(default=dict, blank=True)  # Thông tin kỹ thuật khác của raster
    is_deleted = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)  # Thời gian tạo bản ghi
    updated_at = models.DateTimeField(auto_now=True)  # Thời gian cập nhật gần nhất

    class Meta:
        db_table = "raster_metadata"  # Tên bảng trong PostgreSQL
        ordering = ["title", "name"]  # Sắp xếp mặc định theo title rồi name
