const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
 let server;
 try { await fetch('http://127.0.0.1:5179/'); }
 catch {
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5179', '--strictPort'], { windowsHide: true, stdio: 'ignore' });
  for (let attempt=0; attempt<80; attempt++) {
   try { await fetch('http://127.0.0.1:5179/'); break; }
   catch { await new Promise(resolve=>setTimeout(resolve, 200)); }
  }
 }
 const browser = await chromium.launch({headless:true,channel:'msedge'});
 try {
  const page = await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[]; page.on('pageerror', e=>errors.push(e.message));
  let pixelRequests=0;
  const raster={name:'table_test',title:'Ảnh hàng không kiểm tra',presentation_type:'aerial',crs:'EPSG:4326',bbox:[105,20,106,21],width:100,height:80,source_filename:'test.tif',technical_metadata:{band_count:3,no_data:0,bits_per_sample:'8 bit × 3 band',file_size_bytes:1024}};
  await page.route('**/mygis/rasters/**', route=>route.fulfill({json:{success:true,rasters:[raster],deleted_names:[]},headers:{'Access-Control-Allow-Origin':'http://127.0.0.1:5179','Access-Control-Allow-Credentials':'true'}}));
  await page.route('**/geoserver/**', async route=>{
   const url = new URL(route.request().url());
   const request = url.searchParams.get('REQUEST') || url.searchParams.get('request');
   if(request?.toLowerCase()==='getfeatureinfo') {
    pixelRequests++;
    return route.fulfill({json:{type:'FeatureCollection',features:[{type:'Feature',properties:{GRAY_INDEX:0,BAND_2:128}}]}});
   }
   if(request?.toLowerCase()==='getfeature') return route.fulfill({json:{type:'FeatureCollection',features:[
    {type:'Feature',id:'ub_tinh.1',properties:{gid:1,ten:'Alpha'},geometry:{type:'Point',coordinates:[105.5,20.5]}},
    {type:'Feature',id:'ub_tinh.2',properties:{gid:2,ten:'Beta'},geometry:{type:'Point',coordinates:[105.7,20.7]}}
   ]}});
   return route.fulfill({status:204});
  });
  await page.goto('http://127.0.0.1:5179/',{waitUntil:'domcontentloaded'});
  await page.waitForSelector('#data-raster-layer',{state:'attached'});
  await page.locator('#menu-btn').click();
  const item=page.locator('[data-menu-action="view-data"]');
  await item.locator('..').locator('.menu-group-title').click();
  assert.equal(await page.locator('[data-menu-action="raster-data"]').count(),0);
  await item.click();
  const panel=page.locator('#attribute-table-panel');
  await panel.waitFor({state:'visible'});
  await page.locator('#attribute-layer-select').selectOption('ub_tinh');
  await page.locator('#load-attribute-btn').click();
  await page.waitForFunction(()=>document.querySelector('#attribute-table-status').textContent.includes('2 đối tượng'));
  await page.waitForFunction(()=>document.querySelectorAll('#tabulator-table .tabulator-row').length===2);
  await page.locator('#attribute-quick-filter').fill('Beta');
  await page.waitForFunction(()=>document.querySelectorAll('#tabulator-table .tabulator-row').length===1);
  assert.match(await page.locator('#tabulator-table .tabulator-row').innerText(),/Beta/);
  await page.locator('[data-table-type="raster"]').click();
  await page.locator('#data-raster-layer option[value="table_test"]').waitFor({state:'attached'});
  await page.locator('#data-raster-layer').selectOption('table_test');
  assert.equal(await page.locator('[data-vector-view]').isVisible(),false);
  assert.match(await page.locator('#data-raster-details').innerText(),/100 × 80 px/);
  assert.match(await page.locator('#data-raster-details').innerText(),/Ảnh hàng không/);
  await page.locator('#data-raster-zoom').click();
  await page.waitForFunction(()=>document.querySelector('#data-raster-status').textContent.includes('Đã zoom'));
  await page.locator('#map').click({position:{x:180,y:300}});
  await page.waitForFunction(()=>document.querySelector('#data-raster-pixel').textContent.includes('GRAY_INDEX: 0'));
  assert.equal(pixelRequests,1);
  await page.screenshot({path:'dist/data-table-raster.png'});
  await page.locator('[data-table-type="vector"]').click();
  assert.equal(await page.locator('[data-raster-view]').isVisible(),false);
  assert.match(await page.locator('#tabulator-table .tabulator-row').innerText(),/Beta/);
  await page.screenshot({path:'dist/data-table-vector.png'});
  await page.setViewportSize({width:390,height:844});
  const rect=await panel.boundingBox();
  assert.ok(rect.x>=0 && rect.x+rect.width<=390);
  await page.locator('#close-attribute-table').click();
  assert.equal(await panel.isVisible(),false);
  assert.deepEqual(errors,[]);
  console.log('PASS: menu gộp, bảng vector, lọc nhanh, đổi tab giữ dữ liệu, metadata raster, zoom, pixel giá trị 0, đóng và màn hình 390px.');
  // Chạy lại kiểm tra CRUD hiện có sau thay đổi bảng thuộc tính.
  await page.goto('http://127.0.0.1:5179/tests/crud-manager.html');
  await page.waitForFunction(()=>window.testResult);
  const regression = await page.evaluate(()=>window.testResult);
  assert.equal(regression.success, true, regression.error);
  console.log(`PASS: ${regression.results.length} kiểm tra CRUD hiện có.`);
 } finally { await browser.close(); server?.kill(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
