import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/config/projections.js';
import { transform, transformExtent, get } from '../node_modules/ol/proj.js';

test('hai múi UTM của DEM hỗ trợ tọa độ, phạm vi và chuyển đổi khứ hồi', () => {
  for (const [code, longitude] of [['EPSG:32648', 105], ['EPSG:32649', 111]]) {
    assert.equal(get(code).getUnits(), 'm');
    const original = [longitude, 15];
    const utm = transform(original, 'EPSG:4326', code);
    assert.ok(Math.abs(utm[0] - 500000) < 0.001);
    const restored = transform(utm, code, 'EPSG:4326');
    assert.ok(Math.abs(restored[0] - original[0]) < 1e-7);
    assert.ok(Math.abs(restored[1] - original[1]) < 1e-7);
    const bounds = transformExtent([utm[0] - 100, utm[1] - 100, utm[0] + 100, utm[1] + 100], code, 'EPSG:3857');
    assert.ok(bounds.every(Number.isFinite));
    assert.ok(bounds[0] < bounds[2] && bounds[1] < bounds[3]);
  }
});
