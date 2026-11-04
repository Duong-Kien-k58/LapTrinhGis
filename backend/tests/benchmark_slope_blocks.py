"""QGIS Python: benchmark_slope_blocks.py BASELINE_MODULE [SIZE] [full|data]."""
import importlib.util
import json
import shutil
import sys
import tempfile
import time
from pathlib import Path

import numpy as np
from osgeo import gdal, osr

ROOT = Path(__file__).resolve().parents[2]
(ROOT / 'temp/tests').mkdir(parents=True, exist_ok=True)
SIZE = int(sys.argv[2]) if len(sys.argv) > 2 else 4096
MODE = sys.argv[3] if len(sys.argv) > 3 else 'full'
gdal.UseExceptions()


def load(path):
    spec = importlib.util.spec_from_file_location('__main__', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


with tempfile.TemporaryDirectory(dir=ROOT / 'temp/tests') as temp:
    folder = Path(temp)
    source = folder / 'source.tif'
    ds = gdal.GetDriverByName('GTiff').Create(str(source), SIZE, SIZE, 1, gdal.GDT_Float32,
        ['TILED=YES', 'COMPRESS=DEFLATE', 'PREDICTOR=3'])
    crs = osr.SpatialReference()
    crs.ImportFromEPSG(32648)
    ds.SetProjection(crs.ExportToWkt())
    ds.SetGeoTransform((500000, 10, 0, 1800000, 0, -10))
    band = ds.GetRasterBand(1)
    band.SetNoDataValue(-9999)
    # Irregular data occupies about half the bounding rectangle, with holes.
    for y in range(0, SIZE, 256):
        ys, xs = np.mgrid[y:min(y + 256, SIZE), :SIZE]
        valid = (np.abs(xs - ys) < SIZE // 3) & ~((xs > SIZE // 2) & (ys < SIZE // 2))
        values = (1000 + 40 * np.sin(xs / 83) + 30 * np.cos(ys / 57)).astype(np.float32)
        band.WriteArray(np.where(valid, values, -9999), 0, y)
    band = ds = None
    modules = [('baseline', load(Path(sys.argv[1]))), ('candidate', load(ROOT / 'backend/mygis/terrain_analysis.py'))]
    footprint = None
    if MODE == 'data':
        footprint = modules[0][1].inspect_data_footprint(folder,
            {'source': {'path': str(source), 'band': 1, 'elevation_unit': 'm'}}, lambda *args: 1)
    reference = None
    measurements = []
    for repeat in range(2):
        for label, module in (modules if repeat == 0 else reversed(modules)):
            run = folder / f'{label}-{repeat}'
            run.mkdir()
            state = {'source': {'path': str(source), 'band': 1, 'elevation_unit': 'm'},
                     'request': {'region': {'mode': MODE}}, 'unit': 'degree', 'title': 'Benchmark'}
            if footprint:
                state['data_window'] = footprint['window']
                shutil.copyfile(folder / 'valid-data-mask.tif', run / 'valid-data-mask.tif')
            phases = {}
            last = [None, time.perf_counter()]

            def notify(progress, message):
                if message != last[0]:
                    now = time.perf_counter()
                    if last[0]:
                        phases[last[0]] = phases.get(last[0], 0) + now - last[1]
                    last[:] = [message, now]
                return 1

            started = time.perf_counter()
            result = module.calculate(run, state, notify)
            elapsed = time.perf_counter() - started
            raster = gdal.Open(str(run / 'slope.tif'))
            if reference is None:
                reference = (run / 'slope.tif', result)
            else:
                expected = gdal.Open(str(reference[0]))
                for y in range(0, SIZE, 256):
                    rows = min(256, SIZE - y)
                    np.testing.assert_array_equal(raster.ReadAsArray(0, y, SIZE, rows), expected.ReadAsArray(0, y, SIZE, rows))
                for field in ['valid_cells', 'selected_cells', 'excluded_cells', 'min', 'max']:
                    assert result[field] == reference[1][field], field
                np.testing.assert_allclose(result['mean'], reference[1]['mean'], rtol=1e-12)
                assert [c['count'] for c in result['classes']] == [c['count'] for c in reference[1]['classes']]
                expected = None
            raster = None
            item = {'variant': label, 'repeat': repeat + 1, 'size': SIZE, 'mode': MODE, 'seconds': round(elapsed, 3),
                    'bytes': (run / 'slope.tif').stat().st_size, 'phases': {k: round(v, 3) for k, v in phases.items()}}
            measurements.append(item)
            print(json.dumps(item, ensure_ascii=False), flush=True)
    (ROOT / f'temp/reports/slope-block-benchmark-{MODE}.json').write_text(json.dumps(measurements, ensure_ascii=False, indent=2), encoding='utf-8')
