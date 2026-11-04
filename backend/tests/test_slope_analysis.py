import json
import tempfile
from pathlib import Path
from unittest.mock import patch
from types import SimpleNamespace

from django.conf import settings
from django.test import Client, SimpleTestCase, override_settings
from mygis.terrain_analysis import directory, read_state, write_state, source_signature


@override_settings(SESSION_ENGINE='django.contrib.sessions.backends.signed_cookies')
class SlopeApiTests(SimpleTestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=settings.TEMP_ROOT / 'tests')
        self.addCleanup(self.temp.cleanup)
        self.config = override_settings(SLOPE_JOB_ROOT=Path(self.temp.name) / 'jobs')
        self.config.enable()
        self.addCleanup(self.config.disable)
        self.source = Path(self.temp.name) / 'source.tif'
        self.source.write_bytes(b'fixture')
        self.data = {'dem': {'source':'geoserver', 'name':'dem_hue'}, 'region':{'mode':'full'}, 'unit':'degree', 'method':'Horn'}

    def create(self):
        with patch('mygis.terrain_analysis.resolve_input', return_value=(self.source, {'elevation_unit':'m'}, 'Test DEM')), patch('mygis.terrain_analysis.subprocess.Popen'):
            return self.client.post('/mygis/slope-jobs/', json.dumps(self.data), content_type='application/json')

    def test_private_job_and_artifacts(self):
        response = self.create()
        self.assertEqual(response.status_code, 200)
        job = response.json()['job']
        self.assertNotIn('source', job)
        self.assertNotIn('owner', job)
        url = f'/mygis/slope-jobs/{job["id"]}/'
        self.assertEqual(Client().get(url).status_code, 404)
        self.assertEqual(Client().delete(url).status_code, 404)
        self.assertEqual(self.client.get(url+'geotiff/').status_code, 404)
        folder = directory(settings.SLOPE_JOB_ROOT, job['id'])
        state = read_state(folder)
        state.update(status='ready', result={'mean': 0})
        write_state(folder, state)
        (folder / 'slope.tif').write_bytes(b'result')
        response = self.client.get(url + 'geotiff/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(b''.join(response.streaming_content), b'result')
        response.close()
        self.assertEqual(Client().get(url+'geotiff/').status_code, 404)
        self.assertEqual(self.client.get(url+'state.json/').status_code, 404)

    def test_concurrency_and_cancel_marker(self):
        job = self.create().json()['job']
        self.assertEqual(self.create().status_code, 409)
        self.assertEqual(self.client.delete(f'/mygis/slope-jobs/{job["id"]}/').status_code, 200)
        self.assertTrue((directory(settings.SLOPE_JOB_ROOT, job['id']) / 'cancel').exists())

    def test_aspect_job_and_percent_rejected(self):
        self.data.update(operation='aspect', unit='percent')
        self.assertEqual(self.create().status_code, 400)
        self.data['unit'] = 'degree'
        response = self.create()
        self.assertEqual(response.status_code, 200)
        job = response.json()['job']
        folder = directory(settings.SLOPE_JOB_ROOT, job['id'])
        state = read_state(folder)
        self.assertEqual(state['request']['operation'], 'aspect')
        state.update(status='ready', result={'operation': 'aspect'})
        write_state(folder, state)
        (folder / 'slope.tif').write_bytes(b'aspect')
        response = self.client.get(f'/mygis/slope-jobs/{job["id"]}/geotiff/')
        self.assertEqual(response.status_code, 200)
        self.assertIn('aspect-', response['Content-Disposition'])
        response.close()

    def test_raster_grid_uses_real_file_metadata_without_type_filter(self):
        grid = {'crs': 'EPSG:32648', 'bbox': [1, 2, 3, 4], 'width': 100, 'height': 200, 'elevation_unit': None}
        with patch('mygis.terrain_analysis.resolve_input', return_value=(self.source, {'elevation_unit': 'm'}, 'Raster')) as resolve, \
             patch('mygis.terrain_analysis.subprocess.run', return_value=SimpleNamespace(returncode=0, stdout=json.dumps(grid), stderr='')):
            response = self.client.get('/mygis/rasters/any_raster/analysis/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['metadata']['crs'], 'EPSG:32648')
        self.assertEqual(response.json()['metadata']['elevation_unit'], 'm')
        self.assertEqual(resolve.call_args.args[1], {'source': 'geoserver', 'name': 'any_raster'})

    def test_data_boundary_is_private_and_bound_to_unchanged_dem(self):
        self.data.update(operation='footprint', region={'mode': 'data'})
        footprint = self.create().json()['job']
        folder = directory(settings.SLOPE_JOB_ROOT, footprint['id'])
        state = read_state(folder)
        state.update(status='ready', result={'window': [0, 0, 9, 9], 'source_signature': source_signature(self.source)})
        write_state(folder, state)
        (folder / 'valid-data-mask.tif').write_bytes(b'mask')
        url = f'/mygis/slope-jobs/{footprint["id"]}/'
        self.assertNotIn('files', self.client.get(url).json()['job'])
        self.assertEqual(Client().get(url).status_code, 404)
        self.assertEqual(self.client.get(url + 'report/').status_code, 404)
        self.data.update(operation='aspect', region={'mode': 'data', 'footprint_id': footprint['id']})
        owner = state['owner']
        state['owner'] = 'other-session'
        write_state(folder, state)
        self.assertEqual(self.create().status_code, 400)
        state['owner'] = owner
        write_state(folder, state)
        self.source.write_bytes(b'changed DEM')
        self.assertEqual(self.create().status_code, 400)
        state['result']['source_signature'] = source_signature(self.source)
        write_state(folder, state)
        job = self.create().json()['job']
        created = directory(settings.SLOPE_JOB_ROOT, job['id'])
        self.assertEqual(read_state(created)['data_window'], [0, 0, 9, 9])
        self.assertEqual((created / 'valid-data-mask.tif').read_bytes(), b'mask')

    def test_invalid_payload_and_csrf(self):
        self.data['unit'] = 'bogus'
        self.assertEqual(self.create().status_code, 400)
        self.data['unit'] = 'degree'
        self.data['region'] = {'mode':'polygon','crs':'EPSG:4326','geometry':{'type':'Polygon','coordinates':[[[0,0],[1,0],[1,True],[0,0]]]}}
        self.assertEqual(self.create().status_code, 400)
        self.assertEqual(Client(enforce_csrf_checks=True).post('/mygis/slope-jobs/', '{}', content_type='application/json').status_code, 403)

    def test_trusted_geotiff_url_and_metadata_units(self):
        from mygis.terrain_analysis import resolve_input
        from django.test import RequestFactory
        raster = SimpleNamespace(technical_metadata={'elevation_unit':'m'}, crs='EPSG:32648', title='DEM')
        for prefix in ['file:/', 'file://', 'file:///']:
            with patch('mygis.models.RasterMetadata.objects.filter') as query, patch('mygis.raster.raster_store',return_value='dem'), patch('mygis.raster.geoserver_json',return_value={'coverageStore':{'type':'GeoTIFF','url':prefix+str(self.source)}}):
                query.return_value.first.return_value = raster
                path, metadata, _ = resolve_input(RequestFactory().get('/'), {'source':'geoserver','name':'dem_hue','elevation_unit':'ft','path':'C:/untrusted.tif'})
                self.assertEqual(path, self.source.resolve())
                self.assertEqual(metadata['elevation_unit'], 'm')
