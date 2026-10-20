const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const { writeArrayBuffer } = await import(pathToFileURL(path.resolve('node_modules/geotiff/dist-module/geotiff.js')));
  const fixture = Buffer.from(writeArrayBuffer(new Uint8Array(Array.from({length: 16}, (_, i) => i * 16)), {
    width: 4, height: 4, GeographicTypeGeoKey: 4326, ModelPixelScale: [0.01, 0.01, 0],
    ModelTiepoint: [0, 0, 0, 105, 21, 0], PhotometricInterpretation: 1
  }));
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    let rasters = [
      { name: 'fast_alpha', title: 'Dữ liệu nền VN25K', presentation_type: 'satellite' },
      { name: 'SRTM_30_VN_UTM', title: 'DEM Việt Nam (SRTM 30 m)', presentation_type: 'dem' }
    ];
    const deleted = [];
    const writes = [];
    await page.route('**/mygis/rasters/**', async route => {
      const request = route.request();
      const url = new URL(request.url());
      let body = { success: true };
      if (url.pathname.endsWith('/csrf/')) body.token = 'test-token';
      else if (request.method() === 'GET') body = { ...body, rasters, deleted_names: deleted };
      else {
        writes.push(url.pathname);
        assert.equal(request.headers()['x-csrftoken'], 'test-token');
        if (url.pathname.endsWith('/delete/')) {
          const name = url.pathname.split('/').at(-3);
          rasters = rasters.filter(item => item.name !== name);
          deleted.push(name);
        } else {
          const edited = url.pathname.includes('/test_dem/');
          const raster = { name: 'test_dem', title: edited ? 'DEM đã sửa' : 'DEM thử nghiệm', crs: 'EPSG:4326', bbox: [105, 20.96, 105.04, 21], width: 4, height: 4, source_filename: 'test_dem.tif', presentation_type: 'dem' };
          rasters = [...rasters.filter(item => item.name !== raster.name), raster];
          body.raster = raster;
        }
      }
      await route.fulfill({ json: body, headers: { 'Access-Control-Allow-Origin': 'http://127.0.0.1:5179', 'Access-Control-Allow-Credentials': 'true' } });
    });
    await page.route('**/geoserver/**', route => route.fulfill({ status: 204 }));
    await page.goto('http://127.0.0.1:5179/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#raster-manager-panel', { state: 'attached' });
    const panel = page.locator('#raster-manager-panel');
    const open = async action => {
      await page.locator('#menu-btn').click();
      const group = page.locator('.menu-group').filter({ has: page.locator('[data-raster-action="add-raster"]') });
      if (!(await group.getAttribute('class')).includes('active')) await group.locator('.menu-group-title').click();
      await page.locator(`[data-raster-action="${action}-raster"]`).click();
      await panel.waitFor({ state: 'visible' });
      await page.waitForFunction(() => document.querySelector('[data-raster-status]').textContent.includes('Chọn'));
    };
    await open('add');
    assert.equal(await panel.locator('[data-raster-select-row]').isVisible(), false);
    assert.equal(await panel.locator('[data-raster-name-row]').isVisible(), true);
    await panel.locator('[data-raster-file]').setInputFiles({ name: 'test_dem.tif', mimeType: 'image/tiff', buffer: fixture });
    await panel.locator('[data-raster-preview]').waitFor({ state: 'visible' });
    assert.match(await panel.locator('[data-raster-info]').innerText(), /4 × 4 px/);
    await panel.locator('[data-raster-title]').fill('DEM thử nghiệm');
    await panel.locator('[data-raster-type]').selectOption('dem');
    await page.screenshot({ path: 'dist/raster-preview.png' });
    await panel.locator('[data-raster-save]').click();
    await page.waitForFunction(() => document.querySelector('[data-raster-status]').textContent.includes('Đã publish'));
    await open('edit');
    await panel.locator('[data-raster-select]').selectOption('test_dem');
    assert.equal(await panel.locator('[data-raster-name-row]').isVisible(), false);
    assert.equal(await panel.locator('[data-raster-metadata]').isVisible(), true);
    await panel.locator('[data-raster-file]').setInputFiles({ name: 'replacement.tif', mimeType: 'image/tiff', buffer: fixture });
    await panel.locator('[data-raster-preview]').waitFor({ state: 'visible' });
    await panel.locator('[data-raster-save]').click();
    await page.waitForFunction(() => document.querySelector('[data-raster-status]').textContent.includes('Đã publish'));
    await panel.locator('[data-raster-title]').fill('DEM đã sửa');
    await panel.locator('[data-raster-metadata]').click();
    await page.waitForFunction(() => document.querySelector('[data-raster-status]').textContent.includes('Đã đọc và lưu'));
    await open('delete');
    await panel.locator('[data-raster-select]').selectOption('test_dem');
    assert.equal(await panel.locator('[data-raster-file-row]').isVisible(), false);
    await panel.locator('[data-raster-save]').click();
    await page.waitForFunction(() => document.querySelector('[data-raster-status]').textContent.includes('Đã xóa'));
    assert.equal(await panel.locator('[data-raster-select] option[value="test_dem"]').count(), 0);
    // Raster cấu hình sẵn cũng phải bị loại khỏi danh sách sau khi tải lại.
    await panel.locator('[data-raster-select]').selectOption('fast_alpha');
    await panel.locator('[data-raster-save]').click();
    await page.waitForFunction(() => !document.querySelector('[data-raster-select] option[value="fast_alpha"]'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#raster-manager-panel', { state: 'attached' });
    await open('edit');
    assert.equal(await panel.locator('[data-raster-select] option[value="fast_alpha"]').count(), 0);
    await page.setViewportSize({ width: 390, height: 844 });
    const rect = await panel.boundingBox();
    assert.ok(rect.x >= 0 && rect.x + rect.width <= 390);
    assert.deepEqual(pageErrors, []);
    assert.ok(writes.includes('/mygis/rasters/upload/'));
    assert.ok(writes.includes('/mygis/rasters/test_dem/upload/'));
    assert.ok(writes.includes('/mygis/rasters/test_dem/sync/'));
    console.log('PASS: mở menu, preview GeoTIFF, thêm, thay tệp, sửa metadata, xóa, tải lại và khung màn hình 390px.');
    console.log('Ảnh kiểm tra: frontend/dist/raster-preview.png');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
