import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from '../node_modules/cesium/Source/Cesium.js';
import LayerGroup from '../node_modules/ol/layer/Group.js';
import TileLayer from '../node_modules/ol/layer/Tile.js';
import View from '../node_modules/ol/View.js';
import { withCurrentLayerParents, applyStartupCamera, smoothEffectStrength } from '../src/tool/cesiumTool.js';
import { STARTUP_3D_VIEW } from '../src/config/layers.js';
import { toLonLat } from '../node_modules/ol/proj.js';

globalThis.Cesium = Cesium;
const { default: RasterSynchronizer } = await import('../node_modules/olcs/lib/olcs/RasterSynchronizer.js');

test('effect transitions increase/decrease monotonically without overshooting', () => {
  let value = 0;
  for (let frame = 0; frame < 60; frame++) {
    const next = smoothEffectStrength(value, 1, 1 / 60);
    assert.ok(next >= value && next <= 1);
    value = next;
  }
  assert.equal(value, 1);
  for (let frame = 0; frame < 60; frame++) {
    const next = smoothEffectStrength(value, 0.1, 1 / 60);
    assert.ok(next <= value && next >= 0.1);
    value = next;
  }
  assert.equal(value, 0.1);
});

test('effect smoothing is frame-rate independent and zero stops immediately', () => {
  const simulate = fps => {
    let value = 0;
    for (let frame = 0; frame < fps / 5; frame++) value = smoothEffectStrength(value, 1, 1 / fps);
    return value;
  };
  assert.ok(Math.abs(simulate(30) - simulate(60)) < 1e-12);
  assert.equal(smoothEffectStrength(0.9, 0, 0), 0);
  const afterStall = smoothEffectStrength(0, 1, 10);
  assert.ok(afterStall > 0 && afterStall < 1);
});

test('opening camera replaces an old saved view with the configured Indochina view', () => {
  const view = new View({ center: [0, 0], zoom: 18, rotation: 1 });
  const applied = {};
  const camera = { heading: 0, pitch: -0.6, setView: state => { applied.orientation = state.orientation; } };
  const bridge = {
    getCamera: () => ({ setTilt: value => { applied.tilt = value; }, setDistance: value => { applied.distance = value; } }),
    getCesiumScene: () => ({ camera, requestRender() {} })
  };
  applyStartupCamera(bridge, { getView: () => view });
  toLonLat(view.getCenter()).forEach((value, index) => assert.ok(Math.abs(value - STARTUP_3D_VIEW.center[index]) < 1e-8));
  assert.equal(applied.tilt, Cesium.Math.toRadians(STARTUP_3D_VIEW.tilt));
  assert.equal(applied.distance, STARTUP_3D_VIEW.distance);
  assert.equal(applied.orientation.roll, 0);
  assert.equal(view.getRotation(), 0);
});

// Chạy chính listener và vòng đời của OL-Cesium; chỉ thay tile/WebGL bằng
// counterpart nhẹ để kiểm tra độc lập với mạng và GeoServer.
function fixture(patched = true) {
  const layer = new TileLayer();
  const first = new LayerGroup({ layers: [layer] });
  const second = new LayerGroup({ layers: [] });
  const root = new LayerGroup({ layers: [first, second] });
  const map = { getLayerGroup: () => root, getView: () => new View() };
  const counterparts = new Map();
  const images = [];
  const collection = {
    indexOf: image => images.indexOf(image),
    add(image, index = images.length) { images.splice(index, 0, image); },
    remove(image) { const index = images.indexOf(image); if (index >= 0) images.splice(index, 1); },
    raiseToTop() {},
  };
  const Base = patched ? withCurrentLayerParents(RasterSynchronizer) : RasterSynchronizer;
  class TestSynchronizer extends Base {
    convertLayerToCesiumImageries(olLayer) {
      if (olLayer instanceof LayerGroup) return null;
      const image = { show: true, alpha: 1, destroy() {} };
      counterparts.set(olLayer, image);
      return [image];
    }
    addCesiumObject(image) { collection.add(image); }
    removeSingleCesiumObject(image) { collection.remove(image); }
    removeAllCesiumObjects() { images.splice(0); }
  }
  const synchronizer = new TestSynchronizer(map, { imageryLayers: collection, requestRender() {} });
  synchronizer.synchronize();
  return { layer, first, second, root, images, image: () => counterparts.get(layer), synchronizer };
}

test('tái hiện lỗi gốc: lớp được thêm lại mất liên kết nhóm cha', () => {
  const state = fixture(false);
  state.first.getLayers().clear();
  state.first.getLayers().push(state.layer);
  state.first.setVisible(false);
  assert.equal(state.image().show, true);
  state.synchronizer.destroyAll();
});

test('khôi phục TOC rồi tắt/bật nhóm cập nhật đúng lớp Cesium', () => {
  const state = fixture();
  state.root.getLayers().clear();
  state.root.getLayers().extend([state.first, state.second]);
  state.first.getLayers().clear();
  state.first.getLayers().push(state.layer);
  state.first.setVisible(false);
  assert.equal(state.image().show, false);
  state.first.setVisible(true);
  assert.equal(state.image().show, true);
  state.layer.setVisible(false);
  assert.equal(state.image().show, false);
  state.first.setVisible(false);
  state.first.setVisible(true);
  assert.equal(state.image().show, false, 'nhóm không tự bật lại lớp con đã tắt');
  state.synchronizer.destroyAll();
});

test('chuyển nhóm tuân theo nhóm mới, không còn nghe nhóm cũ', () => {
  const state = fixture();
  state.second.setVisible(false);
  state.first.getLayers().remove(state.layer);
  state.second.getLayers().push(state.layer);
  assert.equal(state.image().show, false);
  state.second.setVisible(true);
  assert.equal(state.image().show, true);
  state.first.setVisible(false);
  assert.equal(state.image().show, true);
  state.second.setOpacity(.4);
  state.layer.setOpacity(.5);
  assert.equal(state.image().alpha, .2);
  assert.equal(state.images.length, 1, 'không để lại ảnh trùng sau khi chuyển nhóm');
  state.synchronizer.destroyAll();
});

test('nhóm lồng nhau đồng bộ, root bị OL-Cesium ẩn không làm trắng bản đồ 3D', () => {
  const state = fixture();
  const nested = new LayerGroup({ layers: [] });
  state.second.getLayers().push(nested);
  state.first.getLayers().remove(state.layer);
  nested.getLayers().push(state.layer);
  state.second.setVisible(false);
  assert.equal(state.image().show, false);
  state.second.setVisible(true);
  assert.equal(state.image().show, true);
  state.root.setVisible(false);
  assert.equal(state.image().show, true, 'root chỉ dùng để dừng bản đồ 2D');
  nested.setVisible(false);
  assert.equal(state.image().show, false);
  nested.setVisible(true);
  assert.equal(state.image().show, true);
  state.root.setVisible(true);
  assert.equal(state.image().show, true);
  state.synchronizer.destroyAll();
});
