import json
import logging

from django.db import DatabaseError, connection
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt


logger = logging.getLogger(__name__)

SRID = 4326

# Chỉ các bảng và trường được khai báo tại đây mới có thể được CRUD.
# geometry_type là kiểu geometry chuẩn đang lưu trong PostGIS.
LAYER_CONFIG = {
    'ub_tinh': {
        'table': 'ub_tinh',
        'id_field': 'gid',
        'geom_field': 'geom',
        'geometry_type': 'Point',
        'fields': ['ten', 'caphc', 'tinh'],
    },
    'tinhlo': {
        'table': 'tinhlo',
        'id_field': 'gid',
        'geom_field': 'geom',
        'geometry_type': 'MultiLineString',
        'fields': ['tenduong', 'loaiduong', 'tdg'],
    },
    'vn_tinh': {
        'table': 'vn_tinh',
        'id_field': 'gid',
        'geom_field': 'geom',
        'geometry_type': 'MultiPolygon',
        'fields': [
            'ma_tinh',
            'ten_tinh',
            'sap_nhap',
            'quy_mo',
            'tru_so',
            'loai',
        ],
    },
    'vn_xa': {
        'table': 'vn_xa',
        'id_field': 'gid',
        'geom_field': 'geom',
        'geometry_type': 'MultiPolygon',
        'fields': [
            'ma_xa',
            'ten_xa',
            'sap_nhap',
            'tru_so',
            'loai',
            'ma_tinh',
            'ten_tinh',
        ],
    },
    'qlo': {
        'table': 'qlo',
        'id_field': 'gid',
        'geom_field': 'geom',
        'geometry_type': 'MultiLineString',
        'fields': ['bientap', 'td'],
    },
    'nenbien': {
        'table': 'nenbien',
        'id_field': 'gid',
        'geom_field': 'geom',
        'geometry_type': 'MultiPolygon',
        'fields': ['dosau'],
    },
    'nuocngoai': {
        'table': 'nuocngoai',
        'id_field': 'gid',
        'geom_field': 'geom',
        'geometry_type': 'MultiPolygon',
        'fields': ['ten'],
    },
}


ALLOWED_INPUT_GEOMETRIES = {
    'Point': {'Point'},
    'MultiLineString': {'LineString', 'MultiLineString'},
    'MultiPolygon': {'Polygon', 'MultiPolygon'},
}


def get_layer_config(layer_name):
    return LAYER_CONFIG.get(layer_name)


def json_error(message, status=400):
    return JsonResponse(
        {
            'success': False,
            'message': message,
        },
        status=status,
    )


def json_success(message, data=None):
    result = {
        'success': True,
        'message': message,
    }

    if data is not None:
        result.update(data)

    return JsonResponse(result)


def parse_request_data(request):
    try:
        data = json.loads(request.body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None, json_error('Dữ liệu JSON không hợp lệ', 400)

    if not isinstance(data, dict):
        return None, json_error('Nội dung yêu cầu phải là một đối tượng JSON', 400)

    properties = data.get('properties', {})
    if properties is None:
        properties = {}
    if not isinstance(properties, dict):
        return None, json_error('properties phải là một đối tượng JSON', 400)

    geometry = data.get('geometry')
    if geometry is not None and not isinstance(geometry, dict):
        return None, json_error('geometry phải là một đối tượng GeoJSON', 400)

    return {
        'properties': properties,
        'geometry': geometry,
    }, None


def validate_geometry(geometry, config, required=False):
    if geometry is None:
        if required:
            return 'Thiếu geometry'
        return None

    geometry_type = geometry.get('type')
    coordinates = geometry.get('coordinates')

    if not geometry_type or coordinates is None:
        return 'GeoJSON geometry thiếu type hoặc coordinates'

    expected_type = config['geometry_type']
    allowed_types = ALLOWED_INPUT_GEOMETRIES[expected_type]

    if geometry_type not in allowed_types:
        allowed_text = ', '.join(sorted(allowed_types))
        return (
            f'Geometry của lớp {config["table"]} phải có kiểu: '
            f'{allowed_text}; nhận được: {geometry_type}'
        )

    return None


def get_geometry_sql(config):
    """Tạo geometry 2D, SRID 4326 và đúng kiểu cột PostGIS."""
    base_sql = (
        f'ST_Force2D('
        f'ST_SetSRID(ST_GeomFromGeoJSON(%s), {SRID})'
        f')'
    )

    geometry_type = config['geometry_type']

    if geometry_type == 'MultiPolygon':
        # ST_MakeValid sửa polygon tự cắt; CollectionExtract chỉ giữ phần vùng.
        return (
            f'ST_Multi('
            f'ST_CollectionExtract(ST_MakeValid({base_sql}), 3)'
            f')'
        )

    if geometry_type == 'MultiLineString':
        return f'ST_Multi({base_sql})'

    return base_sql


def get_allowed_property_values(properties, config):
    field_names = []
    field_values = []

    for field in config['fields']:
        if field in properties:
            field_names.append(field)
            field_values.append(properties[field])

    return field_names, field_values


@csrf_exempt
def add_feature(request, layer_name):
    if request.method != 'POST':
        return json_error('Chỉ chấp nhận phương thức POST', 405)

    config = get_layer_config(layer_name)
    if config is None:
        return json_error('Lớp dữ liệu không tồn tại', 404)

    data, error_response = parse_request_data(request)
    if error_response is not None:
        return error_response

    properties = data['properties']
    geometry = data['geometry']

    geometry_error = validate_geometry(geometry, config, required=True)
    if geometry_error:
        return json_error(geometry_error, 400)

    table = config['table']
    id_field = config['id_field']
    geom_field = config['geom_field']

    field_names, field_values = get_allowed_property_values(properties, config)
    columns_sql = ', '.join([*field_names, geom_field])
    values_sql = ', '.join([
        *(['%s'] * len(field_values)),
        get_geometry_sql(config),
    ])
    params = [*field_values, json.dumps(geometry)]

    sql = f'''
        INSERT INTO {table} ({columns_sql})
        VALUES ({values_sql})
        RETURNING {id_field}
    '''

    try:
        with connection.cursor() as cursor:
            cursor.execute(sql, params)
            new_id = cursor.fetchone()[0]
    except DatabaseError:
        logger.exception('Không thể thêm feature vào lớp %s', layer_name)
        return json_error('Không thể thêm đối tượng vào cơ sở dữ liệu', 500)

    return json_success(
        'Thêm đối tượng thành công',
        {'id': new_id},
    )


@csrf_exempt
def edit_feature(request, layer_name, feature_id):
    if request.method != 'PUT':
        return json_error('Chỉ chấp nhận phương thức PUT', 405)

    config = get_layer_config(layer_name)
    if config is None:
        return json_error('Lớp dữ liệu không tồn tại', 404)

    data, error_response = parse_request_data(request)
    if error_response is not None:
        return error_response

    properties = data['properties']
    geometry = data['geometry']

    geometry_error = validate_geometry(geometry, config)
    if geometry_error:
        return json_error(geometry_error, 400)

    table = config['table']
    id_field = config['id_field']
    geom_field = config['geom_field']

    field_names, field_values = get_allowed_property_values(properties, config)
    set_parts = [f'{field} = %s' for field in field_names]
    params = list(field_values)

    if geometry is not None:
        set_parts.append(f'{geom_field} = {get_geometry_sql(config)}')
        params.append(json.dumps(geometry))

    if not set_parts:
        return json_error('Không có dữ liệu để sửa', 400)

    params.append(feature_id)
    set_sql = ', '.join(set_parts)

    sql = f'''
        UPDATE {table}
        SET {set_sql}
        WHERE {id_field} = %s
    '''

    try:
        with connection.cursor() as cursor:
            cursor.execute(sql, params)
            if cursor.rowcount == 0:
                return json_error('Không tìm thấy đối tượng cần sửa', 404)
    except DatabaseError:
        logger.exception(
            'Không thể sửa feature %s của lớp %s',
            feature_id,
            layer_name,
        )
        return json_error('Không thể sửa đối tượng trong cơ sở dữ liệu', 500)

    return json_success(
        'Sửa đối tượng thành công',
        {'id': feature_id},
    )


@csrf_exempt
def delete_feature(request, layer_name, feature_id):
    if request.method != 'DELETE':
        return json_error('Chỉ chấp nhận phương thức DELETE', 405)

    config = get_layer_config(layer_name)
    if config is None:
        return json_error('Lớp dữ liệu không tồn tại', 404)

    table = config['table']
    id_field = config['id_field']

    sql = f'''
        DELETE FROM {table}
        WHERE {id_field} = %s
    '''

    try:
        with connection.cursor() as cursor:
            cursor.execute(sql, [feature_id])
            if cursor.rowcount == 0:
                return json_error('Không tìm thấy đối tượng cần xóa', 404)
    except DatabaseError:
        logger.exception(
            'Không thể xóa feature %s của lớp %s',
            feature_id,
            layer_name,
        )
        return json_error('Không thể xóa đối tượng khỏi cơ sở dữ liệu', 500)

    return json_success(
        'Xóa đối tượng thành công',
        {'id': feature_id},
    )
