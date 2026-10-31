from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('mygis', '0006_raster_data_types')]
    operations = [migrations.AlterField(
        model_name='rastermetadata', name='presentation_type',
        field=models.CharField(choices=[('raster', 'Raster')], default='raster', max_length=16),
    )]
