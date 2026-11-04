"""Find a local QGIS Python without requiring machine-specific .env paths."""
import os
import re
from pathlib import Path


def find_gdal_python(environ=None, roots=None):
    environ = os.environ if environ is None else environ
    if environ.get('DEM_GDAL_PYTHON'):
        return environ['DEM_GDAL_PYTHON']
    roots = roots if roots is not None else [
        environ.get('ProgramW6432', 'C:/Program Files'),
        environ.get('ProgramFiles', 'C:/Program Files'),
        environ.get('ProgramFiles(x86)', 'C:/Program Files (x86)'),
        str(Path(environ.get('LOCALAPPDATA', 'C:/Users/Default/AppData/Local')) / 'Programs'),
        'C:/', 'D:/', 'E:/',
    ]
    installations = set()
    for root in roots:
        root = Path(root)
        if not root.is_dir():
            continue
        for pattern in ('QGIS*', 'OSGeo4W*'):
            installations.update(path for path in root.glob(pattern) if path.is_dir())
    for root in sorted(installations, key=lambda p: tuple(int(n) for n in re.findall(r'\d+', p.name)), reverse=True):
        for name in ('python3.exe', 'python.exe'):
            candidate = root / 'bin' / name
            if candidate.is_file() and any((root / 'apps').glob('Python*/Lib/site-packages/osgeo/gdal.py')):
                return str(candidate)
    return ''
