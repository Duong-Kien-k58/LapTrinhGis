import json

from django.db import connection
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt

LAYER_CONFIG = {
    'ub_tinh': {
        'table': 'ub_tinh',
        'id_field': 'gid',
        'geom_field': 'geom',
        'fields': ['ten', 'caphc', 'tinh'],
    },

    'tinhlo': {
        'table': 'tinhlo',
        'id_field': 'gid',
        'geom_field': 'geom',
        'fields': ['tenduong', 'loaiduong', 'tdg'],
    },

    'vn_tinh': {
        'table': 'vn_tinh',
        'id_field': 'gid',
        'geom_field': 'geom',
        'fields': ['ma_tinh', 'ten_tinh', 'sap_nhap', 'quy_mo', 'tru_so', 'loai'],
    },

    'vn_xa': {
        'table': 'vn_xa',
        'id_field': 'gid',
        'geom_field': 'geom',
        'fields': ['ma_xa', 'ten_xa', 'sap_nhap', 'tru_so', 'loai', 'ma_tinh', 'ten_tinh'],
    },

    'qlo': {
        'table': 'qlo',
        'id_field': 'gid',
        'geom_field': 'geom',
        'fields': ['bientap', 'td'],
    },

    'nenbien': {
        'table': 'nenbien',
        'id_field': 'gid',
        'geom_field': 'geom',
        'fields': ['dosau'],
    },
}

def get_layer_config(layer_name):
    return LAYER_CONFIG.get(layer_name)


def json_error(message, status=400):
    return JsonResponse({
        'success': False,
        'message': message
    }, status=status)


def json_success(message, data=None):
    result = {
        'success': True,
        'message': message
    }

    if data:
        result.update(data)

    return JsonResponse(result)


@csrf_exempt
def add_feature(request, layer_name):
    if request.method != 'POST':
        return json_error('Chỉ chấp nhận phương thức POST', 405)

    config = get_layer_config(layer_name)

    if not config:
        return json_error('Lớp dữ liệu không tồn tại', 404)

    try:
        data = json.loads(request.body)

        properties = data.get('properties', {})
        geometry = data.get('geometry')

        if not geometry:
            return json_error('Thiếu geometry', 400)

        table = config['table']
        geom_field = config['geom_field']
        allowed_fields = config['fields']

        field_names = []
        field_values = []

        for field in allowed_fields:
            if field in properties:
                field_names.append(field)
                field_values.append(properties.get(field))

        columns_sql = ', '.join(field_names + [geom_field])
        placeholders_sql = ', '.join(['%s'] * len(field_values) + ['ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326)'])

        geometry_json = json.dumps(geometry)
        params = field_values + [geometry_json]

        sql = f"""
            INSERT INTO {table} ({columns_sql})
            VALUES ({placeholders_sql})
            RETURNING {config['id_field']}
        """

        with connection.cursor() as cursor:
            cursor.execute(sql, params)
            new_id = cursor.fetchone()[0]

        return json_success('Thêm đối tượng thành công', {
            'id': new_id
        })

    except Exception as e:
        return json_error(str(e), 500)


@csrf_exempt
def edit_feature(request, layer_name, feature_id):
    if request.method != 'PUT':
        return json_error('Chỉ chấp nhận phương thức PUT', 405)

    config = get_layer_config(layer_name)

    if not config:
        return json_error('Lớp dữ liệu không tồn tại', 404)

    try:
        data = json.loads(request.body)

        properties = data.get('properties', {})
        geometry = data.get('geometry')

        table = config['table']
        id_field = config['id_field']
        geom_field = config['geom_field']
        allowed_fields = config['fields']

        set_parts = []
        params = []

        for field in allowed_fields:
            if field in properties:
                set_parts.append(f'{field} = %s')
                params.append(properties.get(field))

        if geometry:
            set_parts.append(f'{geom_field} = ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326)')
            params.append(json.dumps(geometry))

        if not set_parts:
            return json_error('Không có dữ liệu để sửa', 400)

        params.append(feature_id)

        set_sql = ', '.join(set_parts)

        sql = f"""
            UPDATE {table}
            SET {set_sql}
            WHERE {id_field} = %s
        """

        with connection.cursor() as cursor:
            cursor.execute(sql, params)

            if cursor.rowcount == 0:
                return json_error('Không tìm thấy đối tượng cần sửa', 404)

        return json_success('Sửa đối tượng thành công', {
            'id': feature_id
        })

    except Exception as e:
        return json_error(str(e), 500)


@csrf_exempt
def delete_feature(request, layer_name, feature_id):
    if request.method != 'DELETE':
        return json_error('Chỉ chấp nhận phương thức DELETE', 405)

    config = get_layer_config(layer_name)

    if not config:
        return json_error('Lớp dữ liệu không tồn tại', 404)

    try:
        table = config['table']
        id_field = config['id_field']

        sql = f"""
            DELETE FROM {table}
            WHERE {id_field} = %s
        """

        with connection.cursor() as cursor:
            cursor.execute(sql, [feature_id])

            if cursor.rowcount == 0:
                return json_error('Không tìm thấy đối tượng cần xóa', 404)

        return json_success('Xóa đối tượng thành công', {
            'id': feature_id
        })

    except Exception as e:
        return json_error(str(e), 500)