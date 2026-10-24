//#region Imports
import ScaleLine from 'ol/control/ScaleLine.js';
import OverviewMap from 'ol/control/OverviewMap.js';
import TileLayer from 'ol/layer/Tile.js';
import { toLonLat, fromLonLat, getPointResolution } from 'ol/proj.js';
import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import Geolocation from 'ol/Geolocation.js';
import Control from 'ol/control/Control.js';
import { Style, Fill, Stroke, Circle as CircleStyle } from 'ol/style.js';
//#endregion

//#region 1. Tọa độ, tỷ lệ và bản đồ tổng quan
function toVn2000(longitude, latitude, zoneWidth) {
  const a = 6378137 // Bán trục lớn ellipsoid
  const e2 = 0.00669438 // Độ lệch tâm bình phương
  const k0 = zoneWidth === 3 ? 0.9999 : 0.9996 // Hệ số tỷ lệ
  const centralMeridian = zoneWidth === 3 ? Math.round(longitude / 3) * 3 : (Math.floor((longitude + 180) / 6) + 1) * 6 - 183 // Kinh tuyến trục
  const rad = Math.PI / 180
  const lon = longitude * rad
  const lat = latitude * rad
  const lon0 = centralMeridian * rad
  const sinLat = Math.sin(lat)
  const cosLat = Math.cos(lat)
  const tanLat = Math.tan(lat)
  const ePrime2 = e2 / (1 - e2)
  const N = a / Math.sqrt(1 - e2 * sinLat ** 2) // Bán kính cong
  const T = tanLat ** 2
  const C = ePrime2 * cosLat ** 2
  const A = cosLat * (lon - lon0)
  const M = a * ((1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * lat - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * lat) + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * lat) - 35 * e2 ** 3 / 3072 * Math.sin(6 * lat)) // Cung kinh tuyến
  const easting = k0 * N * (A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T ** 2 + 72 * C - 58 * ePrime2) * A ** 5 / 120) + 500000 // Y
  const northing = k0 * (M + N * tanLat * (A ** 2 / 2 + (5 - T + 9 * C + 4 * C ** 2) * A ** 4 / 24 + (61 - 58 * T + T ** 2 + 600 * C - 330 * ePrime2) * A ** 6 / 720)) // X
  return { northing, easting }
}

export function createBasicTools(map) {
  // Thước tỷ lệ
  const scaleLineControl = new ScaleLine({
    target: document.getElementById('header-scale-ruler'),
    units: 'metric',
    bar: true,
    steps: 4,
    text: false,
    minWidth: 80,
    maxWidth: 140,
  });
  map.addControl(scaleLineControl);

  // Cụm tọa độ/tỷ lệ trên header, theo bố cục PTN.
  const latitudeOutput = document.getElementById('latitude-value');
  const longitudeOutput = document.getElementById('longitude-value');
  const vn2000XOutput = document.getElementById('vn2000-x-value');
  const vn2000YOutput = document.getElementById('vn2000-y-value');
  const projectionInputs = document.querySelectorAll('input[name="projection-zone"]');
  const scaleOutput = document.getElementById('map-scale-value');
  const view = map.getView();
  let latestCoordinate = view.getCenter();
  function updateCoordinates(coordinate) {
    if (!coordinate) return;
    latestCoordinate = coordinate;
    const [longitude, latitude] = toLonLat(coordinate, view.getProjection());
    const zoneWidth = Number(document.querySelector('input[name="projection-zone"]:checked')?.value || 6);
    const { northing, easting } = toVn2000(longitude, latitude, zoneWidth);
    latitudeOutput.textContent = latitude.toFixed(6);
    longitudeOutput.textContent = longitude.toFixed(6);
    vn2000XOutput.textContent = northing.toFixed(2);
    vn2000YOutput.textContent = easting.toFixed(2);
  }
  function updateScale() {
    const resolution = view.getResolution();
    const center = view.getCenter();
    if (!resolution || !center) return;
    // Cùng quy ước điểm ảnh 0,28 mm với thước OpenLayers và PTN.
    const metersPerPixel = getPointResolution(view.getProjection(), resolution, center, 'm');
    scaleOutput.textContent = Math.round(metersPerPixel / 0.00028).toLocaleString('vi-VN');
  }
  map.on('pointermove', event => {
    if (!event.dragging) updateCoordinates(event.coordinate);
  });
  map.on('singleclick', event => updateCoordinates(event.coordinate));
  document.addEventListener('webgis-coordinate-update', event => {
    const { longitude, latitude } = event.detail;
    updateCoordinates(fromLonLat([longitude, latitude], view.getProjection()));
  });
  projectionInputs.forEach(input => input.addEventListener('change', () => updateCoordinates(latestCoordinate)));
  view.on('change:resolution', updateScale);
  view.on('change:center', updateScale);
  updateCoordinates(view.getCenter());
  updateScale();

  // Bản đồ tổng quan
  const overviewMapControl = new OverviewMap({
    collapsed: false,
    layers: [createOverviewBaseLayer(map)]
  });
  map.addControl(overviewMapControl);

  return { 
  scaleLineControl, // Trả control thước tỷ lệ để file khác có thể quản lý/ẩn hiện
  overviewMapControl // Trả control bản đồ tổng quan để file khác có thể quản lý/ẩn hiện
  };
}
// Dùng nền đang chọn thay vì tải thêm OSM độc lập cho mỗi bản đồ nhỏ.
export function createOverviewBaseLayer(map) {
  const bases = map.getAllLayers().filter(layer => layer.get('layerKind') === 'base');
  const layer = new TileLayer();
  const sync = () => {
    const active = bases.find(base => base.getVisible());
    layer.setSource(active?.getSource() || null);
  };
  bases.forEach(base => base.on('change:visible', sync));
  sync();
  return layer;
}
//#endregion

//#region 2. Định vị vị trí hiện tại
//Hàm tạo công  cụ định vị
export function createGeolocationTool(map, beforeStart = function () {}) {
  let active = false;
  let hasZoomed = false;

  //Khởi tạo đối tượng định vị
  const geolocation = new Geolocation({
    trackingOptions: {
      enableHighAccuracy: true
    },
    projection: map.getView().getProjection()
  });

  //Tạo đối tượng hiển thị vị trí
  const positionFeature = new Feature();
  positionFeature.setStyle(new Style({
      image: new CircleStyle({
        radius: 8,
        fill: new Fill({
          color: '#cc0f2b'
        }),
        stroke: new Stroke({
          color: '#ffffff',
          width: 3
        })
      })
    })
  );

  //Tạo lớp chứa vị trí
  const positionLayer = new VectorLayer({
    visible: false,
    source: new VectorSource({
      features: [positionFeature]
    }),
    zIndex: 9999
  });
  map.addLayer(positionLayer);

  //Tạo nút định vị
  const button = document.createElement('button');
  button.className = 'ol-locate-btn';
  button.title = 'Định vị vị trí hiện tại';
  button.innerHTML = `<svg class="map-control-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><circle class="icon-fill" cx="12" cy="12" r="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>`;
  //Tạo control định vị
  const element = document.createElement('div');
  element.className = 'ol-locate ol-control';
  element.appendChild(button);
  const control = new Control({
    element
  });
  map.addControl(control);

  //Cập nhật trạng thái nút
  function updateButton() {
    button.classList.toggle('active', active);
    button.title = active
      ? 'Tắt định vị vị trí hiện tại'
      : 'Định vị vị trí hiện tại';
  }

  //Hàm bật vị trí
  function start() {
    active = true;
    hasZoomed = false;
    positionLayer.setVisible(true);
    geolocation.setTracking(true);
    updateButton();
  }

  //Hàm tắt vị trí
  function stop() {
    active = false;
    hasZoomed = false;
    geolocation.setTracking(false);
    positionFeature.setGeometry(null);
    positionLayer.setVisible(false);
    updateButton();
  }

  //Hàm bật/tắt vị trí
  function toggle() {
    if (active) {
      stop();
      return;
    }
    beforeStart();
    start();
  }

  //Hàm xử lí khi vị trí thay đổi
  geolocation.on('change:position', function () {
    if (!active) return;

    const coordinates = geolocation.getPosition(); //Lấy tọa độ hiện tại của người dùng
    if (!coordinates) return;

    //Cập nhật vị trí điểm
    positionFeature.setGeometry(
      new Point(coordinates)
    );
    positionLayer.setVisible(true);

    //Đưa bản đồ tới vị trí mới
    if (!hasZoomed) {
      map.getView().animate({
        center: coordinates,
        zoom: 15,
        duration: 800
      });
      hasZoomed = true;
    }
  });

  //Xử lí khi có lỗi xảy ra
  geolocation.on('error', function (error) {
    alert( 'Không lấy được vị trí: ' + error.message);
    stop();
  });

  button.onclick = toggle;

  return {
    button,
    control,
    positionLayer,
    start,
    stop,
    toggle
  };
}
//#endregion
