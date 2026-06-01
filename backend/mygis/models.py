from django.db import models
# Create your models here.
#tạo các model cho bảng trong database, mỗi model sẽ tương ứng với một bảng trong database
#CharField      → kiểu chữ
#max_length=255 → tối đa 255 ký tự
#blank=True     → trong form có thể để trống
#null=True      → trong database có thể lưu giá trị NULL
class UbTinh(models.Model):
    ten = models.CharField(max_length=255, blank=True, null=True)

    class Meta:
        db_table = 'ub_tinh'
        managed = False


class TinhLo(models.Model):
    tenduong = models.CharField(max_length=255, blank=True, null=True)
    loaiduong = models.CharField(max_length=255, blank=True, null=True)

    class Meta:
        db_table = 'tinhlo'
        managed = False


class RgTinh(models.Model):
    ten = models.CharField(max_length=255, blank=True, null=True)

    class Meta:
        db_table = 'rgtinh'
        managed = False