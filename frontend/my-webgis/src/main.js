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

import { fromLonLat } from 'ol/proj.js';

import LayerSwitcher from 'ol-layerswitcher';

import Overlay from 'ol/Overlay.js';

import Draw from 'ol/interaction/Draw.js';

import {
  Style,
  Fill,
  Stroke,
  Circle as CircleStyle
} from 'ol/style.js';

//control
import ZoomToExtent from 'ol/control/ZoomToExtent.js';
import ScaleLine from 'ol/control/ScaleLine.js';
import MousePosition from 'ol/control/MousePosition.js';
import { createStringXY } from 'ol/coordinate.js';
import OverviewMap from 'ol/control/OverviewMap.js';
import FullScreen from 'ol/control/FullScreen.js';

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
  source: new OSM() //Tạo nguồn OSM load từ openstreetmap.org
});

const toPoLayer = new TileLayer({
  title: 'Địa hình',
  type: 'base',
  visible: false,
  source: new OSM({
    url: 'https://{a-c}.tile.opentopomap.org/{z}/{x}/{y}.png'
  })
});

const satelliteLayer = new TileLayer({
  title: 'Vệ tinh',
  type: 'base',
  visible: true,
  source: new XYZ({
    url: 'http://mt0.google.com/vt/lyrs=s&hl=en&x={x}&y={y}&z={z}'
  })
});

//#endregion


//#region 3. CÁC LỚP WMS TỪ GEOSERVER

// const wmsRgTinh = new TileLayer({
//   title: 'WMS - Ranh giới tỉnh',
//   visible: true,
//   source: new TileWMS({ //Lấy nguồn dữ liệu từ WMS dạng tile
//     url: 'http://localhost:8080/geoserver/webgis/wms', //địa chỉ máy chủ geoserver/ứng dụng geoserver/workspace/dịch vụ wms
//     params: {
//       LAYERS: 'rgtinh',
//       TILED: true
//     },
//     serverType: 'geoserver'
//   })
// });

const wmsVN_Tinh = new TileLayer({
  title: 'WMS - Việt Nam tỉnh',
  visible: true,
  source: new TileWMS({
    url: 'http://localhost:8080/geoserver/webgis/wms',
    params: {
      LAYERS: 'vn_tinh',
      TILED: true
    },
    serverType: 'geoserver'
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
    serverType: 'geoserver'
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
    serverType: 'geoserver'
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
    serverType: 'geoserver'
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
    serverType: 'geoserver'
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
    serverType: 'geoserver'
  })
}); 

//#endregion


//#region 4. CÁC LỚP WFS TỪ GEOSERVER

const wfsRgTinh = new VectorLayer({
  title: 'WFS - Ranh giới tỉnh',
  visible: true,
  source: new VectorSource({
    format: new GeoJSON(),
    url: 'http://localhost:8080/geoserver/webgis/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=webgis:rgtinh&outputFormat=application/json'
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
    wfsRgTinh,
    wfsTinhLo,
    wfsUyBan
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

// ===============================
// 1. ZoomToExtent - quay về phạm vi Hà Nội
// ===============================
const zoomToExtentControl = new ZoomToExtent({
  extent: fromLonLat([105.2, 20.5]).concat(fromLonLat([106.5, 21.6]))
});
map.addControl(zoomToExtentControl);

// ===============================
// 2. ScaleLine - thước tỷ lệ bản đồ
// ===============================
const scaleLineControl = new ScaleLine({
  units: 'metric',
  bar: true,
  steps: 4,
  text: true,
  minWidth: 140
});
map.addControl(scaleLineControl);

// ===============================
// 3. MousePosition - hiển thị tọa độ chuột
// ===============================
const mousePositionControl = new MousePosition({
  coordinateFormat: createStringXY(6),
  projection: 'EPSG:4326',
  className: 'custom-mouse-position',
  target: document.getElementById('mouse-position'),
  undefinedHTML: '&nbsp;'
});
map.addControl(mousePositionControl);

// ===============================
// 4. OverviewMap - bản đồ tổng quan
// ===============================
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

// ===============================
// 5. FullScreen - toàn màn hình
// ===============================
const fullScreenControl = new FullScreen();
map.addControl(fullScreenControl);
//#endregion

//region 9. THAO TÁC BẢN ĐỒ NÂNG CAO
// 1. ĐO KHOẢNG CÁCH / DIỆN TÍCH
// Tạo nguồn lưu các đối tượng đo
const measureSource = new VectorSource();

// Tạo lớp hiển thị kết quả đo
const measureLayer = new VectorLayer({
  title: 'Lớp đo đạc',
  source: measureSource,
  style: new Style({
    fill: new Fill({
      color: 'rgba(255, 255, 255, 0.2)'
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

// Biến quản lý trạng thái đo
let measureDraw = null;
let measureTooltipElement = null;
let measureTooltip = null;

// ===============================
// Tạo popup công cụ đo đạc
// ===============================

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

// ===============================
// Hàm kéo popup đo đạc
// ===============================
function makePanelDraggable(panel, header) {
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;

  header.addEventListener('mousedown', function (event) {
    if (event.target.closest('button')) {
      return;
    }

    isDragging = true;

    startX = event.clientX;
    startY = event.clientY;

    const rect = panel.getBoundingClientRect();
    startLeft = rect.left;
    startTop = rect.top;

    panel.style.left = startLeft + 'px';
    panel.style.top = startTop + 'px';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';

    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', function (event) {
    if (!isDragging) {
      return;
    }

    const dx = event.clientX - startX;
    const dy = event.clientY - startY;

    panel.style.left = startLeft + dx + 'px';
    panel.style.top = startTop + dy + 'px';
  });

  document.addEventListener('mouseup', function () {
    if (!isDragging) {
      return;
    }

    isDragging = false;
    document.body.style.userSelect = '';
  });
}

makePanelDraggable(measurePanel, measurePanelHeader);

// ===============================
// Hàm định dạng kết quả đo
// ===============================

function formatLength(line) {
  const length = getLength(line);
  if (length > 1000) {
    return (length / 1000).toFixed(2) + ' km';
  }
  return length.toFixed(2) + ' m';
}

function formatArea(polygon) {
  const area = getArea(polygon);
  if (area > 1000000) {
    return (area / 1000000).toFixed(2) + ' km²';
  }
  return area.toFixed(2) + ' m²';
}

// ===============================
// Tạo nhãn hiển thị kết quả đo
// ===============================

function createMeasureTooltip() {
  measureTooltipElement = document.createElement('div');
  measureTooltipElement.className = 'measure-tooltip';
  measureTooltip = new Overlay({
    element: measureTooltipElement,
    offset: [10, -15],
    positioning: 'bottom-center'
  });
  map.addOverlay(measureTooltip);
}

// ===============================
// Chỉ tắt thao tác đang vẽ, KHÔNG ẩn popup
// ===============================
function stopMeasureDrawOnly() {
  if (measureDraw) {
    map.removeInteraction(measureDraw);
    measureDraw = null;
  }

  measureTooltipElement = null;
  measureTooltip = null;
}

// ===============================
// Bắt đầu đo khoảng cách hoặc diện tích
// ===============================
function startMeasure(type) {
  // Nếu đang đo dở thì tắt interaction cũ, nhưng popup vẫn giữ nguyên
  stopMeasureDrawOnly();

  createMeasureTooltip();

  measureDraw = new Draw({
    source: measureSource,
    type: type
  });

  map.addInteraction(measureDraw);

  measureDraw.on('drawstart', function (event) {
    const geometry = event.feature.getGeometry();

    geometry.on('change', function (evt) {
      const geom = evt.target;
      let output = '';
      let tooltipCoord = null;

      if (geom instanceof Polygon) {
        output = formatArea(geom);
        tooltipCoord = geom.getInteriorPoint().getCoordinates();
      }

      if (geom instanceof LineString) {
        output = formatLength(geom);
        tooltipCoord = geom.getLastCoordinate();
      }

      if (measureTooltipElement && measureTooltip) {
        measureTooltipElement.innerHTML = output;
        measureTooltip.setPosition(tooltipCoord);
      }
    });
  });

  measureDraw.on('drawend', function () {
    if (measureTooltipElement) {
      measureTooltipElement.className = 'measure-tooltip measure-tooltip-static';
    }

    map.removeInteraction(measureDraw);
    measureDraw = null;

    measureTooltipElement = null;
    measureTooltip = null;
  });
}

// ===============================
// Xóa toàn bộ kết quả đã đo
// ===============================

function clearMeasure() {
  // Dừng vẽ nếu đang vẽ dở
  stopMeasureDrawOnly();

  // Xóa hình đo
  measureSource.clear();

  // Xóa toàn bộ tooltip đo
  map.getOverlays().getArray().slice().forEach(function (overlayItem) {
    const element = overlayItem.getElement();

    if (
      element &&
      (
        element.classList.contains('measure-tooltip') ||
        element.classList.contains('measure-tooltip-static')
      )
    ) {
      map.removeOverlay(overlayItem);
    }
  });
}

// ===============================
// Tắt riêng công cụ đo
// ===============================

function closeMeasurePanel() {
  stopMeasureDrawOnly();
  measurePanel.classList.remove('active');
}

// ===============================
// Sự kiện các nút trong popup đo đạc
// ===============================

measureLineBtn.addEventListener('click', function () {
  startMeasure('LineString');
});

measureAreaBtn.addEventListener('click', function () {
  startMeasure('Polygon');
});

measureClearBtn.addEventListener('click', function () {
  clearMeasure();

  // Sau khi xóa kết quả, popup vẫn hiện
  measurePanel.classList.add('active');
});

measurePanelClose.addEventListener('click', function () {
  closeMeasurePanel();
});

// ===============================
// 3. CHỌN ĐỐI TƯỢNG BẰNG VÙNG HỘP
// ===============================

let isSelectBoxActive = false;
let disabledDragPanInteractions = [];
let selectedBoxFeatures = [];

const selectBoxStyle = new Style({
  fill: new Fill({
    color: 'rgba(255, 255, 0, 0.35)'
  }),
  stroke: new Stroke({
    color: '#ffff00',
    width: 3
  }),
  image: new CircleStyle({
    radius: 8,
    fill: new Fill({
      color: '#ffff00'
    }),
    stroke: new Stroke({
      color: '#ffffff',
      width: 2
    })
  })
});

const selectBoxPanel = document.createElement('div');
selectBoxPanel.id = 'select-box-panel';
selectBoxPanel.className = 'advanced-panel';

selectBoxPanel.innerHTML = `
  <div class="advanced-panel-header">
    <span>Chọn đối tượng bằng vùng hộp</span>
    <button id="select-box-close" class="advanced-panel-close" title="Tắt chọn vùng">×</button>
  </div>

  <div class="advanced-panel-body">
    <div class="select-box-guide">
      Kéo chuột trực tiếp trên bản đồ để vẽ vùng chọn.
    </div>

    <div class="select-box-actions">
      <button id="select-box-clear">Xóa kết quả chọn</button>
    </div>

    <div class="select-box-summary">
      Số đối tượng đã chọn: <b id="select-box-count">0</b>
    </div>

    <ul id="select-box-result" class="advanced-result-list"></ul>
  </div>
`;

document.querySelector('.map-wrapper').appendChild(selectBoxPanel);

const selectBoxCloseBtn = selectBoxPanel.querySelector('#select-box-close');
const selectBoxClearBtn = selectBoxPanel.querySelector('#select-box-clear');
const selectBoxResultList = selectBoxPanel.querySelector('#select-box-result');
const selectBoxCount = selectBoxPanel.querySelector('#select-box-count');

const selectBoxInteraction = new DragBox({
  condition: function () {
    return isSelectBoxActive;
  }
});

function disableDragPanForSelectBox() {
  disabledDragPanInteractions = map
    .getInteractions()
    .getArray()
    .filter(function (interaction) {
      return interaction instanceof DragPan;
    });

  disabledDragPanInteractions.forEach(function (interaction) {
    interaction.setActive(false);
  });
}

function restoreDragPanAfterSelectBox() {
  disabledDragPanInteractions.forEach(function (interaction) {
    interaction.setActive(true);
  });

  disabledDragPanInteractions = [];
}

function clearSelectBoxResult() {
  selectedBoxFeatures.forEach(function (feature) {
    feature.setStyle(null);
  });

  selectedBoxFeatures = [];

  selectBoxResultList.innerHTML = '';
  selectBoxCount.innerText = '0';
}

function getFeatureName(feature, index) {
  return (
    feature.get('ten') ||
    feature.get('ten_tinh') ||
    feature.get('TenTinhT') ||
    feature.get('tenduong') ||
    feature.get('ten_duong') ||
    feature.get('name') ||
    'Đối tượng ' + (index + 1)
  );
}

function getLayerTitle(layer) {
  if (!layer) {
    return 'Không rõ lớp';
  }
  return layer.get('title') || 'Không rõ lớp';
}

function getAllSelectableFeaturesInExtent(extent) {
  const result = [];
  const layers = [
    wfsRgTinh,
    wfsTinhLo,
    wfsUyBan
  ];
  layers.forEach(function (layer) {
    const source = layer.getSource();
    if (!source) {
      return;
    }

    source.getFeatures().forEach(function (feature) {
      const geometry = feature.getGeometry();
      if (!geometry) {
        return;
      }

      if (geometry.intersectsExtent(extent)) {
        result.push({
          feature: feature,
          layer: layer
        });
      }
    });
  });
  return result;
}

function renderSelectBoxResult(selectedItems) {
  selectBoxResultList.innerHTML = '';
  selectBoxCount.innerText = selectedItems.length.toString();
  if (selectedItems.length === 0) {
    selectBoxResultList.innerHTML = '<li>Không có đối tượng nào trong vùng chọn</li>';
    return;
  }

  selectedItems.forEach(function (item, index) {
    const feature = item.feature;
    const layer = item.layer;

    const name = getFeatureName(feature, index);
    const layerTitle = getLayerTitle(layer);

    const li = document.createElement('li');

    li.innerHTML = `
      <b>${index + 1}. ${name}</b>
      <br>
      <span>${layerTitle}</span>
    `;

    li.addEventListener('click', function () {
      const geometry = feature.getGeometry();
      if (!geometry) {
        return;
      }

      map.getView().fit(geometry.getExtent(), {
        padding: [80, 80, 80, 80],
        duration: 500,
        maxZoom: 15
      });
    });

    selectBoxResultList.appendChild(li);
  });
}

//Bắt đầu sự kiện kéo hộp chọn
selectBoxInteraction.on('boxstart', function () {
  clearSelectBoxResult();
});
// Kết thúc sự kiện kéo hộp chọn, thực hiện tìm kiếm đối tượng trong vùng chọn
selectBoxInteraction.on('boxend', function () {
  const extent = selectBoxInteraction.getGeometry().getExtent();
  const selectedItems = getAllSelectableFeaturesInExtent(extent);

  selectedItems.forEach(function (item) {
    item.feature.setStyle(selectBoxStyle);
    selectedBoxFeatures.push(item.feature);
  });
  renderSelectBoxResult(selectedItems);
});

function openSelectBoxTool() {
  if (isSelectBoxActive) {
    return;
  }

  isSelectBoxActive = true;

  disableDragPanForSelectBox();

  if (!map.getInteractions().getArray().includes(selectBoxInteraction)) {
    map.addInteraction(selectBoxInteraction);
  }

  selectBoxPanel.classList.add('active');
  map.getTargetElement().style.cursor = 'crosshair';
}

function closeSelectBoxTool() {
  isSelectBoxActive = false;

  if (map.getInteractions().getArray().includes(selectBoxInteraction)) {
    map.removeInteraction(selectBoxInteraction);
  }

  clearSelectBoxResult();

  restoreDragPanAfterSelectBox();

  selectBoxPanel.classList.remove('active');
  map.getTargetElement().style.cursor = '';
}

selectBoxCloseBtn.addEventListener('click', function () {
  closeSelectBoxTool();
});

selectBoxClearBtn.addEventListener('click', function () {
  clearSelectBoxResult();
});


// ===============================
// 6. GEOLOCATION - ĐỊNH VỊ HIỆN TẠI
// ===============================

let isGeolocationActive = false;
let hasZoomedToCurrentPosition = false;

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
        color: '#3399CC'
      }),
      stroke: new Stroke({
        color: '#ffffff',
        width: 2
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
  })
});

map.addLayer(geolocationLayer);

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
}

// ===============================
// 7. IN / XUẤT BẢN ĐỒ
// ===============================

function printMap() {
  window.print();
}

// ===============================
// 8. HÀM TẮT CÔNG CỤ ĐANG DÙNG
// ===============================
function clearCurrentAdvancedTool() {
  stopMeasureDrawOnly();

  closeSelectBoxTool();

  stopGeolocation();

  measurePanel.classList.remove('active');
  selectBoxPanel.classList.remove('active');
}

// ===============================
// 9. GẮN SỰ KIỆN CHO MENU THAO TÁC
// ===============================

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

    if (action === 'geolocation') {
      locateUser();
    }

    if (action === 'print-map') {
      printMap();
    }

    if (action === 'clear-tool') {
      clearCurrentAdvancedTool();
      alert('Đã tắt thao tác đang dùng');
    }

    closeMenu();
  });
});
//endregion

//#region 8. LỚP DỮ LIỆU TỰ TẠO TỪ FILE GEOJSON

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
  style: styleDuLieu
});
map.addLayer(duLieuLayer);

//#endregion


//#region 9. POPUP XEM THÔNG TIN ĐỐI TƯỢNG

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

function closePopup() {
  popup.setPosition(undefined);
  cleanHighlight();
  return false;
}

closer.onclick = closePopup;

function getLayerTitleFromFeatureLayer(layer) {
  if (layer === wfsUyBan) {
    return 'UB tỉnh';
  }

  if (layer === wfsTinhLo) {
    return 'Tỉnh lộ';
  }

  if (layer === wfsRgTinh) {
    return 'Ranh giới tỉnh';
  }

  return 'Đối tượng';
}

function createPopupContent(result) {
  const props = result.properties;

  if (result.layerTitle === 'UB tỉnh') {
    return `
      <div class="popup_title">Thông tin UB tỉnh</div>
      <div class="popup_content">
        <b>Tỉnh:</b> ${props.ten || props.ten_tinh || props.TenTinhT || ''}
      </div>
    `;
  }

  if (result.layerTitle === 'Tỉnh lộ') {
    return `
      <div class="popup_title">Thông tin tỉnh lộ</div>

      <div class="popup_content">
        <b>Tên đường:</b> ${props.tenduong || props.ten_duong || props.ten || ''}
      </div>

      <div class="popup_content">
        <b>Loại đường:</b> ${props.loaiduong || props.loai_duong || ''}
      </div>
    `;
  }

  if (result.layerTitle === 'Ranh giới tỉnh') {
    return `
      <div class="popup_title">Thông tin tỉnh</div>

      <div class="popup_content">
        <b>Tên tỉnh:</b> ${props.TenTinhT || props.ten || ''}
      </div>

      <div class="popup_content">
        <b>GID:</b> ${props.gid || ''}
      </div>
    `;
  }

  return `
    <div class="popup_title">${result.layerTitle}</div>
  `;
}

function handleMapClickWFS(event) {
  let selectedFeature = null;
  let selectedLayer = null;

  map.forEachFeatureAtPixel(
    event.pixel,
    function (feature, layer) {
      selectedFeature = feature;
      selectedLayer = layer;
      return true;
    },
    {
      hitTolerance: 8,
      layerFilter: function (layer) {
        return layer === wfsUyBan ||
               layer === wfsTinhLo ||
               layer === wfsRgTinh;
      }
    }
  );

  if (!selectedFeature) {
    popup.setPosition(undefined);
    cleanHighlight();
    return;
  }

  highlightFeature(selectedFeature);

  const properties = selectedFeature.getProperties();
  const layerTitle = getLayerTitleFromFeatureLayer(selectedLayer);

  const result = {
    layerTitle: layerTitle,
    properties: properties
  };

  content.innerHTML = createPopupContent(result);
  popup.setPosition(event.coordinate);
}

//#endregion


//#region 10. HIGHLIGHT ĐỐI TƯỢNG KHI CLICK

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


//#region 11. MENU TRÁI

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

//#endregion


//#region 12. CẤU HÌNH LỚP THÊM / SỬA / XÓA

const editableLayers = [
  {
    id: 'ub_tinh',
    title: 'UB Tỉnh',
    geometryType: 'Point',
    layer: wfsUyBan,
    apiName: 'ub_tinh',
    fields: [
      { name: 'ten', label: 'Tên tỉnh' }
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
      { name: 'loaiduong', label: 'Loại đường' }
    ]
  },
  {
    id: 'rgtinh',
    title: 'Ranh giới tỉnh',
    geometryType: 'Polygon',
    layer: wfsRgTinh,
    apiName: 'rgtinh',
    fields: [
      { name: 'ten', label: 'Tên tỉnh' }
    ]
  }
];

//#endregion


//#region 13. BIẾN TRẠNG THÁI THÊM / SỬA / XÓA

let currentAction = null;        // add, edit, delete
let currentLayerConfig = null;   // lớp đang thao tác

let drawInteraction = null;      // công cụ vẽ

let newFeature = null;           // đối tượng vừa vẽ
let editingFeature = null;       // đối tượng đang sửa
let deletingFeature = null;      // đối tượng đang xóa

//#endregion


//#region 14. POPUP CHỌN LỚP DỮ LIỆU

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


//#region 15. POPUP NHẬP THUỘC TÍNH

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
  input.value = value;

  attributeForm.appendChild(label);
  attributeForm.appendChild(input);
}

function openAddAttributePopup() {
  attributeForm.innerHTML = '';

  currentLayerConfig.fields.forEach(function (field) {
    createInputField(field);
  });

  attributePopup.classList.add('active');
}

function openEditAttributePopup() {
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


//#region 16. HÀM DÙNG CHUNG CHO THÊM / SỬA / XÓA

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


//#region 17. CHỨC NĂNG THÊM DỮ LIỆU

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


//#region 18. CHỨC NĂNG SỬA DỮ LIỆU

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


//#region 19. CHỨC NĂNG XÓA DỮ LIỆU

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


//#region 20. SỰ KIỆN MENU THÊM / SỬA / XÓA

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

    closeMenu();
  });
});

//#endregion


//#region 21. SỰ KIỆN CLICK TRÊN BẢN ĐỒ

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