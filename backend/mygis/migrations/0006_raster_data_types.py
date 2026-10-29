from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("mygis", "0005_validate_aligned_borders")]

    operations = [
        migrations.AlterField(
            model_name="rastermetadata",
            name="presentation_type",
            field=models.CharField(
                choices=[
                    ("satellite", "Ảnh vệ tinh"),
                    ("aerial", "Ảnh hàng không"),
                    ("dem", "Dữ liệu DEM"),
                    ("dsm", "Mô hình số bề mặt DSM"),
                    ("dtm", "Mô hình số địa hình DTM"),
                    ("uav", "Ảnh UAV"),
                    ("thematic", "Raster chuyên đề"),
                ],
                default="thematic",
                max_length=16,
            ),
        ),
    ]
