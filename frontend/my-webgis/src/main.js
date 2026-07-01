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
import { fromLonLat, toLonLat, getPointResolution, transformExtent } from 'ol/proj.js';
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
import { platformModifierKeyOnly, primaryAction } from 'ol/events/condition.js';
import Geolocation from 'ol/Geolocation.js';
import { getLength, getArea } from 'ol/sphere.js';
import DragPan from 'ol/interaction/DragPan.js';
//#endregion

//#region 2. CẤU HÌNH CHUNG CÁC LỚP BẢN ĐỒ
/*
  Ý tưởng:
  - Tất cả lớp bản đồ được khai báo tập trung tại đây.
  - Khi thêm lớp mới, chủ yếu chỉ cần thêm vào MAP_LAYER_CONFIGS hoặc RASTER_LAYER_CONFIGS.
  - Các phần WMS, WFS, tìm kiếm, bảng thuộc tính, popup, thêm/sửa/xóa sẽ lấy lại từ cấu hình này.
*/
const GEOSERVER_CONFIG = {
  workspace: 'webgis',
  wmsUrl: 'http://localhost:8080/geoserver/webgis/wms',
  wfsUrl: 'http://localhost:8080/geoserver/webgis/ows',
  backendUrl: 'http://localhost:8000/mygis/features'
};

// ================== 2.1. CẤU HÌNH BẢN ĐỒ NỀN ==================
const BASE_LAYER_CONFIGS = [
  {
    id: 'osm', 
    title: 'OpenStreetMap',
    type: 'base',
    visible: false,
    sourceType: 'OSM'
  },
  {
    id: 'topo',
    title: 'Địa hình',
    type: 'base',
    visible: false,
    sourceType: 'OSM',
    url: 'https://{a-c}.tile.opentopomap.org/{z}/{x}/{y}.png'
  },
  {
    id: 'satellite',
    title: 'Vệ tinh',
    type: 'base',
    visible: true,
    sourceType: 'XYZ',
    url: 'http://mt0.google.com/vt/lyrs=s&hl=en&x={x}&y={y}&z={z}'
  }
];

// ================== 2.2. CẤU HÌNH CÁC LỚP VECTOR WMS / WFS ==================
const MAP_LAYER_CONFIGS = [
  {
    id: 'nenbien', //Mã định danh riêng của lớp
    title: 'Nền biển', //Tên dùng để hiển thị
    wmsTitle: 'WMS - Nền biển', //Tên hiển thị của lơp WMS
    wfsTitle: 'WFS - Nền biển', //Tên hiển thị của lớp WFS
    geoserverName: 'nenbien', //Tên lớp trên Geoserver
    wmsName: 'nenbien', //Tên lớp khi gọi WMS
    wfsName: 'webgis:nenbien', //Tên lớp khi gọi WFS
    geometryType: 'Polygon', //Loại hình học
    apiName: 'nenbien', //Tên lớp dùng khi gọi API backend

    visible: true, //mặc định hiển thị
    selectable: true, //Sử dụng trong công cụ chọn đối tượng bằng vùng hộp
    searchable: true, //Sử dụng để tham gia vào tìm kiếm
    editable: true, //Quy định có đc thêm/sửa/xóa hay ko
    attributeTable: true, //Quy định có hiển thị trong bảng thuộc tính ko
    hasPopup: true, //Quy định hiển thị popup khi click vào đối tượng hay ko

    selectName: 'Nền biển', //Tên lớp hiển thị trong công cụ chọn đối tượng vùng hộp
    searchTitle: 'Nền biển', //Tên nhóm hiển  thị trong kết quả tìm kiếm
    searchIcon: '≈', //Biểu tượng hiển thị trong danh sách tìm kiếm

    searchFields: ['dosau', 'ten', 'name'], //Danh sách các trường để tìm kiếm

    editFields: [
      { name: 'dosau', label: 'Độ sâu' } //Khai báo danh sách các trường cho form thêm/sửa
    ],

    popupTitle: 'Nền biển', //Tên dùng để nhận biết loại popup
    popupHeader: 'Thông tin nền biển', //Tên tiêu đề hiển thị ở đầu popup
    popupFields: [ //Các dòng/trường hiển thị trên popup
      { label: 'Độ sâu', fields: ['dosau', 'ten', 'name'] },
      { label: 'GID', fields: ['gid', 'id'] }
    ],
    //Khai báo hiển thị lớp WFS
    style: {
      type: 'polygon',
      fill: 'rgba(0, 255, 255, 0.5)',
      stroke: 'cyan',
      width: 2
    }
  },

  {
    id: 'vn_tinh',
    title: 'Ranh giới tỉnh',
    wmsTitle: 'WMS - Việt Nam tỉnh',
    wfsTitle: 'WFS - Tỉnh',
    geoserverName: 'vn_tinh',
    wmsName: 'vn_tinh',
    wfsName: 'webgis:vn_tinh',
    geometryType: 'Polygon',
    apiName: 'vn_tinh',

    visible: true,
    selectable: true,
    searchable: true,
    editable: true,
    attributeTable: true,
    hasPopup: true,

    selectName: 'Tỉnh',
    searchTitle: 'Tỉnh',
    searchIcon: '▣',

    searchFields: ['ten_tinh', 'TenTinhT', 'ten', 'name', 'ma_tinh', 'tru_so', 'loai'],

    editFields: [
      { name: 'ma_tinh', label: 'Mã tỉnh' },
      { name: 'ten_tinh', label: 'Tên tỉnh' },
      { name: 'sap_nhap', label: 'Sáp nhập' },
      { name: 'quy_mo', label: 'Quy mô' },
      { name: 'tru_so', label: 'Trụ sở' },
      { name: 'loai', label: 'Loại' }
    ],

    popupTitle: 'Ranh giới tỉnh',
    popupHeader: 'Thông tin tỉnh',
    popupFields: [
      { label: 'Mã tỉnh', fields: ['ma_tinh'] },
      { label: 'Tên tỉnh', fields: ['ten_tinh', 'TenTinhT', 'ten', 'name'] },
      { label: 'Trụ sở', fields: ['tru_so'] },
      { label: 'Loại', fields: ['loai'] },
      { label: 'GID', fields: ['gid', 'id'] }
    ],

    style: {
      type: 'polygon',
      fill: 'rgba(0, 0, 255, 0.5)',
      stroke: 'blue',
      width: 2
    }
  },

  {
    id: 'vn_xa',
    title: 'Ranh giới xã',
    wmsTitle: 'WMS - Việt Nam xã',
    wfsTitle: 'WFS - Xã',
    geoserverName: 'vn_xa',
    wmsName: 'vn_xa',
    wfsName: 'webgis:vn_xa',
    geometryType: 'Polygon',
    apiName: 'vn_xa',

    visible: true,
    selectable: true,
    searchable: true,
    editable: true,
    attributeTable: true,
    hasPopup: true,

    selectName: 'Xã',
    searchTitle: 'Xã / phường',
    searchIcon: '⌂',

    searchFields: ['ten_xa', 'TenXa', 'ten', 'name', 'ma_xa', 'ten_tinh', 'tru_so'],
    editFields: [
      { name: 'ma_xa', label: 'Mã xã' },
      { name: 'ten_xa', label: 'Tên xã' },
      { name: 'sap_nhap', label: 'Sáp nhập' },
      { name: 'tru_so', label: 'Trụ sở' },
      { name: 'loai', label: 'Loại' },
      { name: 'ma_tinh', label: 'Mã tỉnh' },
      { name: 'ten_tinh', label: 'Tên tỉnh' }
    ],
    popupTitle: 'Ranh giới xã',
    popupHeader: 'Thông tin xã',
    popupFields: [
      { label: 'Mã xã', fields: ['ma_xa'] },
      { label: 'Tên xã', fields: ['ten_xa', 'TenXa', 'ten', 'name'] },
      { label: 'Tỉnh', fields: ['ten_tinh'] },
      { label: 'Trụ sở', fields: ['tru_so'] },
      { label: 'Loại', fields: ['loai'] },
      { label: 'GID', fields: ['gid', 'id'] }
    ],

    style: {
      type: 'polygon',
      fill: 'rgba(255, 0, 0, 0.5)',
      stroke: 'red',
      width: 2
    }
  },

  {
    id: 'tinhlo',
    title: 'Tỉnh lộ',
    wmsTitle: 'WMS - Tỉnh lộ',
    wfsTitle: 'WFS - Tỉnh lộ',
    geoserverName: 'tinhlo',
    wmsName: 'tinhlo',
    wfsName: 'webgis:tinhlo',
    geometryType: 'LineString',
    apiName: 'tinhlo',

    visible: true,
    selectable: true,
    searchable: true,
    editable: true,
    attributeTable: true,
    hasPopup: true,

    selectName: 'Tỉnh lộ',
    searchTitle: 'Tỉnh lộ',
    searchIcon: '━',

    searchFields: ['tenduong', 'ten_duong', 'ten', 'name', 'loaiduong', 'tdg'],
    editFields: [
      { name: 'tenduong', label: 'Tên đường' },
      { name: 'loaiduong', label: 'Loại đường' },
      { name: 'tdg', label: 'TDG' }
    ],
    popupTitle: 'Tỉnh lộ',
    popupHeader: 'Thông tin tỉnh lộ',
    popupFields: [
      { label: 'Tên đường', fields: ['tenduong', 'ten_duong', 'ten', 'name'] },
      { label: 'Loại đường', fields: ['loaiduong', 'loai_duong'] },
      { label: 'TDG', fields: ['tdg'] },
      { label: 'GID', fields: ['gid', 'id'] }
    ],

    style: {
      type: 'line',
      stroke: 'green',
      width: 2
    }
  },

  {
    id: 'qlo',
    title: 'Quốc lộ',
    wmsTitle: 'WMS - Quốc lộ',
    wfsTitle: 'WFS - Quốc lộ',
    geoserverName: 'qlo',
    wmsName: 'qlo',
    wfsName: 'webgis:qlo',
    geometryType: 'LineString',
    apiName: 'qlo',

    visible: true,
    selectable: true,
    searchable: true,
    editable: true,
    attributeTable: true,
    hasPopup: true,

    selectName: 'Quốc lộ',
    searchTitle: 'Quốc lộ',
    searchIcon: '═',

    searchFields: ['td', 'tenduong', 'ten_duong', 'ten', 'name', 'bientap'],
    editFields: [
      { name: 'bientap', label: 'Biên tập' },
      { name: 'td', label: 'Tên / thuộc tính đường' }
    ],
    popupTitle: 'Quốc lộ',
    popupHeader: 'Thông tin quốc lộ',
    popupFields: [
      { label: 'Tên / thuộc tính đường', fields: ['td', 'tenduong', 'ten_duong', 'ten', 'name'] },
      { label: 'Biên tập', fields: ['bientap'] },
      { label: 'GID', fields: ['gid', 'id'] }
    ],

    style: {
      type: 'line',
      stroke: 'orange',
      width: 2
    }
  },

  {
    id: 'ub_tinh',
    title: 'UB Tỉnh',
    wmsTitle: 'WMS - UBND',
    wfsTitle: 'WFS - UBND',
    geoserverName: 'ub_tinh',
    wmsName: 'ub_tinh',
    wfsName: 'webgis:ub_tinh',
    geometryType: 'Point',
    apiName: 'ub_tinh',

    visible: true,
    selectable: true,
    searchable: true,
    editable: true,
    attributeTable: true,
    hasPopup: true,

    selectName: 'Ủy ban',
    searchTitle: 'UBND',
    searchIcon: '●',

    searchFields: ['ten', 'tinh', 'ten_tinh', 'TenTinhT', 'name', 'caphc'],
    editFields: [
      { name: 'ten', label: 'Tên UB' },
      { name: 'caphc', label: 'Cấp hành chính' },
      { name: 'tinh', label: 'Tỉnh' }
    ],
    popupTitle: 'UB tỉnh',
    popupHeader: 'Thông tin UB tỉnh',
    popupFields: [
      { label: 'Tên UB', fields: ['ten', 'name'] },
      { label: 'Tỉnh', fields: ['tinh', 'ten_tinh', 'TenTinhT'] },
      { label: 'Cấp HC', fields: ['caphc'] },
      { label: 'GID', fields: ['gid', 'id'] }
    ],

    style: {
      type: 'point',
      radius: 6,
      fill: 'red',
      stroke: 'white',
      width: 2
    }
  },

];

// ================== 2.3. CẤU HÌNH CÁC LỚP RASTER ==================
const RASTER_LAYER_CONFIGS = [
  {
    id: 'hanoi25k',
    title: 'Bản đồ tỉ lệ 1:25.000',
    layerName: 'fast',
    visible: true,
    extent4326: [
      105.24994245399438,
      20.52991784021072,
      106.05007187755965,
      21.400026024408888
    ],
    minZoom: 10,
    maxZoom: 16,
    format: 'image/jpeg'
  }
];

// ================== 2.4. HÀM TẠO SOURCE / STYLE / LAYER ==================
//Hàm tạo bản đồ nền
function createBaseLayer(cfg) {
  let source = null;
  if (cfg.sourceType === 'XYZ') {
    source = new XYZ({
      url: cfg.url,
      crossOrigin: 'anonymous'
    });
  } else {
    source = new OSM({
      url: cfg.url,
      crossOrigin: 'anonymous'
    });
  }
  const layer = new TileLayer({
    title: cfg.title,
    type: cfg.type,
    visible: cfg.visible,
    source: source
  });
  layer.set('configId', cfg.id); //Lưu mã cấu hình của lớp
  layer.set('layerKind', 'base'); //Loại layer --> Base

  return layer;
}

//Hàm tạo style WFS
function createVectorStyle(styleCfg) {
  if (!styleCfg) return null;

  if (styleCfg.type === 'point') {
    return new Style({
      image: new CircleStyle({
        radius: styleCfg.radius || 6,
        fill: new Fill({
          color: styleCfg.fill || 'red'
        }),
        stroke: new Stroke({
          color: styleCfg.stroke || 'white',
          width: styleCfg.width || 2
        })
      })
    });
  }
  if (styleCfg.type === 'line') {
    return new Style({
      stroke: new Stroke({
        color: styleCfg.stroke || 'blue',
        width: styleCfg.width || 2
      })
    });
  }
  if (styleCfg.type === 'polygon') {
    return new Style({
      fill: new Fill({
        color: styleCfg.fill || 'rgba(0, 0, 255, 0.3)'
      }),
      stroke: new Stroke({
        color: styleCfg.stroke || 'blue',
        width: styleCfg.width || 2
      })
    });
  }
  return null;
}

//Hàm tạo URL WFS
function createWfsUrl(typeName) {
  return `${GEOSERVER_CONFIG.wfsUrl}?service=WFS&version=1.0.0&request=GetFeature&typeName=${typeName}&outputFormat=application/json`;
}

//Hàm tạo Lớp WMS
function createWmsLayer(cfg) {
  const layer = new TileLayer({
    title: cfg.wmsTitle,
    visible: cfg.visible,
    source: new TileWMS({
      url: GEOSERVER_CONFIG.wmsUrl,
      params: {
        LAYERS: cfg.wmsName || cfg.geoserverName,
        TILED: true
      },
      serverType: 'geoserver',
      crossOrigin: 'anonymous'
    })
  });
  layer.set('configId', cfg.id);
  layer.set('layerKind', 'wms');

  return layer;
}

//Tạo lớp WFS
function createWfsLayer(cfg) {
  const layer = new VectorLayer({
    title: cfg.wfsTitle,
    visible: cfg.visible,
    source: new VectorSource({
      format: new GeoJSON(),
      url: createWfsUrl(cfg.wfsName)
    }),
    style: createVectorStyle(cfg.style)
  });
  layer.set('configId', cfg.id);
  layer.set('layerKind', 'wfs');

  return layer;
}

function createRasterLayer(cfg) {
  const extent3857 = cfg.extent4326 ? transformExtent(cfg.extent4326, 'EPSG:4326', 'EPSG:3857'): undefined;

  const layer = new TileLayer({
    title: cfg.title,
    visible: cfg.visible,
    extent: extent3857,
    minZoom: cfg.minZoom,
    maxZoom: cfg.maxZoom,
    source: new TileWMS({
      url: GEOSERVER_CONFIG.wmsUrl,
      params: {
        LAYERS: cfg.layerName,
        TILED: true,
        FORMAT: cfg.format || 'image/png'
      },
      serverType: 'geoserver',
      transition: 0,
      cacheSize: 512,
      crossOrigin: 'anonymous'
    })
  });
  layer.set('configId', cfg.id);
  layer.set('layerKind', 'raster');

  return layer;
}

// ================== 2.5. TẠO LAYER TỪ CẤU HÌNH ==================
const baseLayerMap = {};
BASE_LAYER_CONFIGS.forEach(function (cfg) {
  baseLayerMap[cfg.id] = createBaseLayer(cfg);
});

const mapLayerMap = {};
MAP_LAYER_CONFIGS.forEach(function (cfg) {
  cfg.wmsLayer = createWmsLayer(cfg);
  cfg.wfsLayer = createWfsLayer(cfg);
  mapLayerMap[cfg.id] = cfg;
});

const rasterLayerMap = {};
RASTER_LAYER_CONFIGS.forEach(function (cfg) {
  rasterLayerMap[cfg.id] = createRasterLayer(cfg);
});

// ================== 2.6. GIỮ LẠI TÊN BIẾN CŨ ==================
function getMapLayer(id, layerType) {
  return mapLayerMap[id] ? mapLayerMap[id][layerType] : null;
}

const osmLayer = baseLayerMap.osm || null;
const toPoLayer = baseLayerMap.topo || null;
const satelliteLayer = baseLayerMap.satellite || null;

const wmsNenBien = getMapLayer('nenbien', 'wmsLayer');
const wmsVN_Tinh = getMapLayer('vn_tinh', 'wmsLayer');
const wmsVN_Xa = getMapLayer('vn_xa', 'wmsLayer');
const wmsTinhLo = getMapLayer('tinhlo', 'wmsLayer');
const wmsQlo = getMapLayer('qlo', 'wmsLayer');
const wmsUyBan = getMapLayer('ub_tinh', 'wmsLayer');

const wfsNenBien = getMapLayer('nenbien', 'wfsLayer');
const wfsVN_Tinh = getMapLayer('vn_tinh', 'wfsLayer');
const wfsVN_Xa = getMapLayer('vn_xa', 'wfsLayer');
const wfsTinhLo = getMapLayer('tinhlo', 'wfsLayer');
const wfsQlo = getMapLayer('qlo', 'wfsLayer');
const wfsUyBan = getMapLayer('ub_tinh', 'wfsLayer');

const hanoi25k = rasterLayerMap.hanoi25k || null;
const hanoi25kExtent = hanoi25k ? hanoi25k.getExtent() : null;

// ================== 2.7. NHÓM CÁC LỚP BẢN ĐỒ ==================
const baseGroup = new LayerGroup({
  title: 'Bản đồ nền',
  layers: BASE_LAYER_CONFIGS.map(function (cfg) {
    return baseLayerMap[cfg.id];
  })
});

const wmsGroup = new LayerGroup({
  title: 'Bản đồ WMS',
  layers: MAP_LAYER_CONFIGS.map(function (cfg) {
    return cfg.wmsLayer;
  })
});

const wfsGroup = new LayerGroup({
  title: 'Bản đồ WFS',
  visible: false,
  layers: MAP_LAYER_CONFIGS.map(function (cfg) {
    return cfg.wfsLayer;
  })
});

const rasterGroup = new LayerGroup({
  title: 'Bản đồ raster',
  layers: RASTER_LAYER_CONFIGS.map(function (cfg) {
    return rasterLayerMap[cfg.id];
  })
});

// ================== 2.8. CÁC DANH SÁCH LẤY TỰ ĐỘNG TỪ CẤU HÌNH ==================
const popupWfsLayers = MAP_LAYER_CONFIGS
  .filter(function (cfg) {
    return cfg.hasPopup;
  })
  .map(function (cfg) {
    return cfg.wfsLayer;
  });

//#endregion

//#region 3. KHỞI TẠO BẢN ĐỒ
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

//#region 4. MENU TRÁI
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

//#region 8. THÊM CÁC CONTROL CƠ BẢN
const layerSwitcher = new LayerSwitcher({
  reverse: true, //Đảo ngược thứ tự layer
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
  ],
  zoom: 5,
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

//#region 9.1. CÔNG CỤ ĐO KHOẢNG CÁCH / DIỆN TÍCH
// Nguồn và lớp lưu kết quả đo
const measureSource = new VectorSource(); //Tạo nguồn vector rỗng để lưu kết quả đo
const measureLayer = new VectorLayer({ //Khai báo lớp vector đo đạc để hiển thị lên bản đồ
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
let measureDraw = null; // Biến lưu trữ đối tượng Draw đang hoạt động
let movingTooltip = null; // Biến lưu trữ tooltip di động hiển thị kết quả đo tạm thời
let movingTooltipElement = null; // Biến lưu trữ phần tử HTML của tooltip di động
let segmentCount = 0; // Biến đếm số cạnh đã chốt để hiển thị nhãn cố định cho từng cạnh
let measureTooltipOverlays = []; // Mảng lưu tắt cả tooltip để quản lí và xóa

// HIỂN THỊ / ẨN TOÀN BỘ TOOLTIP ĐO ĐẠC
function setMeasureTooltipVisible(visible) {
  //Duyệt qua các tooltip 
  measureTooltipOverlays.forEach(function (overlay) {
    const element = overlay.getElement();
    //Kiểm tra xem điều kiện hiển thị 
    if (element) {
      element.style.display = visible ? '' : 'none';
    }
  });
}
//Hàm lấy trạng thái hiển thị của measureLayer và đồng bộ với tooltip
function syncMeasureTooltipVisible() {
  setMeasureTooltipVisible(measureLayer.getVisible());
}
//Hàm xóa tooltip khỏi bản đồ và xóa khỏi mảng quản lý
function removeMeasureTooltipOverlay(overlay) {
  if (!overlay) return;

  map.removeOverlay(overlay);

  measureTooltipOverlays = measureTooltipOverlays.filter(function (item) {
    return item !== overlay;
  });
}
// Đồng bộ trạng thái hiển thị của tooltip khi lớp đo đạc thay đổi
measureLayer.on('change:visible', function () {
  syncMeasureTooltipVisible(); //Đồng bộ trạng thái hiển thị
  //Nếu đang vẽ mà tắt lớp đo đạc thì dừng vẽ
  if (!measureLayer.getVisible()) {
    stopMeasureDrawOnly();
  }
});

// PANEL - BẢNG ĐIỀU KHIỂN ĐO ĐẠC
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
// Thêm panel vào bản đồ
document.querySelector('.map-wrapper').appendChild(measurePanel);

const measurePanelHeader = measurePanel.querySelector('#measure-panel-header');
const measurePanelClose = measurePanel.querySelector('#measure-panel-close');
const measureLineBtn = measurePanel.querySelector('#measure-line-btn');
const measureAreaBtn = measurePanel.querySelector('#measure-area-btn');
const measureClearBtn = measurePanel.querySelector('#measure-clear-btn');

// KÉO, DI CHUYỂN PANEL KHI NHẤN GIỮ VÀO HEADER
function makePanelDraggable(panel, header) {
  let dragging = false; // Biến trạng thái kéo thả
  let startX = 0; // Biến lưu trữ vị trí chuột khi bắt đầu kéo
  let startY = 0; 
  let startLeft = 0;
  let startTop = 0;
  //Sự kiện mousedown trên header
  header.addEventListener('mousedown', function (e) {
    if (e.target.closest('button')) return; // Nếu nhấn vào nút đóng thì không kéo
    // Bắt đầu kéo
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    // Lấy vị trí hiện tại của panel
    const rect = panel.getBoundingClientRect();
    startLeft = rect.left;
    startTop = rect.top;

    panel.style.left = startLeft + 'px';
    panel.style.top = startTop + 'px';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';

    document.body.style.userSelect = 'none';
  });
  // Sự kiện mousemove trên document - Cập nhật vị trí panel khi kéo
  document.addEventListener('mousemove', function (e) {
    if (!dragging) return;

    panel.style.left = startLeft + e.clientX - startX + 'px';
    panel.style.top = startTop + e.clientY - startY + 'px';
  });
  // Sư kiện kết thúc kéo
  document.addEventListener('mouseup', function () {
    dragging = false;
    document.body.style.userSelect = '';
  });
}
// Kích hoạt kéo thả cho panel đo đạc
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

// TÍNH TOẠ ĐỘ GIỮA 2 ĐIỂM ĐỂ ĐẶT TOOLTIP
function getMidPoint(coord1, coord2) {
  return [
    (coord1[0] + coord2[0]) / 2,
    (coord1[1] + coord2[1]) / 2
  ];
}

// TẠO TOOLTIP CHUNG
function createTooltip(className, offset = [0, -12]) {
  const element = document.createElement('div');
  element.className = className;
  // Tạo overlay để hiển thị tooltip
  const overlay = new Overlay({
    element: element,
    offset: offset,
    positioning: 'bottom-center',
    stopEvent: false
  });
  map.addOverlay(overlay);
  // Lưu overlay vào mảng quản lý để có thể xóa sau này
  measureTooltipOverlays.push(overlay);

  return {
    element,
    overlay
  };
}
// TẠO TOOLTIP DI ĐỘNG
function createMovingTooltip() {
  const tooltip = createTooltip('measure-tooltip', [10, -15]);
  movingTooltipElement = tooltip.element;
  movingTooltip = tooltip.overlay;
}
// TẠO TOOLTIP CỐ ĐỊNH
function createStaticTooltip(text, coordinate, extraClass = '') {
  const tooltip = createTooltip(
    'measure-tooltip measure-tooltip-static ' + extraClass,
    [0, -10]
  );
  // Gán nội dung và vị trí cho tooltip
  tooltip.element.innerHTML = text;
  tooltip.overlay.setPosition(coordinate);

  return tooltip.overlay;
}

// XÓA TOOLTIP DI ĐỘNG
function removeMovingTooltip() {
  if (movingTooltip) {
    removeMeasureTooltipOverlay(movingTooltip);
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
  measureLayer.setVisible(true); //bật lớp đo đạc lên
  stopMeasureDrawOnly(); //Dừng công cụ đo cũ nếu có
  createMovingTooltip(); //Tạo tooltip di động để hiển thị kết quả đo tạm thời
  //Tạp công cụ vẽ đường
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
   measureLayer.setVisible(true); //bật lớp đo đạc lên
  stopMeasureDrawOnly(); //Dừng công cụ đo cũ nếu có
  createMovingTooltip(); //Tạo tooltip di động để hiển thị kết quả đo tạm thời

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
  //Xóa
  measureTooltipOverlays.slice().forEach(function (overlay) {
    removeMeasureTooltipOverlay(overlay);
  });

  measureTooltipOverlays = [];
  movingTooltip = null;
  movingTooltipElement = null;
  segmentCount = 0;

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

//#region 9.2. CHỌN ĐỐI TƯỢNG BẰNG VÙNG HỘP

let selectBoxActive = false; // Biến trạng thái công cụ chọn đối tượng bằng vùng hộp
let selectedFeatures = []; //Mảng lưu các đối tượng đã chọn
let focusedSelectFeature = null; //Biến lưu đối tượng được chọn
let activeResultGroup = null; //Biến lưu nhóm đối tượng hiển thị

// Các lớp WFS cho phép chọn
const selectableLayers = MAP_LAYER_CONFIGS
  .filter(function (cfg) {
    return cfg.selectable;
  })
  .map(function (cfg) {
    return {
      id: cfg.id,
      name: cfg.selectName || cfg.title,
      layer: cfg.wfsLayer
    };
  });

// Style chung cho tất cả đối tượng nằm trong vùng hộp
const selectedStyle = new Style({
  fill: new Fill({
    color: 'rgba(255, 153, 0, 0.35)'
  }),
  stroke: new Stroke({
    color: '#ff3300',
    width: 4
  }),
  image: new CircleStyle({
    radius: 10,
    fill: new Fill({
      color: '#ff3300'
    }),
    stroke: new Stroke({
      color: '#ffffff',
      width: 3
    })
  })
});

// Style riêng cho đối tượng đang được chọn trong bảng
const focusedSelectedStyle = new Style({
  fill: new Fill({
    color: 'rgba(0, 255, 255, 0.45)'
  }),
  stroke: new Stroke({
    color: '#00ffff',
    width: 6
  }),
  image: new CircleStyle({
    radius: 14,
    fill: new Fill({
      color: '#00ffff'
    }),
    stroke: new Stroke({
      color: '#000000',
      width: 3
    })
  })
});

// ================== TẠO PANEL ==================
const selectBoxPanel = document.createElement('div');
selectBoxPanel.id = 'select-box-panel';
selectBoxPanel.className = 'advanced-panel';

selectBoxPanel.innerHTML = `
  <div class="advanced-panel-header">
    <span>Chọn đối tượng bằng vùng hộp</span>
    <button id="select-box-close" class="advanced-panel-close" title="Tắt công cụ">×</button>
  </div>

  <div class="advanced-panel-body">
    <div id="select-box-layer-list"></div>

    <button id="select-box-clear">Xóa kết quả chọn</button>

    <div class="select-box-summary">
      Số đối tượng đã chọn: <b id="select-box-count">0</b>
    </div>

    <div id="select-box-result" class="advanced-result-list"></div>
  </div>
`;
// Thêm panel vào bản đồ
document.querySelector('.map-wrapper').appendChild(selectBoxPanel);

const layerListBox = document.getElementById('select-box-layer-list');
const resultList = document.getElementById('select-box-result');
const countBox = document.getElementById('select-box-count');
const selectBoxPanelHeader = selectBoxPanel.querySelector('.advanced-panel-header');
// Kích hoạt kéo thả cho panel chọn đối tượng
makePanelDraggable(selectBoxPanel, selectBoxPanelHeader);

// ================== POPUP THÔNG TIN ĐỐI TƯỢNG ==================
const selectBoxPopupElement = document.createElement('div');
selectBoxPopupElement.id = 'select-box-popup';
selectBoxPopupElement.className = 'select-box-popup';

selectBoxPopupElement.innerHTML = `
  <div class="select-box-popup-header">
    <span>Thông tin đối tượng</span>
    <button id="select-box-popup-close" class="select-box-popup-close">X</button>
  </div>
  <div id="select-box-popup-content" class="select-box-popup-content"></div>
`;
// Thêm popup vào bản đồ
document.querySelector('.map-wrapper').appendChild(selectBoxPopupElement);

const selectBoxPopupContent = document.getElementById('select-box-popup-content');
// Tạo overlay cho popup
const selectBoxPopupOverlay = new Overlay({
  element: selectBoxPopupElement,
  offset: [0, -12],
  positioning: 'bottom-center',
  stopEvent: true
});
map.addOverlay(selectBoxPopupOverlay);
// Sự kiện đóng popup
document.getElementById('select-box-popup-close').onclick = function () {
  selectBoxPopupOverlay.setPosition(undefined);
};

// ================== CHECKBOX LỚP WFS ==================
//Hàm tạo checkbox cho các lớp WFS đang bật
function renderLayerCheckboxes() {
  // Lọc ra các lớp WFS đang bật và tạo checkbox cho chúng
  const html = selectableLayers
    .filter(item => item.layer.getVisible())
    .map(item => `
      <label class="select-box-layer-item">
        <input type="checkbox" value="${item.id}" checked>
        ${item.name}
      </label>
    `)
    .join('');
  // Hiển thị checkbox hoặc thông báo nếu không có lớp nào đang bật
  layerListBox.innerHTML = html || `
    <div class="select-box-empty">Không có lớp WFS nào đang bật</div>
  `;
}

// Hiển thị checkbox khi mở panel
function getCheckedLayers() {
  // Lấy danh sách id của các checkbox đang được chọn
  const checkedIds = [...layerListBox.querySelectorAll('input:checked')]
    .map(input => input.value);
  // Lọc ra các lớp WFS tương ứng với id đã chọn và đang có trạng thái hiển thị
  return selectableLayers.filter(item =>
    checkedIds.includes(item.id) &&
    item.layer.getVisible()
  );
}

// Nếu bật/tắt lớp WFS khi panel đang mở thì cập nhật lại danh sách checkbox
selectableLayers.forEach(item => {
  item.layer.on('change:visible', function () {
    if (selectBoxPanel.classList.contains('active')) {
      clearSelectBox();
      renderLayerCheckboxes();
    }
  });
});

// ================== HÀM PHỤ ==================
//Hàm xử lý các kí tự đặc biệt trong thuộc tính đối tượng
function escapeHTML(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

//Hàm lấy tên đối tượng từ các thuộc tính
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
//Hàm phân loại đối tượng theo loại hình học
function getGeometryGroup(feature) {
  const geometry = feature.getGeometry();
  if (!geometry) return 'other';

  const type = geometry.getType();
  if (type === 'Point' || type === 'MultiPoint') {
    return 'point';
  }
  if (type === 'LineString' || type === 'MultiLineString') {
    return 'line';
  }
  if (type === 'Polygon' || type === 'MultiPolygon') {
    return 'polygon';
  }
  return 'other';
}

//Hàm đặt tên nhóm đối tượng
function getGroupTitle(groupKey) {
  if (groupKey === 'point') return 'Điểm';
  if (groupKey === 'line') return 'Đường';
  if (groupKey === 'polygon') return 'Vùng';
  return 'Khác';
}

//Hàm tính tọa độ hiển thị popup dựa vào loại hình học
function getSelectBoxPopupCoordinate(feature) {
  const geometry = feature.getGeometry();
  if (!geometry) return null;

  const type = geometry.getType();

  if (type === 'Point') {
    return geometry.getCoordinates(); // Trả về tọa độ điểm
  }
  if (type === 'LineString') {
    return geometry.getCoordinateAt(0.5);// Trả về tọa độ trung điểm của đường
  }
  if (type === 'Polygon') {
    return geometry.getInteriorPoint().getCoordinates(); // Trả về tọa độ điểm bên trong đa giác
  }
  if (type === 'MultiPoint') {
    return geometry.getCoordinates()[0]; // Trả về tọa độ của điểm đầu tiên trong tập hợp các điểm
  }
  if (type === 'MultiLineString') {
    return geometry.getLineStrings()[0].getCoordinateAt(0.5); // Trả về tọa độ trung điểm của đường đầu tiên trong tập hợp các đường
  }
  if (type === 'MultiPolygon') {
    return geometry.getPolygons()[0].getInteriorPoint().getCoordinates();// Trả về tọa độ điểm bên trong đa giác đầu tiên trong tập hợp các đa giác
  }
  return geometry.getClosestPoint(map.getView().getCenter()); // Trả về tọa độ điểm gần nhất với tâm bản đồ nếu loại hình học không xác định
}

//Tạo nội dung popup hiển thị 
function buildPopupContent(feature, layerName, index) {
  const props = feature.getProperties();
  delete props.geometry;

  let rows = '';
  Object.keys(props).forEach(key => {
    const value = props[key];
    if (value === null || value === undefined || value === '') return;

    rows += `
      <tr>
        <td>${escapeHTML(key)}</td>
        <td>${escapeHTML(value)}</td>
      </tr>
    `;
  });

  if (!rows) {
    rows = `
      <tr>
        <td colspan="2">Không có dữ liệu thuộc tính</td>
      </tr>
    `;
  }

  return `
    <div class="select-box-popup-title">
      ${escapeHTML(getName(feature, index))}
    </div>

    <div class="select-box-popup-layer">
      Lớp: <b>${escapeHTML(layerName)}</b>
    </div>

    <table class="select-box-popup-table">
      ${rows}
    </table>
  `;
}

//Hàm hiển thị popup
function showFeaturePopup(item, index) {
  const coordinate = getSelectBoxPopupCoordinate(item.feature);
  if (!coordinate) return;

  selectBoxPopupContent.innerHTML = buildPopupContent(
    item.feature,
    item.layerName,
    index
  );
  selectBoxPopupOverlay.setPosition(coordinate);
}

//Highlight đối tượng được chọn trong bảng
function focusSelectedFeature(feature) {
  if (!feature) return;
  // Nếu có đối tượng đang được chọn trước đó, đặt lại style của nó về style mặc định
  if (focusedSelectFeature && selectedFeatures.includes(focusedSelectFeature)) {
    focusedSelectFeature.setStyle(selectedStyle);
  }
  // Cập nhật đối tượng đang được chọn và đặt style mới cho nó
  focusedSelectFeature = feature;
  focusedSelectFeature.setStyle(focusedSelectedStyle);
}

//Hàm zoom đến đối tượng được chọn trong bảng
function zoomToFeature(item, index) {
  const geometry = item.feature.getGeometry();
  if (!geometry) return;

  focusSelectedFeature(item.feature);

  map.getView().fit(geometry.getExtent(), {
    padding: [90, 90, 90, 90],
    duration: 500,
    maxZoom: 16
  });

  setTimeout(function () {
    showFeaturePopup(item, index);
  }, 400);
}

//Hàm xóa tất cả các đối tượng đã chọn và reset trạng thái
function clearSelectBox() {
  selectedFeatures.forEach(feature => {
    feature.setStyle(null);
  });

  selectedFeatures = [];
  focusedSelectFeature = null;
  activeResultGroup = null;

  resultList.innerHTML = '';
  countBox.innerText = '0';
  selectBoxPopupOverlay.setPosition(undefined);
}

//Hàm tìm kiếm các đối tượng trong vùng hộp
function findFeaturesInBox(extent) {
  const items = [];
  const checkedLayers = getCheckedLayers();

  checkedLayers.forEach(item => {
    const source = item.layer.getSource();
    if (!source) return;

    source.forEachFeatureIntersectingExtent(extent, function (feature) {
      items.push({
        feature: feature,
        layerName: item.name,
        group: getGeometryGroup(feature)
      });
    });
  });

  return items;
}

//Nhóm các đối tượng theo loại hình học để hiển thị trong bảng
function groupSelectedItems(items) {
  return {
    point: items.filter(item => item.group === 'point'),
    line: items.filter(item => item.group === 'line'),
    polygon: items.filter(item => item.group === 'polygon'),
    other: items.filter(item => item.group === 'other')
  };
}

//Hàm hiển thị / ẩn nhóm đối tượng trong bảng kết quả
function setActiveResultGroup(groupKey) {
  activeResultGroup = activeResultGroup === groupKey ? null : groupKey;

  resultList.querySelectorAll('.select-box-group').forEach(groupEl => {
    const currentKey = groupEl.dataset.group;
    const body = groupEl.querySelector('.select-box-group-body');
    const icon = groupEl.querySelector('.select-box-group-icon');

    if (currentKey === activeResultGroup) {
      groupEl.classList.add('active');
      body.style.display = 'block';
      icon.innerText = '▼';
    } else {
      groupEl.classList.remove('active');
      body.style.display = 'none';
      icon.innerText = '▶';
    }
  });
}

 //Hàm tạo phần tử nhóm trong bảng kết quả
function createGroupElement(groupKey, items) {
  const groupEl = document.createElement('div');
  groupEl.className = 'select-box-group';
  groupEl.dataset.group = groupKey;

  const header = document.createElement('div');
  header.className = 'select-box-group-header';
  header.innerHTML = `
    <span>
      <span class="select-box-group-icon">▶</span>
      ${getGroupTitle(groupKey)}
    </span>
    <b>${items.length}</b>
  `;

  const body = document.createElement('div');
  body.className = 'select-box-group-body';
  body.style.display = 'none';

  items.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = 'select-box-result-item';

    row.innerHTML = `
      <b>${index + 1}. ${escapeHTML(getName(item.feature, index))}</b><br>
      <span>${escapeHTML(item.layerName)}</span>
    `;

    row.onclick = function () {
      zoomToFeature(item, index);
    };

    body.appendChild(row);
  });

  header.onclick = function () {
    setActiveResultGroup(groupKey);
  };

  groupEl.appendChild(header);
  groupEl.appendChild(body);

  return groupEl;
}

//Hàm hiển thị kết quả tìm kiếm trong bảng
function showResult(items) {
  resultList.innerHTML = '';
  countBox.innerText = items.length;

  if (items.length === 0) {
    resultList.innerHTML = '<div class="select-box-empty">Không có đối tượng nào trong vùng chọn</div>';
    selectBoxPopupOverlay.setPosition(undefined);
    return;
  }

  const groups = groupSelectedItems(items);
  const groupOrder = ['point', 'line', 'polygon', 'other'];

  groupOrder.forEach(groupKey => {
    if (groups[groupKey].length > 0) {
      resultList.appendChild(createGroupElement(groupKey, groups[groupKey]));
    }
  });

  const firstGroup = groupOrder.find(groupKey => groups[groupKey].length > 0);

  if (firstGroup) {
    setActiveResultGroup(firstGroup);
  }
}

// ================== DRAG BOX ==================
// Kéo chuột thường: di chuyển bản đồ
// Ctrl + kéo chuột trái: vẽ vùng hộp
const selectBox = new DragBox({
  condition: function (event) {
    return selectBoxActive &&
           platformModifierKeyOnly(event) &&
           primaryAction(event);
  }
});

selectBox.on('boxstart', function () {
  clearSelectBox();
});

selectBox.on('boxend', function () {
  const extent = selectBox.getGeometry().getExtent();
  const items = findFeaturesInBox(extent);

  items.forEach(item => {
    item.feature.setStyle(selectedStyle);

    if (!selectedFeatures.includes(item.feature)) {
      selectedFeatures.push(item.feature);
    }
  });

  showResult(items);

  if (items.length === 1) {
    zoomToFeature(items[0], 0);
  }
});

// ================== BẬT / TẮT TOOL ==================
function openSelectBoxTool() {
  selectBoxActive = true;

  clearSelectBox();
  renderLayerCheckboxes();

  if (!map.getInteractions().getArray().includes(selectBox)) {
    map.addInteraction(selectBox);
  }

  selectBoxPanel.classList.add('active');
  map.getTargetElement().style.cursor = '';
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

// ================== SỰ KIỆN NÚT ==================
document.getElementById('select-box-close').onclick = closeSelectBoxTool;
document.getElementById('select-box-clear').onclick = clearSelectBox;

//#endregion

//#region 9.3. GEOLOCATION - ĐỊNH VỊ HIỆN TẠI

let isGeolocationActive = false; //Kiểm tra định vị có bật ko
let hasZoomedToCurrentPosition = false; //Kiểm tra đã zoom đến vị trí hiện tại chưa
let locateButton = null; //Nút định vị vị trí hiện tại

//Hàm tạo đối tượng định vị để lấy vị trí hiện tại của người dùng
const geolocation = new Geolocation({
  trackingOptions: {
    enableHighAccuracy: true
  },
  projection: map.getView().getProjection() // Sử dụng cùng hệ tọa độ với bản đồ
});

//Tạo feature để hiển thị vị trí hiện tại trên bản đồ
const geolocationFeature = new Feature();
// Thiết lập style cho feature định vị
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

//Tạo lớp vector để chứa feature định vị
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

//Hàm cập nhật trạng thái nút định vị
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

//Hàm xử lý sự kiện khi vị trí định vị thay đổi
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

//Hàm xử lý sự kiện khi có lỗi xảy ra trong quá trình định vị
geolocation.on('error', function (error) {
  alert('Không lấy được vị trí: ' + error.message);
  stopGeolocation();
});

//Hàm bật định vị
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

//Hàm tắt định vị
function stopGeolocation() {
  isGeolocationActive = false;
  hasZoomedToCurrentPosition = false;

  geolocation.setTracking(false);

  geolocationFeature.setGeometry(null);
  geolocationLayer.setVisible(false);
  updateLocateButton(false);
}

//Hàm tạo nút định vị và thêm vào bản đồ
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
//Khai báo khổ giấy theo hướng ngang, đơn vị mm
const pdfDims = {
  a0: [1189, 841],
  a1: [841, 594],
  a2: [594, 420],
  a3: [420, 297],
  a4: [297, 210],
  a5: [210, 148]
};
const screenDpi = 96; //Độ phân giải màn hình
let isExportingPdf = false; //Biến trạng thái đang xuất PDF

// ================== TẠO PANEL ==================
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

    <label class="pdf-label">Hướng giấy</label>
    <select id="pdf-orientation" class="pdf-select">
      <option value="landscape" selected>Ngang</option>
      <option value="portrait">Dọc</option>
    </select>

    <label class="pdf-label">Độ phân giải</label>
    <select id="pdf-resolution" class="pdf-select">
      <option value="72">72 dpi - nhanh</option>
      <option value="150" selected>150 dpi</option>
      <option value="300">300 dpi - chậm</option>
    </select>

    <label class="pdf-label">Tỷ lệ bản đồ</label>
    <div class="pdf-scale-row">
      <input id="pdf-scale" class="pdf-select" type="number" value="250000" min="1">
      <button id="pdf-zoom-scale-btn" type="button">Zoom</button>
    </div>

    <button id="export-pdf-btn">Xuất PDF</button>
  </div>
`;
// Thêm panel vào bản đồ
document.querySelector('.map-wrapper').appendChild(printPanel);

const $ = id => document.getElementById(id);

const printPanelHeader = $('print-panel-header');
const printPanelClose = $('print-panel-close');
const exportPdfBtn = $('export-pdf-btn');
const pdfScaleInput = $('pdf-scale');
const zoomScaleBtn = $('pdf-zoom-scale-btn');
// Kích hoạt kéo thả cho panel xuất PDF
makePanelDraggable(printPanel, printPanelHeader);

// ================== MỞ / ĐÓNG PANEL ==================
function openPrintPanel() {
  // Khi mở panel, cập nhật giá trị tỷ lệ từ bản đồ vào input
  updateScaleInputFromMap();
  // Hiển thị panel
  printPanel.classList.add('active');
}

function closePrintPanel() {
  printPanel.classList.remove('active');
}
printPanelClose.onclick = closePrintPanel;

// ================== HÀM PHỤ ==================
//Lấy giá trị tỷ lệ từ input, đảm bảo là số nguyên dương
function getInputScale() {
  return Math.max(1, Math.round(Number(pdfScaleInput.value) || 1)); //Đảm bảo tỷ lệ luôn lớn hơn hoặc bằng 1
}

//Định dạng tỷ lệ để hiển thị với dấu phân cách hàng nghìn
function formatScale(scale) {
  return Math.round(scale).toLocaleString('vi-VN');
}

//Chuyển đổi mm sang px dựa trên độ phân giải dpi
function mmToPx(mm, dpi) {
  return Math.round(mm * dpi / 25.4);
}

//Chuyển đổi tỷ lệ sang độ phân giải (resolution) dựa trên dpi và hệ tọa độ bản đồ
function scaleToResolution(scale, dpi = screenDpi) {
  const view = map.getView();
  // Công thức: resolution = (scale / 1000) / (dpi / 25.4 * cos(latitude))
  return (scale / 1000) /
    getPointResolution(
      view.getProjection(),
      dpi / 25.4,
      view.getCenter(),
      'm'
    );
    //Kết quả tính ra là mét/px
}

//Chuyển đổi độ phân giải (resolution) sang tỷ lệ dựa trên dpi và hệ tọa độ bản đồ
function resolutionToScale(resolution, dpi = screenDpi) {
  const view = map.getView();

  const pointResolution = getPointResolution(
    view.getProjection(),
    resolution,
    view.getCenter(),
    'm'
  );
  // Công thức: scale = pointResolution * (dpi / 25.4) * 1000
  return pointResolution * dpi / 25.4 * 1000;
}

//Cập nhật giá trị tỷ lệ trong input khi người dùng zoom bản đồ, nhưng không cập nhật khi đang nhập tỷ lệ hoặc đang xuất PDF
function updateScaleInputFromMap() {
  if (isExportingPdf) return;
  if (document.activeElement === pdfScaleInput) return;

  const resolution = map.getView().getResolution();
  if (!resolution) return;

  const scale = Math.round(resolutionToScale(resolution));

  if (Number.isFinite(scale) && scale > 0) {
    pdfScaleInput.value = scale;
  }
}

// Zoom bản đồ đến tỷ lệ đã nhập trong input, nhưng chỉ khi giá trị hợp lệ và không đang xuất PDF
function zoomMapToInputScale() {
  const scale = getInputScale();

  if (!scale || scale <= 0) {
    alert('Vui lòng nhập tỷ lệ hợp lệ, ví dụ: 250000');
    return;
  }

  pdfScaleInput.value = scale;

  map.getView().animate({
    resolution: scaleToResolution(scale),
    duration: 400
  });
}

// Tính toán bố cục và kích thước bản đồ trong PDF dựa trên khổ giấy, độ phân giải và hướng giấy
function getPdfLayout(format, dpi, orientation) {
  const baseDim = pdfDims[format];

  // landscape: ngang, portrait: dọc
  const dim = orientation === 'portrait'
    ? [Math.min(baseDim[0], baseDim[1]), Math.max(baseDim[0], baseDim[1])]
    : [Math.max(baseDim[0], baseDim[1]), Math.min(baseDim[0], baseDim[1])];

  const margin = 8;
  const headerHeight = 16;
  const footerHeight = 10;

  const pageWidth = dim[0];
  const pageHeight = dim[1];

  const mapX = margin;
  const mapY = margin + headerHeight;
  const mapWidthMM = pageWidth - margin * 2;
  const mapHeightMM = pageHeight - margin * 2 - headerHeight - footerHeight;

  return {
    dim,
    margin,
    pageWidth,
    pageHeight,
    mapX,
    mapY,
    mapWidthMM,
    mapHeightMM,
    widthPx: mmToPx(mapWidthMM, dpi),
    heightPx: mmToPx(mapHeightMM, dpi)
  };
}

// Vẽ bản đồ hiện tại lên canvas
function drawCurrentMapToCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  map.getViewport()
    .querySelectorAll('.ol-layer canvas, canvas.ol-layer')
    .forEach(layerCanvas => {
      if (layerCanvas.width <= 0 || layerCanvas.height <= 0) return;

      const opacity = layerCanvas.parentNode.style.opacity;
      const transform = layerCanvas.style.transform;

      let matrix = [1, 0, 0, 1, 0, 0];

      if (transform && transform.startsWith('matrix')) {
        const match = transform.match(/^matrix\(([^\)]*)\)$/);
        if (match) matrix = match[1].split(',').map(Number);
      }

      ctx.globalAlpha = opacity === '' ? 1 : Number(opacity || 1);
      ctx.setTransform(...matrix);
      ctx.drawImage(layerCanvas, 0, 0);
    });

  ctx.globalAlpha = 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  return canvas;
}

// Lưu canvas vào file PDF với bố cục và thông tin đã định nghĩa
function saveCanvasToPdf(canvas, layout, format, scale, orientation) {
  const pdf = new jsPDF(orientation, 'mm', format);

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.text('BAN DO', layout.pageWidth / 2, layout.margin + 4, {
    align: 'center'
  });

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.text(`Ty le: 1:${formatScale(scale)}`, layout.pageWidth / 2, layout.margin + 11, {
    align: 'center'
  });

  pdf.addImage(
    canvas.toDataURL('image/jpeg', 0.95),
    'JPEG',
    layout.mapX,
    layout.mapY,
    layout.mapWidthMM,
    layout.mapHeightMM
  );

  pdf.setDrawColor(0);
  pdf.setLineWidth(0.25);
  pdf.rect(layout.mapX, layout.mapY, layout.mapWidthMM, layout.mapHeightMM);

  pdf.text(
    `Ngay lap: ${new Date().toLocaleDateString('vi-VN')}`,
    layout.pageWidth / 2,
    layout.pageHeight - layout.margin + 2,
    { align: 'center' }
  );

  pdf.save(`Ban_do_${format.toUpperCase()}_1-${scale}.pdf`);
}

// ================== SỰ KIỆN TỶ LỆ ==================
zoomScaleBtn.onclick = zoomMapToInputScale;

pdfScaleInput.addEventListener('keydown', event => {
  if (event.key === 'Enter') zoomMapToInputScale();
});

// Chỉ cập nhật tỷ lệ khi zoom thay đổi, không cập nhật khi kéo chuột trái để pan bản đồ
map.getView().on('change:resolution', updateScaleInputFromMap);

updateScaleInputFromMap();

// ================== XUẤT PDF ==================
function exportMapToPDF() {
  const orientation = $('pdf-orientation').value;
  const format = $('pdf-format').value;
  const dpi = Number($('pdf-resolution').value);
  const scale = getInputScale();

  if (!pdfDims[format]) {
    alert('Khổ giấy không hợp lệ');
    return;
  }

  if (!dpi || dpi <= 0) {
    alert('Vui lòng chọn độ phân giải hợp lệ');
    return;
  }

  if (!scale || scale <= 0) {
    alert('Vui lòng nhập tỷ lệ hợp lệ, ví dụ: 250000');
    return;
  }

  pdfScaleInput.value = scale;

  const view = map.getView();
  const mapEl = map.getTargetElement();
  const layout = getPdfLayout(format, dpi, orientation);

  const oldState = {
    resolution: view.getResolution(),
    center: view.getCenter() ? [...view.getCenter()] : null,
    width: mapEl.style.width,
    height: mapEl.style.height,
    panelActive: printPanel.classList.contains('active')
  };

  const hasSatelliteLayer =
    typeof satelliteLayer !== 'undefined' &&
    satelliteLayer &&
    typeof satelliteLayer.getVisible === 'function';

  const oldSatelliteVisible = hasSatelliteLayer ? satelliteLayer.getVisible() : false;

  const hasScaleLine =
    typeof scaleLineControl !== 'undefined' &&
    scaleLineControl &&
    typeof scaleLineControl.setDpi === 'function';

  function restoreMap() {
    if (hasScaleLine) scaleLineControl.setDpi();

    mapEl.style.width = oldState.width;
    mapEl.style.height = oldState.height;
    map.updateSize();

    if (oldState.center) view.setCenter(oldState.center);
    view.setResolution(oldState.resolution);

    if (hasSatelliteLayer) satelliteLayer.setVisible(oldSatelliteVisible);
    if (oldState.panelActive) printPanel.classList.add('active');

    exportPdfBtn.disabled = false;
    exportPdfBtn.innerText = 'Xuất PDF';
    document.body.style.cursor = 'auto';

    isExportingPdf = false;
    updateScaleInputFromMap();
  }

  isExportingPdf = true;

  exportPdfBtn.disabled = true;
  exportPdfBtn.innerText = 'Đang xuất PDF...';
  document.body.style.cursor = 'progress';

  printPanel.classList.remove('active');

  if (hasSatelliteLayer) satelliteLayer.setVisible(false);
  if (hasScaleLine) scaleLineControl.setDpi(dpi);

  mapEl.style.width = layout.widthPx + 'px';
  mapEl.style.height = layout.heightPx + 'px';
  map.updateSize();
  view.setResolution(scaleToResolution(scale, dpi));

  map.once('rendercomplete', function () {
    try {
      const canvas = drawCurrentMapToCanvas(layout.widthPx, layout.heightPx);
      saveCanvasToPdf(canvas, layout, format, scale, orientation);
    } catch (error) {
      console.error(error);
      alert('Không xuất được PDF. Kiểm tra CORS của GeoServer hoặc tắt các lớp nền ngoài như vệ tinh.');
    } finally {
      restoreMap();
    }
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
  closeDisplayConfigPanel();

  measurePanel.classList.remove('active');
  selectBoxPanel.classList.remove('active');
  printPanel.classList.remove('active');
  displayConfigPanel.classList.remove('active');
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
      alert('Hãy giữ Ctrl và kéo chuột trên bản đồ để chọn đối tượng');
    }
    if (action === 'print-map') {
      openPrintPanel();
    }
    closeMenu();
  });
});
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

//#region 11.1. HIGHLIGHT ĐỐI TƯỢNG ĐƯỢC CHỌN

// Style dùng để làm nổi bật đối tượng khi click, sửa hoặc xóa
const highlightStyle = new Style({
  fill: new Fill({
    color: 'rgba(255, 255, 0, 0.35)'
  }),
  stroke: new Stroke({
    color: '#ffff00',
    width: 5
  }),
  image: new CircleStyle({
    radius: 10,
    fill: new Fill({
      color: '#ffff00'
    }),
    stroke: new Stroke({
      color: '#ffffff',
      width: 3
    })
  })
});

// Nguồn và lớp riêng để hiển thị đối tượng highlight
const highlightSource = new VectorSource();

const highlightLayer = new VectorLayer({
  title: 'Đối tượng đang chọn',
  source: highlightSource,
  style: highlightStyle,
  zIndex: 10000
});
map.addLayer(highlightLayer);

// Tô sáng đối tượng được click
function highlightFeature(feature) {
  if (!feature) return;

  cleanHighlight();

  const geometry = feature.getGeometry();
  if (!geometry) return;

  const highlightClone = feature.clone();
  highlightClone.setGeometry(geometry.clone());

  highlightSource.addFeature(highlightClone);
}

// Xóa đối tượng đang được tô sáng
function cleanHighlight() {
  highlightSource.clear();
}

//#endregion

//#region 11.2 POPUP XEM THÔNG TIN ĐỐI TƯỢNG

const container = document.getElementById('popup');
const content = document.getElementById('popup-content');
const closer = document.getElementById('popup-closer');
// Tạo overlay cho popup
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
  const cfg = MAP_LAYER_CONFIGS.find(function (item) {
    return item.wfsLayer === layer;
  });

  return cfg ? cfg.popupTitle : 'Đối tượng';
}

// TẠO NỘI DUNG POPUP
function createPopupContent(result) {
  const props = result.properties;

  const cfg = MAP_LAYER_CONFIGS.find(function (item) {
    return item.popupTitle === result.layerTitle;
  });

  if (!cfg || !cfg.popupFields) {
    const allProps = Object.keys(props)
      .filter(function (key) {
        return key !== 'geometry';
      })
      .map(function (key) {
        return `
          <div class="popup_content">
            <b>${escapeHTML(key)}:</b> ${escapeHTML(props[key])}
          </div>
        `;
      })
      .join('');

    return `
      <div class="popup_title">${escapeHTML(result.layerTitle)}</div>
      ${allProps || '<div class="popup_content">Không có thông tin thuộc tính</div>'}
    `;
  }

  const rows = cfg.popupFields.map(function (item) {
    return `
      <div class="popup_content">
        <b>${escapeHTML(item.label)}:</b> ${escapeHTML(getProp(props, item.fields))}
      </div>
    `;
  }).join('');

  return `
    <div class="popup_title">${escapeHTML(cfg.popupHeader || cfg.popupTitle)}</div>
    ${rows}
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
        return popupWfsLayers.includes(layer);
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

//#region 12. TÌM KIẾM ĐỐI TƯỢNG TRÊN BẢN ĐỒ

const searchInput = document.getElementById('search-input'); 
const searchBtn = document.getElementById('search-btn');
const searchSuggestPanel = document.getElementById('search-suggest-panel');
const searchSuggestList = document.getElementById('search-suggest-list');

let searchTimer = null; // Để trì hoãn khi người dùng gõ
let searchIndex = []; //Mảng chứa dữ liệu tìm kiếm đã tải từ các lớp WFS
let searchReadyPromise = null; //Kiểm soát việc nạp dữ liệu, Nếu đã nạp rồi thì không nạp lại
let searchHighlightLayer = null; //Lớp riêng để hiển thị kết quả tìm kiếm được chọn

const searchStyle = new Style({
  fill: new Fill({ color: 'rgba(255,255,0,0.35)' }),
  stroke: new Stroke({ color: '#ffff00', width: 4 }),
  image: new CircleStyle({
    radius: 9,
    fill: new Fill({ color: '#ffff00' }),
    stroke: new Stroke({ color: '#fff', width: 2 })
  })
});

//Khai báo các lớp được tìm kiếm
const searchLayers = MAP_LAYER_CONFIGS
  .filter(function (cfg) {
    return cfg.searchable;
  })
  .map(function (cfg) {
    return {
      id: cfg.id,
      title: cfg.searchTitle || cfg.title,
      icon: cfg.searchIcon || '▣',
      layer: cfg.wfsLayer,
      popupTitle: cfg.popupTitle,
      fields: cfg.searchFields || []
    };
  });

//Hàm chuẩn hóa từ khóa tìm kiếm
function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .trim();
}

//Hàm lấy giá trị thuộc tính theo nhiều trường (lấy giá trị đầu tiên trong danh sách các trường)
function getValue(feature, fields, fallback = '') {
  for (const field of fields) {
    const value = feature.get(field);
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return fallback;
}

// Hàm tạo URL WFS
function getWfsUrl(layer) {
  const source = layer.getSource();
  const rawUrl = source && source.getUrl && source.getUrl();

  if (typeof rawUrl !== 'string') return null;

  const url = new URL(rawUrl, window.location.href);

  url.searchParams.set('service', 'WFS');
  url.searchParams.set('version', '1.0.0');
  url.searchParams.set('request', 'GetFeature');
  url.searchParams.set('outputFormat', 'application/json');
  url.searchParams.set('maxFeatures', '100000');

  return url.toString();
}

//Hàm tạo mô tả ngắn đối tượng bên dưới tên kết quả
function makeDesc(feature, cfg) {
  const fields = cfg.fields || [];

  const values = fields
    .map(function (field) {
      return feature.get(field);
    })
    .filter(function (value) {
      return value !== undefined && value !== null && value !== '';
    });

  if (values.length > 0) {
    return values.slice(0, 3).join(', ');
  }

  return cfg.title;
}

//Hàm tải dữ liệu từ lớp WFS và chuẩn bị dữ liệu tìm kiếm
function loadSearchLayer(cfg) {
  const url = getWfsUrl(cfg.layer);
  if (!url) return Promise.resolve([]);
  //Tải dữ liệu từ Geoserver 
  return fetch(url)
    //Chuyển đổi dữ liệu sang JSON
    .then(res => res.json())
    //Chuyển JSON thành các feature OpenLayers và chuẩn hóa dữ liệu tìm kiếm
    .then(data => {
      const format = new GeoJSON();

      const features = format.readFeatures(data, {
        featureProjection: map.getView().getProjection(),
        dataProjection: 'EPSG:4326'
      });
      // Cập nhật nguồn dữ liệu của lớp WFS với các feature đã tải về
      cfg.layer.getSource().clear();
      cfg.layer.getSource().addFeatures(features);
      //Tạo danh sách dữ liệu tìm kiếm, mỗi feature sẽ chuyển thành một kết quả tìm kiếm riêng
      return features.map((feature, index) => {
        //Lấy tên đối tượng
        const name = getValue(feature, cfg.fields, 'Đối tượng ' + (index + 1));
        //Tạo mô tả ngắn gọn cho đối tượng
        const desc = makeDesc(feature, cfg);
        //Gộp các giá trị thuộc tính để tìm kiếm
        const allValues = cfg.fields.map(field => feature.get(field)).join(' ');
        //Trả về một đối tượng chứa thông tin tìm kiếm, bao gồm feature, cấu hình lớp, tên, mô tả và văn bản tìm kiếm đã chuẩn hóa
        return {
          feature,
          cfg,
          name,
          desc,
          searchText: normalizeText(name + ' ' + desc + ' ' + allValues)
        };
      });
    });
}

//Hàm nạp dữ liệu tìm kiế, chỉ nạp 1 lần và lưu trữ kết quả trong searchIndex
function preloadSearchData() {
  if (searchReadyPromise) return searchReadyPromise;
  // Nếu chưa nạp dữ liệu, thực hiện nạp dữ liệu từ tất cả các lớp tìm kiếm
  searchReadyPromise = Promise.all(searchLayers.map(loadSearchLayer))
    .then(results => {
      //Gộp tất cả các kết quả tìm kiếm từ các lớp thành một mảng duy nhất
      searchIndex = results.flat();
      console.log('Đã nạp dữ liệu tìm kiếm:', searchIndex.length, 'đối tượng');
    })
    .catch(error => {
      console.error('Lỗi nạp dữ liệu tìm kiếm:', error);
    });
  return searchReadyPromise;
}

//Hàm hiển thị thông báo trong bảng gợi ý tìm kiếm
function showSearchMessage(text, className = 'search-suggest-empty') {
  searchSuggestList.innerHTML = `<div class="${className}">${text}</div>`;
  searchSuggestPanel.classList.add('active');
}

//Hàm ẩn bảng gợi ý tìm kiếm
function hideSearchPanel() {
  searchSuggestPanel.classList.remove('active');
}

//Hàm xóa highlight của kết quả tìm kiếm trước đó
function clearSearchHighlight() {
  if (searchHighlightLayer) {
    map.removeLayer(searchHighlightLayer);
    searchHighlightLayer = null;
  }
}

//Hàm zoom tới kết quả tìm kiếm
function zoomToSearchResult(item) {
  const geometry = item.feature.getGeometry();

  if (!geometry) {
    alert('Đối tượng không có hình học');
    return;
  }

  clearSearchHighlight();

  searchHighlightLayer = new VectorLayer({
    source: new VectorSource({ features: [item.feature.clone()] }),
    style: searchStyle,
    zIndex: 9999
  });

  map.addLayer(searchHighlightLayer);

  if (geometry.getType() === 'Point') {
    map.getView().animate({
      center: geometry.getCoordinates(),
      zoom: 14,
      duration: 400
    });
  } else {
    map.getView().fit(geometry.getExtent(), {
      padding: [90, 90, 90, 90],
      duration: 400,
      maxZoom: 15
    });
  }

  content.innerHTML = createPopupContent({
    layerTitle: item.cfg.popupTitle,
    properties: item.feature.getProperties()
  });

  popup.setPosition(getPopupCoordinate(geometry));

  hideSearchPanel();
}

//Hàm lấy vị trí đặt popup
function getPopupCoordinate(geometry) {
  const type = geometry.getType();

  if (type === 'Point') {
    return geometry.getCoordinates();
  }

  if (type === 'LineString') {
    return geometry.getCoordinateAt(0.5);
  }

  if (type === 'Polygon') {
    return geometry.getInteriorPoint().getCoordinates();
  }

  if (type === 'MultiPolygon') {
    return geometry.getInteriorPoints().getFirstCoordinate();
  }

  const extent = geometry.getExtent();

  return [
    (extent[0] + extent[2]) / 2,
    (extent[1] + extent[3]) / 2
  ];
}

//Hàm hiển thị danh sách kết quả tìm kiếm trong bảng gợi ý
function renderSearchResults(results) {
  searchSuggestList.innerHTML = '';

  if (results.length === 0) {
    showSearchMessage('Không tìm thấy kết quả phù hợp');
    return;
  }

  results.forEach(item => {
    const div = document.createElement('div');

    div.className = 'search-suggest-item';
    div.innerHTML = `
      <div class="search-suggest-icon">${item.cfg.icon}</div>
      <div class="search-suggest-main">
        <div class="search-suggest-name">${item.name}</div>
        <div class="search-suggest-desc">${item.desc || item.cfg.title}</div>
      </div>
    `;

    div.onclick = function () {
      searchInput.value = item.name;
      zoomToSearchResult(item);
    };

    searchSuggestList.appendChild(div);
  });

  searchSuggestPanel.classList.add('active');
}

//Hàm tìm kiếm chính, được gọi khi người dùng nhấn Enter hoặc click nút tìm kiếm
function searchNow() {
  const keyword = searchInput.value.trim();

  if (keyword.length < 2) {
    showSearchMessage('Nhập ít nhất 2 ký tự để tìm kiếm');
    return;
  }

  if (searchIndex.length === 0) {
    showSearchMessage('Đang nạp dữ liệu tìm kiếm lần đầu...', 'search-suggest-loading');
  }

  preloadSearchData().then(() => {
    const key = normalizeText(keyword);

    const results = searchIndex
      .filter(item => item.searchText.includes(key))
      .slice(0, 10);

    renderSearchResults(results);
  });
}

//Gắn sự kiện cho ô input tìm kiếm và nút tìm kiếm
searchInput.addEventListener('input', function () {
  clearTimeout(searchTimer);

  if (!searchInput.value.trim()) {
    hideSearchPanel();
    clearSearchHighlight();
    popup.setPosition(undefined);
    return;
  }

  searchTimer = setTimeout(searchNow, 250);
});

searchInput.addEventListener('keydown', function (event) {
  if (event.key === 'Enter') {
    searchNow();
  }

  if (event.key === 'Escape') {
    hideSearchPanel();
    clearSearchHighlight();
    popup.setPosition(undefined);
  }
});

//Gắn sự kiện focus cho ô input tìm kiếm để hiển thị thông báo hướng dẫn
searchInput.addEventListener('focus', function () {
  if (!searchInput.value.trim()) {
    showSearchMessage('Nhập tên tỉnh, xã, đường hoặc UBND cần tìm');
  }
});

searchBtn.addEventListener('click', searchNow);

document.addEventListener('click', function (event) {
  const clickedSearch =
    event.target.closest('.search-box') ||
    event.target.closest('#search-suggest-panel');

  if (!clickedSearch) hideSearchPanel();
});

//Hàm mở công cụ tìm kiếm trên menu
function openSearchTool() {
  searchInput.focus();
  showSearchMessage('Nhập tên tỉnh, xã, đường hoặc UBND cần tìm');
}

// Tự động nạp dữ liệu tìm kiếm khi mở WebGIS
setTimeout(preloadSearchData, 800);

//#endregion

//#region 14. CẤU HÌNH LỚP THÊM / SỬA / XÓA

const editableLayers = MAP_LAYER_CONFIGS
  .filter(function (cfg) {
    return cfg.editable;
  })
  .map(function (cfg) {
    return {
      id: cfg.id,
      title: cfg.title,
      geometryType: cfg.geometryType,
      layer: cfg.wfsLayer,
      apiName: cfg.apiName || cfg.id,
      fields: cfg.editFields || []
    };
  });

//#endregion

//#region 15. QUẢN TRỊ DỮ LIỆU KHÔNG GIAN - THÊM / SỬA / XÓA

// ================== 15.1. BIẾN TRẠNG THÁI THÊM / SỬA / XÓA ==================
let currentAction = null;        // add, edit, delete
let currentLayerConfig = null;   // lớp đang thao tác
let drawInteraction = null;      // công cụ vẽ
let newFeature = null;           // đối tượng mới vừa vẽ
let editingFeature = null;       // đối tượng đang sửa
let deletingFeature = null;      // đối tượng đang xóa

// ================== 15.2. POPUP CHỌN LỚP DỮ LIỆU ==================
const chooseLayerPopup = document.getElementById('choose-layer-popup');
const chooseLayerTitle = document.getElementById('choose-layer-title');
const chooseLayerSelect = document.getElementById('choose-layer-select');
const chooseLayerCancel = document.getElementById('choose-layer-cancel');
const chooseLayerOk = document.getElementById('choose-layer-ok');
//Hàm mở Popup chọn lớp
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

//Hàm đóng Popup chọn lớp
function closeChooseLayerPopup() {
  chooseLayerPopup.classList.remove('active');
}
//Gán sự kiện Hủy
chooseLayerCancel.addEventListener('click', function () {
  closeChooseLayerPopup();
});
//Gán sự kiện Ok
chooseLayerOk.addEventListener('click', function () {
  const selectedLayerId = chooseLayerSelect.value;
  //Lấy id của lớp được chọn
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

// ================== 15.3. POPUP NHẬP THUỘC TÍNH ==================
const attributePopup = document.getElementById('attribute-popup');
const attributeForm = document.getElementById('attribute-form');
const attributeCancel = document.getElementById('attribute-cancel');
const attributeSave = document.getElementById('attribute-save');

//Hàm tạo ô nhập thuộc tính
function createInputField(field, value = '') {
  const label = document.createElement('label');
  //Tạo tên trường
  label.innerText = field.label;
  //Tạo ô nhập
  const input = document.createElement('input');
  input.type = 'text';
  input.name = field.name;
  input.value = value || '';

  attributeForm.appendChild(label);
  attributeForm.appendChild(input);
}

//Hàm mở Popup nhập thuộc tính khi THÊM
function openAddAttributePopup() {
  if (!currentLayerConfig) {
    alert('Chưa chọn lớp dữ liệu');
    return;
  }
  attributeForm.innerHTML = '';
  //Duyệt các trường và tạo ô nhập cho các trường
  currentLayerConfig.fields.forEach(function (field) {
    createInputField(field);
  });
  attributePopup.classList.add('active');
}

//Hàm mở Popup nhập thuộc tính khi SỬA
function openEditAttributePopup() {
  if (!currentLayerConfig || !editingFeature) {
    alert('Chưa chọn đối tượng để sửa');
    return;
  }
  attributeForm.innerHTML = '';
  //Lấy thuộc tính của đối tượng
  const properties = editingFeature.getProperties();
  //Duyệt các trường và tạo ô nhập cho các trường, các giá trị cũ sẽ hiển thị lên
  currentLayerConfig.fields.forEach(function (field) {
    const oldValue = properties[field.name] || '';
    createInputField(field, oldValue);
  });
  attributePopup.classList.add('active');
}

//Hàm đóng popup
function closeAttributePopup() {
  attributePopup.classList.remove('active');
}

//Sự kiện lưu
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

//Sự kiện hủy
attributeCancel.addEventListener('click', function () {
  if (currentAction === 'add') {
    cancelAdd();
  }
  if (currentAction === 'edit') {
    cancelEdit();
  }
  closeAttributePopup();
});

// ================== 15.4. HÀM DÙNG CHUNG CHO THÊM / SỬA / XÓA ==================

//Hàm tìm kiếm đối tượng tại vị trí click
function findFeatureInCurrentLayer(pixel) {
  let foundFeature = null;
  //Tìm đối tượng trên vị trí click - Của lớp đã chọn
  map.forEachFeatureAtPixel(
    pixel,
    function (feature, layer) {
      if (layer === currentLayerConfig.layer) {
        foundFeature = feature;
        return true;
      }
    },
    {
      hitTolerance: 8 //8 ô lân cận
    }
  );
  return foundFeature;
}

//Hàm reset trạng thái thêm sửa xóa -> Đưa về trạng thái ban đầu
function resetCrudState() {
  currentAction = null;
  currentLayerConfig = null;
  newFeature = null;
  editingFeature = null;
  deletingFeature = null;

  stopDrawInteraction();
  map.getTargetElement().style.cursor = '';

  try {
    updateAttributeAddButton(false);
  } catch (error) {
    // Bỏ qua nếu bảng chưa được khởi tạo
  }
}

//Hàm dừng Vẽ
function stopDrawInteraction() {
  if (drawInteraction) {
    map.removeInteraction(drawInteraction);
    drawInteraction = null;
  }
}

//Chuyển Feature sang Geojson
function featureToGeoJSON(feature) {
  const format = new GeoJSON();

  return format.writeFeatureObject(feature, {
    featureProjection: map.getView().getProjection(),
    dataProjection: 'EPSG:4326'
  });
}

//Trích xuất và tìm ra ID
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

//Xóa và tải lại dữ liệu
function refreshLayer(layerConfig) {
  if (!layerConfig || !layerConfig.layer) return;

  const source = layerConfig.layer.getSource();

  if (source) {
    source.clear(true);
    source.refresh();
  }
}

// Reload toàn bộ WFS
function refreshAllWfsLayers() {
  wfsGroup.getLayers().getArray().forEach(function (layer) {
    const source = layer.getSource();
    if (source) {
      source.clear(true);
      source.refresh();
    }
  });
}

// Reload toàn bộ WMS
function refreshAllWmsLayers() {
  wmsGroup.getLayers().getArray().forEach(function (layer) {
    const source = layer.getSource();
    if (source && source.updateParams) {
      source.updateParams({
        _reload: Date.now()
      });
    }
  });
}

// Reload bảng + WFS + WMS + dữ liệu tìm kiếm
function refreshMapAndTableAfterCrud(layerConfig) {
  refreshLayer(layerConfig);
  refreshAllWfsLayers();
  refreshAllWmsLayers();

  // Reset lại dữ liệu tìm kiếm để lần sau tìm kiếm lấy dữ liệu mới
  searchIndex = [];
  searchReadyPromise = null;
  setTimeout(function () {
    preloadSearchData();
  }, 500);
  try {
    reloadAttributeTableAfterCrud(layerConfig);
  } catch (error) {
    // Bỏ qua nếu bảng chưa mở
  }
}

// ================== 15.5. CHỨC NĂNG THÊM DỮ LIỆU ==================
//Hàm kích hoạt công cụ vẽ đối tượng mới
function startAdd() {
  if (!currentLayerConfig) {
    alert('Bạn chưa chọn lớp');
    return;
  }
  alert('Bây giờ hãy vẽ đối tượng trên bản đồ');
  //Dừng công cụ vẽ nào đang chạy ngầm
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

//Hàm lưu thông tin và gửi lên máy chủ
function saveAddAttributes(inputs) {
  if (!newFeature) {
    alert('Chưa có đối tượng mới để lưu');
    return;
  }
  inputs.forEach(function (input) {
    newFeature.set(input.name, input.value);
  });
  //Chuyển đối tượng thành Geojson
  const geojson = featureToGeoJSON(newFeature);
  //Tao Request POST gửi chuỗi Geojson về hệ thống backend
  fetch(`${GEOSERVER_CONFIG.backendUrl}/${currentLayerConfig.apiName}/add/`, {
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

      const savedLayerConfig = currentLayerConfig;

      closeAttributePopup();
      cleanHighlight();
      clearAttributeHighlight();
      refreshMapAndTableAfterCrud(savedLayerConfig);
      resetCrudState();

    })
    .catch(function (error) {
      console.error(error);
      alert('Lỗi kết nối backend khi thêm dữ liệu');
    });
}

//Hàm hủy thao tác thêm mới
function cancelAdd() {
  if (newFeature && currentLayerConfig) {
    currentLayerConfig.layer.getSource().removeFeature(newFeature);
  }

  resetCrudState();
}

// ================== 15.6. CHỨC NĂNG SỬA DỮ LIỆU ==================
function startEdit() {
  if (!currentLayerConfig) {
    alert('Bạn chưa chọn lớp');
    return;
  }
  alert('Hãy click vào đối tượng cần sửa trên bản đồ');
}

//Sự kiện click tìm đối tượng
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

//Lưu thuộc tính đổi tượng
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

  fetch(`${GEOSERVER_CONFIG.backendUrl}/${currentLayerConfig.apiName}/${featureId}/edit/`, {    
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

      const editedLayerConfig = currentLayerConfig;

      closeAttributePopup();
      cleanHighlight();
      clearAttributeHighlight();
      refreshMapAndTableAfterCrud(editedLayerConfig);
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

// ================== 15.7. CHỨC NĂNG XÓA DỮ LIỆU ==================
function startDelete() {
  if (!currentLayerConfig) {
    alert('Bạn chưa chọn lớp');
    return;
  }
  alert('Hãy click vào đối tượng cần xóa trên bản đồ');
}

function deleteFeatureWithConfirm(feature) {
  if (!feature) {
    alert('Chưa chọn đối tượng để xóa');
    return;
  }

  deletingFeature = feature;
  highlightFeature(deletingFeature);

  const confirmDelete = confirm('Bạn có chắc chắn muốn xóa đối tượng này không?');

  if (!confirmDelete) {
    cleanHighlight();
    clearAttributeHighlight();
    deletingFeature = null;
    return;
  }

  const featureId = getFeatureId(deletingFeature);

  if (!featureId) {
    alert('Không tìm thấy ID đối tượng để xóa');
    cleanHighlight();
    clearAttributeHighlight();
    deletingFeature = null;
    return;
  }

  const deletedLayerConfig = currentLayerConfig;

  fetch(`${GEOSERVER_CONFIG.backendUrl}/${deletedLayerConfig.apiName}/${featureId}/delete/`, {
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
      clearAttributeHighlight();
      refreshMapAndTableAfterCrud(deletedLayerConfig);
      resetCrudState();
    })
    .catch(function (error) {
      console.error(error);
      alert('Lỗi kết nối backend khi xóa dữ liệu');
    });
}

function handleDeleteClick(event) {
  const foundFeature = findFeatureInCurrentLayer(event.pixel);
  if (!foundFeature) {
    alert('Không tìm thấy đối tượng thuộc lớp đã chọn');
    return;
  }
  deleteFeatureWithConfirm(foundFeature);
}

// ================== 15.8. SỰ KIỆN MENU THÊM / SỬA / XÓA ==================

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

    if (action === 'search-data') {
      openSearchTool();
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

//#region BẢNG DỮ LIỆU THUỘC TÍNH

let attributeTable = null; //Biến lưu đối tượng bảng
let attributeCache = []; //Mảng lưu toàn bộ Feature gốc lấy từ WFS
let attributeHighlightLayer = null; //Biến lưu đối tượng highlight
let attributeLayerConfigs = []; //Biến lưu danh sách các lớp WFS có thể đưa vào bảng
let attributeAddMode = false; //Biến trạng thái nút THÊM

const attributeTablePanel = document.getElementById('attribute-table-panel');
const attributeLayerSelect = document.getElementById('attribute-layer-select');
const loadAttributeBtn = document.getElementById('load-attribute-btn');
const closeAttributeTableBtn = document.getElementById('close-attribute-table');
const tableAddBtn = document.getElementById('table-btn-add');

// ================== LẤY URL WFS CỦA LỚP ==================
function getLayerUrl(layer) {
  const source = layer.getSource();
  if (!source || !source.getUrl) 
    return null;

  const url = source.getUrl();
  if (typeof url !== 'string') 
    return null;

  return url;
}

// ================== TẠO DANH SÁCH LỚP CHO BẢNG ==================
function createAttributeLayerConfigs() {
  attributeLayerConfigs = [];

  MAP_LAYER_CONFIGS.forEach(function (cfg) {
    if (!cfg.attributeTable) return;
    if (!cfg.wfsLayer) return;

    const url = getLayerUrl(cfg.wfsLayer);
    if (!url) return;

    attributeLayerConfigs.push({
      title: cfg.wfsTitle || cfg.title,
      layer: cfg.wfsLayer,
      url: url
    });
  });
}

// ================== ĐỔ DANH SÁCH LỚP VÀO SELECT ==================
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

// ================== LẤY LỚP ĐANG CHỌN TRONG BẢNG ==================
function getCurrentAttributeConfig() {
  const index = Number(attributeLayerSelect.value);
  return attributeLayerConfigs[index];
}

// ================== LẤY CẤU HÌNH CRUD TƯƠNG ỨNG VỚI LỚP ĐANG CHỌN ==================
function getEditableConfigFromAttributeConfig(attributeConfig) {
  if (!attributeConfig) return null;

  return editableLayers.find(function (item) {
    return item.layer === attributeConfig.layer;
  });
}

// ================== GÁN LỚP TRONG BẢNG THÀNH LỚP ĐANG THAO TÁC CRUD ==================
function setCrudLayerFromAttributeTable() {
  const attributeConfig = getCurrentAttributeConfig();
  const editableConfig = getEditableConfigFromAttributeConfig(attributeConfig);

  if (!editableConfig) {
    alert('Lớp này chưa được cấu hình để thêm / sửa / xóa');
    return null;
  }

  currentLayerConfig = editableConfig;
  return editableConfig;
}

// ================== ĐỔI TRẠNG THÁI NÚT THÊM ==================
function updateAttributeAddButton(active) {
  attributeAddMode = active;

  if (!tableAddBtn) return;

  if (active) {
    tableAddBtn.classList.add('active');
    tableAddBtn.innerText = '⛔ Hủy thêm';
    tableAddBtn.title = 'Tắt chức năng thêm đối tượng';
  } else {
    tableAddBtn.classList.remove('active');
    tableAddBtn.innerText = '➕ Thêm';
    tableAddBtn.title = 'Thêm đối tượng mới';
  }
}

// ================== MỞ / ĐÓNG BẢNG ==================
function openAttributeTable() {
  renderAttributeLayerOptions();
  attributeTablePanel.classList.add('active');
}

function closeAttributeTable() {
  attributeTablePanel.classList.remove('active');
  clearAttributeHighlight();

  if (attributeTable) {
    attributeTable.clearData();
  }

  if (currentAction === 'add') {
    cancelAdd();
  }
}

// ================== XÓA HIGHLIGHT TRÊN BẢN ĐỒ ==================
function clearAttributeHighlight() {
  if (attributeHighlightLayer) {
    map.removeLayer(attributeHighlightLayer);
    attributeHighlightLayer = null;
  }
}

// ================== TẠO URL TẢI DỮ LIỆU WFS ==================
function getAttributeUrl(config) {
  const url = new URL(config.url, window.location.href);

  url.searchParams.set('maxFeatures', '50000');
  url.searchParams.set('outputFormat', 'application/json');
  url.searchParams.set('_reload', Date.now());

  return url.toString();
}

// ================== ĐỌC FEATURE TỪ DÒNG TABULATOR ==================
function getFeatureFromAttributeRow(rowData) {
  const rawFeature = attributeCache[rowData.__index];

  if (!rawFeature) return null;

  const format = new GeoJSON();

  const feature = format.readFeature(rawFeature, {
    featureProjection: map.getView().getProjection(),
    dataProjection: 'EPSG:4326'
  });

  if (rawFeature.id) {
    feature.setId(rawFeature.id);
  }

  return feature;
}

// ================== ZOOM ĐẾN ĐỐI TƯỢNG ==================
function zoomToAttributeFeature(rowData) {
  const feature = getFeatureFromAttributeRow(rowData);

  if (!feature) {
    alert('Không tìm thấy đối tượng');
    return;
  }

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
      duration: 500
    });
  } else {
    map.getView().fit(geometry.getExtent(), {
      padding: [80, 80, 80, 80],
      duration: 500,
      maxZoom: 15
    });
  }
}

// ================== SỬA ĐỐI TƯỢNG THEO DÒNG ==================
function editAttributeRow(rowData) {
  const editableConfig = setCrudLayerFromAttributeTable();

  if (!editableConfig) return;

  const feature = getFeatureFromAttributeRow(rowData);

  if (!feature) {
    alert('Không tìm thấy đối tượng để sửa');
    return;
  }

  currentAction = 'edit';
  currentLayerConfig = editableConfig;
  editingFeature = feature;

  zoomToAttributeFeature(rowData);
  highlightFeature(editingFeature);
  openEditAttributePopup();
}

// ================== XÓA ĐỐI TƯỢNG THEO DÒNG ==================
function deleteAttributeRow(rowData) {
  const editableConfig = setCrudLayerFromAttributeTable();

  if (!editableConfig) return;

  const feature = getFeatureFromAttributeRow(rowData);

  if (!feature) {
    alert('Không tìm thấy đối tượng để xóa');
    return;
  }

  currentAction = 'delete';
  currentLayerConfig = editableConfig;
  deletingFeature = feature;

  zoomToAttributeFeature(rowData);
  highlightFeature(deletingFeature);
  deleteFeatureWithConfirm(deletingFeature);
}

// ================== BẬT / TẮT THÊM ĐỐI TƯỢNG ==================
function addAttributeRow() {
  // Nếu đang bật thêm thì click lại để tắt
  if (currentAction === 'add' && attributeAddMode) {
    cancelAdd();
    closeAttributePopup();
    clearAttributeHighlight();
    cleanHighlight();
    updateAttributeAddButton(false);
    return;
  }

  const editableConfig = setCrudLayerFromAttributeTable();

  if (!editableConfig) return;

  cleanHighlight();
  clearAttributeHighlight();
  stopDrawInteraction();

  currentAction = 'add';
  currentLayerConfig = editableConfig;
  newFeature = null;

  updateAttributeAddButton(true);
  startAdd();
}

// ================== TẠO CỘT CHO TABULATOR ==================
function createAttributeColumns(features) {
  const properties = features[0].properties || {};
  const fields = Object.keys(properties);

  const actionColumn = {
    title: 'Thao tác',
    field: '__actions',
    width: 125,
    hozAlign: 'center',
    headerSort: false,
    frozen: true,
    formatter: function () {
      return `
        <div class="table-row-actions">
          <button class="table-row-btn view" data-row-action="view" title="Xem đối tượng">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 5C6.5 5 2.1 8.4 1 12c1.1 3.6 5.5 7 11 7s9.9-3.4 11-7c-1.1-3.6-5.5-7-11-7zm0 11.2A4.2 4.2 0 1 1 12 7.8a4.2 4.2 0 0 1 0 8.4zm0-2.3a1.9 1.9 0 1 0 0-3.8 1.9 1.9 0 0 0 0 3.8z"/>
            </svg>
          </button>

          <button class="table-row-btn edit" data-row-action="edit" title="Sửa đối tượng">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 17.3V21h3.7L18.4 9.3l-3.7-3.7L3 17.3zm17.7-10.2a1 1 0 0 0 0-1.4l-2.4-2.4a1 1 0 0 0-1.4 0l-1.9 1.9 3.7 3.7 2-1.8z"/>
            </svg>
          </button>

          <button class="table-row-btn delete" data-row-action="delete" title="Xóa đối tượng">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M7 21c-.6 0-1-.4-1-1V7h12v13c0 .6-.4 1-1 1H7zm3-3h2V10h-2v8zm4 0h2V10h-2v8zM15.5 4l-1-1h-5l-1 1H5v2h14V4h-3.5z"/>
            </svg>
          </button>
        </div>
      `;
    },
    cellClick: function (e, cell) {
      const button = e.target.closest('[data-row-action]');

      if (!button) return;

      e.stopPropagation();

      const action = button.dataset.rowAction;
      const rowData = cell.getRow().getData();

      if (action === 'view') {
        zoomToAttributeFeature(rowData);
      }

      if (action === 'edit') {
        editAttributeRow(rowData);
      }

      if (action === 'delete') {
        deleteAttributeRow(rowData);
      }
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

  return [actionColumn, ...attributeColumns];
}

// ================== TẢI DỮ LIỆU LÊN BẢNG ==================
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

        if (attributeTable) {
          attributeTable.clearData();
        }

        config.layer.getSource().clear(true);
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
        selectable: 1,
        placeholder: 'Không có dữ liệu',

        rowClick: function (e, row) {
          row.select();
        },

        rowDblClick: function (e, row) {
          zoomToAttributeFeature(row.getData());
        }
      });

      // Đồng bộ dữ liệu WFS lên source của lớp đang xem
      const format = new GeoJSON();

      const mapFeatures = format.readFeatures(data, {
        featureProjection: map.getView().getProjection(),
        dataProjection: 'EPSG:4326'
      });

      config.layer.getSource().clear(true);
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

// ================== TẢI LẠI BẢNG SAU THÊM / SỬA / XÓA ==================
function reloadAttributeTableAfterCrud(layerConfig) {
  if (!attributeTablePanel.classList.contains('active')) return;

  const tableConfig = getCurrentAttributeConfig();

  if (!tableConfig || !layerConfig) return;

  if (tableConfig.layer !== layerConfig.layer) return;

  setTimeout(function () {
    loadAttributeTable();
  }, 300);
}

// ================== SỰ KIỆN ==================
loadAttributeBtn.addEventListener('click', loadAttributeTable);

closeAttributeTableBtn.addEventListener('click', closeAttributeTable);

tableAddBtn.addEventListener('click', function () {
  addAttributeRow();
});

attributeLayerSelect.addEventListener('change', function () {
  clearAttributeHighlight();
  cleanHighlight();
  attributeCache = [];

  if (attributeTable) {
    attributeTable.clearData();
  }

  if (currentAction === 'add') {
    cancelAdd();
  }
});

//#endregion

//#region 16. CẤU HÌNH HIỂN THỊ BẢN ĐỒ / NHÓM / LỚP
//Lưu cấu hình --> Sau khi trình duyệt mở lại sẽ đọc cấu hình này để áp dụng
const DISPLAY_CONFIG_STORAGE_KEY = 'webgis_display_config_v1'; 
// ================== LƯU / ĐỌC CẤU HÌNH ==================
//Hàm đọc cấu hình đã lưu
function getSavedDisplayConfig() {
  try {
    return JSON.parse(localStorage.getItem(DISPLAY_CONFIG_STORAGE_KEY)) || {};
  } catch (error) {
    return {};
  }
}
//Hàm lưu cấu hình 
function saveDisplayConfig(config) {
  localStorage.setItem(DISPLAY_CONFIG_STORAGE_KEY, JSON.stringify(config));
}

// ================== CẤU HÌNH BẢN ĐỒ NỀN ==================
//Hàm chọn bản đồ nền đang hiển thị
function setBaseLayerById(baseLayerId) {
  BASE_LAYER_CONFIGS.forEach(function (cfg) {
    const layer = baseLayerMap[cfg.id];
    if (layer) {
      layer.setVisible(cfg.id === baseLayerId);
    }
  });
}

//Hàm lấy bản đồ nền đang bật hiện tại
function getCurrentBaseLayerId() {
  const found = BASE_LAYER_CONFIGS.find(function (cfg) {
    const layer = baseLayerMap[cfg.id];
    return layer && layer.getVisible();
  });
  return found ? found.id : BASE_LAYER_CONFIGS[0].id;
}

// ================== CẤU HÌNH NHÓM LỚP ==================
//Gom nhóm layẻ vào danh sách
const displayGroupConfigs = [
  { id: 'base', title: 'Bản đồ nền', group: baseGroup },
  { id: 'wms', title: 'Bản đồ WMS', group: wmsGroup },
  { id: 'wfs', title: 'Bản đồ WFS', group: wfsGroup },
  { id: 'raster', title: 'Bản đồ raster', group: rasterGroup }
];

// ================== LẤY DANH SÁCH LỚP CÓ THỂ CẤU HÌNH ==================
function getDisplayLayerItems() {
  const items = [];
  MAP_LAYER_CONFIGS.forEach(function (cfg) {
    if (cfg.wmsLayer) {
      items.push({
        key: 'wms:' + cfg.id,
        id: cfg.id,
        type: 'WMS',
        title: cfg.wmsTitle,
        layer: cfg.wmsLayer
      });
    }

    if (cfg.wfsLayer) {
      items.push({
        key: 'wfs:' + cfg.id,
        id: cfg.id,
        type: 'WFS',
        title: cfg.wfsTitle,
        layer: cfg.wfsLayer
      });
    }
  });

  RASTER_LAYER_CONFIGS.forEach(function (cfg) {
    const layer = rasterLayerMap[cfg.id];
    if (layer) {
      items.push({
        key: 'raster:' + cfg.id,
        id: cfg.id,
        type: 'Raster',
        title: cfg.title,
        layer: layer
      });
    }
  });

  return items;
}

// ================== ÁP DỤNG CẤU HÌNH ĐÃ LƯU CHO LỚP ==================
//Áp dụng cấu hình đã lưu cho layer
function applyLayerDisplayState(layer, state) {
  if (!layer || !state) return;
  if (state.title !== undefined) {
    layer.set('title', state.title);
  }
  if (state.visible !== undefined) {
    layer.setVisible(Boolean(state.visible));
  }
  if (state.opacity !== undefined) {
    layer.setOpacity(Number(state.opacity));
  }
  if (state.minZoom !== undefined && state.minZoom !== '') {
    layer.setMinZoom(Number(state.minZoom));
  }
  if (state.maxZoom !== undefined && state.maxZoom !== '') {
    layer.setMaxZoom(Number(state.maxZoom));
  }
}

//Áp dụng toàn bộ cấu hình lớp đã lưu
function applySavedLayerDisplayConfig() {
  const saved = getSavedDisplayConfig(); //Đọc toàn bộ cấu hình đã lưu rồi áp dụng cho...
  //Bản đồ nền
  if (saved.map && saved.map.baseLayerId) {
    setBaseLayerById(saved.map.baseLayerId);
  }
  //Nhóm bản đồ
  if (saved.groups) {
    displayGroupConfigs.forEach(function (item) {
      const groupState = saved.groups[item.id];
      if (!groupState) return;
      if (groupState.title !== undefined) {
        item.group.set('title', groupState.title);
      }
      if (groupState.visible !== undefined) {
        item.group.setVisible(Boolean(groupState.visible));
      }
    });
  }
  //Từng layer
  if (saved.layers) {
    getDisplayLayerItems().forEach(function (item) {
      applyLayerDisplayState(item.layer, saved.layers[item.key]);
    });
  }
}

// ================== ẨN / HIỆN CONTROL OPENLAYERS ==================
//Hàm thêm hoặc bỏ class trên bản đồ
function setMapWrapperHiddenClass(className, visible) {
  const wrapper = document.querySelector('.map-wrapper');
  if (!wrapper) return;
  wrapper.classList.toggle(className, !visible);
}

//Hàm bật tắt control
function setControlElementVisible(control, visible) {
  if (control === scaleLineControl) {
    setMapWrapperHiddenClass('hide-scale-control', visible);
  }
  if (control === overviewMapControl) {
    setMapWrapperHiddenClass('hide-overview-control', visible);
  }
  if (control && control.element) {
    control.element.style.display = visible ? '' : 'none';
  }
}

//Hàm hiển thị/tắt tọa độ chuột
function setMousePositionVisible(visible) {
  setMapWrapperHiddenClass('hide-mouse-position', visible);
  const mousePositionBox = document.getElementById('mouse-position');
  if (mousePositionBox) {
    mousePositionBox.style.display = visible ? '' : 'none';
  }
}

//Hàm đọc cấu hình bản đồ đã lưu
function applySavedMapControlConfig() {
  const saved = getSavedDisplayConfig();
  const mapCfg = saved.map || {};

  if (mapCfg.centerLon !== undefined && mapCfg.centerLat !== undefined) {
    map.getView().setCenter(fromLonLat([
      Number(mapCfg.centerLon),
      Number(mapCfg.centerLat)
    ]));
  }
  if (mapCfg.zoom !== undefined && mapCfg.zoom !== '') {
    map.getView().setZoom(Number(mapCfg.zoom));
  }
  if (mapCfg.scaleLineVisible !== undefined) {
    setControlElementVisible(scaleLineControl, mapCfg.scaleLineVisible);
  }
  if (mapCfg.mousePositionVisible !== undefined) {
    setMousePositionVisible(mapCfg.mousePositionVisible);
  }
  if (mapCfg.overviewVisible !== undefined) {
    setControlElementVisible(overviewMapControl, mapCfg.overviewVisible);
  }
}

// ================== TẠO PANEL CẤU HÌNH ==================

const displayConfigPanel = document.createElement('div');
displayConfigPanel.id = 'display-config-panel';
displayConfigPanel.className = 'advanced-panel';

displayConfigPanel.innerHTML = `
  <div class="advanced-panel-header" id="display-config-panel-header">
    <span id="display-config-title">Cấu hình hiển thị</span>
    <button id="display-config-close" class="advanced-panel-close">×</button>
  </div>

  <div class="advanced-panel-body" id="display-config-body"></div>
`;

document.querySelector('.map-wrapper').appendChild(displayConfigPanel);

const displayConfigTitle = document.getElementById('display-config-title');
const displayConfigBody = document.getElementById('display-config-body');
const displayConfigClose = document.getElementById('display-config-close');
const displayConfigHeader = document.getElementById('display-config-panel-header');

makePanelDraggable(displayConfigPanel, displayConfigHeader);

function closeDisplayConfigPanel() {
  displayConfigPanel.classList.remove('active');
}

displayConfigClose.onclick = closeDisplayConfigPanel;

// ================== MỞ PANEL THEO TỪNG CHỨC NĂNG ==================

function openDisplayConfigPanel(mode) {
  stopMeasureDrawOnly();
  closeSelectBoxTool();
  stopGeolocation();
  closePrintPanel();

  measurePanel.classList.remove('active');
  selectBoxPanel.classList.remove('active');
  printPanel.classList.remove('active');

  if (mode === 'map-config') {
    renderMapConfigPanel();
  }
  if (mode === 'group-config') {
    renderGroupConfigPanel();
  }
  if (mode === 'layer-config') {
    renderLayerConfigPanel();
  }
  displayConfigPanel.classList.add('active');
}

// ================== CẤU HÌNH BẢN ĐỒ ==================

function renderMapConfigPanel() {
  displayConfigTitle.innerText = 'Cấu hình hiển thị bản đồ';

  const center = map.getView().getCenter();
  const lonLat = center ? toLonLat(center) : [105.8, 21.04];
  const zoom = map.getView().getZoom() || 8;
  const currentBaseId = getCurrentBaseLayerId();
  const saved = getSavedDisplayConfig();
  const mapCfg = saved.map || {};

  displayConfigBody.innerHTML = `
    <label class="pdf-label">Bản đồ nền mặc định</label>
    <select id="map-config-base" class="pdf-select">
      ${BASE_LAYER_CONFIGS.map(function (cfg) {
        return `
          <option value="${cfg.id}" ${cfg.id === currentBaseId ? 'selected' : ''}>
            ${cfg.title}
          </option>
        `;
      }).join('')}
    </select>

    <label class="pdf-label">Kinh độ tâm bản đồ</label>
    <input id="map-config-lon" class="pdf-select" type="number" step="0.000001" value="${lonLat[0].toFixed(6)}">

    <label class="pdf-label">Vĩ độ tâm bản đồ</label>
    <input id="map-config-lat" class="pdf-select" type="number" step="0.000001" value="${lonLat[1].toFixed(6)}">

    <label class="pdf-label">Mức zoom ban đầu</label>
    <input id="map-config-zoom" class="pdf-select" type="number" step="1" min="1" max="22" value="${Math.round(zoom)}">

    <label class="select-box-layer-item">
      <input id="map-config-scale" type="checkbox" ${mapCfg.scaleLineVisible !== false ? 'checked' : ''}>
      Hiển thị thước tỷ lệ
    </label>

    <label class="select-box-layer-item">
      <input id="map-config-mouse" type="checkbox" ${mapCfg.mousePositionVisible !== false ? 'checked' : ''}>
      Hiển thị tọa độ chuột
    </label>

    <label class="select-box-layer-item">
      <input id="map-config-overview" type="checkbox" ${mapCfg.overviewVisible !== false ? 'checked' : ''}>
      Hiển thị bản đồ tổng quan
    </label>

    <button id="map-config-apply">Áp dụng</button>
    <button id="map-config-save">Lưu cấu hình</button>
  `;

  document.getElementById('map-config-apply').onclick = function () {
    applyMapConfig(false);
  };

  document.getElementById('map-config-save').onclick = function () {
    applyMapConfig(true);
  };
}

function applyMapConfig(shouldSave) {
  const baseLayerId = document.getElementById('map-config-base').value;
  const centerLon = Number(document.getElementById('map-config-lon').value);
  const centerLat = Number(document.getElementById('map-config-lat').value);
  const zoom = Number(document.getElementById('map-config-zoom').value);

  const scaleLineVisible = document.getElementById('map-config-scale').checked;
  const mousePositionVisible = document.getElementById('map-config-mouse').checked;
  const overviewVisible = document.getElementById('map-config-overview').checked;

  setBaseLayerById(baseLayerId);

  if (Number.isFinite(centerLon) && Number.isFinite(centerLat)) {
    map.getView().animate({
      center: fromLonLat([centerLon, centerLat]),
      zoom: Number.isFinite(zoom) ? zoom : map.getView().getZoom(),
      duration: 400
    });
  }

  setControlElementVisible(scaleLineControl, scaleLineVisible);
  setMousePositionVisible(mousePositionVisible);
  setControlElementVisible(overviewMapControl, overviewVisible);

  if (shouldSave) {
    const saved = getSavedDisplayConfig();

    saved.map = {
      ...(saved.map || {}),
      baseLayerId,
      centerLon,
      centerLat,
      zoom,
      scaleLineVisible,
      mousePositionVisible,
      overviewVisible
    };

    saveDisplayConfig(saved);
    alert('Đã lưu cấu hình hiển thị bản đồ');
  }
}

// ================== CẤU HÌNH NHÓM BẢN ĐỒ ==================

function renderGroupConfigPanel() {
  displayConfigTitle.innerText = 'Cấu hình hiển thị nhóm bản đồ';

  displayConfigBody.innerHTML = `
    ${displayGroupConfigs.map(function (item) {
      return `
        <div class="select-box-layer-item">
          <label>
            <input type="checkbox" class="group-config-visible" data-group-id="${item.id}" ${item.group.getVisible() ? 'checked' : ''}>
            Bật nhóm
          </label>

          <label class="pdf-label">Tên nhóm</label>
          <input class="pdf-select group-config-title" data-group-id="${item.id}" value="${item.group.get('title') || item.title}">
        </div>
      `;
    }).join('')}

    <button id="group-config-apply">Áp dụng</button>
    <button id="group-config-save">Lưu cấu hình</button>
  `;

  document.getElementById('group-config-apply').onclick = function () {
    applyGroupConfig(false);
  };

  document.getElementById('group-config-save').onclick = function () {
    applyGroupConfig(true);
  };
}

function applyGroupConfig(shouldSave) {
  const saved = getSavedDisplayConfig();
  saved.groups = saved.groups || {};

  displayGroupConfigs.forEach(function (item) {
    const visibleInput = document.querySelector(`.group-config-visible[data-group-id="${item.id}"]`);
    const titleInput = document.querySelector(`.group-config-title[data-group-id="${item.id}"]`);

    const visible = visibleInput ? visibleInput.checked : item.group.getVisible();
    const title = titleInput ? titleInput.value.trim() : item.group.get('title');

    item.group.setVisible(visible);

    if (title) {
      item.group.set('title', title);
    }

    saved.groups[item.id] = {
      visible,
      title
    };
  });

  if (shouldSave) {
    saveDisplayConfig(saved);
    alert('Đã lưu cấu hình nhóm bản đồ');
  }
}

// ================== CẤU HÌNH LỚP ==================

function renderLayerConfigPanel() {
  displayConfigTitle.innerText = 'Cấu hình hiển thị lớp';

  const items = getDisplayLayerItems();

  displayConfigBody.innerHTML = `
    <label class="pdf-label">Chọn lớp</label>
    <select id="layer-config-select" class="pdf-select">
      ${items.map(function (item) {
        return `
          <option value="${item.key}">
            ${item.type} - ${item.layer.get('title') || item.title}
          </option>
        `;
      }).join('')}
    </select>

    <div id="layer-config-detail"></div>
  `;

  const layerSelect = document.getElementById('layer-config-select');

  layerSelect.onchange = function () {
    renderLayerConfigDetail(layerSelect.value);
  };

  if (items.length > 0) {
    renderLayerConfigDetail(items[0].key);
  }
}

function renderLayerConfigDetail(layerKey) {
  const item = getDisplayLayerItems().find(function (layerItem) {
    return layerItem.key === layerKey;
  });

  if (!item) {
    document.getElementById('layer-config-detail').innerHTML = `
      <div class="select-box-empty">Không có lớp để cấu hình</div>
    `;
    return;
  }

  const layer = item.layer;
  const minZoom = Number.isFinite(layer.getMinZoom()) ? layer.getMinZoom() : '';
  const maxZoom = Number.isFinite(layer.getMaxZoom()) ? layer.getMaxZoom() : '';

  document.getElementById('layer-config-detail').innerHTML = `
    <label class="pdf-label">Tên lớp hiển thị</label>
    <input id="layer-config-title" class="pdf-select" value="${layer.get('title') || item.title}">

    <label class="select-box-layer-item">
      <input id="layer-config-visible" type="checkbox" ${layer.getVisible() ? 'checked' : ''}>
      Hiển thị lớp
    </label>

    <label class="pdf-label">Độ trong suốt</label>
    <input id="layer-config-opacity" class="pdf-select" type="number" min="0" max="1" step="0.1" value="${layer.getOpacity()}">

    <label class="pdf-label">Min zoom</label>
    <input id="layer-config-minzoom" class="pdf-select" type="number" step="1" value="${minZoom}">

    <label class="pdf-label">Max zoom</label>
    <input id="layer-config-maxzoom" class="pdf-select" type="number" step="1" value="${maxZoom}">

    <button id="layer-config-apply">Áp dụng</button>
    <button id="layer-config-save">Lưu cấu hình</button>
  `;

  document.getElementById('layer-config-apply').onclick = function () {
    applyLayerConfig(item, false);
  };

  document.getElementById('layer-config-save').onclick = function () {
    applyLayerConfig(item, true);
  };
}

function applyLayerConfig(item, shouldSave) {
  const layer = item.layer;
  const title = document.getElementById('layer-config-title').value.trim();
  const visible = document.getElementById('layer-config-visible').checked;
  const opacity = Number(document.getElementById('layer-config-opacity').value);
  const minZoomValue = document.getElementById('layer-config-minzoom').value;
  const maxZoomValue = document.getElementById('layer-config-maxzoom').value;

  if (title) {
    layer.set('title', title);
  }
  layer.setVisible(visible);
  if (Number.isFinite(opacity)) {
    layer.setOpacity(Math.max(0, Math.min(1, opacity)));
  }
  if (minZoomValue !== '') {
    layer.setMinZoom(Number(minZoomValue));
  } else {
    layer.setMinZoom(-Infinity);
  }
  if (maxZoomValue !== '') {
    layer.setMaxZoom(Number(maxZoomValue));
  } else {
    layer.setMaxZoom(Infinity);
  }
  if (shouldSave) {
    const saved = getSavedDisplayConfig();
    saved.layers = saved.layers || {};

    saved.layers[item.key] = {
      title: title || layer.get('title'),
      visible,
      opacity: layer.getOpacity(),
      minZoom: minZoomValue,
      maxZoom: maxZoomValue
    };
    saveDisplayConfig(saved);
    alert('Đã lưu cấu hình lớp bản đồ');
  }
}

// ================== GẮN SỰ KIỆN MENU ==================
document.querySelectorAll('[data-config-action]').forEach(function (item) {
  item.addEventListener('click', function () {
    openDisplayConfigPanel(item.dataset.configAction);
    closeMenu();
  });
});

// ================== ÁP DỤNG CẤU HÌNH SAU KHI TOÀN BỘ MAP ĐÃ TẠO XONG ==================
applySavedLayerDisplayConfig();
applySavedMapControlConfig();
setTimeout(function () {
  applySavedLayerDisplayConfig();
  applySavedMapControlConfig();
}, 300);
//#endregion