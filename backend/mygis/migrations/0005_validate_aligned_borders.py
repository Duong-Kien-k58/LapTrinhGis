"""Remove floating-point ring defects introduced by inverse projection."""
from django.db import migrations


def validate(apps, schema_editor):
    with schema_editor.connection.cursor() as cursor:
        cursor.execute('''UPDATE public.nuocngoai
            SET geom=ST_Multi(ST_CollectionExtract(ST_MakeValid(geom),3))
            WHERE adm0_a3 IN ('CHN','KHM','LAO') AND NOT ST_IsValid(geom)''')
        cursor.execute('SELECT count(*) FROM public.nuocngoai WHERE NOT ST_IsValid(geom) OR ST_IsEmpty(geom)')
        if cursor.fetchone()[0]:
            raise RuntimeError('Invalid geometry remains after inverse projection.')


class Migration(migrations.Migration):
    dependencies = [('mygis', '0004_align_country_borders')]
    operations = [migrations.RunPython(validate)]
