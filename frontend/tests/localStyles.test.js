import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';
import { compileLayerStyles } from '../build/layerStyles.js';
import { configureLocalStyles, getLocalStyleParams } from '../src/config/localStyles.js';
import { MAP_LAYER_CONFIGS, RASTER_LAYER_CONFIGS } from '../src/config/layers.js';
import { loadWmsImage } from '../src/tool/toolUtils.js';

const env = loadEnv('test', fileURLToPath(new URL('../../', import.meta.url)), '');
const compilerOptions = { libFolder: env.GEOSERVER_LIB_DIR, java: env.STYLE_JAVA };
const files = compileLayerStyles(compilerOptions);
configureLocalStyles(files);

function stubGlobal(context, name, value) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  context.after(() => {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  });
}

test('mọi lớp cấu hình gửi style trong file, không chọn style trên GeoServer', () => {
  for (const [name, raster] of [...MAP_LAYER_CONFIGS.map(layer => [layer.id, false]), ...RASTER_LAYER_CONFIGS.map(layer => [layer.layerName, true])]) {
    assert.ok(files[`styleLayer/${name}.css`], `Thiếu file của ${name}`);
    const params = getLocalStyleParams(name, { raster });
    assert.equal(params.STYLES, '');
    assert.equal(params.TILED, false);
    assert.ok(params.SLD_BODY.includes(`<sld:Name>${raster ? 'webgis:' : ''}${name}</sld:Name>`));
    assert.ok(params.SLD_BODY.includes('<sld:UserStyle>'));
    assert.ok(params.SLD_BODY.includes('<sld:IsDefault>1</sld:IsDefault>'));
    assert.ok(!params.SLD_BODY.includes('<sld:NamedStyle>'));
    assert.ok(!params.SLD_BODY.includes('{{'));
    assert.ok(!params.SLD_BODY.includes('file:/'));
  }
});

test('tên lớp có namespace và không có namespace dùng cùng style', () => {
  assert.deepEqual(getLocalStyleParams('ranhgioi'), getLocalStyleParams('webgis:ranhgioi'));
  assert.deepEqual(getLocalStyleParams('fast_alpha', { raster: true }), getLocalStyleParams('webgis:fast_alpha', { raster: true }));
});

test('lớp vector thiếu file báo lỗi; raster mới dùng file mẫu cục bộ', () => {
  assert.throws(() => getLocalStyleParams('missing_vector'), /Thiếu file styleLayer\/missing_vector.css/);
  const params = getLocalStyleParams('new_upload', { raster: true });
  assert.ok(params.SLD_BODY.includes('<sld:Name>webgis:new_upload</sld:Name>'));
  assert.match(params.SLD_BODY, /<sld:RasterSymbolizer[\s/>]/);
});

test('file CSS mới được tự nhận; lỗi CSS chỉ rõ file cần sửa', () => {
  const folder = mkdtempSync(path.join(tmpdir(), 'webgis-layer-css-'));
  const file = path.join(folder, 'new_layer.css');
  try {
    writeFileSync(file, '* { stroke: #123456; stroke-width: 3; }', 'utf8');
    const result = compileLayerStyles({ ...compilerOptions, folder });
    assert.ok(result['styleLayer/new_layer.css'].includes('#123456'));
    writeFileSync(file, '* { stroke: ;', 'utf8');
    assert.throws(() => compileLayerStyles({ ...compilerOptions, folder }), /new_layer.css/);
  } finally {
    unlinkSync(file);
    rmdirSync(folder);
  }
});

test('biểu tượng hành chính dùng tài nguyên của ứng dụng, không còn đường dẫn máy GeoServer', context => {
  stubGlobal(context, 'location', { origin: 'https://maps.example.test' });
  assert.ok(getLocalStyleParams('tthc').SLD_BODY.includes('https://maps.example.test/style-assets/tthc-pin.svg'));
});

test('ảnh WMS có SLD ngắn cũng gửi POST và giữ đầy đủ nội dung style', async context => {
  stubGlobal(context, 'window', { location: { href: 'http://localhost:5173/' } });
  let sent;
  context.mock.method(globalThis, 'fetch', async (url, options) => {
    sent = { url, options };
    return new Response(new Blob(['png'], { type: 'image/png' }), { headers: { 'Content-Type': 'image/png' } });
  });
  let loaded;
  const ready = new Promise(resolve => { loaded = resolve; });
  const image = { set src(value) { loaded(value); }, addEventListener() {}, removeEventListener() {} };
  const url = new URL('http://localhost:8080/geoserver/webgis/wms');
  url.search = new URLSearchParams({ LAYERS: 'fast_alpha', SLD_BODY: '<StyledLayerDescriptor>Tiếng Việt & màu sắc</StyledLayerDescriptor>' });
  loadWmsImage({ getImage: () => image }, url.href);
  const imageUrl = await ready;
  assert.equal(sent.options.method, 'POST');
  assert.equal(sent.url.search, '');
  assert.equal(sent.options.body.get('SLD_BODY'), url.searchParams.get('SLD_BODY'));
  assert.ok(imageUrl.startsWith('blob:'));
  URL.revokeObjectURL(imageUrl);
});
