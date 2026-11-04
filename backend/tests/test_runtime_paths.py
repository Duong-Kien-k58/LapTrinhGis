import tempfile
from pathlib import Path

from django.conf import settings
from django.test import SimpleTestCase

from backend.runtime_paths import find_gdal_python


class RuntimePathTests(SimpleTestCase):
    def test_explicit_override_is_preserved(self):
        self.assertEqual(find_gdal_python({'DEM_GDAL_PYTHON': 'D:/custom/python.exe'}, []), 'D:/custom/python.exe')

    def test_detects_latest_complete_qgis_and_skips_incomplete_install(self):
        with tempfile.TemporaryDirectory(dir=settings.TEMP_ROOT / 'tests') as folder:
            for version in ('3.9', '3.40', '4.0'):
                root = Path(folder) / f'QGIS {version}'
                (root / 'bin').mkdir(parents=True)
                (root / 'bin/python3.exe').touch()
                if version != '4.0':
                    gdal = root / 'apps/Python312/Lib/site-packages/osgeo/gdal.py'
                    gdal.parent.mkdir(parents=True)
                    gdal.touch()
            result = find_gdal_python({}, [folder])
            self.assertEqual(Path(result), Path(folder) / 'QGIS 3.40/bin/python3.exe')

    def test_missing_install_returns_empty_path(self):
        self.assertEqual(find_gdal_python({}, []), '')
