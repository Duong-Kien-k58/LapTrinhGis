// Chỉ đọc dịch vụ thật; style thay đổi trong trình duyệt, không lưu dữ liệu nguồn.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    const failedOsm = [];
    const lineImages = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('requestfailed', request => { if (request.url().includes('tile.openstreetmap.org')) failedOsm.push(request.url()); });
    page.on('response', response => {
      const request = response.request();
      const url = new URL(request.url());
      const params = new URLSearchParams(request.method() === 'POST' ? request.postData() : url.search);
      if (params.get('LAYERS') === 'tinhlo' && params.get('SLD_BODY')?.includes('#0055ff') && Number(params.get('WIDTH')) > 2) {
        lineImages.push(response.body().then(body => ({ body: body.toString('base64'), tiled: params.get('TILED'), cache: response.headers()['geowebcache-cache-result'] })));
      }
    });
    await page.goto(process.env.TEST_URL || 'http://127.0.0.1:5179', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#layer-style-panel', { state: 'attached' });
    const menu = async section => {
      const button = page.locator(`[data-section="${section}"]`);
      if (await button.evaluate(element => Boolean(element.closest('#side-menu')))) {
        await page.locator('#menu-btn').click();
        const group = button.locator('..');
        if (!(await group.getAttribute('class')).includes('active')) await group.locator('.menu-group-title').click();
      }
      await button.click();
    };
    await menu('position');
    await page.locator('#position-search-query').fill('21.02, 105.83');
    await page.locator('#position-search-panel [type="submit"]').click();
    assert.equal(await page.locator('[data-workspace-raster]').innerText(), '0', 'Không tự bật raster ngoài chế độ đã chọn');
    for (const section of ['vector-point', 'vector-line', 'vector-polygon', 'vector-thematic', 'raster-satellite', 'raster-dem']) {
      await menu(section);
      if (section === 'vector-line') {
        await page.locator('[data-style-layer]').selectOption('tinhlo');
        await page.locator('[data-stroke]').fill('#0055ff');
        await page.locator('[data-width]').fill('6');
        await page.locator('[data-dash]').selectOption('8 5');
      }
      if (section === 'vector-thematic') {
        await page.locator('[data-style-layer]').selectOption('ub_tinh');
        await page.locator('[data-field]').selectOption('caphc');
      }
      await page.locator('[data-style-apply]').click();
      await page.waitForFunction(() => !document.querySelector('[data-style-apply]').disabled, null, { timeout: 30000 });
      const status = await page.locator('[data-style-status]').innerText();
      assert.match(status, /Đã áp dụng/, `${section}: ${status}`);
      if (section === 'vector-line') {
        let bluePixels = 0;
        for (let attempt = 0; attempt < 30 && !bluePixels; attempt++) {
          await page.waitForTimeout(200);
          const responses = (await Promise.allSettled(lineImages)).filter(item => item.status === 'fulfilled').map(item => item.value);
          assert.ok(responses.every(item => item.tiled === 'false' && item.cache !== 'HIT'), 'Style riêng không được dùng ảnh cache cũ');
          bluePixels = await page.evaluate(async images => {
            let blue = 0;
            for (const base64 of images) {
              const image = await createImageBitmap(new Blob([Uint8Array.from(atob(base64), c => c.charCodeAt(0))], { type: 'image/png' }));
              const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
              const context = canvas.getContext('2d'); context.drawImage(image, 0, 0); image.close();
              const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
              for (let i = 0; i < pixels.length; i += 4) if (pixels[i] < 40 && pixels[i + 1] >= 50 && pixels[i + 1] < 150 && pixels[i + 2] > 200 && pixels[i + 3] > 128) blue++;
            }
            return blue;
          }, responses.map(item => item.body));
        }
        assert.ok(bluePixels > 0, 'Ảnh WMS thực tế phải chứa nét đường xanh vừa chọn');
        console.log(`PASS WMS hiển thị ${bluePixels} pixel xanh, không lấy ảnh style cũ từ cache`);
      }
      console.log(`PASS GeoServer SLD: ${section}`);
    }
    await menu('vector-overview');
    await page.waitForFunction(() => document.querySelector('.layer-overview-picker-button small').textContent.includes('ĐỐI TƯỢNG VECTOR'), null, { timeout: 30000 });
    console.log('PASS GeoServer WFS: overview vector');
    await menu('support');
    await page.waitForFunction(() => [...document.querySelectorAll('#support-panel .system-service')].every(item => item.classList.contains('online')), null, { timeout: 15000 });
    assert.deepEqual(errors, []);
    assert.deepEqual(failedOsm, [], 'Overview không tải thêm OSM khi đang dùng nền vệ tinh');
    console.log('PASS Django health, GeoServer WMS, không có lỗi JavaScript. Không ghi/sửa/xóa dữ liệu thật.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
