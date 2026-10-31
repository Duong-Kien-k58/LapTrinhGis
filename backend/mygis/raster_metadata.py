"""Read the actual raster grid without scanning elevation pixels (GDAL worker)."""
import math


def read_raster_grid(path):
    from osgeo import gdal, osr
    gdal.UseExceptions()
    dataset = gdal.OpenEx(str(path), gdal.OF_RASTER | gdal.OF_READONLY, allowed_drivers=['GTiff'])
    crs = dataset.GetSpatialRef()
    transform = dataset.GetGeoTransform(can_return_null=True)
    if crs is None or transform is None or not gdal.InvGeoTransform(transform):
        raise ValueError('Raster thiếu hệ tọa độ hoặc thông tin vị trí. Cập nhật tệp trước khi phân tích.')
    crs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    wgs = osr.SpatialReference()
    wgs.ImportFromEPSG(4326)
    wgs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    corners = [gdal.ApplyGeoTransform(transform, x, y) for x, y in
               [(0, 0), (dataset.RasterXSize, 0), (dataset.RasterXSize, dataset.RasterYSize), (0, dataset.RasterYSize)]]
    bbox = [min(p[0] for p in corners), min(p[1] for p in corners), max(p[0] for p in corners), max(p[1] for p in corners)]
    geographic = list(osr.CoordinateTransformation(crs, wgs).TransformBounds(*bbox, 21))
    if not all(math.isfinite(v) for v in geographic):
        raise ValueError('Không xác định được vị trí raster trên bản đồ.')
    code = crs.GetAuthorityCode(None)
    band = dataset.GetRasterBand(1)
    nodata = band.GetNoDataValue()
    raw_unit = (band.GetUnitType() or '').lower()
    unit = 'm' if raw_unit in {'m', 'meter', 'metre', 'meters', 'metres'} else ('ft' if raw_unit in {'ft', 'foot', 'feet'} else None)
    return {'crs': f'EPSG:{code}' if code else crs.GetName(), 'crs_wkt': crs.ExportToWkt(),
            'bbox': bbox, 'bbox_wgs84': geographic, 'width': dataset.RasterXSize, 'height': dataset.RasterYSize,
            'band_count': dataset.RasterCount, 'band': 1, 'presentation_type': 'raster', 'elevation_unit': unit,
            'resolution_x': math.hypot(transform[1], transform[4]), 'resolution_y': math.hypot(transform[2], transform[5]),
            'horizontal_unit': 'degree' if crs.IsGeographic() else crs.GetLinearUnitsName(),
            'no_data': nodata if nodata is None or math.isfinite(nodata) else str(nodata)}
