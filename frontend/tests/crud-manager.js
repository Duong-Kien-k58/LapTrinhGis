// Open /tests/crud-manager.html on the Vite server. All service calls are mocked;
// these checks never modify a real GIS database.
import Map from 'ol/Map.js';
import View from 'ol/View.js';
import Feature from 'ol/Feature.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import Point from 'ol/geom/Point.js';
import Group from 'ol/layer/Group.js';
import TileLayer from 'ol/layer/Tile.js';
import TileWMS from 'ol/source/TileWMS.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import Draw from 'ol/interaction/Draw.js';
import Modify from 'ol/interaction/Modify.js';
import Snap from 'ol/interaction/Snap.js';
import { createCrudManager } from '../src/tool/crudManager.js';

const results = [];
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const tick = () => new Promise(resolve => setTimeout(resolve, 30));
const get = id => document.getElementById(id);
const click = label => {
  const target = [...get('crud-panel').querySelectorAll('button')].find(item => item.textContent === label);
  assert(target && !target.disabled, `Missing/enabled button: ${label}`);
  target.click();
};
const active = Type => map.getInteractions().getArray().find(item => item instanceof Type);
const mapLayer = new TileLayer({ source: new TileWMS({ url: '/mock-wms', params: { LAYERS: 'test' } }) });
const original = new Feature({ geometry: new Point([1000, 2000]), gid: 7, ten: 'Original' });
original.setId('test.7');
const wfsLayer = new VectorLayer({ source: new VectorSource({ features: [original], url: '/mock-wfs', format: new GeoJSON() }) });
const group = new Group({ layers: [mapLayer] });
const map = new Map({ target: 'map', layers: [group], view: new View({ center: [1000, 2000], zoom: 8 }) });
const config = { id: 'test', title: 'Test points', geometryType: 'Point', editable: true,
  attributeTable: true, editFields: [{ name: 'ten', label: 'Tên' }], wmsLayer: mapLayer, wfsLayer };
let refreshCount = 0;
let writes = [];
let failNext = false;
let delayWrite = null;
window.confirm = () => true;
window.fetch = async (url, options = {}) => {
  if (options.method) {
    writes.push({ url: String(url), method: options.method, body: options.body && JSON.parse(options.body) });
    if (delayWrite) await delayWrite;
    if (failNext) {
      failNext = false;
      return new Response(JSON.stringify({ success: false, message: 'Simulated failure' }), { status: 500 });
    }
    return new Response(JSON.stringify({ success: true, id: 7 }));
  }
  return new Response(JSON.stringify({ type: 'FeatureCollection', crs: { properties: { name: 'EPSG:3857' } }, features: [
    { type: 'Feature', id: 'test.7', properties: { gid: 7, ten: 'First' }, geometry: config.geometryType === 'Polygon'
      ? { type: 'MultiPolygon', coordinates: [[[[1000, 2000], [2000, 2000], [2000, 3000], [1000, 2000]]]] }
      : { type: 'Point', coordinates: [1000, 2000] } },
    { type: 'Feature', id: 'test.8', properties: { gid: 8, ten: 'Second' }, geometry: { type: 'Point', coordinates: [1100, 2100] } }
  ] }));
};
const manager = createCrudManager({ map, layerConfigs: [config], onDataChanged: () => refreshCount++ });
async function select(action = 'edit') {
  manager.openChooseLayerPopup(action);
  click('Bắt đầu chọn');
  manager.handleMapClick({ coordinate: [1000, 2000] });
  await tick();
  assert(get('crud-workspace').children.length === 2, 'Overlapping candidates must be listed');
  get('crud-workspace').firstChild.click();
}
async function test(name, fn) {
  await fn();
  results.push(`PASS ${name}`);
  get('results').textContent = results.join('\n');
}
try {
  await test('Cancel drawing removes preview and interactions without writing', async () => {
    manager.openChooseLayerPopup('add');
    click('Bắt đầu vẽ');
    assert(active(Draw) && active(Snap), 'Draw and snap must be active');
    active(Draw).dispatchEvent({ type: 'drawend', feature: new Feature(new Point([500, 600])) });
    assert(get('crud-property-form').elements.ten.value === '', 'New attributes must start empty');
    click('Hủy');
    assert(!active(Draw) && !active(Snap) && writes.length === 0, 'Cancel must not write');
    assert(!manager.getCurrentAction(), 'Cancel must reset action');
  });
  await test('Add sends GeoJSON in EPSG:4326 and refreshes data', async () => {
    manager.openChooseLayerPopup('add');
    click('Bắt đầu vẽ');
    active(Draw).dispatchEvent({ type: 'drawend', feature: new Feature(new Point([111319.490793, 0])) });
    get('crud-property-form').elements.ten.value = 'New';
    click('Lưu thay đổi');
    await tick();
    assert(writes.at(-1).method === 'POST' && writes.at(-1).body.properties.ten === 'New', 'Add request');
    assert(Math.abs(writes.at(-1).body.geometry.coordinates[0] - 1) < 1e-6, 'Projection transform');
    assert(refreshCount === 1, 'Refresh after add');
  });
  await test('Attribute edit omits geometry and preserves source feature', async () => {
    await select();
    click('Sửa thuộc tính');
    get('crud-property-form').elements.ten.value = 'Edited';
    click('Lưu thay đổi');
    await tick();
    assert(writes.at(-1).method === 'PUT' && writes.at(-1).url.endsWith('/test/7/edit/'), 'Edit ID and route');
    assert(!('geometry' in writes.at(-1).body), 'Attribute-only edit must omit geometry');
    assert(original.get('ten') === 'Original', 'Original feature must be untouched');
  });
  await test('Geometry cancel restores WMS filter and original coordinates', async () => {
    mapLayer.getSource().updateParams({ CQL_FILTER: 'gid > 0' });
    await select();
    click('Di chuyển điểm');
    assert(active(Modify) && !active(Snap), 'Point movement must not snap to itself');
    assert(mapLayer.getSource().getParams().CQL_FILTER.includes('gid <> 7'), 'Hide original WMS feature');
    click('Hủy');
    assert(mapLayer.getSource().getParams().CQL_FILTER === 'gid > 0', 'Restore original filter');
    assert(original.getGeometry().getCoordinates()[0] === 1000, 'Keep original geometry');
  });
  await test('Failed geometry save preserves draft for retry; save locks duplicate requests', async () => {
    await select();
    click('Di chuyển điểm');
    const sketch = map.getLayers().getArray().find(layer => layer.getZIndex() === 10000);
    sketch.getSource().getFeatures()[0].getGeometry().setCoordinates([3000, 4000]);
    active(Modify).dispatchEvent({ type: 'modifyend' });
    failNext = true;
    click('Lưu thay đổi');
    await tick();
    assert(get('crud-status').textContent.includes('Simulated failure'), 'Show save failure');
    assert(get('crud-panel').classList.contains('active'), 'Keep draft on failure');
    assert(writes.at(-1).body.geometry, 'Geometry save must include geometry');
    let release;
    delayWrite = new Promise(resolve => { release = resolve; });
    click('Lưu thay đổi');
    const count = writes.length;
    get('crud-actions').firstChild.click();
    manager.cancel();
    assert(writes.length === count && manager.getCurrentAction() === 'edit', 'Lock duplicate/cancel while saving');
    release(); delayWrite = null;
    await tick();
    assert(!manager.getCurrentAction(), 'Successful retry clears draft');
    assert(mapLayer.getSource().getParams().CQL_FILTER === 'gid > 0', 'Restore filter after retry');
  });
  await test('Hidden parent group cancels editing and excludes layer', async () => {
    await select();
    click('Di chuyển điểm');
    group.setVisible(false);
    assert(!active(Modify), 'Hidden layer must stop modifying');
    assert(get('crud-layer').disabled && !get('crud-layer').options.length, 'Exclude hidden layers');
    group.setVisible(true);
    assert(get('crud-layer').options.length === 1, 'Visible layer returns');
    manager.cancel();
  });
  await test('Polygon replacement preserves typed attributes and sends new geometry', async () => {
    config.geometryType = 'Polygon';
    await select();
    click('Sửa hình học');
    assert(active(Modify) && active(Snap), 'Polygon editing must support snapping');
    get('crud-property-form').elements.ten.value = 'Replacement';
    click('Vẽ hình thay thế');
    assert(active(Draw), 'Replacement drawing must start');
    const { default: Polygon } = await import('ol/geom/Polygon.js');
    active(Draw).dispatchEvent({ type: 'drawend', feature: new Feature(new Polygon([[[0, 0], [100, 0], [100, 100], [0, 0]]])) });
    assert(get('crud-property-form').elements.ten.value === 'Replacement', 'Keep attributes during replacement');
    click('Lưu thay đổi');
    await tick();
    assert(writes.at(-1).body.geometry.type === 'Polygon', 'Send replacement geometry');
    assert(writes.at(-1).body.properties.ten === 'Replacement', 'Send preserved attributes');
    config.geometryType = 'Point';
  });
  await test('Delete requires confirmation and uses Django endpoint', async () => {
    await select('delete');
    window.confirm = () => false;
    const count = writes.length;
    click('Xác nhận xóa');
    assert(writes.length === count, 'Declining confirmation must not delete');
    window.confirm = () => true;
    click('Xác nhận xóa');
    await tick();
    assert(writes.at(-1).method === 'DELETE' && writes.at(-1).url.endsWith('/test/7/delete/'), 'Delete request');
  });
  await test('Attribute table opens the same edit workflow for its row', async () => {
    manager.openAttributeTable();
    get('load-attribute-btn').click();
    await new Promise(resolve => setTimeout(resolve, 150));
    const edit = document.querySelector('#tabulator-table [data-row-action="edit"]');
    assert(edit, 'Table must render row actions');
    edit.click();
    click('Sửa thuộc tính');
    assert(get('crud-property-form').elements.ten.value === 'First', 'Edit selected table row');
    click('Hủy');
    manager.closeAttributeTable();
  });
  await test('Late selection response cannot reopen canceled workspace', async () => {
    const previousFetch = window.fetch;
    let release;
    window.fetch = async (...args) => {
      await new Promise(resolve => { release = resolve; });
      return previousFetch(...args);
    };
    manager.openChooseLayerPopup('edit');
    click('Bắt đầu chọn');
    manager.handleMapClick({ coordinate: [1000, 2000] });
    manager.cancel();
    release();
    await tick();
    window.fetch = previousFetch;
    assert(!manager.getCurrentAction() && !get('crud-workspace').children.length, 'Ignore late selection response');
  });
  document.title = `PASS ${results.length} CRUD checks`;
  window.testResult = { success: true, results };
} catch (error) {
  get('results').textContent += `\nFAIL ${error.stack}`;
  document.title = 'FAIL CRUD checks';
  window.testResult = { success: false, results, error: error.stack };
}
