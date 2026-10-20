import ZoomToExtent from 'ol/control/ZoomToExtent.js';
import ScaleLine from 'ol/control/ScaleLine.js';
import OverviewMap from 'ol/control/OverviewMap.js';
import FullScreen from 'ol/control/FullScreen.js';
import TileLayer from 'ol/layer/Tile.js';
import { fromLonLat, toLonLat, getPointResolution } from 'ol/proj.js';

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

function createControlIcon(content) {
  const icon = document.createElement('span');
  icon.className = 'map-control-icon-wrap';
  icon.innerHTML = `<svg class="map-control-icon" viewBox="0 0 24 24">${content}</svg>`;
  return icon;
}

export function createBasicTools(map) {
  // Phóng đến phạm vi Hà Nội
  const bottomLeft = fromLonLat([105.2, 20.5]);
  const topRight = fromLonLat([106.5, 21.6]);
  const zoomToExtentControl = new ZoomToExtent({
    extent: [bottomLeft[0], bottomLeft[1], topRight[0], topRight[1]],
    label: createControlIcon(`<path d="M8 4H4v4M16 4h4v4M4 16v4h4M20 16v4h-4"/><rect x="9" y="9" width="6" height="6" rx="1"/>`),
    tipLabel: 'Xem toàn bộ khu vực'
  });
  map.addControl(zoomToExtentControl);

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

  // Toàn màn hình
  const fullScreenControl = new FullScreen({
    source: document.querySelector('.map-wrapper'),
    label: createControlIcon(`<path d="M9 4H4v5M15 4h5v5M4 15v5h5M20 15v5h-5"/>`),
    labelActive: createControlIcon(`<path d="M4 9h5V4M20 9h-5V4M4 15h5v5M20 15h-5v5"/>`),
    tipLabel: 'Toàn màn hình'
  });
  map.addControl(fullScreenControl);

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
