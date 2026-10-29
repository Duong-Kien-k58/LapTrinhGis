"""Slope: DEM uploads, validation, analysis, results and isolated GDAL workers.

Read in order: temporary storage -> request validation -> HTTP API -> DEM
inspection -> slope calculation -> background workers. Original rasters are read-only.
Django imports stay in the API section so QGIS workers need only GDAL and NumPy.
"""
import json
import logging
import math
import os
import re
import secrets
import shutil
import subprocess
import sys
import time
from contextlib import contextmanager
from io import BytesIO
from pathlib import Path
from uuid import UUID, uuid4

# 1. Lưu trữ DEM và trạng thái tác vụ tạm.

def directory(root, upload_id):
    canonical = str(UUID(str(upload_id)))
    root = Path(root).resolve()
    target = root / canonical
    if target.is_symlink() or target.resolve().parent != root:
        raise ValueError('Đường dẫn tải lên không hợp lệ.')
    return target


def read_state(folder):
    return json.loads((folder / 'state.json').read_text(encoding='utf-8'))


def source_signature(path):
    info = Path(path).stat()
    return [info.st_size, info.st_mtime_ns, info.st_ino]


def write_state(folder, state):
    temp = folder / 'state.tmp'
    temp.write_text(json.dumps(state, ensure_ascii=False, allow_nan=False), encoding='utf-8')
    os.replace(temp, folder / 'state.json')


@contextmanager
def lock(folder):
    path = folder / '.lock'
    fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    try:
        os.close(fd)
        yield
    finally:
        path.unlink(missing_ok=True)


def cleanup_expired(root):
    root = Path(root)
    if not root.exists():
        return
    for folder in root.iterdir():
        try:
            checked = directory(root, folder.name)
            state = read_state(checked)
            if state['expires_at'] < time.time() and state['status'] != 'validating':
                with lock(checked):
                    # Lock file is inside the directory; Windows permits closing it first.
                    for child in checked.iterdir():
                        if child.name != '.lock' and child.is_file():
                            child.unlink()
                checked.rmdir()
        except (ValueError, OSError, KeyError, json.JSONDecodeError):
            continue

MAX_CELLS = 200_000_000
TTL = 86400
TIMEOUT = 1800
COLORS = ['#38b764', '#a7d46f', '#f5e663', '#f6b44c', '#e87842', '#c94444', '#813b64']
BREAKS = [0, 3, 8, 15, 25, 35, 45, 90]


# 2. Kiểm tra yêu cầu và chọn DEM đầu vào.

def validate_request(data):
    if not isinstance(data, dict) or data.get('method') != 'Horn' or data.get('unit') not in {'degree', 'percent'}:
        raise ValueError('Chọn phương pháp Horn và đơn vị độ hoặc phần trăm.')
    dem, region = data.get('dem'), data.get('region')
    if not isinstance(dem, dict) or dem.get('source') not in {'upload', 'geoserver'}:
        raise ValueError('Nguồn DEM không hợp lệ.')
    if not isinstance(region, dict) or region.get('mode') not in {'full', 'polygon', 'data'}:
        raise ValueError('Vùng phân tích không hợp lệ.')
    operation = data.get('operation', 'slope')
    if operation not in {'slope', 'footprint'} or (operation == 'footprint' and region['mode'] != 'data'):
        raise ValueError('Thao tác phân tích không hợp lệ.')
    clean_region = {'mode': region['mode']}
    if region['mode'] == 'data' and operation == 'slope':
        clean_region['footprint_id'] = str(UUID(str(region.get('footprint_id', ''))))
    if region['mode'] == 'polygon':
        geom = region.get('geometry', {})
        if region.get('crs') != 'EPSG:4326' or not isinstance(geom, dict) or geom.get('type') != 'Polygon':
            raise ValueError('Vùng vẽ phải là đa giác WGS84.')
        rings = geom.get('coordinates')
        if not isinstance(rings, list) or len(rings) != 1 or not isinstance(rings[0], list) or not 4 <= len(rings[0]) <= 1002:
            raise ValueError('Đa giác cần từ 3 đến 1000 đỉnh, không có lỗ.')
        for point in rings[0]:
            if not isinstance(point, list) or len(point) != 2 or any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) for v in point):
                raise ValueError('Tọa độ vùng không hợp lệ.')
            if not -180 <= point[0] <= 180 or not -85 <= point[1] <= 85:
                raise ValueError('Tọa độ nằm ngoài phạm vi hỗ trợ.')
        if rings[0][0] != rings[0][-1]:
            raise ValueError('Đa giác chưa khép kín.')
        clean_region['geometry'] = {'type': 'Polygon', 'coordinates': rings}
    return {'dem': dem, 'region': clean_region, 'method': 'Horn', 'unit': data['unit'], 'operation': operation}


def job_root():
    from django.conf import settings
    return Path(getattr(settings, 'SLOPE_JOB_ROOT', settings.TEMP_ROOT / 'slope-jobs'))


def cleanup_jobs():
    root = job_root()
    if not root.exists():
        return
    for child in root.iterdir():
        try:
            folder = directory(root, child.name)
            state = read_state(folder)
            if state['expires_at'] < time.time():
                with lock(folder):
                    for file in folder.iterdir():
                        if file.name != '.lock' and file.is_file() and not file.is_symlink():
                            file.unlink()
                folder.rmdir()
        except (ValueError, OSError, KeyError):
            continue


def public_job(state):
    result = {key: state[key] for key in ['id', 'status', 'progress', 'message', 'expires_at', 'unit', 'title', 'result'] if key in state}
    if state['status'] == 'ready' and state['request'].get('operation') != 'footprint':
        base = f'/mygis/slope-jobs/{state["id"]}/'
        result['files'] = {name: base + name + '/' for name in ['geotiff', 'preview', 'report']}
    return result


def format_slope_report(report, title):
    """Báo cáo tải xuống chỉ giữ thông tin nguồn và thống kê cần đọc."""
    def number(value):
        return f'{value:,.2f}'.rstrip('0').rstrip('.').replace(',', '_').replace('.', ',').replace('_', '.')

    unit = 'độ (°)' if report['unit'] == 'degree' else 'phần trăm (%)'
    suffix = '°' if report['unit'] == 'degree' else '%'
    lines = [
        'BÁO CÁO PHÂN TÍCH ĐỘ DỐC',
        f'Dữ liệu đầu vào: {title}',
        f'Phương pháp: {report["method"]}',
        f'Đơn vị độ dốc: {unit}',
        f'Hệ tọa độ: {report["crs"]}',
        f'Kích thước lưới: {report["width"]} cột × {report["height"]} hàng',
        f'Độ phân giải: {number(report["resolution"][0])} × {number(report["resolution"][1])} m',
        '',
        'KẾT QUẢ THỐNG KÊ',
        f'Số ô trong vùng: {number(report["selected_cells"])}',
        f'Số ô tính được: {number(report["valid_cells"])}',
        f'Số ô bị loại: {number(report["excluded_cells"])}',
        f'Diện tích có kết quả: {number(report["valid_area_m2"])} m²',
        f'Độ dốc nhỏ nhất: {number(report["min"])} {suffix}',
        f'Độ dốc lớn nhất: {number(report["max"])} {suffix}',
        f'Độ dốc trung bình: {number(report["mean"])} {suffix}',
        '',
        'PHÂN CẤP ĐỘ DỐC',
        'Khoảng độ dốc | Số ô | Tỷ lệ (%) | Diện tích (m²)',
    ]
    for index, item in enumerate(report['classes']):
        if item['max'] is None:
            interval = f'Từ {number(item["min"])} {suffix} trở lên'
        else:
            end = 'đến' if index == len(report['classes']) - 1 else 'đến dưới'
            interval = f'{number(item["min"])} {end} {number(item["max"])} {suffix}'
        lines.append(f'{interval} | {number(item["count"])} | {number(item["percent"])} | {number(item["area_m2"])}')
    return '\n'.join(lines) + '\n'


def resolve_input(request, dem):
    from .models import RasterMetadata
    from .raster import geoserver_setting, geoserver_json, raster_store, validate_name
    from urllib.parse import urlsplit, unquote
    from urllib.request import url2pathname
    if dem['source'] == 'upload':
        folder, state = owned_upload(request, dem.get('id', ''))
        if state['status'] != 'ready':
            raise ValueError('DEM tải lên chưa sẵn sàng.')
        metadata = state['metadata']
        return folder / 'data.tif', metadata, state['filename']
    name = dem.get('name')
    if validate_name(name):
        raise ValueError('Tên lớp DEM không hợp lệ.')
    raster = RasterMetadata.objects.filter(name=name, is_deleted=False, presentation_type__in=['dem', 'dsm', 'dtm']).first()
    if raster is None:
        raise ValueError('Lớp chưa được khai báo là DEM, DSM hoặc DTM.')
    workspace = geoserver_setting('GEOSERVER_WORKSPACE', 'webgis')
    store = raster_store(workspace, name)
    if not store:
        raise ValueError('Không tìm thấy kho GeoTIFF của lớp DEM.')
    config = geoserver_json(f'workspaces/{workspace}/coveragestores/{store}.json').get('coverageStore', {})
    raw_url = config.get('url', '')
    url = urlsplit(raw_url)
    windows_file = re.fullmatch(r'file:(?://)?/?([A-Za-z]:[/\\].*)', raw_url)
    if config.get('type') != 'GeoTIFF' or url.scheme != 'file' or (url.netloc and not windows_file):
        raise ValueError('Hiện chỉ phân tích kho GeoTIFF cục bộ trên máy chủ.')
    path = Path(unquote(windows_file.group(1)) if windows_file else url2pathname(url.path))
    if not path.is_absolute() or not path.is_file() or path.suffix.lower() not in {'.tif', '.tiff'}:
        raise ValueError('Backend không đọc được GeoTIFF đã cấu hình trên GeoServer.')
    path = path.resolve()
    metadata = dict(raster.technical_metadata)
    metadata.update(crs=raster.crs)
    if metadata.get('elevation_unit') not in {'m', 'ft'}:
        metadata['elevation_unit'] = dem.get('elevation_unit')
    return path, metadata, raster.title


# 3. API Django: tải DEM, theo dõi và hủy, tính slope, tải kết quả.

if __name__ != '__main__':
    from django.conf import settings
    from django.http import FileResponse
    from django.views.decorators.csrf import csrf_protect
    from django.views.decorators.http import require_http_methods
    from .responses import error, success

    logger = logging.getLogger(__name__)


    def public_state(state):
        keys = ['id', 'filename', 'size', 'received', 'status', 'expires_at', 'metadata', 'message']
        return {key: state[key] for key in keys if key in state}


    def owned_upload(request, upload_id):
        folder = directory(settings.DEM_UPLOAD_ROOT, upload_id)
        state = read_state(folder)
        owner = request.session.get('dem_upload_owner', '')
        if not owner or not secrets.compare_digest(owner, state['owner']):
            raise FileNotFoundError
        if state['expires_at'] < time.time():
            raise FileNotFoundError
        return folder, state


    def gdal_environment():
        python = Path(settings.DEM_GDAL_PYTHON)
        env = os.environ.copy()
        # Isolate QGIS's Python from other installed GIS Python distributions.
        qgis_root = python.parent.parent
        homes = sorted((qgis_root / 'apps').glob('Python3*'))
        if homes and (qgis_root / 'apps' / 'gdal').exists():
            env['PYTHONHOME'] = str(homes[-1])
            env['PYTHONPATH'] = str(homes[-1] / 'Lib' / 'site-packages')
            env['GDAL_DATA'] = str(qgis_root / 'apps' / 'gdal' / 'share' / 'gdal')
            env['PROJ_DATA'] = str(qgis_root / 'share' / 'proj')
            env['PATH'] = str(python.parent) + os.pathsep + env.get('PATH', '')
        else:
            env.pop('PYTHONHOME', None)
            env.pop('PYTHONPATH', None)
        return env


    @csrf_protect
    @require_http_methods(['GET', 'POST'])
    def uploads(request):
        if request.method == 'GET':
            return success('Cấu hình tải DEM.', max_bytes=settings.DEM_UPLOAD_MAX_BYTES,
                           chunk_bytes=settings.DEM_UPLOAD_CHUNK_BYTES, ttl_seconds=settings.DEM_UPLOAD_TTL_SECONDS)
        try:
            cleanup_expired(settings.DEM_UPLOAD_ROOT)
            data = json.loads(request.body)
            if not isinstance(data, dict):
                return error('Thông tin tệp phải là một đối tượng JSON.')
            size = data.get('size')
            name = str(data.get('filename', '')).replace('\\', '/').split('/')[-1]
            if not name.lower().endswith(('.tif', '.tiff')) or len(name) > 255:
                return error('Chọn tệp GeoTIFF .tif hoặc .tiff.')
            if isinstance(size, bool) or not isinstance(size, int) or not 0 < size <= settings.DEM_UPLOAD_MAX_BYTES:
                return error('Tệp rỗng hoặc vượt giới hạn tải lên.', 413)
            if data.get('data_type') not in {'dem', 'dsm', 'dtm'} or data.get('elevation_unit') not in {'m', 'ft'}:
                return error('Hãy xác nhận loại dữ liệu và đơn vị cao độ.')
            band = int(data.get('band', 1))
            if band < 1 or band > 1024:
                return error('Band cao độ không hợp lệ.')
            epsg = str(data.get('epsg', '')).strip().upper().removeprefix('EPSG:')
            if epsg and (not epsg.isdigit() or not 1 <= int(epsg) <= 1000000):
                return error('Mã EPSG không hợp lệ.')
            if data.get('confirm_elevation') is not True:
                return error('Hãy xác nhận tệp chứa giá trị cao độ.')
            request.session.setdefault('dem_upload_owner', secrets.token_hex(32))
            root = Path(settings.DEM_UPLOAD_ROOT)
            root.mkdir(parents=True, exist_ok=True)
            upload_id = str(uuid4())
            folder = directory(root, upload_id)
            folder.mkdir()
            state = {'id': upload_id, 'owner': request.session['dem_upload_owner'], 'filename': name,
                     'size': size, 'received': 0, 'status': 'uploading',
                     'expires_at': time.time() + settings.DEM_UPLOAD_TTL_SECONDS,
                     'options': {'band': band, 'epsg': epsg, 'elevation_unit': data['elevation_unit'], 'data_type': data['data_type']}}
            (folder / 'data.tif').touch()
            write_state(folder, state)
            return success('Đã tạo phiên tải DEM.', upload=public_state(state))
        except (ValueError, TypeError, json.JSONDecodeError):
            return error('Thông tin tệp không hợp lệ.')
        except OSError:
            logger.exception('Cannot initialize DEM upload storage')
            return error('Không thể tạo vùng lưu trữ DEM tạm.', 507)


    @csrf_protect
    @require_http_methods(['GET', 'DELETE', 'POST', 'PUT'])
    def upload_detail(request, upload_id):
        try:
            folder, state = owned_upload(request, upload_id)
            if request.method == 'GET':
                return success('Trạng thái DEM.', upload=public_state(state))
            with lock(folder):
                state = read_state(folder)
                if request.method == 'DELETE':
                    validating = state['status'] == 'validating'
                    state['status'] = 'cancelled'
                    write_state(folder, state)
                    if not validating:
                        (folder / 'data.tif').unlink(missing_ok=True)
                    return success('Đã hủy DEM tạm.', upload=public_state(state))
                if request.method == 'PUT':
                    if state['status'] != 'uploading':
                        return error('Phiên tải không còn nhận dữ liệu.', 409)
                    offset = int(request.GET.get('offset', -1))
                    if offset != state['received']:
                        return error('Vị trí tải không khớp. Hãy tiếp tục lại phiên tải.', 409)
                    length = int(request.META.get('CONTENT_LENGTH', 0))
                    if not 0 < length <= settings.DEM_UPLOAD_CHUNK_BYTES or offset + length > state['size']:
                        return error('Khối dữ liệu vượt giới hạn.', 413)
                    chunk = request.read(length + 1)
                    if len(chunk) != length:
                        return error('Khối dữ liệu không đầy đủ.')
                    with (folder / 'data.tif').open('r+b') as handle:
                        handle.seek(offset)
                        handle.write(chunk)
                        handle.truncate(offset + length)
                    state['received'] += length
                    write_state(folder, state)
                    return success('Đã nhận khối dữ liệu.', upload=public_state(state))
                if state['status'] in {'validating', 'ready'}:
                    return success('DEM đang được kiểm tra hoặc đã sẵn sàng.', upload=public_state(state))
                if state['status'] != 'uploading' or state['received'] != state['size']:
                    return error('Tệp chưa được tải đầy đủ.', 409)
                if not Path(settings.DEM_GDAL_PYTHON).is_file():
                    return error('Chưa cấu hình Python có GDAL trên máy chủ.', 503)
                state['status'] = 'validating'
                state['message'] = 'Đang kiểm tra GeoTIFF và thống kê cao độ…'
                write_state(folder, state)
                try:
                    subprocess.Popen([str(settings.DEM_GDAL_PYTHON), str(Path(__file__).resolve()), '--validate-upload', str(folder)],
                                     env=gdal_environment(), stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                                     stderr=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
                except OSError:
                    state['status'] = 'uploading'
                    write_state(folder, state)
                    return error('Không khởi động được bộ kiểm tra DEM.', 503)
                return success('Đang kiểm tra DEM.', upload=public_state(state))
        except (FileNotFoundError, ValueError, TypeError):
            return error('Phiên tải không tồn tại, đã hết hạn hoặc tham số không hợp lệ.', 404)
        except FileExistsError:
            return error('Phiên tải đang xử lý yêu cầu khác. Hãy thử lại.', 409)
        except OSError:
            logger.exception('DEM upload storage failure')
            return error('Không thể lưu tệp tạm. Kiểm tra dung lượng lưu trữ.', 507)

    @csrf_protect
    @require_http_methods(['POST'])
    def jobs(request):
        folder = None
        try:
            if len(request.body) > 100_000:
                return error('Yêu cầu vùng phân tích quá lớn.', 413)
            data = validate_request(json.loads(request.body))
            if not Path(settings.DEM_GDAL_PYTHON).is_file():
                return error('Chưa cấu hình Python có GDAL.', 503)
            root = job_root()
            root.mkdir(parents=True, exist_ok=True)
            cleanup_jobs()
            owner = request.session.setdefault('dem_upload_owner', secrets.token_hex(32))
            with lock(root):
                active = []
                for child in root.iterdir():
                    if child.is_dir():
                        try:
                            item = read_state(directory(root, child.name))
                            if item['status'] in {'queued', 'running'} and time.time() < item['deadline']:
                                active.append(item)
                        except (OSError, ValueError, KeyError):
                            continue
                if len(active) >= 2 or any(item['owner'] == owner for item in active):
                    return error('Đang có tác vụ độ dốc chạy. Hãy đợi hoàn tất hoặc hủy tác vụ cũ.', 409)
                path, metadata, title = resolve_input(request, data['dem'])
                signature = source_signature(path)
                unit = metadata.get('elevation_unit')
                if unit not in {'m', 'ft'}:
                    raise ValueError('DEM chưa khai báo đơn vị cao độ m/ft trong metadata.')
                identifier = str(uuid4())
                folder = directory(root, identifier)
                folder.mkdir()
                data_window = None
                if data['region']['mode'] == 'data' and data['operation'] == 'slope':
                    footprint_folder = directory(root, data['region']['footprint_id'])
                    footprint_state = read_state(footprint_folder)
                    if (footprint_state['owner'] != owner or footprint_state['expires_at'] < time.time()
                            or footprint_state['status'] != 'ready'
                            or footprint_state['request'].get('operation') != 'footprint'
                            or footprint_state['request']['dem'] != data['dem']):
                        raise ValueError('Ranh giới không khớp DEM hoặc đã hết hạn. Hãy xác định lại ranh giới.')
                    # Prevent reuse if a GeoServer raster was replaced after scanning.
                    if footprint_state['result']['source_signature'] != source_signature(path):
                        raise ValueError('DEM đã thay đổi. Hãy xác định lại ranh giới.')
                    data_window = footprint_state['result']['window']
                    shutil.copyfile(footprint_folder / 'valid-data-mask.tif', folder / 'valid-data-mask.tif')
                # Preserve a ready upload if the user deletes its upload session while calculating.
                if data['dem']['source'] == 'upload':
                    snapshot = folder / 'input.tif'
                    try:
                        os.link(path, snapshot)
                    except OSError:
                        shutil.copyfile(path, snapshot)
                    path = snapshot
                now = time.time()
                state = {'id': identifier, 'owner': owner, 'status': 'queued', 'progress': 0,
                         'source_signature': signature,
                         'message': 'Đang chuẩn bị DEM…', 'title': title, 'unit': data['unit'],
                         'expires_at': now + TTL, 'deadline': now + TIMEOUT, 'updated_at': now,
                         'request': data, 'source': {'path': str(path), 'band': int(metadata.get('band', 1)),
                         'elevation_unit': unit, 'crs': metadata.get('crs_wkt') or metadata.get('crs'),
                         'quality_note': metadata.get('quality_note', '')},
                         'max_cells': getattr(settings, 'SLOPE_MAX_CELLS', MAX_CELLS)}
                if data_window is not None:
                    state['data_window'] = data_window
                write_state(folder, state)
                subprocess.Popen([str(settings.DEM_GDAL_PYTHON), str(Path(__file__).resolve()), '--worker', str(folder)],
                                 env=gdal_environment(), stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                                 stderr=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
            return success('Đã tạo tác vụ độ dốc.', job=public_job(state))
        except FileExistsError:
            return error('Máy chủ đang nhận tác vụ khác. Thử lại sau.', 409)
        except (ValueError, TypeError, KeyError, FileNotFoundError):
            if folder and folder.exists():
                shutil.rmtree(folder)
            return error(str(sys.exc_info()[1]) if isinstance(sys.exc_info()[1], ValueError) else 'Dữ liệu DEM hoặc yêu cầu không hợp lệ.')
        except (OSError, RuntimeError):
            if folder and folder.exists():
                shutil.rmtree(folder)
            return error('Không khởi tạo được tác vụ. Kiểm tra GeoServer, GDAL và dung lượng lưu trữ.', 503)

    @csrf_protect
    @require_http_methods(['GET', 'DELETE'])
    def job_detail(request, job_id, artifact=None):
        try:
            folder = directory(job_root(), job_id)
            state = read_state(folder)
            owner = request.session.get('dem_upload_owner', '')
            if not owner or not secrets.compare_digest(owner, state['owner']) or state['expires_at'] < time.time():
                raise FileNotFoundError
            if request.method == 'DELETE':
                (folder / 'cancel').touch()
                return success('Đã yêu cầu hủy tác vụ.')
            if artifact:
                files = {'geotiff': ('slope.tif', 'image/tiff'), 'preview': ('preview.png', 'image/png'), 'report': ('report.txt', 'text/plain; charset=utf-8')}
                if artifact not in files or state['status'] != 'ready':
                    raise FileNotFoundError
                if state['request'].get('operation') == 'footprint':
                    raise FileNotFoundError
                name, content_type = files[artifact]
                # Kết quả từ lần chạy cũ cũng tải được báo cáo TXT tiếng Việt.
                content = (BytesIO(format_slope_report(state['result'], state['title']).encode('utf-8-sig'))
                           if artifact == 'report' else (folder / name).open('rb'))
                response = FileResponse(content, content_type=content_type,
                                        as_attachment=artifact != 'preview', filename=f'slope-{job_id}.{name.split(".")[-1]}')
                response['Cache-Control'] = 'private, no-store'
                return response
            if state['status'] in {'queued', 'running'} and state['deadline'] < time.time():
                state.update(status='failed', message='Tác vụ quá thời gian xử lý. Hãy chọn vùng nhỏ hơn.')
                (folder / 'cancel').touch()
            return success('Trạng thái độ dốc.', job=public_job(state))
        except (FileNotFoundError, ValueError, KeyError):
            return error('Kết quả không tồn tại, đã hết hạn hoặc thuộc phiên khác.', 404)


# 4. Kiểm tra GeoTIFF bằng GDAL trong tiến trình riêng.

def inspect(folder, state):
    from osgeo import gdal, osr
    gdal.UseExceptions()
    gdal.SetConfigOption('GDAL_PAM_ENABLED', 'NO')
    gdal.SetCacheMax(128 * 1024 * 1024)
    dataset = gdal.OpenEx(str(folder / 'data.tif'), gdal.OF_RASTER | gdal.OF_READONLY, allowed_drivers=['GTiff'])
    if dataset is None:
        raise ValueError('Tệp không phải GeoTIFF hợp lệ.')
    index = state['options']['band']
    if index > dataset.RasterCount:
        raise ValueError('Band cao độ đã chọn không tồn tại.')
    interpretations = {dataset.GetRasterBand(i).GetColorInterpretation() for i in range(1, dataset.RasterCount + 1)}
    if {gdal.GCI_RedBand, gdal.GCI_GreenBand, gdal.GCI_BlueBand}.issubset(interpretations):
        raise ValueError('Đây là ảnh màu RGB, không phải raster cao độ để phân tích.')
    crs = dataset.GetSpatialRef()
    assumed_crs = False
    if crs is None:
        if not state['options']['epsg']:
            raise ValueError('GeoTIFF thiếu CRS. Hãy nhập mã EPSG rồi tải lại.')
        crs = osr.SpatialReference()
        crs.ImportFromEPSG(int(state['options']['epsg']))
        assumed_crs = True
    if not (crs.IsProjected() or crs.IsGeographic()):
        raise ValueError('Hệ tọa độ phải là hệ chiếu hoặc kinh độ/vĩ độ hợp lệ.')
    transform = dataset.GetGeoTransform(can_return_null=True)
    if transform is None or not all(math.isfinite(v) for v in transform) or transform[1] * transform[5] - transform[2] * transform[4] == 0:
        raise ValueError('Tệp thiếu lưới tọa độ hợp lệ.')
    band = dataset.GetRasterBand(index)
    if gdal.DataTypeIsComplex(band.DataType):
        raise ValueError('Band số phức không thể dùng làm cao độ.')
    def progress(fraction, message, user_data):
        if read_state(folder)['status'] == 'cancelled':
            return 0
        return 1
    minimum, maximum, mean, stddev = band.ComputeStatistics(False, callback=progress)
    if not all(math.isfinite(v) for v in [minimum, maximum, mean, stddev]):
        raise ValueError('Band không có dữ liệu cao độ hữu hạn hợp lệ.')
    corners = [(transform[0] + x * transform[1] + y * transform[2], transform[3] + x * transform[4] + y * transform[5])
               for x, y in [(0, 0), (dataset.RasterXSize, 0), (0, dataset.RasterYSize), (dataset.RasterXSize, dataset.RasterYSize)]]
    crs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    wgs84 = osr.SpatialReference()
    wgs84.ImportFromEPSG(4326)
    wgs84.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    bbox = [min(p[0] for p in corners), min(p[1] for p in corners), max(p[0] for p in corners), max(p[1] for p in corners)]
    bbox_wgs84 = list(osr.CoordinateTransformation(crs, wgs84).TransformBounds(*bbox, 21))
    if not all(math.isfinite(value) for value in bbox_wgs84):
        raise ValueError('Không chuyển đổi được phạm vi về WGS84.')
    code = crs.GetAuthorityCode(None)
    nodata = band.GetNoDataValue()
    return {'filename': state['filename'], 'width': dataset.RasterXSize, 'height': dataset.RasterYSize,
            'band_count': dataset.RasterCount, 'band': index, 'data_type': gdal.GetDataTypeName(band.DataType),
            'presentation_type': state['options']['data_type'], 'crs': f'EPSG:{code}' if code else crs.GetName(),
            'crs_wkt': crs.ExportToWkt(), 'crs_supplied_by_user': assumed_crs,
            'bbox': bbox, 'bbox_wgs84': bbox_wgs84, 'resolution_x': math.hypot(transform[1], transform[4]),
            'resolution_y': math.hypot(transform[2], transform[5]), 'horizontal_unit': 'degree' if crs.IsGeographic() else crs.GetLinearUnitsName(),
            'elevation_unit': state['options']['elevation_unit'], 'z_to_meters': 1 if state['options']['elevation_unit'] == 'm' else .3048,
            'no_data': nodata if nodata is None or math.isfinite(nodata) else str(nodata),
            'value_min': minimum, 'value_max': maximum, 'value_mean': mean, 'value_stddev': stddev,
            'requires_reprojection': bool(crs.IsGeographic()), 'statistics': 'full_resolution'}


def upload_worker(folder):
    folder = Path(folder).resolve()
    state = read_state(folder)
    try:
        metadata = inspect(folder, state)
        outcome = {'status': 'ready', 'message': 'DEM sẵn sàng để chọn vùng phân tích.', 'metadata': metadata}
    except Exception as exc:
        message = str(exc)
        if 'no valid pixels' in message.lower():
            message = 'Band chỉ chứa NoData, không có cao độ hợp lệ.'
        if not isinstance(exc, ValueError) and 'no valid pixels' not in str(exc).lower():
            message = 'GeoTIFF bị hỏng, CRS không hợp lệ hoặc không đọc được band cao độ.'
        outcome = {'status': 'failed', 'message': 'Không thể dùng DEM: ' + message[:350]}
    for attempt in range(50):
        try:
            with lock(folder):
                current = read_state(folder)
                if current['status'] == 'cancelled':
                    (folder / 'data.tif').unlink(missing_ok=True)
                    return
                current.update(outcome)
                write_state(folder, current)
                if current['status'] == 'failed':
                    (folder / 'data.tif').unlink(missing_ok=True)
            return
        except FileExistsError:
            time.sleep(.1)


# 5. Tính slope Horn, thống kê và tạo ảnh xem trước.

def inspect_data_footprint(folder, state, notify):
    """Quét theo khối, giữ mask pixel chính xác; đa giác chỉ phục vụ xem ranh giới."""
    import numpy as np
    from osgeo import gdal, ogr, osr
    gdal.UseExceptions()
    gdal.SetConfigOption('GDAL_PAM_ENABLED', 'NO')
    gdal.SetCacheMax(128 * 1024 * 1024)
    dataset = gdal.OpenEx(state['source']['path'], gdal.OF_RASTER | gdal.OF_READONLY, allowed_drivers=['GTiff'])
    crs = dataset.GetSpatialRef()
    if crs is None:
        crs = osr.SpatialReference()
        if not state['source'].get('crs') or crs.SetFromUserInput(state['source']['crs']) != 0:
            raise ValueError('DEM thiếu hệ tọa độ hợp lệ.')
    crs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    gt = dataset.GetGeoTransform(can_return_null=True)
    if not gt or not gdal.InvGeoTransform(gt):
        raise ValueError('Lưới tọa độ DEM không hợp lệ.')
    width, height = dataset.RasterXSize, dataset.RasterYSize
    index = state['source']['band']
    if not 1 <= index <= dataset.RasterCount:
        raise ValueError('Band cao độ không tồn tại.')
    band = dataset.GetRasterBand(index)
    if gdal.DataTypeIsComplex(band.DataType) or band.GetColorInterpretation() in {gdal.GCI_RedBand, gdal.GCI_GreenBand, gdal.GCI_BlueBand, gdal.GCI_PaletteIndex}:
        raise ValueError('Band ảnh màu hoặc số phức không phải cao độ.')
    if shutil.disk_usage(folder).free < width * height + 256 * 1024**2:
        raise ValueError('Ổ lưu tạm không đủ dung lượng xác định ranh giới DEM.')
    mask = gdal.GetDriverByName('GTiff').Create(str(folder / 'valid-data-mask.tif'), width, height, 1,
                                            gdal.GDT_Byte, ['TILED=YES', 'COMPRESS=DEFLATE', 'BIGTIFF=IF_SAFER'])
    mask.SetGeoTransform(gt)
    mask.SetProjection(crs.ExportToWkt())
    target = mask.GetRasterBand(1)
    target.SetNoDataValue(0)
    nodata = band.GetNoDataValue()
    scale = band.GetScale()
    offset = band.GetOffset()
    scale, offset = (1 if scale is None else scale), (0 if offset is None else offset)
    zfactor = 1 if state['source']['elevation_unit'] == 'm' else .3048
    count, x0, y0, x1, y1 = 0, width, height, 0, 0
    for y in range(0, height, 512):
        rows = min(512, height - y)
        for x in range(0, width, 512):
            columns = min(512, width - x)
            values = band.ReadAsArray(x, y, columns, rows).astype(np.float64)
            valid = (band.GetMaskBand().ReadAsArray(x, y, columns, rows) != 0) & np.isfinite(values)
            if nodata is not None:
                valid &= values != nodata
            values = (values * scale + offset) * zfactor
            valid &= np.isfinite(values) & (np.abs(values) < np.finfo(np.float32).max)
            target.WriteArray(valid.astype(np.uint8), x, y)
            ys, xs = np.nonzero(valid)
            count += len(xs)
            if len(xs):
                x0, y0 = min(x0, x + int(xs.min())), min(y0, y + int(ys.min()))
                x1, y1 = max(x1, x + int(xs.max()) + 1), max(y1, y + int(ys.max()) + 1)
            notify(5 + 65 * ((y * width + x * rows + rows * columns) / (width * height)),
                   'Đang xác định các ô có cao độ hợp lệ…')
    if not count:
        raise ValueError('DEM chỉ chứa NoData, không có vùng cao độ hợp lệ.')
    mask.FlushCache()
    vector = ogr.GetDriverByName('GPKG').CreateDataSource(str(folder / 'footprint.gpkg'))
    layer = vector.CreateLayer('footprint', crs, ogr.wkbPolygon)
    gdal.Polygonize(target, target, layer, -1, [], callback=lambda fraction, *_: notify(70 + 25 * fraction, 'Đang tạo đường bao vùng dữ liệu DEM…'))
    geometry = ogr.Geometry(ogr.wkbMultiPolygon)
    size = 0
    for feature in layer:
        polygon = feature.GetGeometryRef().Simplify(0)
        size += polygon.WkbSize()
        if size > 4 * 1024**2:
            raise ValueError('Ranh giới DEM có quá nhiều mảnh nhỏ. Hãy dùng chế độ vẽ vùng để phân tích.')
        geometry.AddGeometry(polygon)
    wgs = osr.SpatialReference()
    wgs.ImportFromEPSG(4326)
    wgs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    geometry.Transform(osr.CoordinateTransformation(crs, wgs))
    area_geometry = geometry.Clone()
    area_crs = osr.SpatialReference()
    area_crs.ImportFromEPSG(6933)
    area_geometry.Transform(osr.CoordinateTransformation(wgs, area_crs))
    result = {'geometry': json.loads(geometry.ExportToJson()), 'crs': 'EPSG:4326',
              'valid_cells': count, 'window': [x0, y0, x1, y1], 'area_m2': area_geometry.GetArea(),
              'window_cells': (min(width, x1 + 2) - max(0, x0 - 2)) * (min(height, y1 + 2) - max(0, y0 - 2)),
              'source_signature': state.get('source_signature', source_signature(state['source']['path']))}
    target = None
    mask = vector = dataset = None
    return result


def calculate(folder, state, notify):
    """GDAL-only path: normalize -> slope with halo -> AOI mask -> statistics/preview."""
    import numpy as np
    from osgeo import gdal, ogr, osr
    gdal.UseExceptions()
    gdal.SetConfigOption('GDAL_PAM_ENABLED', 'NO')
    # The bundled QGIS GTiff driver needs serial RasterIO for masks spanning multiple blocks.
    gdal.SetConfigOption('GDAL_NUM_THREADS', '1')
    gdal.SetCacheMax(128 * 1024 * 1024)
    creation = ['TILED=YES', 'COMPRESS=DEFLATE', 'PREDICTOR=3', 'BIGTIFF=IF_SAFER']
    nodata = -9999.0
    dataset = gdal.OpenEx(state['source']['path'], gdal.OF_RASTER | gdal.OF_READONLY, allowed_drivers=['GTiff'])
    if dataset is None:
        raise ValueError('Không đọc được GeoTIFF đầu vào.')
    crs = dataset.GetSpatialRef()
    if crs is None:
        crs = osr.SpatialReference()
        if not state['source'].get('crs') or crs.SetFromUserInput(state['source']['crs']) != 0:
            raise ValueError('DEM thiếu hệ tọa độ hợp lệ.')
    crs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    wgs = osr.SpatialReference()
    wgs.ImportFromEPSG(4326)
    wgs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    gt = dataset.GetGeoTransform(can_return_null=True)
    inv = gdal.InvGeoTransform(gt) if gt else None
    if not inv:
        raise ValueError('Lưới tọa độ DEM không hợp lệ.')
    band_index = state['source']['band']
    if not 1 <= band_index <= dataset.RasterCount:
        raise ValueError('Band cao độ không tồn tại.')
    band = dataset.GetRasterBand(band_index)
    if gdal.DataTypeIsComplex(band.DataType) or band.GetColorInterpretation() in {gdal.GCI_RedBand, gdal.GCI_GreenBand, gdal.GCI_BlueBand, gdal.GCI_PaletteIndex}:
        raise ValueError('Band ảnh màu hoặc số phức không phải cao độ.')
    corners = [gdal.ApplyGeoTransform(gt, x, y) for x, y in [(0, 0), (dataset.RasterXSize, 0), (dataset.RasterXSize, dataset.RasterYSize), (0, dataset.RasterYSize), (0, 0)]]
    footprint = ogr.CreateGeometryFromJson(json.dumps({'type': 'Polygon', 'coordinates': [corners]}))
    region = state['request']['region']
    aoi = footprint.Clone()
    if region['mode'] == 'data':
        dx0, dy0, dx1, dy1 = state['data_window']
        corners = [gdal.ApplyGeoTransform(gt, x, y) for x, y in
                   [(dx0, dy0), (dx1, dy0), (dx1, dy1), (dx0, dy1), (dx0, dy0)]]
        aoi = ogr.CreateGeometryFromJson(json.dumps({'type': 'Polygon', 'coordinates': [corners]}))
    if region['mode'] == 'polygon':
        aoi = ogr.CreateGeometryFromJson(json.dumps(region['geometry']))
        if aoi is None or not aoi.IsValid() or aoi.GetArea() <= 0:
            raise ValueError('Vùng vẽ bị tự cắt hoặc không có diện tích.')
        aoi.Transform(osr.CoordinateTransformation(wgs, crs))
        aoi = aoi.Intersection(footprint)
    if aoi is None or aoi.IsEmpty() or aoi.GetArea() <= 0:
        raise ValueError('Vùng chọn không giao với DEM.')
    # Read a two-cell halo so the AOI boundary does not create false missing neighbors.
    xmin, xmax, ymin, ymax = aoi.GetEnvelope()
    grid_points = [gdal.ApplyGeoTransform(inv, x, y) for x in [xmin, xmax] for y in [ymin, ymax]]
    x0 = max(0, math.floor(min(p[0] for p in grid_points)) - 2)
    y0 = max(0, math.floor(min(p[1] for p in grid_points)) - 2)
    x1 = min(dataset.RasterXSize, math.ceil(max(p[0] for p in grid_points)) + 2)
    y1 = min(dataset.RasterYSize, math.ceil(max(p[1] for p in grid_points)) + 2)
    if region['mode'] == 'data':
        # Exact pixel bounds also handle rotated rasters without expanding the envelope twice.
        x0, y0 = max(0, dx0 - 2), max(0, dy0 - 2)
        x1, y1 = min(dataset.RasterXSize, dx1 + 2), min(dataset.RasterYSize, dy1 + 2)
    width, height = x1 - x0, y1 - y0
    limit = state['max_cells']
    if width < 3 or height < 3 or width * height > limit:
        raise ValueError(f'Khung xử lý cần từ 3 × 3 ô và tối đa {limit:,} ô. Hãy vẽ vùng nhỏ hơn.')
    if shutil.disk_usage(folder).free < width * height * 24 + 256 * 1024**2:
        raise ValueError('Ổ lưu tạm không đủ dung lượng cho vùng phân tích.')
    origin = gdal.ApplyGeoTransform(gt, x0, y0)
    cropped_gt = (origin[0], gt[1], gt[2], origin[1], gt[4], gt[5])
    normalized = gdal.GetDriverByName('GTiff').Create(str(folder / 'elevation.tif'), width, height, 1, gdal.GDT_Float32, creation)
    normalized.SetGeoTransform(cropped_gt)
    normalized.SetProjection(crs.ExportToWkt())
    target_band = normalized.GetRasterBand(1)
    target_band.SetNoDataValue(nodata)
    target_band.SetUnitType('m')
    scale, offset = band.GetScale(), band.GetOffset()
    scale = 1 if scale is None else scale
    offset = 0 if offset is None else offset
    zfactor = 1 if state['source']['elevation_unit'] == 'm' else .3048
    original_nodata = band.GetNoDataValue()
    for y in range(0, height, 256):
        rows = min(256, height - y)
        values = band.ReadAsArray(x0, y0 + y, width, rows).astype(np.float64)
        valid = (band.GetMaskBand().ReadAsArray(x0, y0 + y, width, rows) != 0) & np.isfinite(values)
        if original_nodata is not None:
            valid &= values != original_nodata
        values = (values * scale + offset) * zfactor
        valid &= np.isfinite(values) & (np.abs(values) < np.finfo(np.float32).max)
        target_band.WriteArray(np.where(valid, values, nodata).astype(np.float32), 0, y)
        notify(5 + 20 * (y + rows) / height, 'Đang chuẩn hóa band cao độ và NoData…')
    target_band = None
    normalized.FlushCache()
    dataset = None
    reprojected = False
    working = normalized
    target_crs = crs
    if not crs.IsProjected() or abs(crs.GetLinearUnits() - 1) > 1e-8 or gt[2] != 0 or gt[4] != 0:
        center = aoi.Centroid()
        center.Transform(osr.CoordinateTransformation(crs, wgs))
        lon, lat = center.GetX(), center.GetY()
        if not -80 < lat < 84:
            raise ValueError('Vùng ngoài phạm vi UTM được hỗ trợ.')
        target_crs = osr.SpatialReference()
        target_crs.ImportFromEPSG((32600 if lat >= 0 else 32700) + min(60, max(1, int((lon + 180) // 6) + 1)))
        target_crs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
        auto = gdal.AutoCreateWarpedVRT(normalized, None, target_crs.ExportToWkt(), gdal.GRA_Bilinear)
        if auto.RasterXSize * auto.RasterYSize > limit:
            raise ValueError('Lưới sau chuyển hệ chiếu quá lớn. Hãy chọn vùng nhỏ hơn.')
        auto = None
        working = gdal.Warp(str(folder / 'projected.tif'), normalized, dstSRS=target_crs.ExportToWkt(),
                            resampleAlg='bilinear', srcNodata=nodata, dstNodata=nodata, outputType=gdal.GDT_Float32,
                            creationOptions=creation, warpMemoryLimit=128, callback=lambda f, *_: notify(25 + f * 15, 'Đang chuyển DEM sang hệ chiếu mét…'))
        reprojected = True
    output = gdal.DEMProcessing(str(folder / 'slope.tif'), working, 'slope', format='GTiff', alg='Horn',
                                slopeFormat='percent' if state['unit'] == 'percent' else 'degree', scale=1.0,
                                computeEdges=False, creationOptions=creation,
                                callback=lambda f, *_: notify(40 + f * 30, 'Đang tính độ dốc Horn…'))
    output = None
    output = gdal.Open(str(folder / 'slope.tif'), gdal.GA_Update)
    # Apply AOI only AFTER the neighborhood calculation.
    output_crs = target_crs
    aoi.Transform(osr.CoordinateTransformation(crs, output_crs))
    mask = gdal.GetDriverByName('GTiff').Create(str(folder / 'mask.tif'), output.RasterXSize, output.RasterYSize, 1, gdal.GDT_Byte, ['TILED=YES', 'COMPRESS=DEFLATE'])
    mask.SetGeoTransform(output.GetGeoTransform())
    mask.SetProjection(output.GetProjection())
    vector = ogr.GetDriverByName('Memory').CreateDataSource('aoi')
    layer = vector.CreateLayer('aoi', output_crs, ogr.wkbUnknown)
    feature = ogr.Feature(layer.GetLayerDefn())
    feature.SetGeometry(aoi)
    layer.CreateFeature(feature)
    gdal.RasterizeLayer(mask, [1], layer, burn_values=[1])
    mask.FlushCache()
    mask = None
    mask = gdal.Open(str(folder / 'mask.tif'), gdal.GA_ReadOnly)
    if region['mode'] == 'data':
        mask = None
        transform = output.GetGeoTransform()
        bounds = [transform[0], transform[3] + transform[5] * output.RasterYSize,
                  transform[0] + transform[1] * output.RasterXSize, transform[3]]
        mask = gdal.Warp(str(folder / 'mask.tif'), str(folder / 'valid-data-mask.tif'),
                         dstSRS=output.GetProjection(), outputBounds=bounds,
                         width=output.RasterXSize, height=output.RasterYSize,
                         resampleAlg='near', srcNodata=0, dstNodata=0, outputType=gdal.GDT_Byte,
                         creationOptions=['TILED=YES', 'COMPRESS=DEFLATE'],
                         callback=lambda fraction, *_: notify(70, 'Đang áp ranh giới dữ liệu DEM…'))
    count, total, squared, selected = 0, 0.0, 0.0, 0
    minimum, maximum = float('inf'), float('-inf')
    bins = np.array(BREAKS[1:-1], dtype=float)
    if state['unit'] == 'percent':
        bins = np.tan(np.deg2rad(bins)) * 100
    histogram = np.zeros(len(COLORS), dtype=np.int64)
    ob = output.GetRasterBand(1)
    result_nodata = ob.GetNoDataValue()
    for y in range(0, output.RasterYSize, 256):
        rows = min(256, output.RasterYSize - y)
        values = ob.ReadAsArray(0, y, output.RasterXSize, rows)
        inside = mask.GetRasterBand(1).ReadAsArray(0, y, output.RasterXSize, rows) != 0
        valid = inside & np.isfinite(values) & (values != result_nodata)
        ob.WriteArray(np.where(valid, values, result_nodata), 0, y)
        v = values[valid].astype(np.float64)
        selected += int(inside.sum())
        if v.size:
            count += int(v.size)
            total += float(v.sum())
            squared += float(np.square(v).sum())
            minimum, maximum = min(minimum, float(v.min())), max(maximum, float(v.max()))
            histogram += np.bincount(np.searchsorted(bins, v, side='right'), minlength=len(COLORS))
        notify(70 + 15 * (y + rows) / output.RasterYSize, 'Đang thống kê các ô độ dốc hợp lệ…')
    if not count:
        raise ValueError('Vùng không có ô đủ dữ liệu 3 × 3 để tính độ dốc. Có thể chỉ chứa NoData hoặc vùng quá nhỏ.')
    ob.SetUnitType('%' if state['unit'] == 'percent' else 'degree')
    ob.SetStatistics(minimum, maximum, total / count, math.sqrt(max(0, squared / count - (total / count)**2)))
    output.SetMetadata({'METHOD': 'Horn 3x3', 'SLOPE_UNIT': state['unit'], 'SOURCE_TITLE': state['title'],
                        'NODATA_POLICY': 'strict 3x3 neighborhood; AOI mask applied after slope'})
    transform = output.GetGeoTransform()
    pixel_area = abs(transform[1] * transform[5] - transform[2] * transform[4])
    classes = []
    for i, color in enumerate(COLORS):
        lower = BREAKS[i] if state['unit'] == 'degree' else math.tan(math.radians(BREAKS[i])) * 100
        upper = BREAKS[i + 1] if state['unit'] == 'degree' else (math.tan(math.radians(BREAKS[i + 1])) * 100 if i < len(COLORS) - 1 else None)
        classes.append({'min': lower, 'max': upper, 'color': color, 'count': int(histogram[i]),
                        'percent': float(histogram[i]) / count * 100, 'area_m2': int(histogram[i]) * pixel_area})
    report = {'method': 'Horn 3×3', 'unit': state['unit'], 'crs': f'EPSG:{output_crs.GetAuthorityCode(None)}' if output_crs.GetAuthorityCode(None) else output_crs.GetName(),
              'resolution': [abs(transform[1]), abs(transform[5])], 'width': output.RasterXSize, 'height': output.RasterYSize,
              'valid_cells': count, 'selected_cells': selected, 'excluded_cells': selected - count,
              'valid_area_m2': count * pixel_area, 'min': minimum, 'max': maximum, 'mean': total / count,
              'classes': classes, 'reprojected': reprojected}
    output.FlushCache()
    # Small classified preview; downloadable GeoTIFF always keeps full resolution Float32.
    preview_crs = osr.SpatialReference()
    preview_crs.ImportFromEPSG(3857)
    auto = gdal.AutoCreateWarpedVRT(output, None, preview_crs.ExportToWkt(), gdal.GRA_NearestNeighbour)
    pgt = auto.GetGeoTransform()
    bounds = [pgt[0], pgt[3] + pgt[5] * auto.RasterYSize, pgt[0] + pgt[1] * auto.RasterXSize, pgt[3]]
    ratio = min(1, 1536 / max(auto.RasterXSize, auto.RasterYSize))
    pw, ph = max(1, round(auto.RasterXSize * ratio)), max(1, round(auto.RasterYSize * ratio))
    auto = None
    preview = gdal.Warp('', output, format='MEM', dstSRS='EPSG:3857', outputBounds=bounds, width=pw, height=ph,
                        srcNodata=result_nodata, dstNodata=result_nodata, resampleAlg='near',
                        callback=lambda f, *_: notify(85 + f * 12, 'Đang tạo ảnh xem trước…'))
    pixels = preview.GetRasterBand(1).ReadAsArray()
    valid = np.isfinite(pixels) & (pixels != result_nodata)
    indices = np.searchsorted(bins, pixels, side='right')
    rgba = gdal.GetDriverByName('MEM').Create('', pw, ph, 4, gdal.GDT_Byte)
    palette = np.array([[int(c[n:n + 2], 16) for n in (1, 3, 5)] for c in COLORS], dtype=np.uint8)
    for channel in range(3):
        rgba.GetRasterBand(channel + 1).WriteArray(palette[indices, channel])
    rgba.GetRasterBand(4).WriteArray(valid.astype(np.uint8) * 255)
    rgba.GetRasterBand(4).SetColorInterpretation(gdal.GCI_AlphaBand)
    gdal.GetDriverByName('PNG').CreateCopy(str(folder / 'preview.png'), rgba)
    report['preview_extent'] = bounds
    report['preview_crs'] = 'EPSG:3857'
    (folder / 'report.txt').write_text(format_slope_report(report, state['title']), encoding='utf-8-sig')
    ob = None
    output = mask = working = normalized = None
    return report


# 6. Chạy nền và dọn các tệp trung gian.

def worker(folder):
    folder = Path(folder).resolve()
    state = read_state(folder)
    last_write = 0

    def notify(progress, message):
        nonlocal last_write
        if (folder / 'cancel').exists():
            raise InterruptedError('Đã hủy phân tích độ dốc.')
        if time.time() > state['deadline']:
            raise ValueError('Tác vụ quá thời gian xử lý. Hãy chọn vùng nhỏ hơn.')
        if time.time() - last_write >= 1:
            state.update(status='running', progress=round(progress), message=message, updated_at=time.time())
            write_state(folder, state)
            last_write = time.time()
        return 1

    try:
        notify(1, 'Đang kiểm tra lưới DEM và vùng chọn…')
        is_footprint = state['request'].get('operation') == 'footprint'
        report = inspect_data_footprint(folder, state, notify) if is_footprint else calculate(folder, state, notify)
        notify(99, 'Đang hoàn tất kết quả…')
        state.update(status='ready', progress=100,
                     message='Đã xác định ranh giới dữ liệu DEM.' if is_footprint else 'Đã tính xong độ dốc.', result=report)
    except Exception as exc:
        cancelled = (folder / 'cancel').exists()
        state.update(status='cancelled' if cancelled else 'failed', message=str(exc)[:400] if isinstance(exc, (ValueError, InterruptedError)) else 'Không xử lý được raster. Kiểm tra dữ liệu, CRS hoặc dung lượng lưu trữ.')
        if not isinstance(exc, (ValueError, InterruptedError)):
            import traceback
            (folder / 'worker-error.log').write_text(traceback.format_exc(), encoding='utf-8')
    finally:
        state['updated_at'] = time.time()
        write_state(folder, state)
        # Only known generated names in this private UUID folder are disposable.
        keep_mask = state['status'] == 'ready' and state.get('request', {}).get('operation') == 'footprint'
        for name in ['input.tif', 'elevation.tif', 'projected.tif', 'mask.tif', 'footprint.gpkg'] + ([] if keep_mask else ['valid-data-mask.tif']) + ([] if state['status'] == 'ready' else ['slope.tif', 'preview.png', 'report.txt']):
            try:
                (folder / name).unlink(missing_ok=True)
            except OSError:
                pass


if __name__ == '__main__' and len(sys.argv) == 3:
    if sys.argv[1] == '--validate-upload':
        upload_worker(sys.argv[2])
    elif sys.argv[1] == '--worker':
        worker(sys.argv[2])
