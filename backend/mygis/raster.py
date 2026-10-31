import json  # Đọc dữ liệu JSON như bbox
import logging  # Ghi log lỗi
import math  # Kiểm tra số hữu hạn
import os  # Đọc biến môi trường
import re  # Kiểm tra định dạng tên raster
from base64 import b64encode  # Mã hóa tài khoản GeoServer theo Basic Authentication
from django.middleware.csrf import get_token
from django.views.decorators.csrf import ensure_csrf_cookie
from urllib.error import HTTPError, URLError  # Bắt lỗi khi gọi GeoServer REST API
from urllib.request import Request, urlopen  # Gửi HTTP request đến GeoServer
from urllib.parse import unquote
from django.db import DatabaseError  # Bắt lỗi PostgreSQL
from django.conf import settings
from dotenv import dotenv_values
from django.views.decorators.csrf import csrf_protect
from .responses import error, success  # Chuẩn hóa response thành công/lỗi
from .models import RasterMetadata  # Model lưu metadata raster trong PostgreSQL
logger = logging.getLogger(__name__)  # Logger của file hiện tại
RASTER_NAME_PATTERN = re.compile(r"^[a-zA-Z][a-zA-Z0-9_-]{0,62}$")  # Tên raster phải bắt đầu bằng chữ, tối đa 63 ký tự
MAX_RASTER_SIZE = 512 * 1024 * 1024  # Web chỉ nhận GeoTIFF nhỏ hơn 512 MB
PRESENTATION_TYPES = {value for value, _ in RasterMetadata.PresentationType.choices}

@ensure_csrf_cookie
def csrf_token(request):
    return success("Đã tạo mã xác thực yêu cầu.", token=get_token(request))

def geoserver_setting(name, default=None):
    # Đọc lại cấu hình REST khi người dùng vừa cập nhật tài khoản trong .env.
    values = dotenv_values(settings.PROJECT_DIR / '.env', interpolate=False)
    return values.get(name) or os.getenv(name) or getattr(settings, name, None) or default


def geoserver_request(path, *, method="GET", data=None, content_type=None, content_length=None, allow_not_found=False, read_body=False):
    username = geoserver_setting("GEOSERVER_ADMIN_USER")  # Lấy tài khoản admin GeoServer
    password = geoserver_setting("GEOSERVER_ADMIN_PASSWORD")  # Lấy mật khẩu GeoServer
    if not username or not password:
        raise RuntimeError("Chưa điền GEOSERVER_ADMIN_USER và GEOSERVER_ADMIN_PASSWORD trong file .env ở thư mục gốc LapTrinhGis.")
    base_url = geoserver_setting("GEOSERVER_REST_URL", "http://localhost:8080/geoserver/rest").rstrip("/")  # URL REST API GeoServer
    headers = {"Authorization": f"Basic {b64encode(f'{username}:{password}'.encode()).decode()}"}  # Tạo Basic Auth
    if content_type:
        headers["Content-Type"] = content_type  # Ví dụ image/tiff khi upload GeoTIFF
    if content_length is not None:
        headers["Content-Length"] = str(content_length)
    try:
        request = Request(f"{base_url}/{path.lstrip('/')}", data=data, headers=headers, method=method)  # Tạo HTTP request
        with urlopen(request, timeout=45) as response:
            return response.read() if read_body else response.status
    except HTTPError as exc:
        if allow_not_found and exc.code == 404:
            return None
        if exc.code == 401:
            raise RuntimeError("GeoServer từ chối đăng nhập (HTTP 401). Kiểm tra GEOSERVER_ADMIN_USER và GEOSERVER_ADMIN_PASSWORD trong .env bằng tài khoản đăng nhập GeoServer tại http://localhost:8080/geoserver/.") from exc
        if exc.code == 403:
            raise RuntimeError("Tài khoản GeoServer không có quyền thực hiện thao tác REST (HTTP 403). Kiểm tra quyền quản trị của tài khoản trong .env.") from exc
        detail = exc.read().decode("utf-8", "replace")[:500]  # Đọc nội dung lỗi GeoServer, tối đa 500 ký tự
        raise RuntimeError(f"GeoServer trả về HTTP {exc.code}: {detail}") from exc
    except (URLError, TimeoutError, OSError) as exc:
        raise RuntimeError("Không kết nối được GeoServer.") from exc  # GeoServer tắt hoặc sai URL

def validate_name(name):
    if not isinstance(name, str) or not RASTER_NAME_PATTERN.fullmatch(name):
        return "Tên raster chỉ gồm chữ cái, số, dấu gạch nối hoặc gạch dưới; bắt đầu bằng chữ cái."  # Tên không hợp lệ
    return None  # Tên hợp lệ

def validate_presentation_type(value):
    if value not in PRESENTATION_TYPES:
        return "Loại trình bày raster không hợp lệ."
    return None

def serialize(raster):
    return {
        "id": raster.name,  # Dùng tên raster làm id phía frontend
        "name": raster.name,  # Tên kỹ thuật của raster
        "title": re.sub(r"^DEM\b", "Raster", raster.title, flags=re.IGNORECASE),  # Tên hiển thị
        "crs": raster.crs,  # Hệ tọa độ
        "bbox": raster.bbox,  # Phạm vi raster
        "width": raster.width,  # Số pixel chiều ngang
        "height": raster.height,  # Số pixel chiều dọc
        "source_filename": raster.source_filename,  # Tên file GeoTIFF gốc
        "presentation_type": "raster",
        "technical_metadata": raster.technical_metadata,  # Band, kiểu pixel và NoData
        "created_at": raster.created_at.isoformat(),
        "updated_at": raster.updated_at.isoformat(),
    }

def read_metadata(request, fallback_name="", fallback_presentation_type=RasterMetadata.PresentationType.RASTER):
    name = request.POST.get("name", fallback_name).strip()  # Lấy tên raster frontend gửi lên
    title = request.POST.get("title", name).strip()  # Lấy tên hiển thị, mặc định bằng name
    presentation_type = "raster"
    if name_error := validate_name(name):
        return None, name_error  # Dừng nếu tên không hợp lệ
    if not title:
        return None, "Hãy nhập tên hiển thị raster."
    if presentation_error := validate_presentation_type(presentation_type):
        return None, presentation_error
    try:
        bbox = json.loads(request.POST.get("bbox", "[]"))  # Chuyển bbox JSON thành list Python
        width, height = int(request.POST.get("width", 0)), int(request.POST.get("height", 0))  # Đọc kích thước raster
        technical_metadata = json.loads(request.POST.get("technical_metadata", "{}"))
    except (ValueError, json.JSONDecodeError):
        return None, "Thông tin raster không hợp lệ."
    if not isinstance(technical_metadata, dict):
        return None, "Metadata kỹ thuật raster không hợp lệ."
    if (
        not isinstance(bbox, list)
        or len(bbox) != 4  # BBox phải có minX, minY, maxX, maxY
        or not all(isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) for value in bbox)  # Tất cả phải là số hữu hạn
    ):
        return None, "BBox raster phải gồm bốn tọa độ số hữu hạn."
    if bbox[0] >= bbox[2] or bbox[1] >= bbox[3]:
        return None, "Phạm vi raster phải có minX < maxX và minY < maxY."
    if width <= 0 or height <= 0:
        return None, "Kích thước raster phải lớn hơn 0."  # Không cho width/height bằng 0 hoặc âm
    return {
        "name": name,
        "title": title[:150],  # Giới hạn title tối đa 150 ký tự
        "crs": request.POST.get("crs", "").strip()[:64],  # Hệ tọa độ, tối đa 64 ký tự
        "bbox": bbox,
        "width": width,
        "height": height,
        "source_filename": request.POST.get("source_filename", "").strip()[:255],
        "presentation_type": presentation_type,
        "technical_metadata": technical_metadata,
        "is_deleted": False,
    }, None

def list_rasters(request):
    if request.method != "GET":
        return error("Chỉ hỗ trợ phương thức GET.", 405)  # Danh sách raster chỉ cho GET
    try:
        rasters = [serialize(raster) for raster in RasterMetadata.objects.filter(is_deleted=False)]  # Đọc toàn bộ raster từ PostgreSQL
        deleted_names = list(RasterMetadata.objects.filter(is_deleted=True).values_list("name", flat=True))
    except DatabaseError:
        logger.exception("Không thể đọc metadata raster")  # Ghi lỗi vào log
        return error("Không thể đọc danh sách raster từ cơ sở dữ liệu.", 500)
    return success("Đã tải danh sách raster.", rasters=rasters, deleted_names=deleted_names)


def geoserver_json(path):
    try:
        return json.loads(geoserver_request(path, read_body=True).decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise RuntimeError("GeoServer không trả về metadata JSON hợp lệ.") from exc


def raster_store(workspace, name):
    """Đọc đúng store của lớp có sẵn; tên store có thể khác tên raster."""
    payload = geoserver_request(f"layers/{workspace}:{name}.json", allow_not_found=True, read_body=True)
    if payload is None:
        return None
    try:
        resource = json.loads(payload).get("layer", {}).get("resource", {})
        match = re.search(r"/coveragestores/([^/]+)/coverages/", resource.get("href", ""))
        store = unquote(match.group(1)) if match else ""
        if validate_name(store):
            raise ValueError("Không phải lớp raster hợp lệ")
        return store
    except (ValueError, TypeError, AttributeError) as exc:
        raise RuntimeError("Không xác định được CoverageStore của raster trên GeoServer.") from exc


def coverage_metadata(workspace, store_name, coverage_name):
    coverage = geoserver_json(
        f"workspaces/{workspace}/coveragestores/{store_name}/coverages/{coverage_name}.json"
    ).get("coverage", {})
    native_bbox = coverage.get("nativeBoundingBox")
    bbox_data = native_bbox or coverage.get("latLonBoundingBox") or {}
    try:
        bbox = [float(bbox_data[key]) for key in ("minx", "miny", "maxx", "maxy")]
    except (KeyError, TypeError, ValueError) as exc:
        raise RuntimeError("GeoServer không trả về phạm vi hợp lệ cho raster.") from exc
    grid_range = coverage.get("grid", {}).get("range", {})
    try:
        low_value, high_value = grid_range["low"], grid_range["high"]
        low = [int(value) for value in (low_value.split() if isinstance(low_value, str) else low_value)]
        high = [int(value) for value in (high_value.split() if isinstance(high_value, str) else high_value)]
        width, height = high[0] - low[0] + 1, high[1] - low[1] + 1
    except (KeyError, IndexError, TypeError, ValueError):
        width = height = None
    dimensions = coverage.get("dimensions", {}).get("coverageDimension", [])
    if isinstance(dimensions, dict):
        dimensions = [dimensions]
    data_types = [item.get("dimensionType", {}).get("name") for item in dimensions]
    data_types = [item for item in data_types if item]
    # GeoServer trả về dạng UNSIGNED_8BITS hoặc REAL_32BITS.
    bits = sorted({match.group(1) for item in data_types if (match := re.search(r"(\d+)_?BITS", item))})
    no_data = [item.get("nullValues", {}).get("double") for item in dimensions]
    value_range = dimensions[0].get("range", {}) if len(dimensions) == 1 else {}
    def finite_value(key):
        try:
            value = float(value_range[key])
            return value if math.isfinite(value) else None
        except (KeyError, TypeError, ValueError):
            return None
    grid = coverage.get("grid", {})
    source_type = coverage.get("nativeFormat", "GeoServer")
    return {
        "crs": (coverage.get("srs") or bbox_data.get("crs", "")) if native_bbox else "EPSG:4326",
        "bbox": bbox,
        "width": width,
        "height": height,
        "source_filename": f"{source_type}: {store_name}",
        "technical_metadata": {
            "source_type": source_type,
            "coverage_store": store_name,
            "band_count": len(dimensions) or None,
            "band_names": [item.get("name") for item in dimensions],
            "bits_per_sample": f"{', '.join(bits)} bit × {len(dimensions)} band" if bits and dimensions else None,
            "data_type": ", ".join(sorted(set(data_types))) or None,
            "no_data": no_data if any(value is not None for value in no_data) else None,
            "value_min": finite_value("min"),
            "value_max": finite_value("max"),
            "resolution_x": abs(grid.get("transform", {}).get("scaleX", 0)) or None,
            "resolution_y": abs(grid.get("transform", {}).get("scaleY", 0)) or None,
        },
    }


@csrf_protect
def sync_raster_from_geoserver(request, raster_name):
    if request.method != "POST":
        return error("Chỉ hỗ trợ phương thức POST.", 405)
    if name_error := validate_name(raster_name):
        return error(name_error)
    store_name = request.POST.get("store_name", raster_name).strip()
    if name_error := validate_name(store_name):
        return error(name_error)
    workspace = geoserver_setting("GEOSERVER_WORKSPACE", "webgis")
    try:
        current_raster = RasterMetadata.objects.filter(name=raster_name).first()
        current_type = current_raster.presentation_type if current_raster else None
        presentation_type = "raster"
        if presentation_error := validate_presentation_type(presentation_type):
            return error(presentation_error)
        store_name = raster_store(workspace, raster_name) or store_name
        metadata = coverage_metadata(workspace, store_name, raster_name)
        if current_raster:
            # Giữ thống kê đầy đủ và báo cáo chất lượng khi đồng bộ lại GeoServer.
            metadata["technical_metadata"] = {
                **current_raster.technical_metadata,
                **{key: value for key, value in metadata["technical_metadata"].items() if value is not None},
            }
            if current_raster.source_filename:
                metadata["source_filename"] = current_raster.source_filename
        raster, _ = RasterMetadata.objects.update_or_create(
            name=raster_name,
            defaults={
                **metadata,
                "title": request.POST.get("title", raster_name).strip()[:150] or raster_name,
                "presentation_type": presentation_type,
                "is_deleted": False,
            },
        )
    except (DatabaseError, RuntimeError) as exc:
        logger.exception("Không thể đồng bộ metadata raster %s", raster_name)
        return error(str(exc), 502 if isinstance(exc, RuntimeError) else 500)
    return success("Đã đồng bộ metadata từ GeoServer.", raster=serialize(raster))


def upload_chunks(upload):
    yield from upload.chunks()


def publish_raster(workspace, name, upload, *, replace=False):
    store_name = name
    if replace:
        store_name = raster_store(workspace, name) or name
    else:
        existing = geoserver_request(f"layers/{workspace}:{name}.json", allow_not_found=True)
        if existing is not None:
            raise RuntimeError("Tên raster đã tồn tại trên GeoServer. Hãy chọn Sửa dữ liệu raster.")
    store_path = f"workspaces/{workspace}/coveragestores/{store_name}"
    geoserver_request(f"{store_path}/file.geotiff?configure=all&coverageName={name}",
        method="PUT",
        data=upload_chunks(upload),
        content_type="image/tiff",
        content_length=upload.size,
    )


@csrf_protect
def update_raster_metadata(request, raster_name):
    if request.method != "POST":
        return error("Chỉ hỗ trợ phương thức POST.", 405)
    try:
        current_type = RasterMetadata.objects.filter(name=raster_name).values_list("presentation_type", flat=True).first()
    except DatabaseError:
        logger.exception("Không thể đọc loại trình bày raster %s", raster_name)
        return error("Không thể đọc metadata raster từ PostgreSQL.", 500)
    metadata, metadata_error = read_metadata(
        request,
        raster_name,
        current_type or RasterMetadata.PresentationType.RASTER,
    )
    if metadata_error:
        return error(metadata_error)
    if metadata["name"] != raster_name:
        return error("Tên raster không được thay đổi khi chỉ cập nhật metadata.")
    try:
        raster, _ = RasterMetadata.objects.update_or_create(
            name=raster_name,
            defaults=metadata,
        )
    except DatabaseError:
        logger.exception("Không thể cập nhật metadata raster %s", raster_name)
        return error("Không thể lưu metadata raster vào PostgreSQL.", 500)
    return success("Đã cập nhật metadata raster.", raster=serialize(raster))

@csrf_protect
def save_raster(request, raster_name=None):
    if request.method != "POST":
        return error("Chỉ hỗ trợ phương thức POST.", 405)  # Thêm/sửa raster dùng POST
    metadata, metadata_error = read_metadata(request, raster_name or "")  # Đọc và kiểm tra metadata
    if metadata_error:
        return error(metadata_error)
    upload = request.FILES.get("file")  # Lấy file raster được upload
    if not upload:
        return error("Hãy chọn tệp GeoTIFF.")  # Không có file thì dừng
    if not upload.name.lower().endswith((".tif", ".tiff")):
        return error("Chỉ hỗ trợ tệp GeoTIFF (.tif hoặc .tiff).")  # Chỉ cho phép tif/tiff
    if upload.size >= MAX_RASTER_SIZE:
        return error("Tệp từ 512 MB phải publish thủ công lên GeoServer rồi khai báo trong RASTER_LAYER_CONFIGS.")
    signature = upload.read(4)
    upload.seek(0)
    if signature not in (b'II\x2a\x00', b'MM\x00\x2a', b'II\x2b\x00', b'MM\x00\x2b'):
        return error("Nội dung tệp không phải TIFF hợp lệ.")
    workspace = geoserver_setting("GEOSERVER_WORKSPACE", "webgis")
    if raster_name and metadata["name"] != raster_name:
        return error("Tên raster không được thay đổi khi sửa dữ liệu.")
    try:
        if not raster_name and RasterMetadata.objects.filter(name=metadata["name"], is_deleted=False).exists():
            return error("Tên raster đã tồn tại. Hãy chọn Sửa dữ liệu raster.", 409)
    except DatabaseError:
        return error("Không thể kiểm tra metadata raster trong PostgreSQL.", 500)
    replace_existing = raster_name is not None
    try:
        publish_raster(workspace, metadata["name"], upload, replace=replace_existing)
    except RuntimeError as exc:
        logger.exception("Không thể publish raster %s", metadata["name"])
        return error(str(exc), 502)  # GeoServer lỗi thì trả 502
    try:
        raster, _ = RasterMetadata.objects.update_or_create(
            name=metadata["name"],  # Tìm raster theo name
            defaults={**metadata, "source_filename": upload.name[:255]},  # Có rồi thì update, chưa có thì create
        )
    except DatabaseError:
        logger.exception("Đã publish nhưng không lưu được metadata raster %s", metadata["name"])
        return error("Đã publish GeoServer nhưng không lưu được metadata vào PostgreSQL.", 500)
    return success("Đã publish raster và lưu metadata.", raster=serialize(raster))  # Trả raster vừa thêm về frontend


@csrf_protect
def delete_raster(request, raster_name):
    if request.method != "DELETE":
        return error("Chỉ hỗ trợ phương thức DELETE.", 405)  # Xóa phải dùng DELETE
    if name_error := validate_name(raster_name):
        return error(name_error)  # Kiểm tra tên raster
    workspace = geoserver_setting("GEOSERVER_WORKSPACE", "webgis")  # Workspace chứa raster
    try:
        store_name = raster_store(workspace, raster_name)
        if store_name:
            store_path = f"workspaces/{workspace}/coveragestores/{store_name}"
            coverages = geoserver_json(f"{store_path}/coverages.json").get("coverages", {}) or {}
            items = coverages.get("coverage", [])
            if isinstance(items, dict):
                items = [items]
            # Store có nhiều coverage: chỉ gỡ raster được chọn.
            target = f"{store_path}/coverages/{raster_name}" if len(items) > 1 else store_path
            geoserver_request(f"{target}?recurse=true", method="DELETE", allow_not_found=True)
    except RuntimeError as exc:
        logger.exception("Không thể xóa raster %s", raster_name)
        return error(str(exc), 502)
    try:
        RasterMetadata.objects.update_or_create(name=raster_name, defaults={"title": raster_name, "is_deleted": True})  # Xóa metadata raster trong PostgreSQL
    except DatabaseError:
        logger.exception("Đã gỡ GeoServer nhưng không xóa được metadata %s", raster_name)
        return error("Đã gỡ GeoServer nhưng không xóa được metadata PostgreSQL.", 500)
    return success("Đã xóa raster và metadata.", raster_id=raster_name)  # Báo frontend xóa thành công
