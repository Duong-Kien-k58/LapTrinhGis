import ZoomToExtent from 'ol/control/ZoomToExtent.js';
import ScaleLine from 'ol/control/ScaleLine.js';
import MousePosition from 'ol/control/MousePosition.js';
import OverviewMap from 'ol/control/OverviewMap.js';
import FullScreen from 'ol/control/FullScreen.js';
import TileLayer from 'ol/layer/Tile.js';
import OSM from 'ol/source/OSM.js';
import { fromLonLat } from 'ol/proj.js';
import { createStringXY } from 'ol/coordinate.js';

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
    units: 'metric',
    bar: true,
    steps: 6,
    text: true,
    bold: true,
    minWidth: 140,
  });
  map.addControl(scaleLineControl);

  // Tọa độ con trỏ chuột
  const mousePositionControl = new MousePosition({
    coordinateFormat: createStringXY(6),
    projection: 'EPSG:4326',
    className: 'custom-mouse-position',
    target: document.getElementById('mouse-position'),
    undefinedHTML: '&nbsp;'
  });
  map.addControl(mousePositionControl);

  // Bản đồ tổng quan
  const overviewMapControl = new OverviewMap({
    collapsed: false,
    layers: [
      new TileLayer({
        source: new OSM()
      })
    ]
  });
  map.addControl(overviewMapControl);

  // Toàn màn hình
  const fullScreenControl = new FullScreen({
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
