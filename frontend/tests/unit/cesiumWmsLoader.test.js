import test from 'node:test';
import assert from 'node:assert/strict';
import TileWMS from 'ol/source/TileWMS.js';
import ImageWMS from 'ol/source/ImageWMS.js';
import View from 'ol/View.js';
import * as Cesium from 'cesium';
import { wmsPostRequest, wrapWmsProvider, loadPostImage } from '../../src/tool/cesiumTool.js';

const style = `<StyledLayerDescriptor>${'Nhãn địa giới & màu sắc '.repeat(3000)}</StyledLayerDescriptor>`;
const map = { getView: () => new View() };

function wrapped(source) {
  const sent = [];
  let gets = 0;
  const provider = { ready: true, requestImage() { gets++; return 'GET'; } };
  wrapWmsProvider(provider, source, map, (spec, request) => { sent.push({ ...spec, request }); return 'POST'; });
  return { provider, sent, gets: () => gets };
}

test('URL SLD dài chuyển sang body, giữ nguyên Unicode và tham số WMS', () => {
  const src = new URL('http://localhost:8080/geoserver/webgis/wms');
  src.search = new URLSearchParams({ REQUEST: 'GetMap', SLD_BODY: style, BBOX: '1,2,3,4', LAYERS: 'vn_tinh' });
  const post = wmsPostRequest(src.href);
  assert.equal(post.url, 'http://localhost:8080/geoserver/webgis/wms');
  assert.equal(new URLSearchParams(post.data).get('SLD_BODY'), style);
  assert.equal(new URLSearchParams(post.data).get('BBOX'), '1,2,3,4');
  assert.equal(wmsPostRequest('http://localhost:8080/wms?LAYERS=vn_tinh'), null);
});

test('TileWMS dùng POST cho style, GET thường vẫn hoạt động', () => {
  const source = new TileWMS({ url: 'http://localhost:8080/geoserver/webgis/wms', params: { LAYERS: 'vn_tinh', SLD_BODY: style } });
  const state = wrapped(source);
  const request = {};
  assert.equal(state.provider.requestImage(0, 0, 0, request), 'POST');
  const params = new URLSearchParams(state.sent[0].data);
  assert.equal(params.get('SLD_BODY'), style);
  assert.equal(params.get('LAYERS'), 'vn_tinh');
  assert.ok(params.get('BBOX'));
  assert.equal(state.sent[0].request, request);
  assert.equal(state.gets(), 0, 'không gửi URL GET dài');
  source.setParams({ LAYERS: 'vn_tinh' });
  assert.equal(state.provider.requestImage(0, 0, 0), 'GET');
});

test('ImageWMS dùng tham số mới sau khi đổi style hoặc khôi phục mặc định', () => {
  const source = new ImageWMS({ url: 'http://localhost:8080/geoserver/webgis/wms', params: { LAYERS: 'vn_xa', SLD_BODY: style } });
  const state = wrapped(source);
  state.provider.requestImage(0, 0, 0);
  assert.equal(new URLSearchParams(state.sent[0].data).get('SLD_BODY'), style);
  source.updateParams({ SLD_BODY: '<StyledLayerDescriptor>mới</StyledLayerDescriptor>' });
  state.provider.requestImage(0, 0, 0);
  assert.equal(new URLSearchParams(state.sent[1].data).get('SLD_BODY'), '<StyledLayerDescriptor>mới</StyledLayerDescriptor>');
  source.setParams({ LAYERS: 'vn_xa' });
  assert.equal(state.provider.requestImage(0, 0, 0), 'GET');
});

test('giữ đúng quy ước undefined khi hàng đợi Cesium đang đầy', () => {
  class Resource { post() { return undefined; } }
  assert.equal(loadPostImage({ Resource }, { url: 'http://localhost/wms', data: 'a=1' }, {}), undefined);
});

test('POST theo scheduler và giải phóng blob URL sau khi giải mã ảnh', async context => {
  const calls = [];
  context.mock.method(URL, 'createObjectURL', () => 'blob:test-wms');
  const revoke = context.mock.method(URL, 'revokeObjectURL', () => {});
  const request = {};
  class Resource {
    constructor(options) { calls.push(options); }
    post(data, options) { calls.push({ ...options, data }); return Promise.resolve(new Blob(['png'], { type: 'image/png' })); }
    static fetchImage(options) { calls.push(options); return Promise.resolve('decoded image'); }
  }
  assert.equal(await loadPostImage({ Resource }, { url: 'http://localhost/wms', data: 'LAYERS=vn_xa' }, request), 'decoded image');
  assert.equal(calls[0].request, request);
  assert.equal(calls[1].responseType, 'blob');
  assert.equal(calls[1].data, 'LAYERS=vn_xa');
  assert.equal(calls[2].flipY, true);
  assert.equal(revoke.mock.calls[0].arguments[0], 'blob:test-wms');
});

test('không đưa thông báo lỗi XML của GeoServer vào ảnh bản đồ', async () => {
  class Resource { post() { return Promise.resolve(new Blob(['ServiceException'], { type: 'text/xml' })); } }
  await assert.rejects(() => loadPostImage({ Resource }, { url: 'http://localhost/wms', data: '' }), /không trả về ảnh/);
});

test('Resource Cesium thật gửi POST với form body, không ghép SLD vào URL', async context => {
  let sent;
  context.mock.method(URL, 'createObjectURL', () => 'blob:real-resource-test');
  context.mock.method(URL, 'revokeObjectURL', () => {});
  context.mock.method(Cesium.Resource, 'fetchImage', () => Promise.resolve('image'));
  context.mock.method(Cesium.Resource._Implementations, 'loadWithXhr', (url, responseType, method, data, headers, deferred) => {
    sent = { url, responseType, method, data, headers };
    deferred.resolve(new Blob(['png'], { type: 'image/png' }));
    return { abort() {} };
  });
  const spec = wmsPostRequest(`http://localhost:8080/wms?SLD_BODY=${encodeURIComponent(style)}`);
  assert.equal(await loadPostImage(Cesium, spec, new Cesium.Request()), 'image');
  assert.equal(sent.method, 'POST');
  assert.equal(sent.url, 'http://localhost:8080/wms');
  assert.equal(sent.responseType, 'blob');
  assert.equal(new URLSearchParams(sent.data).get('SLD_BODY'), style);
  assert.match(sent.headers['Content-Type'], /application\/x-www-form-urlencoded/);
});
