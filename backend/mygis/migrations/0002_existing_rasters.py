from django.db import migrations


def seed_rasters(apps, schema_editor):
    Raster = apps.get_model('mygis', 'RasterMetadata')
    for name, title, kind in [
        ('fast_alpha', 'Dữ liệu nền VN25K', 'satellite'),
        ('SRTM_30_VN_UTM', 'DEM Việt Nam (SRTM 30 m)', 'dem'),
    ]:
        Raster.objects.get_or_create(name=name, defaults={'title': title, 'presentation_type': kind})


class Migration(migrations.Migration):
    dependencies = [('mygis', '0001_initial')]
    operations = [migrations.RunPython(seed_rasters, migrations.RunPython.noop)]
