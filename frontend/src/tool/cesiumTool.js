import * as Cesium from 'cesium'; // Import toàn bộ thư viện CesiumJS
import 'cesium/Build/Cesium/Widgets/widgets.css'; // Import CSS giao diện mặc định của Cesium

window.Cesium = Cesium; // Đưa Cesium ra biến toàn cục để OL-Cesium sử dụng

let ol3d = null; // Lưu đối tượng OL-Cesium dùng chung trong file
let map2D = null;
let toggleButton = null; // Lưu nút chuyển đổi 2D/3D
let homeButton = null;
let identifyButton = null;
let buildingsButton = null;
let waterButton = null;
let identifyHandler = null;
let osmBuildings = null;
let isLoadingBuildings = false;
let waterEnabled = false;
let infoPanel = null;
let infoTimer = null;

/* =========================================================
   KHỞI TẠO CESIUM
========================================================= */

export async function createCesiumTool(map) {
  if (!map) { // Kiểm tra bản đồ OpenLayers đã tồn tại chưa
    console.error('Không tìm thấy OpenLayers map');
    return null;
  }
  if (ol3d) return ol3d; // Nếu đã khởi tạo rồi thì dùng lại, không tạo mới

  map2D = map;

  const { default: OLCesium } = await import('olcs'); // Import OL-Cesium theo kiểu động để tránh lỗi khi load ban đầu
  Cesium.Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_ION_TOKEN; // Lấy token Cesium ion từ file .env
  ol3d = new OLCesium({ map }); // Kết nối bản đồ OpenLayers với Cesium

  const scene = ol3d.getCesiumScene(); // Lấy scene 3D của Cesium để cấu hình địa hình, ánh sáng
  setTerrainOptions();
  // Giữ ảnh nền sáng, tránh cảnh ban đêm làm công trình 3D gần như không nhìn thấy.
  scene.globe.enableLighting = false;
  scene.globe.depthTestAgainstTerrain = true;
  ol3d.setEnabled(false); // Ban đầu vẫn để bản đồ ở chế độ 2D
  createToggleButton(); // Tạo nút chuyển đổi 2D/3D trên giao diện
  console.log('Cesium + World Terrain đã được khởi tạo');
  return ol3d; // Trả đối tượng OL-Cesium để nơi khác có thể dùng tiếp
}

/* =========================================================
   TẠO NÚT 2D / 3D
========================================================= */

function createToggleButton() {
  if (toggleButton) return; // Nếu nút đã tồn tại thì không tạo lại
  toggleButton = document.createElement('button'); // Tạo nút bấm chuyển chế độ
  toggleButton.type = 'button';
  toggleButton.id = 'cesium-toggle-btn';
  toggleButton.className = 'map-control-btn cesium-toggle-btn'; // Gắn class để CSS thiết kế giống các nút control khác
  toggleButton.textContent = '3D'; // Ban đầu đang ở 2D nên nút hiển thị 3D
  toggleButton.title = 'Chuyển chế độ 2D / 3D';
  const container = document.createElement('div'); // Tạo khung chứa nút
  container.id = 'cesium-toggle-control';
  container.className = 'map-control-group cesium-toggle-control'; // Class dùng để định vị nút bên phải bản đồ
  container.appendChild(toggleButton);
  createThreeDButtons(container);
  const mapWrapper = document.querySelector('.map-wrapper') || document.body; // Ưu tiên gắn vào khung bản đồ
  const controls = document.getElementById('primary-map-controls');
  if (controls) controls.insertBefore(container, controls.querySelector('.ol-zoom'));
  else mapWrapper.appendChild(container);
  createInfoPanel(mapWrapper);
  toggleButton.addEventListener('click', toggle3D); // Bấm nút thì chuyển đổi giữa 2D và 3D
}

function createToolButton(id, label, title, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.id = id;
  button.className = 'map-control-btn cesium-tool-btn';
  button.innerHTML = label;
  button.title = title;
  button.setAttribute('aria-label', title);
  button.hidden = true;
  button.addEventListener('click', onClick);
  return button;
}

function createThreeDButtons(container) {
  homeButton = createToolButton(
    'cesium-home-btn',
    '<svg viewBox="0 0 24 24"><path d="m3 11 9-8 9 8v10H3z"/><path d="M9 21v-6h6v6"/></svg>',
    'Bay về vị trí mặc định 3D',
    flyToDefaultView
  );
  identifyButton = createToolButton(
    'cesium-identify-btn',
    '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="6"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>',
    'Bật/tắt tra cứu tọa độ và cao độ 3D',
    toggleIdentify
  );
  buildingsButton = createToolButton(
    'cesium-buildings-btn',
    '<svg viewBox="0 0 24 24"><path d="M4 21V5h11v16M15 21V2h5v19M8 9h3M8 13h3M8 17h3M17 6h1M17 10h1M17 14h1"/></svg>',
    'Bật/tắt công trình OSM 3D',
    toggleOsmBuildings
  );
  waterButton = createToolButton(
    'cesium-water-btn',
    '<svg viewBox="0 0 24 24"><path d="M3 8c2 2 4 2 6 0s4-2 6 0 4 2 6 0M3 13c2 2 4 2 6 0s4-2 6 0 4 2 6 0M3 18c2 2 4 2 6 0s4-2 6 0 4 2 6 0"/></svg>',
    'Bật/tắt hiệu ứng nước',
    toggleWaterEffect
  );
  container.append(homeButton, identifyButton, buildingsButton, waterButton);
}

function createInfoPanel(mapWrapper) {
  infoPanel = document.createElement('div');
  infoPanel.id = 'cesium-info-panel';
  infoPanel.className = 'cesium-info-panel';
  infoPanel.setAttribute('role', 'status');
  infoPanel.hidden = true;
  mapWrapper.appendChild(infoPanel);
}

function setTerrainOptions() {
  if (!ol3d) return;
  ol3d.getCesiumScene().setTerrain(Cesium.Terrain.fromWorldTerrain({
    requestVertexNormals: true,
    requestWaterMask: waterEnabled
  }));
}

function setThreeDButtonsVisible(enabled) {
  [homeButton, identifyButton, buildingsButton, waterButton].filter(Boolean).forEach(button => {
    button.hidden = !enabled;
  });
  if (!enabled) {
    stopIdentify();
    hideInfo();
  }
}

function flyToDefaultView() {
  if (!ol3d?.getEnabled()) return;
  ol3d.getCesiumScene().camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(105.8, 21.04, 1500000),
    orientation: { heading: 0, pitch: Cesium.Math.toRadians(-55), roll: 0 },
    duration: 1.5
  });
}

function flyToBuildingsView() {
  if (!ol3d?.getEnabled()) return;
  ol3d.getCesiumScene().camera.flyTo({
    // Bay đủ gần để mô hình công trình được tải ở mức chi tiết dễ quan sát.
    destination: Cesium.Cartesian3.fromDegrees(105.852, 21.028, 900),
    orientation: { heading: Cesium.Math.toRadians(20), pitch: Cesium.Math.toRadians(-28), roll: 0 },
    duration: 1.8
  });
}

function showInfo(message, duration = 4500) {
  if (!infoPanel) return;
  clearTimeout(infoTimer);
  infoPanel.textContent = message;
  infoPanel.hidden = false;
  infoTimer = setTimeout(hideInfo, duration);
}

function hideInfo() {
  clearTimeout(infoTimer);
  infoTimer = null;
  if (infoPanel) infoPanel.hidden = true;
}

function toggleIdentify() {
  if (!ol3d?.getEnabled()) return;
  if (identifyHandler) {
    stopIdentify();
    hideInfo();
    return;
  }
  const scene = ol3d.getCesiumScene();
  if (!scene.pickPositionSupported) {
    showInfo('Trình duyệt không hỗ trợ tra cứu vị trí 3D.');
    return;
  }
  identifyHandler = new Cesium.ScreenSpaceEventHandler(scene.canvas);
  identifyHandler.setInputAction(function (event) {
    const position = scene.pickPosition(event.position);
    if (!Cesium.defined(position)) {
      showInfo('Không xác định được vị trí tại điểm đã chọn.');
      return;
    }
    const cartographic = Cesium.Cartographic.fromCartesian(position);
    const longitude = Cesium.Math.toDegrees(cartographic.longitude).toFixed(6);
    const latitude = Cesium.Math.toDegrees(cartographic.latitude).toFixed(6);
    const height = cartographic.height.toFixed(1);
    showInfo(`Kinh độ: ${longitude} | Vĩ độ: ${latitude} | Cao độ: ${height} m`);
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  identifyButton?.classList.add('active');
  showInfo('Chế độ tra cứu đang bật: click lên bản đồ 3D để xem tọa độ và cao độ.');
}

function stopIdentify() {
  if (identifyHandler && !identifyHandler.isDestroyed()) identifyHandler.destroy();
  identifyHandler = null;
  identifyButton?.classList.remove('active');
}

async function toggleOsmBuildings() {
  if (!ol3d?.getEnabled() || isLoadingBuildings) return;
  const scene = ol3d.getCesiumScene();
  if (osmBuildings) {
    osmBuildings.show = !osmBuildings.show;
    buildingsButton?.classList.toggle('active', osmBuildings.show);
    if (osmBuildings.show) flyToBuildingsView();
    return;
  }
  try {
    isLoadingBuildings = true;
    buildingsButton.disabled = true;
    buildingsButton.textContent = '…';
    showInfo('Đang tải công trình OSM 3D...');
    osmBuildings = await Cesium.createOsmBuildingsAsync();
    // Không gán Cesium3DTileStyle: giữ nguyên màu/texture mặc định của OSM Buildings.
    osmBuildings.maximumScreenSpaceError = 4;
    osmBuildings.tileFailed.addEventListener(function (event) {
      console.error('Không tải được tile công trình OSM 3D', event);
      showInfo('Một số tile công trình OSM 3D không tải được. Hãy kiểm tra Cesium ion token và kết nối mạng.');
    });
    scene.primitives.add(osmBuildings);
    buildingsButton.classList.add('active');
    flyToBuildingsView();
    showInfo('Đã bật công trình OSM 3D.');
  } catch (error) {
    console.error('Không thể tải công trình OSM 3D', error);
    showInfo('Không thể tải công trình OSM 3D. Hãy kiểm tra Cesium ion token và kết nối mạng.');
  } finally {
    isLoadingBuildings = false;
    buildingsButton.disabled = false;
    buildingsButton.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 21V5h11v16M15 21V2h5v19M8 9h3M8 13h3M8 17h3M17 6h1M17 10h1M17 14h1"/></svg>';
  }
}

function toggleWaterEffect() {
  if (!ol3d?.getEnabled()) return;
  waterEnabled = !waterEnabled;
  setTerrainOptions();
  waterButton?.classList.toggle('active', waterEnabled);
  showInfo(waterEnabled ? 'Đã bật hiệu ứng nước và địa hình.' : 'Đã tắt hiệu ứng nước; địa hình vẫn được hiển thị.');
}

/* =========================================================
   CHUYỂN ĐỔI 2D / 3D
========================================================= */

export function toggle3D() {
  if (!ol3d) return; // Nếu chưa khởi tạo OL-Cesium thì không xử lý
  const enabled = !ol3d.getEnabled(); // Lấy trạng thái ngược lại của chế độ hiện tại
  ol3d.setEnabled(enabled); // Bật hoặc tắt chế độ 3D
  if (!enabled) reset2DViewDirection();
  setThreeDButtonsVisible(enabled);
  if (toggleButton) {
    toggleButton.textContent = enabled ? '2D' : '3D'; // Nếu đang 3D thì nút hiện 2D, ngược lại hiện 3D
    toggleButton.title = enabled ? 'Chuyển sang chế độ 2D' : 'Chuyển sang chế độ 3D';
    toggleButton.classList.toggle('active', enabled); // Thêm class active khi đang ở chế độ 3D
  }
}

/* =========================================================
   BẬT 3D
========================================================= */

export function enable3D() {
  if (!ol3d) return; // Nếu chưa có OL-Cesium thì không xử lý
  ol3d.setEnabled(true); // Bật chế độ 3D
  setThreeDButtonsVisible(true);
  if (toggleButton) {
    toggleButton.textContent = '2D'; // Đổi chữ nút để người dùng có thể quay lại 2D
    toggleButton.title = 'Chuyển sang chế độ 2D';
    toggleButton.classList.add('active');
  }
}

/* =========================================================
   TẮT 3D
========================================================= */

export function disable3D() {
  if (!ol3d) return; // Nếu chưa có OL-Cesium thì không xử lý
  ol3d.setEnabled(false); // Tắt chế độ 3D, quay về OpenLayers 2D
  reset2DViewDirection();
  setThreeDButtonsVisible(false);
  if (toggleButton) {
    toggleButton.textContent = '3D'; // Đổi chữ nút để người dùng có thể bật lại 3D
    toggleButton.title = 'Chuyển sang chế độ 3D';
    toggleButton.classList.remove('active');
  }
}

/* =========================================================
   KIỂM TRA TRẠNG THÁI 3D
========================================================= */

export function is3DEnabled() {
  return ol3d ? ol3d.getEnabled() : false; // Trả về true nếu đang bật 3D, false nếu chưa bật hoặc chưa khởi tạo
}

/* =========================================================
   LẤY CESIUM SCENE
========================================================= */

export function getCesiumScene() {
  return ol3d ? ol3d.getCesiumScene() : null; // Trả về Cesium Scene để cấu hình hoặc thao tác 3D nâng cao
}

/* =========================================================
   LẤY ĐỐI TƯỢNG OL-CESIUM
========================================================= */

export function getOLCesium() {
  return ol3d; // Trả về đối tượng OL-Cesium hiện tại
}

function reset2DViewDirection() {
  if (!map2D) return;
  map2D.getView().setRotation(0);
  map2D.render();
}
