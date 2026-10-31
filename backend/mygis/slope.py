"""Slope-only Horn calculation, classification, metadata and TXT report."""
import math

COLORS = ['#38b764', '#a7d46f', '#f5e663', '#f6b44c', '#e87842', '#c94444', '#813b64']
BREAKS = [0, 3, 8, 15, 25, 35, 45, 90]


class SlopeAnalysis:
    name = 'độ dốc'
    colors = COLORS

    def __init__(self, unit):
        import numpy as np
        self.unit = unit
        self.bins = np.array(BREAKS[1:-1], dtype=float)
        if unit == 'percent':
            self.bins = np.tan(np.deg2rad(self.bins)) * 100
        self.histogram = np.zeros(len(COLORS), dtype=np.int64)

    def calculate_block(self, elevation, nodata, transform, projection):
        import numpy as np
        from osgeo import gdal
        available = np.isfinite(elevation) & (elevation != nodata)
        neighborhoods = (available[:-2, :-2] & available[:-2, 1:-1] & available[:-2, 2:] &
                         available[1:-1, :-2] & available[1:-1, 1:-1] & available[1:-1, 2:] &
                         available[2:, :-2] & available[2:, 1:-1] & available[2:, 2:])
        if not neighborhoods.any():
            return None
        tile = gdal.GetDriverByName('MEM').Create('', elevation.shape[1], elevation.shape[0], 1, gdal.GDT_Float32)
        tile.SetGeoTransform(transform)
        tile.SetProjection(projection)
        tile.GetRasterBand(1).SetNoDataValue(nodata)
        tile.GetRasterBand(1).WriteArray(elevation)
        slopes = gdal.DEMProcessing('', tile, 'slope', format='MEM', alg='Horn',
            slopeFormat='percent' if self.unit == 'percent' else 'degree', scale=1.0, computeEdges=False)
        values = slopes.GetRasterBand(1).ReadAsArray()
        slopes = tile = None
        return values

    def class_indices(self, values):
        import numpy as np
        return np.searchsorted(self.bins, values, side='right')

    def accumulate(self, values):
        import numpy as np
        self.histogram += np.bincount(self.class_indices(values), minlength=len(self.colors))

    def classes(self, count, pixel_area):
        classes = []
        for i, color in enumerate(self.colors):
            lower = BREAKS[i] if self.unit == 'degree' else math.tan(math.radians(BREAKS[i])) * 100
            upper = BREAKS[i + 1] if self.unit == 'degree' else (math.tan(math.radians(BREAKS[i + 1])) * 100 if i < len(COLORS) - 1 else None)
            classes.append({'min': lower, 'max': upper, 'color': color, 'count': int(self.histogram[i]),
                            'percent': float(self.histogram[i]) / count * 100, 'area_m2': int(self.histogram[i]) * pixel_area})
        return classes

    def report_fields(self):
        return {'method': 'Horn 3×3', 'unit': self.unit}

    def metadata(self, title):
        return {'METHOD': 'Horn 3x3', 'SLOPE_UNIT': self.unit, 'SOURCE_TITLE': title,
                'NODATA_POLICY': 'strict 3x3 neighborhood; AOI mask applied after slope'}


def format_report(report, title):
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
