import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from '../node_modules/cesium/Source/Cesium.js';
import { createSlopeImageryProvider } from '../src/tool/terrainAnalysisTool.js';

test('ảnh độ dốc 3D giữ nguyên khung EPSG:3857 và vị trí vĩ độ', async () => {
  const extent = [11786392.361576676, 2387252.427018025, 11915385.805612855, 2466950.4509264063];
  const image = { width: 1536, height: 949 };
  const provider = createSlopeImageryProvider(image, extent);
  assert.ok(provider.tilingScheme.projection instanceof Cesium.WebMercatorProjection);
  const native = provider.tilingScheme.tileXYToNativeRectangle(0, 0, 0);
  [native.west, native.south, native.east, native.north].forEach((value, i) =>
    assert.ok(Math.abs(value - extent[i]) < 1e-6));
  const projection = new Cesium.WebMercatorProjection();
  const northeast = projection.unproject(new Cesium.Cartesian3(extent[2], extent[3], 0));
  assert.ok(Math.abs(provider.rectangle.north - northeast.latitude) < 1e-12);
  assert.ok(Math.abs(provider.rectangle.east - northeast.longitude) < 1e-12);
  assert.equal(await provider.requestImage(0, 0, 0), image);
});

test('ảnh phân lớp dùng đúng kích thước và giữ kênh trong suốt NoData', () => {
  const provider = createSlopeImageryProvider({ width: 800, height: 600 }, [1, 2, 3, 4]);
  assert.equal(provider.tileWidth, 800);
  assert.equal(provider.tileHeight, 600);
  assert.equal(provider.hasAlphaChannel, true);
  assert.equal(provider.maximumLevel, 0);
  assert.equal(provider.tilingScheme.getNumberOfXTilesAtLevel(0), 1);
  assert.equal(provider.tilingScheme.getNumberOfYTilesAtLevel(0), 1);
});

test('không phủ ảnh 3D khi ảnh hoặc phạm vi không hợp lệ', () => {
  for (const extent of [[1, 2, 0, 4], [1, 4, 3, 2], [1, NaN, 3, 4], [1, 2, 3]]) {
    assert.throws(() => createSlopeImageryProvider({ width: 10, height: 10 }, extent));
  }
  assert.throws(() => createSlopeImageryProvider({ width: 0, height: 10 }, [1, 2, 3, 4]));
});
