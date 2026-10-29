"""Replace the imported reference layers; raw originals remain in a backup schema.

Restore the pre-migration pg_dump with a new forward migration if necessary.
Deliberately irreversible: do not discard edits made after this replacement.
"""
from django.db import migrations


BACKUP_SCHEMA = 'reference_backup_20261025'
COUNTRY_FIELDS = {'gid', 'ten', 'name_en', 'adm0_a3', 'iso_a2', 'iso_a3',
                  'type', 'continent', 'label_x', 'label_y', 'geom'}
CENTER_FIELDS = {'gid', 'tentinh', 'tinhly', 'nguontd', 'loaidiem', 'geom'}


def replace_layers(apps, schema_editor):
    q = schema_editor.quote_name
    with schema_editor.connection.cursor() as cursor:
        cursor.execute("SET LOCAL lock_timeout = '10s'")
        for table in ('nuocngoai_all', 'nuocngoai', 'tthc', 'ub_tinh'):
            cursor.execute('SELECT to_regclass(%s)', [f'public.{table}'])
            if cursor.fetchone()[0] is None:
                raise RuntimeError(f'Missing prerequisite table: public.{table}')
        cursor.execute('SELECT DISTINCT ST_SRID(geom) FROM public.nuocngoai_all UNION SELECT DISTINCT ST_SRID(geom) FROM public.tthc')
        if any(row[0] not in (0, 4326) for row in cursor.fetchall()):
            raise RuntimeError('Unexpected CRS; verify source .prj before migrating.')
        cursor.execute(f'CREATE SCHEMA {q(BACKUP_SCHEMA)}')
        for table in ('nuocngoai_all', 'tthc'):
            cursor.execute(f'CREATE TABLE {q(BACKUP_SCHEMA)}.{q(table)} AS TABLE public.{q(table)}')
        for table in ('nuocngoai', 'ub_tinh'):
            cursor.execute(f'ALTER TABLE public.{q(table)} SET SCHEMA {q(BACKUP_SCHEMA)}')
        cursor.execute('ALTER TABLE public.nuocngoai_all RENAME TO nuocngoai')
        cursor.execute('ALTER TABLE public.nuocngoai RENAME COLUMN name_vi TO ten')
        for table, keep in [('nuocngoai', COUNTRY_FIELDS), ('tthc', CENTER_FIELDS)]:
            cursor.execute('SELECT column_name FROM information_schema.columns WHERE table_schema=%s AND table_name=%s', ['public', table])
            names = {row[0] for row in cursor.fetchall()}
            if not keep <= names:
                raise RuntimeError(f'Missing required attributes in {table}: {keep - names}')
            drops = ', '.join(f'DROP COLUMN {q(name)}' for name in sorted(names - keep))
            if drops:
                cursor.execute(f'ALTER TABLE public.{q(table)} {drops}')
        # Both source .prj files explicitly identify WGS84; assign, do not reproject.
        cursor.execute('''ALTER TABLE public.nuocngoai ALTER COLUMN geom
            TYPE geometry(MultiPolygon,4326) USING ST_Multi(ST_CollectionExtract(
                ST_SetSRID(CASE WHEN ST_IsValid(geom) THEN geom ELSE ST_MakeValid(geom) END,4326),3))''')
        cursor.execute('''ALTER TABLE public.tthc ALTER COLUMN geom
            TYPE geometry(Point,4326) USING ST_SetSRID(geom,4326)''')
        for table in ('nuocngoai', 'tthc'):
            cursor.execute(f'SELECT count(*) FROM public.{q(table)} WHERE geom IS NULL OR ST_IsEmpty(geom) OR NOT ST_IsValid(geom)')
            if cursor.fetchone()[0]:
                raise RuntimeError(f'Invalid or empty geometry in {table}; replacement rolled back.')
            cursor.execute(f'ANALYZE public.{q(table)}')


class Migration(migrations.Migration):
    dependencies = [('mygis', '0002_existing_rasters')]
    operations = [migrations.RunPython(replace_layers)]
