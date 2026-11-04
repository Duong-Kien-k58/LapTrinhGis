import json
import tempfile
import time
from pathlib import Path
from unittest.mock import patch

from django.test import Client, SimpleTestCase, override_settings
from django.conf import settings

from mygis.terrain_analysis import directory, read_state, write_state, cleanup_expired


@override_settings(SESSION_ENGINE='django.contrib.sessions.backends.signed_cookies')
class DemUploadTests(SimpleTestCase):
    def setUp(self):
        test_root = settings.TEMP_ROOT / 'tests'
        test_root.mkdir(parents=True, exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=test_root)
        self.assertEqual(Path(self.temp.name).resolve().parent, test_root.resolve())
        self.addCleanup(self.temp.cleanup)
        self.config = override_settings(DEM_UPLOAD_ROOT=Path(self.temp.name), DEM_UPLOAD_MAX_BYTES=64,
                                        DEM_UPLOAD_CHUNK_BYTES=8)
        self.config.enable()
        self.addCleanup(self.config.disable)
        self.data = {'filename': 'dem.tif', 'size': 12, 'band': 1, 'data_type': 'dem',
                     'elevation_unit': 'm', 'confirm_elevation': True}

    def create_upload(self, **overrides):
        return self.client.post('/mygis/dem-uploads/', json.dumps({**self.data, **overrides}), content_type='application/json')

    def test_upload_needs_no_dem_dtm_dsm_classification(self):
        self.data.pop('data_type')
        response = self.create_upload()
        self.assertEqual(response.status_code, 200)
        folder = directory(self.temp.name, response.json()['upload']['id'])
        self.assertEqual(read_state(folder)['options']['data_type'], 'raster')

    def test_resumable_chunks_enforce_offset_and_declared_size(self):
        result = self.create_upload().json()['upload']
        url = f'/mygis/dem-uploads/{result["id"]}/'
        self.assertEqual(self.client.put(url + '?offset=0', b'12345678', content_type='application/octet-stream').status_code, 200)
        self.assertEqual(self.client.put(url + '?offset=0', b'1234', content_type='application/octet-stream').status_code, 409)
        self.assertEqual(self.client.get(url).json()['upload']['received'], 8)
        self.assertEqual(self.client.put(url + '?offset=8', b'12345678', content_type='application/octet-stream').status_code, 413)
        self.assertEqual(self.client.put(url + '?offset=8', b'abcd', content_type='application/octet-stream').status_code, 200)
        folder = directory(self.temp.name, result['id'])
        self.assertEqual((folder / 'data.tif').read_bytes(), b'12345678abcd')
        with patch('mygis.terrain_analysis.subprocess.Popen') as worker:
            response = self.client.post(url)
        self.assertEqual(response.json()['upload']['status'], 'validating')
        worker.assert_called_once()

    def test_session_isolation_cancellation_and_private_paths(self):
        result = self.create_upload(filename='../../other.tif').json()['upload']
        self.assertEqual(result['filename'], 'other.tif')
        self.assertNotIn('owner', result)
        self.assertNotIn('path', result)
        url = f'/mygis/dem-uploads/{result["id"]}/'
        self.assertEqual(Client().get(url).status_code, 404)
        self.assertEqual(Client().delete(url).status_code, 404)
        self.assertEqual(self.client.delete(url).json()['upload']['status'], 'cancelled')
        self.assertFalse((directory(self.temp.name, result['id']) / 'data.tif').exists())
        self.assertEqual(self.client.put(url + '?offset=0', b'abc', content_type='application/octet-stream').status_code, 409)

    def test_limits_and_confirmation_cannot_be_bypassed(self):
        self.assertEqual(self.create_upload(size=65).status_code, 413)
        self.assertEqual(self.create_upload(size=0).status_code, 413)
        self.assertEqual(self.create_upload(filename='image.png').status_code, 400)
        self.assertEqual(self.create_upload(confirm_elevation=False).status_code, 400)
        self.assertEqual(self.create_upload(elevation_unit='unknown').status_code, 400)
        self.assertEqual(Client(enforce_csrf_checks=True).post('/mygis/dem-uploads/', json.dumps(self.data), content_type='application/json').status_code, 403)

    def test_partial_upload_cannot_start_validation(self):
        upload = self.create_upload().json()['upload']
        with patch('mygis.terrain_analysis.subprocess.Popen') as worker:
            self.assertEqual(self.client.post(f'/mygis/dem-uploads/{upload["id"]}/').status_code, 409)
            worker.assert_not_called()

    def test_expired_uploads_removed_without_touching_other_paths(self):
        upload = self.create_upload().json()['upload']
        folder = directory(self.temp.name, upload['id'])
        state = read_state(folder)
        state['expires_at'] = time.time() - 1
        write_state(folder, state)
        unrelated = Path(self.temp.name) / 'keep.txt'
        unrelated.write_text('keep')
        cleanup_expired(self.temp.name)
        self.assertFalse(folder.exists())
        self.assertTrue(unrelated.exists())
