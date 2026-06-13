//#region 1. IMPORT THƯ VIỆN
import 'ol/ol.css';
import 'ol-layerswitcher/dist/ol-layerswitcher.css';
import './style.css';
import Map from 'ol/Map.js';
import View from 'ol/View.js';
import TileLayer from 'ol/layer/Tile.js';
import VectorLayer from 'ol/layer/Vector.js';
import LayerGroup from 'ol/layer/Group.js';
import OSM from 'ol/source/OSM.js';
import XYZ from 'ol/source/XYZ.js';
import TileWMS from 'ol/source/TileWMS.js';
import VectorSource from 'ol/source/Vector.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import { fromLonLat, getPointResolution } from 'ol/proj.js';
import LayerSwitcher from 'ol-layerswitcher';
import Overlay from 'ol/Overlay.js';
import Draw from 'ol/interaction/Draw.js';
import {Style,Fill,Stroke,Circle as CircleStyle} from 'ol/style.js';
import { jsPDF } from 'jspdf';

//control
import ZoomToExtent from 'ol/control/ZoomToExtent.js';
import ScaleLine from 'ol/control/ScaleLine.js';
import MousePosition from 'ol/control/MousePosition.js';
import { createStringXY } from 'ol/coordinate.js';
import OverviewMap from 'ol/control/OverviewMap.js';
import FullScreen from 'ol/control/FullScreen.js';
import Control from 'ol/control/Control.js';

import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import { LineString, Polygon } from 'ol/geom.js';
import DragBox from 'ol/interaction/DragBox.js';
import Geolocation from 'ol/Geolocation.js';
import { getLength, getArea } from 'ol/sphere.js';
import DragPan from 'ol/interaction/DragPan.js';
//#endregion

//#region 2. BẢN ĐỒ NỀN
const osmLayer = new TileLayer({
  title: 'OpenStreetMap', //Tiêu đề
  type: 'base', //Loại bản đồ nền
  visible: false, //Hiển thị ?
  source: new OSM({
    crossOrigin: 'anonymous'
  }
  ) //Tạo nguồn OSM load từ openstreetmap.org
});
const toPoLayer = new TileLayer({
  title: 'Địa hình',
  type: 'base',
  visible: false,
  source: new OSM({
    url: 'https://{a-c}.tile.opentopomap.org/{z}/{x}/{y}.png',
    crossOrigin: 'anonymous'
  })
});
const satelliteLayer = new TileLayer({
  title: 'Vệ tinh',
  type: 'base',
  visible: true,
  source: new XYZ({
    url: 'http://mt0.google.com/vt/lyrs=s&hl=en&x={x}&y={y}&z={z}', 
    crossOrigin: 'anonymous'
  })
});
//#endregion

//#region 3. CÁC LỚP WMS TỪ GEOSERVER
const wmsVN_Tinh = new TileLayer({
  title: 'WMS - Việt Nam tỉnh',
  visible: true,
  source: new TileWMS({
    url: 'http://localhost:8080/geoserver/webgis/wms',
    params: {
      LAYERS: 'vn_tinh',
      TILED: true
    },
    serverType: 'geoserver',
    crossOrigin: 'anonymous'

  })
});

const wmsVN_Xa = new TileLayer({
  title: 'WMS - Việt Nam xã',
  visible: true,
  source: new TileWMS({
    url: 'http://localhost:8080/geoserver/webgis/wms',
    params: {
      LAYERS: 'vn_xa',
      TILED: true
    },
    serverType: 'geoserver',
    crossOrigin: 'anonymous'
  })
});

const wmsTinhLo = new TileLayer({
  title: 'WMS - Tỉnh lộ',
  visible: true,
  source: new TileWMS({
    url: 'http://localhost:8080/geoserver/webgis/wms',
    params: {
      LAYERS: 'tinhlo',
      TILED: true
    },
    serverType: 'geoserver',
    crossOrigin: 'anonymous'
  })
});

const wmsQlo = new TileLayer({
  title: 'WMS - Quốc lộ',
  visible: true,
  source: new TileWMS({
    url: 'http://localhost:8080/geoserver/webgis/wms',
    params: {
      LAYERS: 'qlo',
      TILED: true
    },
    serverType: 'geoserver',
    crossOrigin: 'anonymous'
  })
});

const wmsUyBan = new TileLayer({
  title: 'WMS - UBND',
  visible: true,
  source: new TileWMS({
    url: 'http://localhost:8080/geoserver/webgis/wms',
    params: {
      LAYERS: 'ub_tinh',
      TILED: true
    },
    serverType: 'geoserver',
    crossOrigin: 'anonymous'
  })
});

const wmsNenBien = new TileLayer({
  title: 'WMS - Nền biển',
  visible: true,
  source: new TileWMS({
    url: 'http://localhost:8080/geoserver/webgis/wms',
    params: {
      LAYERS: 'nenbien',
      TILED: true
    },
    serverType: 'geoserver',
    crossOrigin: 'anonymous'
  })
}); 

//#endregion

//#region 4. CÁC LỚP WFS TỪ GEOSERVER
const wfsVN_Tinh = new VectorLayer({
  title: 'WFS - Tỉnh',
  visible: true,
  source: new VectorSource({
    format: new GeoJSON(),
    url: 'http://localhost:8080/geoserver/webgis/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=webgis:vn_tinh&outputFormat=application/json'
  }),
  style: new Style({
    fill: new Fill({
      color: 'rgba(0, 0, 255, 0.5)'
    }),
    stroke: new Stroke({
      color: 'blue',
      width: 2
    })
  })
});

const wfsVN_Xa = new VectorLayer({
  title: 'WFS - Xã',
  visible: true,
  source: new VectorSource({
    format: new GeoJSON(),
    url: 'http://localhost:8080/geoserver/webgis/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=webgis:vn_xa&outputFormat=application/json'
  }),
  style: new Style({
    fill: new Fill({
      color: 'rgba(255, 0, 0, 0.5)'
    }),
    stroke: new Stroke({
      color: 'red',
      width: 2
    })
  })
});

const wfsTinhLo = new VectorLayer({
  title: 'WFS - Tỉnh lộ',
  visible: true,
  source: new VectorSource({
    format: new GeoJSON(),
    url: 'http://localhost:8080/geoserver/webgis/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=webgis:tinhlo&outputFormat=application/json'
  }),
  style: new Style({
    stroke: new Stroke({
      color: 'green',
      width: 2
    })
  })
});

const wfsQlo = new VectorLayer({
  title: 'WFS - Quốc lộ',
  visible: true,
  source: new VectorSource({
    format: new GeoJSON(),
    url: 'http://localhost:8080/geoserver/webgis/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=webgis:qlo&outputFormat=application/json'
  }),
  style: new Style({
    stroke: new Stroke({
      color: 'orange',
      width: 2
    })
  })
}); 

const wfsUyBan = new VectorLayer({
  title: 'WFS - UBND',
  visible: true,
  source: new VectorSource({
    format: new GeoJSON(),
    url: 'http://localhost:8080/geoserver/webgis/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=webgis:ub_tinh&outputFormat=application/json'
  }),
  style: new Style({
    image: new CircleStyle({
      radius: 6,
      fill: new Fill({
        color: 'red'
      }),
      stroke: new Stroke({
        color: 'white',
        width: 2
      })
    })
  })
});

const wfsNenBien = new VectorLayer({
  title: 'WFS - Nền biển',
  visible: true,
  source: new VectorSource({
    format: new GeoJSON(),
    url: 'http://localhost:8080/geoserver/webgis/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=webgis:nenbien&outputFormat=application/json'
  }),
  style: new Style({
    fill: new Fill({
      color: 'rgba(0, 255, 255, 0.5)'
    }),
    stroke: new Stroke({
      color: 'cyan',
      width: 2
    })
  })
});
//#endregion

//#region 5. LỚP RASTER WMS

const rasterHN = new TileLayer({
  title: 'Hà Nội',
  visible: false,
  source: new TileWMS({
    url: 'http://localhost:8080/geoserver/webgis/wms',
    params: {
      LAYERS: 'HaNoi_raster',
      TILED: true
    },
    serverType: 'geoserver'
  })
});

//#endregion

//#region 6. NHÓM CÁC LỚP BẢN ĐỒ

const baseGroup = new LayerGroup({
  title: 'Bản đồ nền',
  layers: [
    osmLayer,
    toPoLayer,
    satelliteLayer
  ]
});

const wmsGroup = new LayerGroup({
  title: 'Bản đồ WMS',
  layers: [
    wmsNenBien,  
    wmsVN_Tinh,
    wmsVN_Xa, 
    wmsTinhLo,
    wmsQlo,
    wmsUyBan
  ]
});

const wfsGroup = new LayerGroup({
  title: 'Bản đồ WFS',
  visible: false,  
  layers: [
    wfsVN_Tinh,
    wfsVN_Xa,
    wfsTinhLo,
    wfsQlo,
    wfsUyBan,
    wfsNenBien    
  ]
});

const rasterGroup = new LayerGroup({
  title: 'Bản đồ raster',
  layers: [
    rasterHN
  ]
});

//#endregion

//#region 7. KHỞI TẠO BẢN ĐỒ

const map = new Map({
  target: 'map',
  layers: [
    baseGroup,
    wmsGroup,
    wfsGroup,
    rasterGroup
  ],
  view: new View({
    center: fromLonLat([105.8, 21.04]),
    zoom: 8
  })
});
//#endregion

//#region 8. THÊM CÁC CONTROL CƠ BẢN
const layerSwitcher = new LayerSwitcher({
  reverse: true,
  groupSelectStyle: 'group'
});
map.addControl(layerSwitcher);

// 1. ZoomToExtent - quay về phạm vi Hà Nội
const zoomToExtentControl = new ZoomToExtent({
  extent: fromLonLat([105.2, 20.5]).concat(fromLonLat([106.5, 21.6]))
});
map.addControl(zoomToExtentControl);

// 2. ScaleLine - thước tỷ lệ bản đồ
const scaleLineControl = new ScaleLine({
  units: 'metric',
  bar: true,
  steps: 4,
  text: true,
  minWidth: 140
});
map.addControl(scaleLineControl);

// 3. MousePosition - hiển thị tọa độ chuột
const mousePositionControl = new MousePosition({
  coordinateFormat: createStringXY(6),
  projection: 'EPSG:4326',
  className: 'custom-mouse-position',
  target: document.getElementById('mouse-position'),
  undefinedHTML: '&nbsp;'
});
map.addControl(mousePositionControl);

// 4. OverviewMap - bản đồ tổng quan
const overviewMapControl = new OverviewMap({
  collapsed: false,
  layers: [
    new TileLayer({
      source: new OSM()
    })
  ]
});
map.addControl(overviewMapControl);
// Bấm phím N để ẩn / hiện bản đồ tổng quan
document.addEventListener('keydown', function (event) {
  if (event.key === 'n' || event.key === 'N') {
    overviewMapControl.setCollapsed(!overviewMapControl.getCollapsed());
  }
});

// 5. FullScreen - toàn màn hình
const fullScreenControl = new FullScreen();
map.addControl(fullScreenControl);

//#endregion

//#region 9. THÊM CÁC CONTROL NÂNG CAO

//#region 9.1.  CÔNG CỤ ĐO KHOẢNG CÁCH / DIỆN TÍCH
// Nguồn và lớp lưu kết quả đo
const measureSource = new VectorSource();
const measureLayer = new VectorLayer({
  title: 'Lớp đo đạc',
  source: measureSource,
  style: new Style({
    fill: new Fill({
      color: 'rgba(255,255,255,0.2)'
    }),
    stroke: new Stroke({
      color: '#ff0000',
      width: 2
    }),
    image: new CircleStyle({
      radius: 5,
      fill: new Fill({
        color: '#ff0000'
      })
    })
  })
});
map.addLayer(measureLayer);

// BIẾN QUẢN LÝ TRẠNG THÁI ĐO ĐẠC
let measureDraw = null;
let movingTooltip = null;
let movingTooltipElement = null;
let segmentCount = 0;

// PANEL ĐO ĐẠC
const measurePanel = document.createElement('div');
measurePanel.id = 'measure-panel';
measurePanel.className = 'advanced-panel';

measurePanel.innerHTML = `
  <div class="advanced-panel-header" id="measure-panel-header">
    <span>Công cụ đo đạc</span>
    <button id="measure-panel-close" class="advanced-panel-close" title="Tắt công cụ đo">×</button>
  </div>

  <div class="advanced-panel-body">
    <button id="measure-line-btn">Đo khoảng cách</button>
    <button id="measure-area-btn">Đo diện tích</button>
    <button id="measure-clear-btn">Xóa kết quả đo</button>
  </div>
`;

document.querySelector('.map-wrapper').appendChild(measurePanel);

const measurePanelHeader = measurePanel.querySelector('#measure-panel-header');
const measurePanelClose = measurePanel.querySelector('#measure-panel-close');
const measureLineBtn = measurePanel.querySelector('#measure-line-btn');
const measureAreaBtn = measurePanel.querySelector('#measure-area-btn');
const measureClearBtn = measurePanel.querySelector('#measure-clear-btn');

// KÉO PANEL
function makePanelDraggable(panel, header) {
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;

  header.addEventListener('mousedown', function (e) {
    if (e.target.closest('button')) return;

    dragging = true;

    startX = e.clientX;
    startY = e.clientY;

    const rect = panel.getBoundingClientRect();
    startLeft = rect.left;
    startTop = rect.top;

    panel.style.left = startLeft + 'px';
    panel.style.top = startTop + 'px';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';

    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', function (e) {
    if (!dragging) return;

    panel.style.left = startLeft + e.clientX - startX + 'px';
    panel.style.top = startTop + e.clientY - startY + 'px';
  });

  document.addEventListener('mouseup', function () {
    dragging = false;
    document.body.style.userSelect = '';
  });
}

makePanelDraggable(measurePanel, measurePanelHeader);


// HÀM ĐỊNH DẠNG KẾT QUẢ
function formatLength(line) {
  const length = getLength(line);
  if (length >= 1000) {
    return (length / 1000).toFixed(2) + ' km';
  }
  return length.toFixed(2) + ' m';
}

function formatArea(polygon) {
  const area = getArea(polygon);
  if (area >= 1000000) {
    return (area / 1000000).toFixed(2) + ' km²';
  }
  return area.toFixed(2) + ' m²';
}

function getMidPoint(coord1, coord2) {
  return [
    (coord1[0] + coord2[0]) / 2,
    (coord1[1] + coord2[1]) / 2
  ];
}


// TẠO TOOLTIP
function createTooltip(className, offset = [0, -12]) {
  const element = document.createElement('div');
  element.className = className;

  const overlay = new Overlay({
    element: element,
    offset: offset,
    positioning: 'bottom-center',
    stopEvent: false
  });

  map.addOverlay(overlay);

  return {
    element,
    overlay
  };
}

function createMovingTooltip() {
  const tooltip = createTooltip('measure-tooltip', [10, -15]);
  movingTooltipElement = tooltip.element;
  movingTooltip = tooltip.overlay;
}

function createStaticTooltip(text, coordinate, extraClass = '') {
  const tooltip = createTooltip(
    'measure-tooltip measure-tooltip-static ' + extraClass,
    [0, -10]
  );

  tooltip.element.innerHTML = text;
  tooltip.overlay.setPosition(coordinate);

  return tooltip.overlay;
}

// XÓA TOOLTIP DI ĐỘNG
function removeMovingTooltip() {
  if (movingTooltip) {
    map.removeOverlay(movingTooltip);
  }

  movingTooltip = null;
  movingTooltipElement = null;
}

// DỪNG THAO TÁC ĐO ĐANG CHẠY
function stopMeasureDrawOnly() {
  if (measureDraw) {
    map.removeInteraction(measureDraw);
    measureDraw = null;
  }

  removeMovingTooltip();
  segmentCount = 0;
}

// HIỂN THỊ NHÃN KHOẢNG CÁCH TỪNG CẠNH
function addSegmentLabels(coords, maxIndex) {
  for (let i = segmentCount; i < maxIndex; i++) {
    const start = coords[i];
    const end = coords[i + 1];

    if (!start || !end) continue;

    const segment = new LineString([start, end]);
    const segmentLength = formatLength(segment);
    const midPoint = getMidPoint(start, end);

    createStaticTooltip(segmentLength, midPoint, 'measure-tooltip-segment');
  }
  segmentCount = maxIndex;
}

// ĐO KHOẢNG CÁCH
function startMeasureLine() {
  stopMeasureDrawOnly();
  createMovingTooltip();

  measureDraw = new Draw({
    source: measureSource,
    type: 'LineString'
  });

  map.addInteraction(measureDraw);

  measureDraw.on('drawstart', function (event) {
    const geometry = event.feature.getGeometry();

    geometry.on('change', function (evt) {
      const line = evt.target;
      const coords = line.getCoordinates();

      if (coords.length < 2) return;

      // Khi đã chốt cạnh trước đó, hiển thị nhãn cố định cho cạnh đó
      // Điểm cuối cùng trong lúc vẽ là vị trí chuột đang di động
      const completedSegmentCount = Math.max(coords.length - 2, 0);
      addSegmentLabels(coords, completedSegmentCount);

      // Hiển thị nhãn di động cho cạnh đang vẽ
      const start = coords[coords.length - 2];
      const end = coords[coords.length - 1];

      const currentSegment = new LineString([start, end]);
      const currentLength = formatLength(currentSegment);
      const currentMidPoint = getMidPoint(start, end);

      if (movingTooltip && movingTooltipElement) {
        movingTooltipElement.innerHTML = currentLength;
        movingTooltip.setPosition(currentMidPoint);
      }
    });
  });

  measureDraw.on('drawend', function (event) {
    const geometry = event.feature.getGeometry();
    const coords = geometry.getCoordinates();

    // Hiển thị nốt nhãn của cạnh cuối cùng
    addSegmentLabels(coords, coords.length - 1);

    // Hiển thị tổng chiều dài ở điểm cuối polyline
    const totalLength = formatLength(geometry);
    const lastCoord = coords[coords.length - 1];

    createStaticTooltip(
      'Tổng: ' + totalLength,
      lastCoord,
      'measure-tooltip-total'
    );

    stopMeasureDrawOnly();
  });
}

// ĐO DIỆN TÍCH
function startMeasureArea() {
  stopMeasureDrawOnly();
  createMovingTooltip();

  measureDraw = new Draw({
    source: measureSource,
    type: 'Polygon'
  });

  map.addInteraction(measureDraw);

  measureDraw.on('drawstart', function (event) {
    const geometry = event.feature.getGeometry();

    geometry.on('change', function (evt) {
      const polygon = evt.target;
      const areaText = formatArea(polygon);
      const center = polygon.getInteriorPoint().getCoordinates();

      if (movingTooltip && movingTooltipElement) {
        movingTooltipElement.innerHTML = areaText;
        movingTooltip.setPosition(center);
      }
    });
  });

  measureDraw.on('drawend', function (event) {
    const polygon = event.feature.getGeometry();
    const areaText = formatArea(polygon);
    const center = polygon.getInteriorPoint().getCoordinates();

    createStaticTooltip(
      'Diện tích: ' + areaText,
      center,
      'measure-tooltip-total'
    );

    stopMeasureDrawOnly();
  });
}

// XÓA TOÀN BỘ KẾT QUẢ ĐO
function clearMeasure() {
  stopMeasureDrawOnly();
  measureSource.clear();

  map.getOverlays().getArray().slice().forEach(function (overlay) {
    const element = overlay.getElement();

    if (element && element.classList.contains('measure-tooltip')) {
      map.removeOverlay(overlay);
    }
  });

  measurePanel.classList.add('active');
}

// ĐÓNG PANEL ĐO
function closeMeasurePanel() {
  stopMeasureDrawOnly();
  measurePanel.classList.remove('active');
}

// SỰ KIỆN NÚT
measureLineBtn.addEventListener('click', startMeasureLine);
measureAreaBtn.addEventListener('click', startMeasureArea);
measureClearBtn.addEventListener('click', clearMeasure);
measurePanelClose.addEventListener('click', closeMeasurePanel);
//#endregion

//#region 9.2.  CHỌN ĐỐI TƯỢNG BẰNG VÙNG HỘP
let selectBoxActive = false;
let selectedFeatures = [];

// Các lớp WFS cho phép chọn
const selectableLayers = [
  { id: 'tinhlo', name: 'Tỉnh lộ', layer: wfsTinhLo },
  { id: 'uyban', name: 'Ủy ban', layer: wfsUyBan },
  { id: 'vn_tinh', name: 'Tỉnh', layer: wfsVN_Tinh },
  { id: 'vn_xa', name: 'Xã', layer: wfsVN_Xa },
  { id: 'qlo', name: 'Quốc lộ', layer: wfsQlo },
  { id: 'nenbien', name: 'Nền biển', layer: wfsNenBien },
];

const selectedStyle = new Style({
  fill: new Fill({ color: 'rgba(255,255,0,0.35)' }),
  stroke: new Stroke({ color: '#ffff00', width: 3 }),
  image: new CircleStyle({
    radius: 8,
    fill: new Fill({ color: '#ffff00' }),
    stroke: new Stroke({ color: '#fff', width: 2 })
  })
});

// ================== TẠO PANEL ==================
const selectBoxPanel = document.createElement('div');
selectBoxPanel.id = 'select-box-panel';
selectBoxPanel.className = 'advanced-panel';

selectBoxPanel.innerHTML = `
  <div class="advanced-panel-header">
    <span>Chọn đối tượng bằng vùng hộp</span>
    <button id="select-box-close" class="advanced-panel-close">×</button>
  </div>

  <div class="advanced-panel-body">
    <div class="select-box-guide">
      Chọn lớp WFS cần lấy đối tượng, sau đó kéo chuột trên bản đồ.
    </div>

    <div id="select-box-layer-list"></div>

    <button id="select-box-clear">Xóa kết quả chọn</button>

    <div class="select-box-summary">
      Số đối tượng đã chọn: <b id="select-box-count">0</b>
    </div>

    <ul id="select-box-result" class="advanced-result-list"></ul>
  </div>
`;

document.querySelector('.map-wrapper').appendChild(selectBoxPanel);

const layerListBox = document.getElementById('select-box-layer-list');
const resultList = document.getElementById('select-box-result');
const countBox = document.getElementById('select-box-count');
const selectBoxPanelHeader = selectBoxPanel.querySelector('.advanced-panel-header');
makePanelDraggable(selectBoxPanel, selectBoxPanelHeader);

// ================== TẠO CHECKBOX LỚP WFS ==================
function renderLayerCheckboxes() {
  layerListBox.innerHTML = '';
  selectableLayers.forEach(item => {
    // Chỉ hiện checkbox với lớp WFS đang bật
    if (!item.layer.getVisible()) return;

    layerListBox.innerHTML += `
      <label class="select-box-layer-item">
        <input type="checkbox" value="${item.id}" checked>
        ${item.name}
      </label>
    `;
  });

  if (layerListBox.innerHTML === '') {
    layerListBox.innerHTML = `<div class="select-box-empty">Không có lớp WFS nào đang bật</div>`;
  }
}

function getCheckedLayers() {
  const checkedIds = [...layerListBox.querySelectorAll('input:checked')]
    .map(input => input.value);

  return selectableLayers.filter(item =>
    checkedIds.includes(item.id) &&
    item.layer.getVisible()
  );
}

// ================== HÀM PHỤ ==================
function getName(feature, index) {
  return (
    feature.get('ten') ||
    feature.get('ten_tinh') ||
    feature.get('ten_xa') ||
    feature.get('tenduong') ||
    feature.get('td') ||
    feature.get('dosau') ||
    feature.get('ma_tinh') ||
    feature.get('ma_xa') ||
    feature.get('name') ||
    'Đối tượng ' + (index + 1)
  );
}

function clearSelectBox() {
  selectedFeatures.forEach(f => f.setStyle(null));
  selectedFeatures = [];

  resultList.innerHTML = '';
  countBox.innerText = '0';
}

function findFeaturesInBox(extent) {
  const items = [];
  const checkedLayers = getCheckedLayers();

  checkedLayers.forEach(item => {
    const source = item.layer.getSource();
    if (!source) return;

    source.getFeatures().forEach(feature => {
      const geom = feature.getGeometry();
      if (!geom) return;

      if (geom.intersectsExtent(extent)) {
        items.push({
          feature: feature,
          layerName: item.name
        });
      }
    });
  });

  return items;
}

function showResult(items) {
  resultList.innerHTML = '';
  countBox.innerText = items.length;

  if (items.length === 0) {
    resultList.innerHTML = '<li>Không có đối tượng nào trong vùng chọn</li>';
    return;
  }

  items.forEach((item, index) => {
    const li = document.createElement('li');

    li.innerHTML = `
      <b>${index + 1}. ${getName(item.feature, index)}</b><br>
      <span>${item.layerName}</span>
    `;

    li.onclick = () => {
      map.getView().fit(item.feature.getGeometry().getExtent(), {
        padding: [80, 80, 80, 80],
        duration: 500,
        maxZoom: 15
      });
    };

    resultList.appendChild(li);
  });
}

//  DRAG BOX
const selectBox = new DragBox({
  condition: () => selectBoxActive
});

selectBox.on('boxstart', clearSelectBox);

selectBox.on('boxend', () => {
  const extent = selectBox.getGeometry().getExtent();
  const items = findFeaturesInBox(extent);

  items.forEach(item => {
    item.feature.setStyle(selectedStyle);
    selectedFeatures.push(item.feature);
  });

  showResult(items);
});


//  BẬT / TẮT TOOL 
function openSelectBoxTool() {
  selectBoxActive = true;
  clearSelectBox();
  renderLayerCheckboxes();

  if (!map.getInteractions().getArray().includes(selectBox)) {
    map.addInteraction(selectBox);
  }

  selectBoxPanel.classList.add('active');
  map.getTargetElement().style.cursor = 'crosshair';
}

function closeSelectBoxTool() {
  selectBoxActive = false;
  clearSelectBox();

  if (map.getInteractions().getArray().includes(selectBox)) {
    map.removeInteraction(selectBox);
  }

  selectBoxPanel.classList.remove('active');
  map.getTargetElement().style.cursor = '';
}


//  SỰ KIỆN NÚT 
document.getElementById('select-box-close').onclick = closeSelectBoxTool;
document.getElementById('select-box-clear').onclick = clearSelectBox;

//#endregion

//#region 9.3.  GEOLOCATION - ĐỊNH VỊ HIỆN TẠI

let isGeolocationActive = false;
let hasZoomedToCurrentPosition = false;
let locateButton = null;

const geolocation = new Geolocation({
  trackingOptions: {
    enableHighAccuracy: true
  },
  projection: map.getView().getProjection()
});

const geolocationFeature = new Feature();

geolocationFeature.setStyle(
  new Style({
    image: new CircleStyle({
      radius: 8,
      fill: new Fill({
        color: '#1a73e8'
      }),
      stroke: new Stroke({
        color: '#ffffff',
        width: 3
      })
    })
  })
);

const geolocationLayer = new VectorLayer({
  title: 'Vị trí hiện tại',
  visible: false,
  source: new VectorSource({
    features: [
      geolocationFeature
    ]
  }),
  zIndex: 9999
});

map.addLayer(geolocationLayer);

function updateLocateButton(active) {
  if (!locateButton) return;

  if (active) {
    locateButton.classList.add('active');
    locateButton.title = 'Tắt định vị vị trí hiện tại';
  } else {
    locateButton.classList.remove('active');
    locateButton.title = 'Định vị vị trí hiện tại';
  }
}

geolocation.on('change:position', function () {
  if (!isGeolocationActive) {
    return;
  }

  const coordinates = geolocation.getPosition();

  if (!coordinates) {
    return;
  }

  geolocationFeature.setGeometry(new Point(coordinates));
  geolocationLayer.setVisible(true);

  if (!hasZoomedToCurrentPosition) {
    map.getView().animate({
      center: coordinates,
      zoom: 15,
      duration: 800
    });

    hasZoomedToCurrentPosition = true;
  }
});

geolocation.on('error', function (error) {
  alert('Không lấy được vị trí: ' + error.message);
  stopGeolocation();
});

function locateUser() {
  isGeolocationActive = true;
  hasZoomedToCurrentPosition = false;

  geolocationLayer.setVisible(true);
  geolocation.setTracking(true);
  updateLocateButton(true);

  const currentPosition = geolocation.getPosition();

  if (currentPosition) {
    geolocationFeature.setGeometry(new Point(currentPosition));

    map.getView().animate({
      center: currentPosition,
      zoom: 15,
      duration: 800
    });

    hasZoomedToCurrentPosition = true;
  }
}

function stopGeolocation() {
  isGeolocationActive = false;
  hasZoomedToCurrentPosition = false;

  geolocation.setTracking(false);

  geolocationFeature.setGeometry(null);
  geolocationLayer.setVisible(false);
  updateLocateButton(false);
}

function createLocateControl() {
  locateButton = document.createElement('button');
  locateButton.className = 'ol-locate-btn';
  locateButton.title = 'Định vị vị trí hiện tại';
  locateButton.innerHTML = `
    <span class="material-symbols-outlined">my_location</span>
  `;

  const locateElement = document.createElement('div');
  locateElement.className = 'ol-locate ol-control';
  locateElement.appendChild(locateButton);

  const locateControl = new Control({
    element: locateElement
  });

  map.addControl(locateControl);

  locateButton.addEventListener('click', function () {
    if (isGeolocationActive) {
      stopGeolocation();
      return;
    }

    // Tắt các công cụ khác trước khi bật định vị
    stopMeasureDrawOnly();
    closeSelectBoxTool();

    measurePanel.classList.remove('active');
    selectBoxPanel.classList.remove('active');

    locateUser();
  });
}

createLocateControl();

//#endregion

//#region 9.4. XUẤT BẢN ĐỒ RA PDF

const pdfDims = {
  a0: [1189, 841],
  a1: [841, 594],
  a2: [594, 420],
  a3: [420, 297],
  a4: [297, 210],
  a5: [210, 148]
};

const printPanel = document.createElement('div');
printPanel.id = 'print-panel';
printPanel.className = 'advanced-panel';

printPanel.innerHTML = `
  <div class="advanced-panel-header" id="print-panel-header">
    <span>Xuất bản đồ PDF</span>
    <button id="print-panel-close" class="advanced-panel-close">×</button>
  </div>

  <div class="advanced-panel-body">
    <label class="pdf-label">Khổ giấy</label>
    <select id="pdf-format" class="pdf-select">
      <option value="a0">A0</option>
      <option value="a1">A1</option>
      <option value="a2">A2</option>
      <option value="a3">A3</option>
      <option value="a4" selected>A4</option>
      <option value="a5">A5</option>
    </select>

    <label class="pdf-label">Độ phân giải</label>
    <select id="pdf-resolution" class="pdf-select">
      <option value="72">72 dpi - nhanh</option>
      <option value="150" selected>150 dpi</option>
      <option value="300">300 dpi - chậm</option>
    </select>

    <label class="pdf-label">Tỷ lệ bản đồ</label>
    <input id="pdf-scale" class="pdf-select" type="number" value="250000" min="1">
    <div style="font-size:12px;color:#666;margin-top:4px">
      Ví dụ: nhập 250000 nghĩa là 1:250.000
    </div>

    <button id="export-pdf-btn">Xuất PDF</button>
  </div>
`;

document.querySelector('.map-wrapper').appendChild(printPanel);

const printPanelHeader = document.getElementById('print-panel-header');
const printPanelClose = document.getElementById('print-panel-close');
const exportPdfBtn = document.getElementById('export-pdf-btn');

makePanelDraggable(printPanel, printPanelHeader);

function openPrintPanel() {
  printPanel.classList.add('active');
}

function closePrintPanel() {
  printPanel.classList.remove('active');
}

printPanelClose.onclick = closePrintPanel;

function exportMapToPDF() {
  const format = document.getElementById('pdf-format').value;
  const dpi = Number(document.getElementById('pdf-resolution').value);
  const scaleDenominator = Number(document.getElementById('pdf-scale').value);

  if (!scaleDenominator || scaleDenominator <= 0) {
    alert('Vui lòng nhập tỷ lệ hợp lệ, ví dụ: 250000');
    return;
  }

  const dim = pdfDims[format];
  const width = Math.round(dim[0] * dpi / 25.4);
  const height = Math.round(dim[1] * dpi / 25.4);

  const view = map.getView();
  const mapEl = map.getTargetElement();

  const oldResolution = view.getResolution();
  const oldWidth = mapEl.style.width;
  const oldHeight = mapEl.style.height;
  const oldSatelliteVisible = satelliteLayer.getVisible();

  // Vì công thức OpenLayers dùng đơn vị mét/mm,
  // nên 1:250000 sẽ đổi thành 250.
  const scale = scaleDenominator / 1000;

  const printResolution =
    scale /
    getPointResolution(
      view.getProjection(),
      dpi / 25.4,
      view.getCenter()
    );

  function restoreMap() {
    scaleLineControl.setDpi();
    mapEl.style.width = oldWidth;
    mapEl.style.height = oldHeight;
    map.updateSize();
    view.setResolution(oldResolution);
    satelliteLayer.setVisible(oldSatelliteVisible);

    exportPdfBtn.disabled = false;
    exportPdfBtn.innerText = 'Xuất PDF';
    document.body.style.cursor = 'auto';
  }

  exportPdfBtn.disabled = true;
  exportPdfBtn.innerText = 'Đang xuất PDF...';
  document.body.style.cursor = 'progress';

  // Tắt tạm lớp vệ tinh Google để tránh lỗi tainted canvas
  satelliteLayer.setVisible(false);

  scaleLineControl.setDpi(dpi);
  mapEl.style.width = width + 'px';
  mapEl.style.height = height + 'px';
  map.updateSize();
  view.setResolution(printResolution);

  map.once('rendercomplete', function () {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);

      map.getViewport()
        .querySelectorAll('.ol-layer canvas, canvas.ol-layer')
        .forEach(function (layerCanvas) {
          if (layerCanvas.width <= 0 || layerCanvas.height <= 0) return;

          const opacity = layerCanvas.parentNode.style.opacity;
          ctx.globalAlpha = opacity === '' ? 1 : Number(opacity || 1);

          const transform = layerCanvas.style.transform;
          let matrix = [1, 0, 0, 1, 0, 0];

          if (transform && transform.startsWith('matrix')) {
            const match = transform.match(/^matrix\(([^\)]*)\)$/);
            if (match) matrix = match[1].split(',').map(Number);
          }

          ctx.setTransform(...matrix);
          ctx.drawImage(layerCanvas, 0, 0);
        });

      ctx.globalAlpha = 1;
      ctx.setTransform(1, 0, 0, 1, 0, 0);

      const pdf = new jsPDF('landscape', 'mm', format);

      pdf.addImage(
        canvas.toDataURL('image/jpeg', 0.95),
        'JPEG',
        0,
        0,
        dim[0],
        dim[1]
      );

      pdf.save('map.pdf');
    } catch (error) {
      console.error(error);
      alert('Không xuất được PDF. Kiểm tra CORS của GeoServer hoặc tắt các lớp nền ngoài như vệ tinh.');
    }

    restoreMap();
  });

  map.renderSync();
}

exportPdfBtn.onclick = exportMapToPDF;

//#endregion

//#region 9.5.  QUẢN LÝ CÔNG CỤ NÂNG CAO
//HÀM TẮT CÔNG CỤ ĐANG DÙNG
function clearCurrentAdvancedTool() {
  stopMeasureDrawOnly();
  closeSelectBoxTool();
  stopGeolocation();
  closePrintPanel();

  measurePanel.classList.remove('active');
  selectBoxPanel.classList.remove('active');
  printPanel.classList.remove('active');
}

// GẮN SỰ KIỆN CHO MENU THAO TÁC
document.querySelectorAll('[data-tool-action]').forEach(function (item) {
  item.addEventListener('click', function () {
    const action = item.dataset.toolAction;
    clearCurrentAdvancedTool();

    if (action === 'measure') {
      measurePanel.classList.add('active');
    }
    if (action === 'select-box') {
      openSelectBoxTool();
      alert('Kéo chuột trực tiếp trên bản đồ để chọn đối tượng');
    }
    if (action === 'print-map') {
      openPrintPanel();
    }
    closeMenu();
  });
});
//#endregion

//#endregion

//#region 10. LỚP DỮ LIỆU TỰ TẠO TỪ FILE GEOJSON
const styleDuLieu = new Style({
  fill: new Fill({
    color: 'rgba(255, 0, 0, 0.5)'
  }),
  stroke: new Stroke({
    color: 'red',
    width: 2
  }),
  image: new CircleStyle({
    radius: 5,
    fill: new Fill({
      color: 'red'
    }),
    stroke: new Stroke({
      color: 'white',
      width: 1
    })
  })
});

const nguonLayer = new VectorSource({
  url: '/data.geojson',
  format: new GeoJSON()
});

const duLieuLayer = new VectorLayer({
  title: 'Dữ liệu tự tạo',
  source: nguonLayer,
  style: styleDuLieu,
  visible: false
});
map.addLayer(duLieuLayer);

//#endregion

//#region 11. POPUP XEM THÔNG TIN ĐỐI TƯỢNG

const container = document.getElementById('popup');
const content = document.getElementById('popup-content');
const closer = document.getElementById('popup-closer');

const popup = new Overlay({
  element: container,
  autoPan: {
    animation: {
      duration: 250
    }
  }
});

map.addOverlay(popup);

// ĐÓNG POPUP
function closePopup() {
  popup.setPosition(undefined);
  cleanHighlight();
  closer.blur();
  return false;
}
closer.onclick = closePopup;

// LẤY GIÁ TRỊ THUỘC TÍNH THEO NHIỀU TÊN TRƯỜNG KHÁC NHAU
function getProp(props, fields) {
  for (const field of fields) {
    if (props[field] !== undefined && props[field] !== null && props[field] !== '') {
      return props[field];
    }
  }
  return '';
}

// XÁC ĐỊNH TÊN LỚP ĐƯỢC CLICK
function getLayerTitleFromFeatureLayer(layer) {
  if (layer === wfsUyBan) return 'UB tỉnh';
  if (layer === wfsTinhLo) return 'Tỉnh lộ';
  if (layer === wfsVN_Tinh) return 'Ranh giới tỉnh';
  if (layer === wfsVN_Xa) return 'Ranh giới xã';
  if (layer === wfsQlo) return 'Quốc lộ';
  if (layer === wfsNenBien) return 'Nền biển';

  return 'Đối tượng';
}

// TẠO NỘI DUNG POPUP
function createPopupContent(result) {
  const props = result.properties;

  if (result.layerTitle === 'UB tỉnh') {
    return `
      <div class="popup_title">Thông tin UB tỉnh</div>
      <div class="popup_content">
        <b>Tên UB:</b> ${getProp(props, ['ten', 'name'])}
      </div>
      <div class="popup_content">
        <b>Tỉnh:</b> ${getProp(props, ['tinh', 'ten_tinh', 'TenTinhT'])}
      </div>
      <div class="popup_content">
        <b>Cấp HC:</b> ${getProp(props, ['caphc'])}
      </div>
      <div class="popup_content">
        <b>GID:</b> ${getProp(props, ['gid', 'id'])}
      </div>
    `;
  }

  if (result.layerTitle === 'Tỉnh lộ') {
    return `
      <div class="popup_title">Thông tin tỉnh lộ</div>

      <div class="popup_content">
        <b>Tên đường:</b> ${getProp(props, ['tenduong', 'ten_duong', 'ten', 'name'])}
      </div>

      <div class="popup_content">
        <b>Loại đường:</b> ${getProp(props, ['loaiduong', 'loai_duong'])}
      </div>

      <div class="popup_content">
        <b>TDG:</b> ${getProp(props, ['tdg'])}
      </div>

      <div class="popup_content">
        <b>GID:</b> ${getProp(props, ['gid', 'id'])}
      </div>
    `;
  }

  if (result.layerTitle === 'Quốc lộ') {
    return `
      <div class="popup_title">Thông tin quốc lộ</div>

      <div class="popup_content">
        <b>Tên / thuộc tính đường:</b> ${getProp(props, ['td', 'tenduong', 'ten_duong', 'ten', 'name'])}
      </div>

      <div class="popup_content">
        <b>Biên tập:</b> ${getProp(props, ['bientap'])}
      </div>

      <div class="popup_content">
        <b>GID:</b> ${getProp(props, ['gid', 'id'])}
      </div>
    `;
  }

  if (result.layerTitle === 'Ranh giới tỉnh') {
    return `
      <div class="popup_title">Thông tin tỉnh</div>

      <div class="popup_content">
        <b>Mã tỉnh:</b> ${getProp(props, ['ma_tinh'])}
      </div>

      <div class="popup_content">
        <b>Tên tỉnh:</b> ${getProp(props, ['ten_tinh', 'TenTinhT', 'ten', 'name'])}
      </div>

      <div class="popup_content">
        <b>Trụ sở:</b> ${getProp(props, ['tru_so'])}
      </div>

      <div class="popup_content">
        <b>Loại:</b> ${getProp(props, ['loai'])}
      </div>

      <div class="popup_content">
        <b>GID:</b> ${getProp(props, ['gid', 'id'])}
      </div>
    `;
  }

  if (result.layerTitle === 'Ranh giới xã') {
    return `
      <div class="popup_title">Thông tin xã</div>

      <div class="popup_content">
        <b>Mã xã:</b> ${getProp(props, ['ma_xa'])}
      </div>

      <div class="popup_content">
        <b>Tên xã:</b> ${getProp(props, ['ten_xa', 'TenXa', 'ten', 'name'])}
      </div>

      <div class="popup_content">
        <b>Tỉnh:</b> ${getProp(props, ['ten_tinh'])}
      </div>

      <div class="popup_content">
        <b>Trụ sở:</b> ${getProp(props, ['tru_so'])}
      </div>

      <div class="popup_content">
        <b>Loại:</b> ${getProp(props, ['loai'])}
      </div>

      <div class="popup_content">
        <b>GID:</b> ${getProp(props, ['gid', 'id'])}
      </div>
    `;
  }

  if (result.layerTitle === 'Nền biển') {
    return `
      <div class="popup_title">Thông tin nền biển</div>

      <div class="popup_content">
        <b>Độ sâu:</b> ${getProp(props, ['dosau', 'ten', 'name'])}
      </div>

      <div class="popup_content">
        <b>GID:</b> ${getProp(props, ['gid', 'id'])}
      </div>
    `;
  }

  return `
    <div class="popup_title">${result.layerTitle}</div>
    <div class="popup_content">Không có thông tin thuộc tính phù hợp</div>
  `;
}

// XỬ LÝ CLICK VÀO ĐỐI TƯỢNG WFS
function handleMapClickWFS(event) {
  let foundFeature = null;
  let foundLayer = null;

  map.forEachFeatureAtPixel(
    event.pixel,
    function (feature, layer) {
      foundFeature = feature;
      foundLayer = layer;
      return true;
    },
    {
      hitTolerance: 8,
      layerFilter: function (layer) {
        return layer === wfsUyBan ||
               layer === wfsTinhLo ||
               layer === wfsVN_Tinh ||
               layer === wfsVN_Xa ||
               layer === wfsQlo ||
               layer === wfsNenBien;
      }
    }
  );

  if (!foundFeature) {
    popup.setPosition(undefined);
    cleanHighlight();
    return;
  }

  highlightFeature(foundFeature);

  const result = {
    layerTitle: getLayerTitleFromFeatureLayer(foundLayer),
    properties: foundFeature.getProperties()
  };

  content.innerHTML = createPopupContent(result);
  popup.setPosition(event.coordinate);
}

//#endregion

//#region 12. HIGHLIGHT ĐỐI TƯỢNG KHI CLICK
const highlightStyle = new Style({
  fill: new Fill({
    color: 'rgba(255, 255, 0, 0.5)'
  }),
  stroke: new Stroke({
    color: 'yellow',
    width: 2
  }),
  image: new CircleStyle({
    radius: 7,
    fill: new Fill({
      color: 'yellow'
    }),
    stroke: new Stroke({
      color: 'white',
      width: 2
    })
  })
});

let selectedFeature = null;
let oldStyle = null;

function cleanHighlight() {
  if (selectedFeature) {
    selectedFeature.setStyle(oldStyle);
    selectedFeature = null;
    oldStyle = null;
  }
}

function highlightFeature(feature) {
  cleanHighlight();

  selectedFeature = feature;
  oldStyle = feature.getStyle();

  selectedFeature.setStyle(highlightStyle);
}

//#endregion

//#region 13. MENU TRÁI

const menubtn = document.getElementById('menu-btn');
const closeMenuBtn = document.getElementById('close-menu');
const sideMenu = document.getElementById('side-menu');
const overlay = document.getElementById('overlay');

function openMenu() {
  sideMenu.classList.add('active');
  overlay.classList.add('active');
}

function closeMenu() {
  sideMenu.classList.remove('active');
  overlay.classList.remove('active');
}

menubtn.addEventListener('click', openMenu);
closeMenuBtn.addEventListener('click', closeMenu);
overlay.addEventListener('click', closeMenu);

// THU GỌN / MỞ RỘNG NHÓM MENU
document.querySelectorAll('.menu-group-title').forEach(function (title) {
  title.addEventListener('click', function () {
    const currentGroup = title.closest('.menu-group');

    document.querySelectorAll('.menu-group').forEach(function (group) {
      if (group !== currentGroup) {
        group.classList.remove('active');
      }
    });

    currentGroup.classList.toggle('active');
  });
});

//#endregion

//#region 14. CẤU HÌNH LỚP THÊM / SỬA / XÓA

const editableLayers = [
  {
    id: 'ub_tinh',
    title: 'UB Tỉnh',
    geometryType: 'Point',
    layer: wfsUyBan,
    apiName: 'ub_tinh',
    fields: [
      { name: 'ten', label: 'Tên UB' },
      { name: 'caphc', label: 'Cấp hành chính' },
      { name: 'tinh', label: 'Tỉnh' }
    ]
  },
  {
    id: 'tinhlo',
    title: 'Tỉnh lộ',
    geometryType: 'LineString',
    layer: wfsTinhLo,
    apiName: 'tinhlo',
    fields: [
      { name: 'tenduong', label: 'Tên đường' },
      { name: 'loaiduong', label: 'Loại đường' },
      { name: 'tdg', label: 'TDG' }
    ]
  },
  {
    id: 'vn_tinh',
    title: 'Ranh giới tỉnh',
    geometryType: 'Polygon',
    layer: wfsVN_Tinh,
    apiName: 'vn_tinh',
    fields: [
      { name: 'ma_tinh', label: 'Mã tỉnh' },
      { name: 'ten_tinh', label: 'Tên tỉnh' },
      { name: 'sap_nhap', label: 'Sáp nhập' },
      { name: 'quy_mo', label: 'Quy mô' },
      { name: 'tru_so', label: 'Trụ sở' },
      { name: 'loai', label: 'Loại' }
    ]
  },
  {
    id: 'vn_xa',
    title: 'Ranh giới xã',
    geometryType: 'Polygon',
    layer: wfsVN_Xa,
    apiName: 'vn_xa',
    fields: [
      { name: 'ma_xa', label: 'Mã xã' },
      { name: 'ten_xa', label: 'Tên xã' },
      { name: 'sap_nhap', label: 'Sáp nhập' },
      { name: 'tru_so', label: 'Trụ sở' },
      { name: 'loai', label: 'Loại' },
      { name: 'ma_tinh', label: 'Mã tỉnh' },
      { name: 'ten_tinh', label: 'Tên tỉnh' }
    ]
  },
  {
    id: 'qlo',
    title: 'Quốc lộ',
    geometryType: 'LineString',
    layer: wfsQlo,
    apiName: 'qlo',
    fields: [
      { name: 'bientap', label: 'Biên tập' },
      { name: 'td', label: 'Tên / thuộc tính đường' }
    ]
  },
  {
    id: 'nenbien',
    title: 'Nền biển',
    geometryType: 'Polygon',
    layer: wfsNenBien,
    apiName: 'nenbien',
    fields: [
      { name: 'dosau', label: 'Độ sâu' }
    ]
  }
];

//#endregion

//#region 15. BIẾN TRẠNG THÁI THÊM / SỬA / XÓA

let currentAction = null;        // add, edit, delete
let currentLayerConfig = null;   // lớp đang thao tác

let drawInteraction = null;      // công cụ vẽ

let newFeature = null;           // đối tượng vừa vẽ
let editingFeature = null;       // đối tượng đang sửa
let deletingFeature = null;      // đối tượng đang xóa

//#endregion

//#region 16. POPUP CHỌN LỚP DỮ LIỆU

const chooseLayerPopup = document.getElementById('choose-layer-popup');
const chooseLayerTitle = document.getElementById('choose-layer-title');
const chooseLayerSelect = document.getElementById('choose-layer-select');
const chooseLayerCancel = document.getElementById('choose-layer-cancel');
const chooseLayerOk = document.getElementById('choose-layer-ok');

function openChooseLayerPopup(action) {
  currentAction = action;

  if (action === 'add') {
    chooseLayerTitle.innerText = 'Chọn lớp để thêm đối tượng';
  } else if (action === 'edit') {
    chooseLayerTitle.innerText = 'Chọn lớp để sửa đối tượng';
  } else if (action === 'delete') {
    chooseLayerTitle.innerText = 'Chọn lớp để xóa đối tượng';
  }

  chooseLayerSelect.innerHTML = '';

  editableLayers.forEach(function (item) {
    const option = document.createElement('option');
    option.value = item.id;
    option.innerText = item.title + ' - ' + item.geometryType;
    chooseLayerSelect.appendChild(option);
  });

  chooseLayerPopup.classList.add('active');
}

function closeChooseLayerPopup() {
  chooseLayerPopup.classList.remove('active');
}

chooseLayerCancel.addEventListener('click', function () {
  closeChooseLayerPopup();
});

chooseLayerOk.addEventListener('click', function () {
  const selectedLayerId = chooseLayerSelect.value;

  currentLayerConfig = editableLayers.find(function (item) {
    return item.id === selectedLayerId;
  });

  closeChooseLayerPopup();

  if (currentAction === 'add') {
    startAdd();
  }

  if (currentAction === 'edit') {
    startEdit();
  }

  if (currentAction === 'delete') {
    startDelete();
  }
});

//#endregion

//#region 17. POPUP NHẬP THUỘC TÍNH
const attributePopup = document.getElementById('attribute-popup');
const attributeForm = document.getElementById('attribute-form');
const attributeCancel = document.getElementById('attribute-cancel');
const attributeSave = document.getElementById('attribute-save');

function createInputField(field, value = '') {
  const label = document.createElement('label');
  label.innerText = field.label;

  const input = document.createElement('input');
  input.type = 'text';
  input.name = field.name;
  input.value = value || '';

  attributeForm.appendChild(label);
  attributeForm.appendChild(input);
}

function openAddAttributePopup() {
  if (!currentLayerConfig) {
    alert('Chưa chọn lớp dữ liệu');
    return;
  }

  attributeForm.innerHTML = '';

  currentLayerConfig.fields.forEach(function (field) {
    createInputField(field);
  });

  attributePopup.classList.add('active');
}

function openEditAttributePopup() {
  if (!currentLayerConfig || !editingFeature) {
    alert('Chưa chọn đối tượng để sửa');
    return;
  }

  attributeForm.innerHTML = '';

  const properties = editingFeature.getProperties();

  currentLayerConfig.fields.forEach(function (field) {
    const oldValue = properties[field.name] || '';
    createInputField(field, oldValue);
  });

  attributePopup.classList.add('active');
}

function closeAttributePopup() {
  attributePopup.classList.remove('active');
}

attributeSave.addEventListener('click', function () {
  const inputs = attributeForm.querySelectorAll('input');

  if (currentAction === 'add') {
    saveAddAttributes(inputs);
    return;
  }

  if (currentAction === 'edit') {
    saveEditAttributes(inputs);
    return;
  }

  alert('Chưa chọn thao tác thêm hoặc sửa');
});

attributeCancel.addEventListener('click', function () {
  if (currentAction === 'add') {
    cancelAdd();
  }

  if (currentAction === 'edit') {
    cancelEdit();
  }

  closeAttributePopup();
});

//#endregion

//#region 18. HÀM DÙNG CHUNG CHO THÊM / SỬA / XÓA

function findFeatureInCurrentLayer(pixel) {
  let foundFeature = null;

  map.forEachFeatureAtPixel(
    pixel,
    function (feature, layer) {
      if (layer === currentLayerConfig.layer) {
        foundFeature = feature;
        return true;
      }
    },
    {
      hitTolerance: 8
    }
  );

  return foundFeature;
}

function resetCrudState() {
  currentAction = null;
  currentLayerConfig = null;
  newFeature = null;
  editingFeature = null;
  deletingFeature = null;
}

function stopDrawInteraction() {
  if (drawInteraction) {
    map.removeInteraction(drawInteraction);
    drawInteraction = null;
  }
}

function featureToGeoJSON(feature) {
  const format = new GeoJSON();

  return format.writeFeatureObject(feature, {
    featureProjection: map.getView().getProjection(),
    dataProjection: 'EPSG:4326'
  });
}

function getFeatureId(feature) {
  const props = feature.getProperties();

  console.log('Feature ID:', feature.getId());
  console.log('Feature properties:', props);

  if (props.gid) {
    return props.gid;
  }

  if (props.id) {
    return props.id;
  }

  const fid = feature.getId();

  if (fid) {
    const parts = fid.toString().split('.');

    if (parts.length === 2) {
      return parts[1];
    }

    return fid;
  }

  return null;
}

function refreshLayer(layerConfig) {
  const source = layerConfig.layer.getSource();

  if (source) {
    source.clear();
    source.refresh();
  }
}
//#endregion

//#region 19. CHỨC NĂNG THÊM DỮ LIỆU

function startAdd() {
  if (!currentLayerConfig) {
    alert('Bạn chưa chọn lớp');
    return;
  }

  alert('Bây giờ hãy vẽ đối tượng trên bản đồ');

  stopDrawInteraction();

  drawInteraction = new Draw({
    source: currentLayerConfig.layer.getSource(),
    type: currentLayerConfig.geometryType
  });

  map.addInteraction(drawInteraction);

  drawInteraction.on('drawend', function (event) {
    newFeature = event.feature;

    stopDrawInteraction();

    openAddAttributePopup();
  });
}

function saveAddAttributes(inputs) {
  if (!newFeature) {
    alert('Chưa có đối tượng mới để lưu');
    return;
  }

  inputs.forEach(function (input) {
    newFeature.set(input.name, input.value);
  });

  const geojson = featureToGeoJSON(newFeature);

  fetch(`http://localhost:8000/mygis/features/${currentLayerConfig.apiName}/add/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(geojson)
  })
    .then(function (response) {
      return response.json();
    })
    .then(function (data) {
      if (!data.success) {
        alert('Lỗi thêm dữ liệu: ' + data.message);
        return;
      }

      alert('Đã lưu đối tượng vào database');

      closeAttributePopup();
      refreshLayer(currentLayerConfig);
      resetCrudState();
    })
    .catch(function (error) {
      console.error(error);
      alert('Lỗi kết nối backend khi thêm dữ liệu');
    });
}
function cancelAdd() {
  if (newFeature && currentLayerConfig) {
    currentLayerConfig.layer.getSource().removeFeature(newFeature);
  }

  resetCrudState();
}
//#endregion

//#region 20. CHỨC NĂNG SỬA DỮ LIỆU

function startEdit() {
  if (!currentLayerConfig) {
    alert('Bạn chưa chọn lớp');
    return;
  }

  alert('Hãy click vào đối tượng cần sửa trên bản đồ');
}

function handleEditClick(event) {
  const foundFeature = findFeatureInCurrentLayer(event.pixel);

  if (!foundFeature) {
    alert('Không tìm thấy đối tượng thuộc lớp đã chọn');
    return;
  }

  editingFeature = foundFeature;

  highlightFeature(editingFeature);

  openEditAttributePopup();
}

function saveEditAttributes(inputs) {
  if (!editingFeature) {
    alert('Chưa chọn đối tượng để sửa');
    return;
  }

  inputs.forEach(function (input) {
    editingFeature.set(input.name, input.value);
  });

  const featureId = getFeatureId(editingFeature);

  if (!featureId) {
    alert('Không tìm thấy ID đối tượng để sửa');
    return;
  }

  const geojson = featureToGeoJSON(editingFeature);

  fetch(`http://localhost:8000/mygis/features/${currentLayerConfig.apiName}/${featureId}/edit/`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(geojson)
  })
    .then(function (response) {
      return response.json();
    })
    .then(function (data) {
      if (!data.success) {
        alert('Lỗi sửa dữ liệu: ' + data.message);
        return;
      }

      alert('Đã sửa dữ liệu trong database');

      closeAttributePopup();
      cleanHighlight();
      refreshLayer(currentLayerConfig);
      resetCrudState();
    })
    .catch(function (error) {
      console.error(error);
      alert('Lỗi kết nối backend khi sửa dữ liệu');
    });
}

function cancelEdit() {
  editingFeature = null;
  cleanHighlight();
  resetCrudState();
}

//#endregion

//#region 21. CHỨC NĂNG XÓA DỮ LIỆU

function startDelete() {
  if (!currentLayerConfig) {
    alert('Bạn chưa chọn lớp');
    return;
  }

  alert('Hãy click vào đối tượng cần xóa trên bản đồ');
}

function handleDeleteClick(event) {
  const foundFeature = findFeatureInCurrentLayer(event.pixel);

  if (!foundFeature) {
    alert('Không tìm thấy đối tượng thuộc lớp đã chọn');
    return;
  }

  deletingFeature = foundFeature;

  highlightFeature(deletingFeature);

  const confirmDelete = confirm('Bạn có chắc chắn muốn xóa đối tượng này không?');

  if (!confirmDelete) {
    cleanHighlight();
    resetCrudState();
    return;
  }

  const featureId = getFeatureId(deletingFeature);

  if (!featureId) {
    alert('Không tìm thấy ID đối tượng để xóa');
    cleanHighlight();
    resetCrudState();
    return;
  }

  fetch(`http://localhost:8000/mygis/features/${currentLayerConfig.apiName}/${featureId}/delete/`, {
    method: 'DELETE'
  })
    .then(function (response) {
      return response.json();
    })
    .then(function (data) {
      if (!data.success) {
        alert('Lỗi xóa dữ liệu: ' + data.message);
        return;
      }

      alert('Đã xóa dữ liệu trong database');

      cleanHighlight();
      refreshLayer(currentLayerConfig);
      resetCrudState();
    })
    .catch(function (error) {
      console.error(error);
      alert('Lỗi kết nối backend khi xóa dữ liệu');
    });
}

//#endregion

//#region 22. SỰ KIỆN MENU THÊM / SỬA / XÓA

document.querySelectorAll('[data-menu-action]').forEach(function (button) {
  button.addEventListener('click', function () {
    const action = button.dataset.menuAction;

    if (action === 'add-data') {
      openChooseLayerPopup('add');
    }

    if (action === 'edit-data') {
      openChooseLayerPopup('edit');
    }

    if (action === 'delete-data') {
      openChooseLayerPopup('delete');
    }

    if (action === 'attribute-table') {
          openAttributeTable();
    }
    closeMenu();
  });
});

//#endregion

//#region 23. SỰ KIỆN CLICK TRÊN BẢN ĐỒ

map.on('singleclick', function (event) {
  if (drawInteraction) {
    return;
  }

  if (currentAction === 'edit') {
    handleEditClick(event);
    return;
  }

  if (currentAction === 'delete') {
    handleDeleteClick(event);
    return;
  }

  handleMapClickWFS(event);
});

//#endregion

//#region BẢNG DỮ LIỆU THUỘC TÍNH VECTOR

let attributeTable = null;
let attributeCache = [];
let attributeHighlightLayer = null;
let attributeLayerConfigs = [];

const attributeTablePanel = document.getElementById('attribute-table-panel');
const attributeLayerSelect = document.getElementById('attribute-layer-select');
const loadAttributeBtn = document.getElementById('load-attribute-btn');
const closeAttributeTableBtn = document.getElementById('close-attribute-table');

function getLayerUrl(layer) {
  const source = layer.getSource();

  if (!source || !source.getUrl) return null;

  const url = source.getUrl();

  if (typeof url !== 'string') return null;

  return url;
}

function createAttributeLayerConfigs() {
  attributeLayerConfigs = [];

  wfsGroup.getLayers().getArray().forEach(function (layer) {
    const url = getLayerUrl(layer);

    if (!url) return;

    attributeLayerConfigs.push({
      title: layer.get('title') || 'Lớp không tên',
      layer: layer,
      url: url
    });
  });
}

function renderAttributeLayerOptions() {
  createAttributeLayerConfigs();

  attributeLayerSelect.innerHTML = '';

  attributeLayerConfigs.forEach(function (config, index) {
    const option = document.createElement('option');

    option.value = index;
    option.innerText = config.title.replace('WFS - ', '');

    attributeLayerSelect.appendChild(option);
  });

  if (attributeLayerConfigs.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.innerText = 'Không có lớp WFS';
    attributeLayerSelect.appendChild(option);
  }
}

function getCurrentAttributeConfig() {
  const index = Number(attributeLayerSelect.value);
  return attributeLayerConfigs[index];
}

function openAttributeTable() {
  renderAttributeLayerOptions();
  attributeTablePanel.classList.add('active');
}

function closeAttributeTable() {
  attributeTablePanel.classList.remove('active');
  clearAttributeHighlight();
}

function clearAttributeHighlight() {
  if (attributeHighlightLayer) {
    map.removeLayer(attributeHighlightLayer);
    attributeHighlightLayer = null;
  }
}

function getAttributeUrl(config) {
  const url = new URL(config.url, window.location.href);

  url.searchParams.set('maxFeatures', '50000');
  url.searchParams.set('outputFormat', 'application/json');

  return url.toString();
}

function zoomToAttributeFeature(rowData) {
  const rawFeature = attributeCache[rowData.__index];

  if (!rawFeature) {
    alert('Không tìm thấy đối tượng');
    return;
  }

  const format = new GeoJSON();

  const feature = format.readFeature(rawFeature, {
    featureProjection: map.getView().getProjection(),
    dataProjection: 'EPSG:4326'
  });

  const geometry = feature.getGeometry();

  if (!geometry) {
    alert('Đối tượng không có hình học');
    return;
  }

  clearAttributeHighlight();

  attributeHighlightLayer = new VectorLayer({
    source: new VectorSource({
      features: [feature]
    }),
    style: new Style({
      fill: new Fill({
        color: 'rgba(255, 0, 0, 0.25)'
      }),
      stroke: new Stroke({
        color: 'red',
        width: 3
      }),
      image: new CircleStyle({
        radius: 8,
        fill: new Fill({
          color: 'red'
        }),
        stroke: new Stroke({
          color: 'white',
          width: 2
        })
      })
    }),
    zIndex: 9999
  });

  map.addLayer(attributeHighlightLayer);

  if (geometry.getType() === 'Point') {
    map.getView().animate({
      center: geometry.getCoordinates(),
      zoom: 14,
      duration: 600
    });
  } else {
    map.getView().fit(geometry.getExtent(), {
      padding: [80, 80, 80, 80],
      duration: 600,
      maxZoom: 15
    });
  }
}

function createAttributeColumns(features) {
  const properties = features[0].properties || {};
  const fields = Object.keys(properties);

  const viewColumn = {
    title: 'Xem',
    formatter: function () {
      return '<span class="table-view-btn">🔍</span>';
    },
    width: 70,
    hozAlign: 'center',
    headerSort: false,
    cellClick: function (e, cell) {
      zoomToAttributeFeature(cell.getRow().getData());
    }
  };

  const attributeColumns = fields.map(function (field) {
    return {
      title: field.toUpperCase(),
      field: field,
      headerFilter: 'input',
      minWidth: 120
    };
  });

  return [viewColumn, ...attributeColumns];
}

function loadAttributeTable() {
  const config = getCurrentAttributeConfig();

  if (!config) {
    alert('Chưa có lớp WFS để tải dữ liệu');
    return;
  }

  loadAttributeBtn.disabled = true;
  loadAttributeBtn.innerText = 'Đang tải...';

  fetch(getAttributeUrl(config))
    .then(function (res) {
      return res.json();
    })
    .then(function (data) {
      const features = data.features || [];

      attributeCache = features;

      if (features.length === 0) {
        alert('Lớp này không có dữ liệu');
        return;
      }

      const rows = features.map(function (feature, index) {
        return {
          ...feature.properties,
          __index: index
        };
      });

      const columns = createAttributeColumns(features);

      if (attributeTable) {
        attributeTable.destroy();
      }

      attributeTable = new window.Tabulator('#tabulator-table', {
        data: rows,
        columns: columns,
        layout: 'fitDataStretch',
        pagination: 'local',
        paginationSize: 10,
        height: '100%',
        placeholder: 'Không có dữ liệu'
      });

      // Đồng bộ lại dữ liệu lên source của lớp WFS
      const format = new GeoJSON();

      const mapFeatures = format.readFeatures(data, {
        featureProjection: map.getView().getProjection(),
        dataProjection: 'EPSG:4326'
      });

      config.layer.getSource().clear();
      config.layer.getSource().addFeatures(mapFeatures);
    })
    .catch(function (error) {
      console.error(error);
      alert('Không tải được dữ liệu từ GeoServer');
    })
    .finally(function () {
      loadAttributeBtn.disabled = false;
      loadAttributeBtn.innerText = 'Tải dữ liệu';
    });
}

loadAttributeBtn.addEventListener('click', loadAttributeTable);
closeAttributeTableBtn.addEventListener('click', closeAttributeTable);

attributeLayerSelect.addEventListener('change', function () {
  clearAttributeHighlight();

  if (attributeTable) {
    attributeTable.clearData();
  }
});

//#endregion