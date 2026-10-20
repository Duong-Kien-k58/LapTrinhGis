const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const ORIGIN = process.env.TEST_URL || 'http://127.0.0.1:5179';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [], authRequests = [], slds = [], wfs = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (request.url().includes('/auth/')) authRequests.push(request.url()); });
    page.on('dialog', dialog => dialog.accept());
    await page.route('**/mygis/**', route => route.fulfill({ json: { success: true, token: 'test', rasters: [{ name: 'parity_dem', title: 'DEM kiểm tra', presentation_type: 'dem', crs: 'EPSG:4326', bbox: [105, 20, 106, 21], width: 4, height: 4 }], deleted_names: [] }, headers: { 'Access-Control-Allow-Origin': ORIGIN, 'Access-Control-Allow-Credentials': 'true' } }));
    await page.route('**/geoserver/**', async route => {
      const url = new URL(route.request().url());
      const params = Object.fromEntries([...url.searchParams].map(([key, value]) => [key.toLowerCase(), value]));
      if (params.request?.toLowerCase() === 'getfeature') {
        wfs.push(params);
        return route.fulfill({ json: { type: 'FeatureCollection', numberMatched: 2, features: [1, 2].map(id => ({ type: 'Feature', id: `ub_tinh.${id}`, properties: { gid: id, ten: `Tỉnh ${id}`, tinh: `Tỉnh ${id}`, hidden_field: 'Thuộc tính đặc biệt', caphc: id }, geometry: { type: 'Point', coordinates: [105 + id / 10, 21] } })) } });
      }
      if (params.request?.toLowerCase() === 'getfeatureinfo') return route.fulfill({ json: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { GRAY_INDEX: 0 }, geometry: null }] } });
      if (params.request?.toLowerCase() === 'getcapabilities') return route.fulfill({ contentType: 'text/xml', body: '<WMS_Capabilities version="1.3.0"><Capability><Layer><Name>parity_dem</Name><EX_GeographicBoundingBox><westBoundLongitude>105</westBoundLongitude><eastBoundLongitude>106</eastBoundLongitude><southBoundLatitude>20</southBoundLatitude><northBoundLatitude>21</northBoundLatitude></EX_GeographicBoundingBox></Layer></Capability></WMS_Capabilities>' });
      if (params.sld_body) slds.push(params.sld_body);
      return route.fulfill({ contentType: 'image/png', body: png });
    });
    await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#position-search-panel', { state: 'attached' });
    const menu = async selector => {
      const button = page.locator(selector);
      if (await button.evaluate(element => Boolean(element.closest('#side-menu')))) {
        await page.locator('#menu-btn').click();
        const group = button.locator('..');
        if (!(await group.getAttribute('class')).includes('active')) await group.locator('.menu-group-title').click();
      }
      await button.click();
    };
    await menu('[data-section="position"]');
    await page.locator('#position-search-query').fill('21.0278, 105.8342');
    await page.locator('#position-search-panel [type="submit"]').click();
    assert.match(await page.locator('[data-search-hint]').innerText(), /21.027800, 105.834200/);
    await page.locator('[data-coordinate-mode="vn2000"]').click();
    await page.locator('#position-search-query').fill('2329089.18, 524092.03');
    await page.locator('#position-search-panel [type="submit"]').click();
    assert.match(await page.locator('[data-search-hint]').innerText(), /Đã đến/);
    await page.locator('#position-search-query').fill('-1, -2');
    await page.locator('#position-search-panel [type="submit"]').click();
    assert.match(await page.locator('[data-search-hint]').innerText(), /không hợp lệ/);

    await menu('[data-section="vector-point"]');
    assert.equal(await page.locator('#position-search-panel').isVisible(), false);
    await page.locator('[data-style-layer]').selectOption('ub_tinh');
    await page.locator('[data-shape]').selectOption('star');
    await page.locator('[data-style-save]').click();
    await page.waitForFunction(() => document.querySelector('[data-style-status]').textContent.includes('Đã lưu'));
    assert.ok(slds.at(-1).includes('star'));
    assert.ok(await page.evaluate(() => localStorage.getItem('webgis-layer-presentation-v1').includes('star')));
    await menu('[data-section="vector-thematic"]');
    await page.locator('[data-style-layer]').selectOption('ub_tinh');
    await page.locator('[data-field]').selectOption('caphc');
    await page.locator('[data-style-apply]').click();
    await page.waitForFunction(() => document.querySelector('[data-style-status]').textContent.includes('Đã áp dụng'));
    assert.ok(slds.at(-1).includes('PropertyIsEqualTo'));

    await menu('[data-section="vector-overview"]');
    await page.waitForFunction(() => document.querySelector('.layer-overview-picker-button small').textContent.includes('ĐỐI TƯỢNG VECTOR'));
    assert.equal(await page.locator('#layer-style-panel').isVisible(), false);
    assert.ok(wfs.some(params => params.count === '1000'));

    await menu('[data-layer-service="dem"]');
    await menu('[data-section="raster-dem"]');
    await page.locator('[data-style-layer]').selectOption('parity_dem');
    await page.locator('[data-min]').fill('0');
    await page.locator('[data-max]').fill('100');
    await page.locator('[data-style-apply]').click();
    await page.waitForFunction(() => document.querySelector('[data-style-status]').textContent.includes('Đã áp dụng'));
    assert.ok(slds.at(-1).includes('ColorMap'));
    await menu('[data-section="raster-identify"]');
    assert.equal(await page.locator('#layer-style-panel').isVisible(), false);
    await page.locator('[data-identify-type="raster"]').click();
    await page.locator('#popup-layer-select').selectOption('SRTM_30_VN_UTM');
    await page.locator('#map').click({ position: { x: 200, y: 300 } });
    await page.waitForFunction(() => document.querySelector('.popup-tool-content').textContent.includes('GRAY_INDEX'));
    assert.match(await page.locator('.popup-tool-content').first().innerText(), /0/);

    await menu('[data-section="tool-search"]');
    await page.locator('#workspace-tool-query').fill('trinh bay du lieu diem');
    await page.locator('#workspace-tool-query').press('ArrowDown');
    await page.locator('#workspace-tool-query').press('Enter');
    assert.equal(await page.locator('#layer-style-panel').isVisible(), true);
    assert.equal(await page.locator('#tool-search-panel').isVisible(), false);
    await menu('[data-section="support"]');
    await page.waitForFunction(() => [...document.querySelectorAll('#support-panel .system-service')].every(item => item.classList.contains('online')));
    assert.equal(await page.locator('#admin-panel, .account-control, .auth-dialog').count(), 0);
    assert.deepEqual(authRequests, []);
    await page.locator('#support-panel .tool-panel-header button').click();

    await page.locator('#search-input').fill('thuoc tinh dac biet');
    await page.locator('#search-btn').click();
    await page.waitForSelector('.search-suggest-item');
    await page.locator('#search-input').press('Escape');
    await page.locator('.layer-catalog-button').click();
    const visibility = page.locator('[data-layer-id="vn_tinh"] input');
    await visibility.check();
    await page.locator('.layer-catalog-save').click();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('webgis_layer_catalog_v1')).visibility.layers.vn_tinh), true, 'Visibility phải được lưu trước tải lại');
    await page.reload();
    await page.waitForSelector('#support-panel', { state: 'attached' });
    await page.locator('.layer-catalog-button').click();
    assert.equal(await page.locator('[data-layer-id="vn_tinh"] input').isChecked(), true);
    await page.locator('.layer-catalog-close').click();
    await menu('[data-section="vector-point"]');
    await page.locator('[data-style-layer]').selectOption('ub_tinh');
    assert.equal(await page.locator('[data-shape]').inputValue(), 'star');
    await page.locator('[data-style-reset]').click();
    assert.equal(await page.evaluate(() => Boolean(JSON.parse(localStorage.getItem('webgis-layer-presentation-v1'))?.ub_tinh)), false);

    const header = page.locator('#layer-style-panel .tool-panel-header');
    const box = await header.boundingBox();
    await page.mouse.move(box.x + 40, box.y + 15);
    await page.mouse.down(); await page.mouse.move(500, 250); await page.mouse.up();
    assert.ok(await page.evaluate(() => localStorage.getItem('webgis-panel-position:layer-style-panel')));
    await page.setViewportSize({ width: 390, height: 844 });
    const panel = await page.locator('#layer-style-panel').boundingBox();
    assert.ok(panel.x >= 0 && panel.x + panel.width <= 390, JSON.stringify(panel));
    assert.deepEqual(errors, []);
    await page.goto(`${ORIGIN}/tests/layer-catalog.html`);
    await page.waitForFunction(() => document.body.dataset.result);
    assert.equal(await page.getAttribute('body', 'data-result'), 'pass', await page.locator('#results').innerText());
    console.log('PASS: tìm WGS84/VN2000, style vector/chuyên đề/DEM, lưu/reset style, overview WFS, tra cứu pixel 0, tìm công cụ, hỗ trợ, tìm mọi thuộc tính, lưu visibility, kéo panel, màn hình 390px, không tích hợp tài khoản và hồi quy mục lục.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
