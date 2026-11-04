import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectSlopeRegion } from '../src/tool/terrainAnalysisTool.js';

const grid = { bbox: [500000, 1800000, 501000, 1801000], width: 100, height: 100 };
const ring = coordinates => [...coordinates, coordinates[0]];

test('toàn bộ DEM 10 m cho đúng số ô và giữ tọa độ UTM lớn', () => {
  const result = inspectSlopeRegion(ring([[500000, 1800000], [501000, 1800000], [501000, 1801000], [500000, 1801000]]), grid);
  assert.equal(result.cells, 10000);
  assert.equal(result.windowCells, 10000);
  assert.equal(result.partial, false);
});

test('vùng giao một phần chỉ ước tính phần bên trong DEM', () => {
  const result = inspectSlopeRegion(ring([[499900, 1800000], [500100, 1800000], [500100, 1800100], [499900, 1800100]]), grid);
  assert.equal(result.cells, 100);
  assert.equal(result.windowCells, 100);
  assert.equal(result.partial, true);
  assert.ok(result.clippedRing.every(([x, y]) => x >= grid.bbox[0] && y >= grid.bbox[1]));
});

test('từ chối vùng ngoài DEM, vùng chỉ chạm biên và vùng tự cắt', () => {
  assert.throws(() => inspectSlopeRegion(ring([[499000,1800000],[499100,1800000],[499100,1800100]]),grid), /không giao/);
  assert.throws(() => inspectSlopeRegion(ring([[499900,1800000],[500000,1800000],[500000,1800100],[499900,1800100]]),grid), /không giao/);
  assert.throws(() => inspectSlopeRegion(ring([[500000,1800000],[501000,1801000],[501000,1800000],[500000,1801000]]),grid), /tự cắt/);
});

test('đa giác lõm hợp lệ và cửa sổ xử lý bao gồm cả phần ngoài đa giác', () => {
  const result = inspectSlopeRegion(ring([[500000,1800000],[500100,1800000],[500100,1800050],[500050,1800050],[500050,1800100],[500000,1800100]]),grid);
  assert.equal(result.cells,75);
  assert.equal(result.windowCells,100);
});

test('không nhận lưới thiếu metadata hoặc đa giác suy biến', () => {
  assert.throws(() => inspectSlopeRegion(ring([[500000,1800000],[500100,1800000],[500000,1800100]]), {}), /thông tin lưới/);
  assert.throws(() => inspectSlopeRegion(ring([[500000,1800000],[500100,1800000],[500200,1800000]]),grid), /không có diện tích/);
  assert.throws(() => inspectSlopeRegion(ring([[NaN,1800000],[500100,1800000],[500000,1800100]]),grid), /đỉnh hợp lệ/);
});
