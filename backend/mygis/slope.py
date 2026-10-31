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
        result = np.full(elevation.shape, nodata, dtype=np.float32)
        if min(elevation.shape) < 3:
            return result
        available = np.isfinite(elevation) & (elevation != nodata)
        neighbors = [available[dy:available.shape[0] - 2 + dy, dx:available.shape[1] - 2 + dx]
                     for dy in range(3) for dx in range(3) if (dy, dx) != (1, 1)]
        eligible = available[1:-1, 1:-1] & (np.sum(neighbors, axis=0) >= 7)
        if not eligible.any():
            return result
        z = np.where(available, elevation, 0).astype(np.float64)

        def weighted(cells):
            total = np.zeros(eligible.shape, dtype=np.float64)
            weight = np.zeros(eligible.shape, dtype=np.float64)
            for dy, dx, factor in cells:
                window = (slice(dy, z.shape[0] - 2 + dy), slice(dx, z.shape[1] - 2 + dx))
                total += z[window] * factor
                weight += available[window] * factor
            return np.divide(total * 4, weight, out=np.zeros_like(total), where=weight > 0)

        east = weighted([(0, 2, 1), (1, 2, 2), (2, 2, 1)])
        west = weighted([(0, 0, 1), (1, 0, 2), (2, 0, 1)])
        south = weighted([(2, 0, 1), (2, 1, 2), (2, 2, 1)])
        north = weighted([(0, 0, 1), (0, 1, 2), (0, 2, 1)])
        dx = (east - west) / (8 * abs(transform[1]))
        dy = (south - north) / (8 * abs(transform[5]))
        gradient = np.hypot(dx, dy)
        values = gradient * 100 if self.unit == 'percent' else np.degrees(np.arctan(gradient))
        result[1:-1, 1:-1] = np.where(eligible, values, nodata).astype(np.float32)
        return result

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
        return {'method': 'Horn 3×3, hiệu chỉnh trọng số khi thiếu một ô lân cận', 'unit': self.unit}

    def metadata(self, title):
        return {'METHOD': 'Horn 3x3', 'SLOPE_UNIT': self.unit, 'SOURCE_TITLE': title,
                'NODATA_POLICY': 'valid center and >=7 valid neighbors; weighted sides; outer edge NoData; AOI mask applied after slope'}


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
