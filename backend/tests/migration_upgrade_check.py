"""Run with backend/venv/Scripts/python.exe backend/tests/migration_upgrade_check.py.

Uses disposable SQLite databases; never connects to the application's PostGIS.
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from django.conf import settings

settings.configure(
    INSTALLED_APPS=['mygis'],
    DATABASES={'default': {'ENGINE': 'django.db.backends.sqlite3', 'NAME': ':memory:'}},
    DEFAULT_AUTO_FIELD='django.db.models.BigAutoField',
)

import django

django.setup()

from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.db.migrations.recorder import MigrationRecorder

MIGRATIONS = [
    '0001_initial',
    '0002_existing_rasters',
    '0003_reference_layers_external',
    '0004_country_borders_external',
    '0005_border_validation_external',
    '0006_raster_data_types',
    '0007_unify_raster_type',
    '0008_normalize_raster_metadata',
]
HISTORICAL = {
    MIGRATIONS[2]: '0003_replace_reference_layers',
    MIGRATIONS[3]: '0004_align_country_borders',
    MIGRATIONS[4]: '0005_validate_aligned_borders',
}


class MigrationUpgradeTests(unittest.TestCase):
    def test_fresh_and_every_historical_upgrade_point(self):
        for prefix in range(9):
            with self.subTest(applied_migrations=prefix):
                try:
                    if prefix:
                        MigrationExecutor(connection).migrate([('mygis', MIGRATIONS[prefix - 1])])
                    # Emulate databases that only know the original migration names.
                    recorder = MigrationRecorder(connection)
                    for replacement, historical in HISTORICAL.items():
                        if MIGRATIONS.index(replacement) < prefix:
                            recorder.record_unapplied('mygis', replacement)
                            self.assertIn(('mygis', historical), recorder.applied_migrations())
                    with connection.cursor() as cursor:
                        cursor.execute('CREATE TABLE nuocngoai (gid integer PRIMARY KEY, ten text, geom text)')
                        cursor.execute("INSERT INTO nuocngoai VALUES (1, 'existing country', 'original geometry')")
                    if prefix >= 2:
                        state = MigrationExecutor(connection).loader.project_state([('mygis', MIGRATIONS[prefix - 1])])
                        Raster = state.apps.get_model('mygis', 'RasterMetadata')
                        Raster.objects.create(
                            name='custom_dem', title='Custom DEM',
                            presentation_type='raster' if prefix == 8 else 'dem',
                            technical_metadata={'elevation_unit': 'm'}, is_deleted=True,
                        )
                    executor = MigrationExecutor(connection)
                    executor.loader.check_consistent_history(connection)
                    executor.migrate([('mygis', MIGRATIONS[-1])])
                    executor = MigrationExecutor(connection)
                    self.assertEqual(executor.migration_plan([('mygis', MIGRATIONS[-1])]), [])
                    state = executor.loader.project_state([('mygis', MIGRATIONS[-1])])
                    Raster = state.apps.get_model('mygis', 'RasterMetadata')
                    self.assertEqual(Raster.objects.exclude(presentation_type='raster').count(), 0)
                    self.assertEqual(set(Raster.objects.filter(name__in=['fast_alpha', 'SRTM_30_VN_UTM']).values_list('name', flat=True)), {'fast_alpha', 'SRTM_30_VN_UTM'})
                    if prefix >= 2:
                        custom = Raster.objects.get(name='custom_dem')
                        self.assertTrue(custom.is_deleted)
                        self.assertEqual(custom.technical_metadata['elevation_unit'], 'm')
                    with connection.cursor() as cursor:
                        cursor.execute('SELECT * FROM nuocngoai')
                        self.assertEqual(cursor.fetchall(), [(1, 'existing country', 'original geometry')])
                    self.assertEqual(set(connection.introspection.table_names()), {'django_migrations', 'raster_metadata', 'nuocngoai'})
                finally:
                    if connection.connection is not None:
                        connection.connection.close()
                        connection.connection = None


if __name__ == '__main__':
    unittest.main()
