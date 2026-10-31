"""Aspect-only ArcMap planar calculation, circular statistics and TXT report."""
import math

COLORS = ['#bdbdbd', '#ff0000', '#ff9900', '#ffff00', '#00cc00', '#00cccc', '#0099ff', '#6633cc', '#ff66cc']
NAMES = ['Bằng phẳng', 'Bắc', 'Đông Bắc', 'Đông', 'Đông Nam', 'Nam', 'Tây Nam', 'Tây', 'Tây Bắc']


def aspect_class_indices(values):
    import numpy as np
    indices = (np.floor((np.mod(values, 360) + 22.5) / 45).astype(np.int32) % 8) + 1
    return np.where(values == -1, 0, indices)


def planar_aspect(elevation, nodata, resolution):
    """ArcMap planar weighted 3x3: valid center + >=7 neighbors; clockwise from north.

    Reference: desktop.arcgis.com/en/arcmap/latest/tools/spatial-analyst-toolbox/how-aspect-works.htm
    Halo edges stay NoData. Flat terrain is -1, distinct from missing data.
    """
    import numpy as np
    result = np.full(elevation.shape, nodata, dtype=np.float32)
    if min(elevation.shape) < 3:
        return result
    valid = np.isfinite(elevation) & (elevation != nodata)
    z = np.where(valid, elevation, 0).astype(np.float64)
    neighbors = [valid[dy:valid.shape[0] - 2 + dy, dx:valid.shape[1] - 2 + dx]
                 for dy in range(3) for dx in range(3) if (dy, dx) != (1, 1)]
    eligible = valid[1:-1, 1:-1] & (np.sum(neighbors, axis=0) >= 7)
    if not eligible.any():
        return result

    def weighted(cells):
        total = np.zeros(eligible.shape, dtype=np.float64)
        weight = np.zeros(eligible.shape, dtype=np.float64)
        for dy, dx, factor in cells:
            window = (slice(dy, z.shape[0] - 2 + dy), slice(dx, z.shape[1] - 2 + dx))
            total += z[window] * factor
            weight += valid[window] * factor
        return np.divide(total * 4, weight, out=np.zeros_like(total), where=weight > 0)

    east = weighted([(0, 2, 1), (1, 2, 2), (2, 2, 1)])
    west = weighted([(0, 0, 1), (1, 0, 2), (2, 0, 1)])
    south = weighted([(2, 0, 1), (2, 1, 2), (2, 2, 1)])
    north = weighted([(0, 0, 1), (0, 1, 2), (0, 2, 1)])
    dx = (east - west) / (8 * resolution[0])
    dy = (south - north) / (8 * resolution[1])
    angles = np.mod(90 - np.degrees(np.arctan2(dy, -dx)), 360)
    angles[(dx == 0) & (dy == 0)] = -1
    result[1:-1, 1:-1] = np.where(eligible, angles, nodata).astype(np.float32)
    # Rounding to Float32 can turn a bearing just below 360 into 360.
    result[result == 360] = 0
    return result


class AspectAnalysis:
    name = 'hướng dốc'
    colors = COLORS

    def __init__(self, unit):
        import numpy as np
        if unit != 'degree':
            raise ValueError('Hướng dốc chỉ sử dụng đơn vị độ (°).')
        self.unit = unit
        self.histogram = np.zeros(len(self.colors), dtype=np.int64)
        self.bearing_sin = self.bearing_cos = 0.0
        self.directional_count = 0

    def calculate_block(self, elevation, nodata, transform, projection):
        return planar_aspect(elevation, nodata, (abs(transform[1]), abs(transform[5])))

    def class_indices(self, values):
        return aspect_class_indices(values)

    def accumulate(self, values):
        import numpy as np
        self.histogram += np.bincount(self.class_indices(values), minlength=len(self.colors))
        directions = values[values >= 0]
        radians = np.deg2rad(directions)
        self.directional_count += int(directions.size)
        self.bearing_sin += float(np.sin(radians).sum())
        self.bearing_cos += float(np.cos(radians).sum())

    def classes(self, count, pixel_area):
        classes = []
        for i, color in enumerate(self.colors):
            lower, upper = (-1, -1) if i == 0 else ((337.5, 22.5) if i == 1 else (22.5 + (i - 2) * 45, 67.5 + (i - 2) * 45))
            label = '-1' if i == 0 else ('337,5°–360° / 0°–<22,5°' if i == 1 else f'{lower:g}°–<{upper:g}°')
            classes.append({'min': lower, 'max': upper, 'name': NAMES[i], 'label': label,
                            'color': color, 'count': int(self.histogram[i]), 'percent': float(self.histogram[i]) / count * 100,
                            'area_m2': int(self.histogram[i]) * pixel_area})
        return classes

    def report_fields(self):
        mean_direction = None
        if self.directional_count and math.hypot(self.bearing_sin, self.bearing_cos) > self.directional_count * 1e-7:
            mean_direction = math.degrees(math.atan2(self.bearing_sin, self.bearing_cos)) % 360
        return {'operation': 'aspect', 'method': 'Aspect planar 3×3 (ArcMap)', 'unit': self.unit, 'mean': None,
                'mean_direction': mean_direction, 'flat_cells': int(self.histogram[0]), 'directional_cells': self.directional_count}

    def metadata(self, title):
        return {'METHOD': 'ArcMap planar weighted 3x3', 'ASPECT_UNIT': 'degree',
                'SOURCE_TITLE': title, 'ASPECT_CONVENTION': 'clockwise from grid north; flat=-1; nodata=-9999',
                'NODATA_POLICY': 'valid center and >=7 valid neighbors; outer edge NoData; AOI after calculation'}


def format_report(report, title):
    mean = report['mean_direction']
    lines = ['BÁO CÁO PHÂN TÍCH HƯỚNG DỐC', f'Dữ liệu đầu vào: {title}',
             'Phương pháp: Aspect planar 3 × 3, trọng số theo ArcMap',
             'Quy ước: Bắc 0°, Đông 90°, Nam 180°, Tây 270°; bằng phẳng -1; NoData -9999.',
             f'Hệ tọa độ: {report["crs"]}',
             f'Kích thước lưới: {report["width"]} cột × {report["height"]} hàng',
             f'Độ phân giải: {report["resolution"][0]:g} × {report["resolution"][1]:g} m', '',
             f'Số ô trong vùng: {report["selected_cells"]}', f'Số ô tính được: {report["valid_cells"]}',
             f'Số ô bị loại: {report["excluded_cells"]}', f'Số ô bằng phẳng: {report["flat_cells"]}',
             f'Diện tích có kết quả: {report["valid_area_m2"]:g} m²',
             'Hướng trung bình vòng (không gồm ô bằng phẳng): ' + (f'{mean:.2f}°' if mean is not None else 'Không xác định'),
             '', 'PHÂN NHÓM HƯỚNG DỐC', 'Hướng | Khoảng góc | Số ô | Tỷ lệ (%) | Diện tích (m²)']
    for item in report['classes']:
        lines.append(f'{item["name"]} | {item["label"]} | {item["count"]} | {item["percent"]:.2f} | {item["area_m2"]:g}')
    return '\n'.join(lines) + '\n'
