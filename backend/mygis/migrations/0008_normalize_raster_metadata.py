from django.db import migrations


def normalize(apps, schema_editor):
    Raster = apps.get_model('mygis', 'RasterMetadata')
    for raster in Raster.objects.exclude(presentation_type='raster').iterator():
        metadata = dict(raster.technical_metadata or {})
        # Retained only to make this metadata migration reversible.
        metadata['_previous_presentation_type'] = raster.presentation_type
        Raster.objects.filter(pk=raster.pk).update(presentation_type='raster', technical_metadata=metadata)


def restore(apps, schema_editor):
    Raster = apps.get_model('mygis', 'RasterMetadata')
    for raster in Raster.objects.all().iterator():
        metadata = dict(raster.technical_metadata or {})
        previous = metadata.pop('_previous_presentation_type', None)
        if previous:
            Raster.objects.filter(pk=raster.pk).update(presentation_type=previous, technical_metadata=metadata)


class Migration(migrations.Migration):
    dependencies = [('mygis', '0007_unify_raster_type')]
    operations = [migrations.RunPython(normalize, restore)]
