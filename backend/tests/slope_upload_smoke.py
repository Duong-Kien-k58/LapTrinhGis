"""Real upload -> GDAL validation -> slope worker -> full-resolution download."""
import json
import subprocess
import time
from pathlib import Path
from django.conf import settings
from django.test import Client
from mygis.terrain_analysis import gdal_environment

root = settings.TEMP_ROOT / 'reports'
fixture = root / 'slope-upload-plane.tif'
script = '''import sys
import numpy as np
from osgeo import gdal, osr
gdal.UseExceptions()
d=gdal.GetDriverByName('GTiff').Create(sys.argv[1],9,9,1,gdal.GDT_Float32)
s=osr.SpatialReference(); s.ImportFromEPSG(32648)
d.SetProjection(s.ExportToWkt()); d.SetGeoTransform((500000,10,0,1800000,0,-10))
b=d.GetRasterBand(1); b.SetNoDataValue(-9999); b.SetUnitType('m'); b.WriteArray(np.tile(np.arange(9)*10,(9,1)))
d=None
'''
subprocess.run([settings.DEM_GDAL_PYTHON, '-c', script, str(fixture)], env=gdal_environment(), check=True)
client = Client(HTTP_HOST='localhost')
def request(method, url, data=None):
    response = getattr(client, method)(url, json.dumps(data) if data is not None else '', content_type='application/json')
    result = response.json()
    assert response.status_code == 200, result
    return result
upload = request('post','/mygis/dem-uploads/',{'filename':fixture.name,'size':fixture.stat().st_size,'data_type':'dem','band':1,'elevation_unit':'m','confirm_elevation':True})['upload']
url = f'/mygis/dem-uploads/{upload["id"]}/'
response = client.put(url+'?offset=0',fixture.read_bytes(),content_type='application/octet-stream')
assert response.status_code == 200
request('post',url)
for _ in range(100):
    upload = request('get',url)['upload']
    if upload['status'] != 'validating': break
    time.sleep(.2)
assert upload['status'] == 'ready', upload
job = request('post','/mygis/slope-jobs/',{'dem':{'source':'upload','id':upload['id']},'region':{'mode':'full'},'method':'Horn','unit':'degree'})['job']
for _ in range(100):
    job = request('get',f'/mygis/slope-jobs/{job["id"]}/')['job']
    if job['status'] not in ['queued','running']: break
    time.sleep(.2)
assert job['status'] == 'ready', job
assert abs(job['result']['mean']-45)<1e-4
assert job['result']['valid_cells']==49
response = client.get(job['files']['geotiff'])
assert response.status_code==200
download = root/'slope-upload-smoke.tif'
download.write_bytes(b''.join(response.streaming_content))
response.close()
response = client.get(job['files']['report'])
assert response.status_code == 200
assert response['Content-Type'] == 'text/plain; charset=utf-8'
assert '.txt' in response['Content-Disposition']
text = b''.join(response.streaming_content).decode('utf-8-sig')
response.close()
assert 'Độ dốc trung bình: 45 °' in text
assert 'Số ô tính được: 49' in text
assert 'note' not in text and 'source_quality' not in text
assert 'preview_extent' not in text and 'preview_crs' not in text
# Các tác vụ cũ chỉ có dữ liệu thống kê vẫn tải TXT được.
from mygis.terrain_analysis import directory, job_root
folder = directory(job_root(), job['id'])
(folder / 'report.txt').unlink()
response = client.get(job['files']['report'])
assert response.status_code == 200
assert b''.join(response.streaming_content).decode('utf-8-sig') == text
response.close()
print('UPLOAD SLOPE SMOKE OK: 49 cells, mean 45 degrees, downloaded',download.stat().st_size,'bytes')
payload = {'dem': {'source': 'upload', 'id': upload['id']}, 'region': {'mode': 'data'},
           'method': 'Horn', 'unit': 'degree', 'operation': 'footprint'}
footprint = request('post', '/mygis/slope-jobs/', payload)['job']
for _ in range(100):
    footprint = request('get', f'/mygis/slope-jobs/{footprint["id"]}/')['job']
    if footprint['status'] not in ['queued', 'running']: break
    time.sleep(.2)
assert footprint['status'] == 'ready', footprint
assert footprint['result']['valid_cells'] == 81
assert footprint['result']['geometry']['type'] == 'MultiPolygon'
payload.update(operation='slope', region={'mode': 'data', 'footprint_id': footprint['id']})
job = request('post', '/mygis/slope-jobs/', payload)['job']
for _ in range(100):
    job = request('get', f'/mygis/slope-jobs/{job["id"]}/')['job']
    if job['status'] not in ['queued', 'running']: break
    time.sleep(.2)
assert job['status'] == 'ready', job
assert abs(job['result']['mean'] - 45) < 1e-4
assert job['result']['selected_cells'] == 81
assert job['result']['valid_cells'] == 49
print('DATA FOOTPRINT SMOKE OK: boundary -> exact mask -> slope')
client.delete(url)
