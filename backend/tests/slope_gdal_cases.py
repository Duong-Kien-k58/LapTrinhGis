"""Analytical raster fixtures, run using the configured QGIS Python."""
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
from osgeo import gdal, osr

ROOT = Path(__file__).resolve().parents[2]
(ROOT / 'temp/tests').mkdir(parents=True, exist_ok=True)
sys.path.insert(0, str(ROOT / 'backend' / 'mygis'))
import importlib.util
spec = importlib.util.spec_from_file_location('__main__', ROOT / 'backend/mygis/terrain_analysis.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class SlopeRasterTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=ROOT / 'temp/tests')
        self.addCleanup(self.temp.cleanup)
        self.folder = Path(self.temp.name)

    def dem(self, values, epsg=32648, gt=(500000, 10, 0, 1800000, 0, -10), scale=None):
        path = self.folder / 'source.tif'
        ds = gdal.GetDriverByName('GTiff').Create(str(path), values.shape[1], values.shape[0], 1, gdal.GDT_Float32)
        crs = osr.SpatialReference()
        crs.ImportFromEPSG(epsg)
        ds.SetProjection(crs.ExportToWkt())
        ds.SetGeoTransform(gt)
        band = ds.GetRasterBand(1)
        band.SetNoDataValue(-9999)
        band.WriteArray(values)
        if scale is not None:
            band.SetScale(scale)
            band.SetOffset(123)
        ds = None
        return path

    def run_case(self, path, unit='degree', region=None, zunit='m', operation='slope'):
        state = {'source': {'path': str(path), 'band': 1, 'elevation_unit': zunit},
                 'request': {'region': region or {'mode': 'full'}, 'operation': operation}, 'unit': unit, 'title': 'Analytical plane'}
        return module.calculate(self.folder, state, lambda *args: 1)

    def test_plane_45_degrees(self):
        path = self.dem(np.tile(np.arange(9) * 10, (9, 1)))
        result = self.run_case(path)
        self.assertAlmostEqual(result['mean'], 45, places=4)
        self.assertEqual(result['valid_cells'], 49)
        self.assertEqual(sum(c['count'] for c in result['classes']), 49)
        self.assertEqual(result['valid_area_m2'], 4900)
        ds = gdal.Open(str(self.folder / 'slope.tif'))
        self.assertEqual(ds.GetRasterBand(1).DataType, gdal.GDT_Float32)
        self.assertEqual(ds.GetRasterBand(1).GetNoDataValue(), -9999)
        self.assertTrue((self.folder / 'preview.png').exists())
        text = (self.folder / 'report.txt').read_text(encoding='utf-8-sig')
        self.assertIn('BÁO CÁO PHÂN TÍCH ĐỘ DỐC', text)
        self.assertIn('Độ dốc trung bình: 45 °', text)
        self.assertIn('Số ô tính được: 49', text)
        self.assertNotIn('source_quality', text)
        self.assertNotIn('note', text)
        self.assertFalse((self.folder / 'report.json').exists())

    def test_aspect_eight_compass_directions(self):
        ys, xs = np.mgrid[:9, :9]
        for expected in range(0, 360, 45):
            with self.subTest(direction=expected):
                angle = np.deg2rad(expected)
                # Rows increase southward; construct the known downhill bearing.
                values = -xs * np.sin(angle) + ys * np.cos(angle)
                result = self.run_case(self.dem(values), operation='aspect')
                self.assertEqual(result['operation'], 'aspect')
                self.assertEqual(result['valid_cells'], 49)
                self.assertEqual(result['flat_cells'], 0)
                delta = (result['mean_direction'] - expected + 180) % 360 - 180
                self.assertAlmostEqual(delta, 0, places=4)
                self.assertEqual(result['classes'][expected // 45 + 1]['count'], 49)

    def test_aspect_flat_is_valid_and_distinct_from_nodata(self):
        result = self.run_case(self.dem(np.zeros((9, 9))), operation='aspect')
        self.assertEqual(result['flat_cells'], 49)
        self.assertEqual(result['valid_cells'], 49)
        self.assertIsNone(result['mean_direction'])
        self.assertIsNone(result['mean'])
        raster = gdal.Open(str(self.folder / 'slope.tif'))
        self.assertEqual(raster.GetRasterBand(1).GetNoDataValue(), -9999)
        self.assertEqual(raster.ReadAsArray()[4, 4], -1)
        self.assertEqual(raster.ReadAsArray()[0, 0], -9999)
        raster = None
        text = (self.folder / 'report.txt').read_text(encoding='utf-8-sig')
        self.assertIn('BÁO CÁO PHÂN TÍCH HƯỚNG DỐC', text)
        self.assertIn('Bằng phẳng', text)

    def test_aspect_weighted_missing_neighbor_matches_arcmap_formula(self):
        z = np.array([[101., 92., 85.], [101., 92., 85.], [101., 91., 84.]])
        # Independent weighted side sums from Esri's published planar equations.
        for missing in [None, (0, 0), (0, 1), (0, 2), (1, 0), (1, 2), (2, 0), (2, 1), (2, 2)]:
            values = z.copy()
            if missing:
                values[missing] = -9999
            def side(cells):
                pairs = [(values[y, x], w) for y, x, w in cells if values[y, x] != -9999]
                return sum(v * w for v, w in pairs) * 4 / sum(w for _, w in pairs)
            dx = (side([(0,2,1),(1,2,2),(2,2,1)]) - side([(0,0,1),(1,0,2),(2,0,1)])) / 8
            dy = (side([(2,0,1),(2,1,2),(2,2,1)]) - side([(0,0,1),(0,1,2),(0,2,1)])) / 8
            expected = (90 - np.degrees(np.arctan2(dy, -dx))) % 360
            actual = module.aspect.planar_aspect(values, -9999, (10, 10))[1, 1]
            self.assertAlmostEqual(float(actual), expected, places=4)
        values[0, 0] = -9999
        self.assertEqual(module.aspect.planar_aspect(values, -9999, (10, 10))[1, 1], -9999)
        values = z.copy()
        values[1, 1] = -9999
        self.assertEqual(module.aspect.planar_aspect(values, -9999, (10, 10))[1, 1], -9999)

    def test_aspect_north_wrap_and_class_boundaries(self):
        values = np.array([-1, 0, 22.499, 22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5, 359.999, 360])
        np.testing.assert_array_equal(module.aspect.aspect_class_indices(values), [0,1,1,2,3,4,5,6,7,8,1,1,1])

    def test_aspect_mean_wraps_across_north(self):
        z = np.full((12, 25), -9999, dtype=np.float32)
        ys, xs = np.mgrid[:9, :9]
        for column, bearing in [(1, 359), (14, 1)]:
            angle = np.deg2rad(bearing)
            z[1:10, column:column + 9] = -xs * np.sin(angle) + ys * np.cos(angle)
        result = self.run_case(self.dem(z), operation='aspect')
        self.assertEqual(result['valid_cells'], 98)
        self.assertLess(abs((result['mean_direction'] + 180) % 360 - 180), .001)

    def test_aspect_flat_geographic_data_region_keeps_mask(self):
        z = np.full((21, 21), -9999, dtype=np.float32)
        z[4:17, 4:17] = 0
        z[9:12, 9:12] = -9999
        path = self.dem(z, epsg=4326, gt=(107, .0001, 0, 16, 0, -.0001))
        state = {'source': {'path': str(path), 'band': 1, 'elevation_unit': 'm'},
                 'request': {'region': {'mode': 'data'}, 'operation': 'aspect'},
                 'unit': 'degree', 'title': 'Flat geographic DEM'}
        footprint = module.inspect_data_footprint(self.folder, state, lambda *args: 1)
        state['data_window'] = footprint['window']
        result = module.calculate(self.folder, state, lambda *args: 1)
        self.assertTrue(result['reprojected'])
        self.assertEqual(result['flat_cells'], result['valid_cells'])
        self.assertIsNone(result['mean_direction'])
        self.assertLess(result['selected_cells'], result['width'] * result['height'])

    def test_aspect_sparse_tiles_match_continuous_reference(self):
        ys, xs = np.mgrid[:1100, :1150]
        z = (50 * np.sin(xs / 83) + 40 * np.cos(ys / 57)).astype(np.float32)
        z[1018:1028, 1022:1025] = -9999
        z[100, 100] = -9999
        expected = module.aspect.planar_aspect(z, -9999, (10, 10))
        result = self.run_case(self.dem(z), operation='aspect')
        raster = gdal.Open(str(self.folder / 'slope.tif'))
        np.testing.assert_array_equal(raster.ReadAsArray(), expected)
        raster = None
        self.assertEqual(result['valid_cells'], int(np.count_nonzero(expected != -9999)))
        self.assertEqual(sum(c['count'] for c in result['classes']), result['valid_cells'])

    def test_large_plane_crosses_raster_blocks(self):
        path = self.dem(np.tile(np.arange(1200) * 10, (1200, 1)))
        result = self.run_case(path)
        self.assertEqual(result['valid_cells'], 1198 ** 2)
        self.assertAlmostEqual(result['mean'], 45, places=4)

    def test_sparse_tiles_match_gdal_at_seams_holes_and_raster_edges(self):
        ys, xs = np.mgrid[:2200, :2300]
        values = (100 + 30 * np.sin(xs / 13) + 20 * np.cos(ys / 19)).astype(np.float32)
        keep = ((xs >= 800) & (xs < 1300) & (ys >= 800) & (ys < 1300))
        keep |= (xs < 20) & (ys < 20)
        keep |= (xs > 2150) & (ys > 2100)
        keep &= ~((xs >= 1022) & (xs < 1027) & (ys >= 1022) & (ys < 1027))
        values[~keep] = -9999
        path = self.dem(values)
        expected_ds = gdal.DEMProcessing('', str(path), 'slope', format='MEM', alg='Horn', computeEdges=False)
        strict_expected = expected_ds.ReadAsArray()
        expected = module.slope.SlopeAnalysis('degree').calculate_block(values, -9999, (500000, 10, 0, 1800000, 0, -10), '')
        result = self.run_case(path)
        actual_ds = gdal.Open(str(self.folder / 'slope.tif'))
        actual = actual_ds.ReadAsArray()
        np.testing.assert_array_equal(actual, expected)
        strict_valid = strict_expected != -9999
        # GDAL uses Float32 intermediates; the weighted implementation uses Float64.
        np.testing.assert_allclose(actual[strict_valid], strict_expected[strict_valid], rtol=1e-6, atol=1e-4)
        valid = expected != -9999
        self.assertEqual(result['valid_cells'], int(valid.sum()))
        self.assertAlmostEqual(result['mean'], float(expected[valid].astype(np.float64).mean()), places=10)
        self.assertEqual(sum(c['count'] for c in result['classes']), int(valid.sum()))
        self.assertGreater(result['processing']['skipped_blocks'], 0)
        self.assertEqual(result['processing']['computed_blocks'] + result['processing']['skipped_blocks'],
                         result['processing']['total_blocks'])
        actual_ds = expected_ds = None

    def test_data_footprint_preserves_holes_islands_and_crops_empty_padding(self):
        values = np.full((50, 60), -9999, dtype=float)
        values[10:25, 10:25] = np.tile(np.arange(15) * 10, (15, 1))
        values[15:18, 15:18] = -9999
        values[30:37, 40:47] = np.tile(np.arange(7) * 10, (7, 1))
        path = self.dem(values)
        state = {'source': {'path': str(path), 'band': 1, 'elevation_unit': 'm'},
                 'request': {'region': {'mode': 'data'}}, 'unit': 'degree', 'title': 'DEM test', 'max_cells': 2000}
        footprint = module.inspect_data_footprint(self.folder, state, lambda *args: 1)
        self.assertEqual(footprint['valid_cells'], 265)
        self.assertEqual(footprint['window'], [10, 10, 47, 37])
        self.assertEqual(len(footprint['geometry']['coordinates']), 2)
        self.assertTrue(any(len(polygon) == 2 for polygon in footprint['geometry']['coordinates']))
        state['data_window'] = footprint['window']
        result = module.calculate(self.folder, state, lambda *args: 1)
        self.assertEqual(result['selected_cells'], 265)
        self.assertEqual(result['valid_cells'], 173)
        self.assertGreater(result['mean'], 0)
        self.assertLess(result['mean'], 90)
        self.assertEqual([result['width'], result['height']], [41, 31])

    def test_data_footprint_rejects_all_nodata(self):
        path = self.dem(np.full((9, 9), -9999))
        state = {'source': {'path': str(path), 'band': 1, 'elevation_unit': 'm'}}
        with self.assertRaisesRegex(ValueError, 'NoData'):
            module.inspect_data_footprint(self.folder, state, lambda *args: 1)

    def test_geographic_data_mask_matches_output_grid(self):
        values = np.full((21, 21), -9999, dtype=float)
        values[4:17, 4:17] = 0
        values[9:12, 9:12] = -9999
        path = self.dem(values, epsg=4326, gt=(107, .0001, 0, 16, 0, -.0001))
        state = {'source': {'path': str(path), 'band': 1, 'elevation_unit': 'm'},
                 'request': {'region': {'mode': 'data'}}, 'unit': 'degree', 'title': 'DEM test', 'max_cells': 2000}
        footprint = module.inspect_data_footprint(self.folder, state, lambda *args: 1)
        self.assertEqual(footprint['valid_cells'], 160)
        state['data_window'] = footprint['window']
        result = module.calculate(self.folder, state, lambda *args: 1)
        self.assertTrue(result['reprojected'])
        self.assertEqual(result['mean'], 0)
        self.assertLess(result['selected_cells'], result['width'] * result['height'])

    def test_percent_scale_offset_and_feet(self):
        path = self.dem(np.tile(np.arange(9) * (10 / .3048 / 2), (9, 1)), scale=2)
        result = self.run_case(path, unit='percent', zunit='ft')
        self.assertAlmostEqual(result['mean'], 100, places=3)

    def test_slope_allows_one_missing_neighbor(self):
        values = np.full((9, 9), 100., dtype=float)
        values[4, 4] = -9999
        result = self.run_case(self.dem(values))
        self.assertEqual(result['valid_cells'], 48)
        self.assertAlmostEqual(result['mean'], 0, places=4)

    def test_slope_weighted_neighbors_and_units(self):
        z = np.array([[101., 92., 85.], [101., 92., 85.], [101., 91., 84.]])
        transform = (0, 10, 0, 0, 0, -20)
        for missing in [None, (0, 0), (0, 1), (0, 2), (1, 0), (1, 2), (2, 0), (2, 1), (2, 2)]:
            values = z.copy()
            if missing:
                values[missing] = -9999
            def side(cells):
                pairs = [(values[y, x], w) for y, x, w in cells if values[y, x] != -9999]
                return sum(v * w for v, w in pairs) * 4 / sum(w for _, w in pairs)
            dx = (side([(0,2,1),(1,2,2),(2,2,1)]) - side([(0,0,1),(1,0,2),(2,0,1)])) / 80
            dy = (side([(2,0,1),(2,1,2),(2,2,1)]) - side([(0,0,1),(0,1,2),(0,2,1)])) / 160
            for unit in ['degree', 'percent']:
                analysis = module.slope.SlopeAnalysis(unit)
                gradient = np.hypot(dx, dy)
                expected = gradient * 100 if unit == 'percent' else np.degrees(np.arctan(gradient))
                actual = analysis.calculate_block(values, -9999, transform, '')
                self.assertAlmostEqual(float(actual[1, 1]), expected, places=4)
                self.assertTrue(np.all(actual[0] == -9999))
        analysis = module.slope.SlopeAnalysis('degree')
        for invalid in [((0, 0), (0, 1)), ((1, 1),), ((0, 0), (2, 2))]:
            values = z.copy()
            for cell in invalid:
                values[cell] = -9999
            self.assertEqual(analysis.calculate_block(values, -9999, transform, '')[1, 1], -9999)
        values = z.copy()
        values[0, 0] = np.nan
        self.assertNotEqual(analysis.calculate_block(values, -9999, transform, '')[1, 1], -9999)
        values[0, 1] = np.inf
        self.assertEqual(analysis.calculate_block(values, -9999, transform, '')[1, 1], -9999)

    def test_polygon_halo_keeps_all_nine_cells(self):
        path = self.dem(np.tile(np.arange(9) * 10, (9, 1)))
        crs, wgs = osr.SpatialReference(), osr.SpatialReference()
        crs.ImportFromEPSG(32648)
        wgs.ImportFromEPSG(4326)
        crs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
        wgs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
        transform = osr.CoordinateTransformation(crs, wgs)
        ring = [[*transform.TransformPoint(x, y)[:2]] for x, y in [(500030,1799940),(500060,1799940),(500060,1799970),(500030,1799970),(500030,1799940)]]
        result = self.run_case(path, region={'mode':'polygon','geometry':{'type':'Polygon','coordinates':[ring]}})
        self.assertEqual(result['valid_cells'], 9)
        self.assertAlmostEqual(result['mean'], 45, places=4)

    def test_geographic_is_reprojected_to_meters(self):
        path = self.dem(np.zeros((21, 21)), epsg=4326, gt=(107,.0001,0,16,0,-.0001))
        result = self.run_case(path)
        self.assertTrue(result['reprojected'])
        self.assertEqual(result['crs'], 'EPSG:32648')
        self.assertEqual(result['mean'], 0)

    def test_empty_and_too_small_regions_rejected(self):
        path = self.dem(np.full((9, 9), -9999))
        with self.assertRaisesRegex(ValueError, 'NoData'):
            self.run_case(path)
        path = self.dem(np.zeros((2, 2)))
        with self.assertRaisesRegex(ValueError, 'ít nhất 3 × 3'):
            self.run_case(path)

    def test_cancelled_worker_never_reads_source(self):
        import json, time
        write_state, read_state = module.write_state, module.read_state
        write_state(self.folder, {'status':'queued','deadline':time.time()+60})
        (self.folder/'cancel').touch()
        module.worker(self.folder)
        self.assertEqual(read_state(self.folder)['status'], 'cancelled')

    def test_standalone_worker_imports_both_analysis_modules(self):
        import subprocess
        import time
        path = self.dem(np.tile(np.arange(9) * 10, (9, 1)))
        for operation in ['slope', 'aspect']:
            state = {'source': {'path': str(path), 'band': 1, 'elevation_unit': 'm'},
                     'request': {'region': {'mode': 'full'}, 'operation': operation},
                     'unit': 'degree', 'title': 'Split worker fixture', 'status': 'queued',
                     'deadline': time.time() + 60, 'expires_at': time.time() + 86400}
            module.write_state(self.folder, state)
            subprocess.run([sys.executable, str(ROOT / 'backend/mygis/terrain_analysis.py'),
                            '--worker', str(self.folder)], check=True, timeout=60, capture_output=True)
            result = module.read_state(self.folder)
            self.assertEqual(result['status'], 'ready', result.get('message'))
            self.assertEqual(result['result']['valid_cells'], 49)
            if operation == 'slope':
                self.assertAlmostEqual(result['result']['mean'], 45, places=4)
            else:
                self.assertAlmostEqual(result['result']['mean_direction'], 270, places=4)
            self.assertTrue((self.folder / 'preview.png').exists())
            self.assertTrue((self.folder / 'report.txt').exists())

    def test_grid_metadata_worker_reads_real_crs_and_frame(self):
        import json
        import subprocess
        path = self.dem(np.zeros((9, 9)))
        process = subprocess.run([sys.executable, str(ROOT / 'backend/mygis/terrain_analysis.py'),
                                  '--metadata', str(path)], check=True, timeout=30, capture_output=True, text=True)
        grid = json.loads(process.stdout)
        self.assertEqual(grid['crs'], 'EPSG:32648')
        self.assertEqual(grid['bbox'], [500000, 1799910, 500090, 1800000])
        self.assertEqual([grid['width'], grid['height']], [9, 9])
        self.assertEqual(grid['presentation_type'], 'raster')


if __name__ == '__main__':
    unittest.main()
