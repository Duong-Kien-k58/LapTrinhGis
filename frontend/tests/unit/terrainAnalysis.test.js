import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import { samplePath, sampleHeights, pathStatistics, areaMesh, meshArea } from '../../src/tool/cesiumTool.js';

const point = (lon, lat, height = 0) => Cesium.Cartographic.fromDegrees(lon, lat, height);

test('lấy mẫu qua mọi đỉnh, giữ khoảng cách tăng dần và giới hạn số mẫu', () => {
  const vertices = [point(104, 21), point(104.1, 21.1), point(105, 22)];
  const path = samplePath(vertices, 20, 4096);
  assert.ok(path.positions.length <= 4096);
  assert.ok(path.positions.some(sample => Math.abs(sample.longitude - vertices[1].longitude) < 1e-12));
  assert.ok(path.distances.every((value, index) => !index || value > path.distances[index - 1]));
  assert.ok(Cesium.Cartographic.equalsEpsilon(path.positions.at(-1), vertices.at(-1), 1e-12));
  assert.equal(path.distances.length, path.positions.length);
});

test('đo 3D cộng đúng chiều dài theo độ dốc, lên và xuống', () => {
  const positions = [point(105, 21, 0), point(105.001, 21, 100), point(105.002, 21, 0)];
  const stats = pathStatistics(positions, [0, 100, 200]);
  assert.ok(Math.abs(stats.length3D - 200 * Math.SQRT2) < 1e-9);
  assert.equal(stats.horizontal, 200);
  assert.equal(stats.ascent, 100);
  assert.equal(stats.descent, 100);
  assert.equal(stats.min, 0);
  assert.equal(stats.max, 100);
});

test('lưới diện tích phẳng và dốc 45° khớp kết quả giải tích', () => {
  const origin = Cesium.Cartesian3.fromDegrees(105, 21);
  const frame = Cesium.Transforms.eastNorthUpToFixedFrame(origin);
  const inverse = Cesium.Matrix4.inverseTransformation(frame, new Cesium.Matrix4());
  const vertices = [[0, 0], [100, 0], [100, 100], [0, 100]].map(([x, y]) =>
    Cesium.Cartographic.fromCartesian(Cesium.Matrix4.multiplyByPoint(frame, new Cesium.Cartesian3(x, y, 0), new Cesium.Cartesian3())));
  const mesh = areaMesh(vertices);
  mesh.positions.forEach(sample => { sample.height = 0; });
  const flat = meshArea(mesh.positions, mesh.indices);
  assert.ok(Math.abs(flat - 10000) < 5, `flat=${flat}`);
  const slope = mesh.positions.map(sample => {
    const clone = Cesium.Cartographic.clone(sample);
    const local = Cesium.Matrix4.multiplyByPoint(inverse, Cesium.Cartographic.toCartesian(sample), new Cesium.Cartesian3());
    clone.height = local.x;
    return clone;
  });
  const sloped = meshArea(slope, mesh.indices);
  assert.ok(Math.abs(sloped / flat - Math.SQRT2) < .001, `ratio=${sloped / flat}`);
});

test('từ chối tuyến quá ngắn, vùng tự cắt và vùng quá rộng', () => {
  assert.throws(() => samplePath([point(105, 21), point(105, 21)]), /quá ngắn/);
  assert.throws(() => areaMesh([point(105, 21), point(105.01, 21.01), point(105, 21.01), point(105.01, 21)]), /tự cắt/);
  assert.throws(() => areaMesh([point(100, 10), point(110, 10), point(110, 20)]), /quá rộng/);
});

test('không giả lập cao độ 0 khi thiếu địa hình', async () => {
  await assert.rejects(() => sampleHeights(undefined, [point(105, 21)]), /chưa sẵn sàng/);
});
