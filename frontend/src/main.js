//#region 1. IMPORT
import 'ol/ol.css';
import './style.css';
import './workspace.css';
import './ptn-workspace.css';
import { createPositionSearchTool } from './tool/positionSearchTool.js';
import { initWorkspaceTools } from './tool/workspaceTools.js';
import { createSystemTools } from './tool/systemTools.js';

import Map from 'ol/Map.js';
import View from 'ol/View.js';

import TileLayer from 'ol/layer/Tile.js';
import ImageLayer from 'ol/layer/Image.js';
import VectorLayer from 'ol/layer/Vector.js';
import LayerGroup from 'ol/layer/Group.js';

import OSM from 'ol/source/OSM.js';
import XYZ from 'ol/source/XYZ.js';
import TileWMS from 'ol/source/TileWMS.js';
import ImageWMS from 'ol/source/ImageWMS.js';
import VectorSource from 'ol/source/Vector.js';

import GeoJSON from 'ol/format/GeoJSON.js';

import {
  fromLonLat,
  toLonLat,
  transformExtent
} from 'ol/proj.js';

import {
  GEOSERVER_CONFIG,
  BASE_LAYER_CONFIGS,
  MAP_LAYER_CONFIGS,
  RASTER_LAYER_CONFIGS,
  LAYER_GROUP_CONFIGS 
} from './config/layers.js';

import {
  createBasicTools
} from './tool/basicTools.js';

import {
  createToolManager
} from './tool/toolManager.js';

import {
  makePanelDraggable,
  loadWmsImage,
  initTooltips,
} from './tool/toolUtils.js';

import { createCrudManager } from './tool/crudManager.js';
import { createSearchManager } from './tool/searchManager.js';
import { createPopupTool } from './tool/popupTool.js';
import { createCesiumTool } from './tool/cesiumTool.js';
import { createLayerCatalogTool } from './tool/layerCatalogTool.js';
import { createRasterManager } from './tool/rasterManager.js';
import { createDataTableTool } from './tool/dataTableTool.js';
import { createLayerStyleTool } from './tool/layerStyleTool.js';
import { createLayerOverviewTool } from './tool/layerOverviewTool.js';
//#endregion

//#region 2. KHỞI TẠO LỚP VÀ NHÓM BẢN ĐỒ
// ================== 2.4. HÀM TẠO SOURCE / STYLE / LAYER ==================
//Hàm tạo bản đồ nền
function createBaseLayer(cfg) {
  let source = null;
  if (cfg.sourceType === 'XYZ') {
    source = new XYZ({
      url: cfg.url,
      maxZoom: cfg.sourceMaxZoom ?? 19,
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


//Hàm tạo URL WFS
function createWfsUrl(typeName) {
  return `${GEOSERVER_CONFIG.wfsUrl}?service=WFS&version=1.0.0&request=GetFeature&typeName=${typeName}&outputFormat=application/json`;
}

//Hàm tạo Lớp WMS
function createWmsLayer(cfg) {
  // Các lớp hành chính có nhãn dùng một ảnh WMS cho toàn khung nhìn. Điều này
  // ngăn GeoServer vẽ lặp nhãn ở từng tile khi bản đồ được ghép nhiều ô ảnh.
  const isLabelledAdministrativeLayer = ['vn_tinh', 'vn_xa'].includes(cfg.id);
  const sourceOptions = {
    url: GEOSERVER_CONFIG.wmsUrl,
    params: {
      LAYERS: cfg.id,
      ...(isLabelledAdministrativeLayer ? {} : { TILED: true })
    },
    serverType: 'geoserver',
    crossOrigin: 'anonymous'
  };
  const layerOptions = {
    title: cfg.title,
    visible: cfg.visible,
    source: isLabelledAdministrativeLayer
      ? new ImageWMS({ ...sourceOptions, ratio: 1.5, imageLoadFunction: loadWmsImage })
      : new TileWMS({ ...sourceOptions, tileLoadFunction: loadWmsImage })
  };
  const layer = isLabelledAdministrativeLayer
    ? new ImageLayer(layerOptions)
    : new TileLayer(layerOptions);
  layer.set('configId', cfg.id);
  layer.set('layerKind', 'wms');
  return layer;
}

//Tạo lớp WFS
function createWfsLayer(cfg) {
  const typeName = `${GEOSERVER_CONFIG.workspace}:${cfg.id}`;
  const layer = new VectorLayer({
    visible: true,
    source: new VectorSource({
      format: new GeoJSON(),
      url: createWfsUrl(typeName)
    }),
    style: function () {
      return null;
    }
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
      tileLoadFunction: loadWmsImage,
      url: GEOSERVER_CONFIG.wmsUrl,
      params: {
        LAYERS: cfg.layerName,
        TILED: true,
        FORMAT: cfg.format || 'image/png',
        TRANSPARENT: cfg.transparent !== false
      },
      serverType: 'geoserver',
      transition: 0,
      cacheSize: 512,
      crossOrigin: 'anonymous'
    })
  });
  layer.set('configId', cfg.id);
  layer.set('layerKind', 'raster');
  layer.set('rasterName', cfg.layerName);
  layer.set('rasterMetadata', { name: cfg.layerName, title: cfg.title, presentation_type: cfg.id === 'dem_vietnam' ? 'dem' : 'satellite' });

  return layer;
}

// ================== 2.5. TẠO LAYER TỪ CẤU HÌNH ==================
const baseLayerMap = {};
BASE_LAYER_CONFIGS.forEach(function (cfg) {
  baseLayerMap[cfg.id] = createBaseLayer(cfg);
});

const layerConfigs = MAP_LAYER_CONFIGS.map(function (config) {
  return {
    ...config,
    wmsLayer: createWmsLayer(config),
    wfsLayer: createWfsLayer(config)
  };
});

const rasterLayerMap = {};
RASTER_LAYER_CONFIGS.forEach(function (cfg) {
  rasterLayerMap[cfg.id] = createRasterLayer(cfg);
});

// Lớp nền cần ẩn khi xuất bản đồ được xác định từ cấu hình
const printHiddenBaseConfig = BASE_LAYER_CONFIGS.find(
  config => config.hideWhenPrinting
);

const satelliteLayer = printHiddenBaseConfig
  ? baseLayerMap[printHiddenBaseConfig.id]
  : null;

// ================== 2.7. NHÓM CÁC LỚP BẢN ĐỒ ==================
// Tên, thành viên và thứ tự các nhóm chỉ lấy từ config/layers.js.
// OpenLayers lưu collection từ dưới lên trên, nên đảo thứ tự khai báo trước khi
// đưa vào map để group/layer viết trước được hiển thị ở trên cùng.
const thematicGroupMap = {};
const groupMap = {};
const mapGroups = LAYER_GROUP_CONFIGS.map(function (groupCfg) {
  const kind = groupCfg.kind || 'wms';
  let childLayers = [];

  if (kind === 'base') {
    childLayers = BASE_LAYER_CONFIGS
      .filter(cfg => cfg.group === groupCfg.id)
      .map(cfg => baseLayerMap[cfg.id]);
  } else if (kind === 'raster') {
    childLayers = RASTER_LAYER_CONFIGS
      .filter(cfg => cfg.group === groupCfg.id)
      .map(cfg => rasterLayerMap[cfg.id]);
  } else {
    childLayers = layerConfigs
      .filter(config => config.group === groupCfg.id)
      .map(function (config) {
        config.wmsLayer.set('title', config.title);
        return config.wmsLayer;
      });
  }

  const group = new LayerGroup({
    title: groupCfg.title,
    fold: groupCfg.fold || 'open',
    layers: childLayers.reverse()
  });
  group.set('tocGroupId', groupCfg.id);
  group.set('layerGroupKind', kind);
  groupMap[groupCfg.id] = group;
  if (kind === 'wms') thematicGroupMap[groupCfg.id] = group;
  return group;
});

const baseGroup = mapGroups.find(group => group.get('layerGroupKind') === 'base');
const rasterGroup = mapGroups.find(group => group.get('layerGroupKind') === 'raster');
const thematicGroups = mapGroups.filter(group => group.get('layerGroupKind') === 'wms');

// WFS vẫn giữ để CRUD, tìm kiếm và chọn đối tượng hoạt động.
const wfsGroup = new LayerGroup({
  visible: false, // Mặc định không hiển thị.
  layers: layerConfigs.map(function (config) {
    return config.wfsLayer; // Giữ nguyên các WFS hiện tại.
  })
});

//#endregion

//#region 3. BẢN ĐỒ, CONTROL VÀ MENU
const map = new Map({
  target: 'map',
  layers: [
    wfsGroup, // WFS kỹ thuật, mặc định tắt.
    ...mapGroups.slice().reverse()
  ],
  view: new View({
    center: fromLonLat([107.5, 16.2]),
    zoom: 5
  })
});
createCesiumTool(map);
// ================== CONTROL CƠ BẢN ==================
const popupTool = createPopupTool({
  map,
  layerConfigs,
  groupMap: thematicGroupMap
});

const basicTools = createBasicTools(map);
const layerStyle = createLayerStyleTool({ thematicGroups, rasterGroup });
const layerOverview = createLayerOverviewTool({ map, thematicGroups, rasterGroup });

// Bảng mục lục lớp theo kiểu ArcMap. Bảng này thay LayerSwitcher cũ.
const layerCatalog = createLayerCatalogTool({
  map,
  baseGroup,
  thematicGroups,
  rasterGroup,
  wfsGroup,
  layerConfigs,
  rasterLayerMap
});

// Các control này vẫn được phần cấu hình hiển thị sử dụng
const {
  scaleLineControl,
  overviewMapControl
} = basicTools;

// ================== TOOL NÂNG CAO ==================
const toolManager = createToolManager({
  map,
  layerConfigs,
  satelliteLayer,
  scaleLineControl,
  closeMenu,
  closeDisplayConfigPanel,
  popupTool
});
popupTool.setBeforeStart(toolManager.closeAllTools);

// ================== MENU TRÁI ==================
const menubtn = document.getElementById('menu-btn');
const closeMenuBtn = document.getElementById('close-menu');
const sideMenu = document.getElementById('side-menu');
const overlay = document.getElementById('overlay');

function openMenu() {
  sideMenu.inert = false;
  menubtn.setAttribute('aria-expanded', 'true');
  sideMenu.classList.add('active');
  overlay.classList.add('active');
  closeMenuBtn.focus();
}

function closeMenu() {
  const returnFocus = sideMenu.contains(document.activeElement);
  sideMenu.inert = true;
  menubtn.setAttribute('aria-expanded', 'false');
  if (returnFocus) menubtn.focus();
  sideMenu.classList.remove('active');
  overlay.classList.remove('active');
}

menubtn.addEventListener('click', openMenu);
closeMenuBtn.addEventListener('click', closeMenu);
overlay.addEventListener('click', closeMenu);
document.addEventListener('keydown', event => {
  if (!sideMenu.classList.contains('active')) return;
  if (event.key === 'Escape') closeMenu();
  if (event.key === 'Tab') {
    const items = [...sideMenu.querySelectorAll('button:not(:disabled)')].filter(item => item.getClientRects().length);
    const first = items[0];
    const last = items.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
});

// THU GỌN / MỞ RỘNG NHÓM MENU
document.querySelectorAll('.menu-group-title').forEach(function (title) {
  title.addEventListener('click', function () {
    const currentGroup = title.closest('.menu-group');

    document.querySelectorAll('.menu-group').forEach(function (group) {
      if (group !== currentGroup) {
        group.classList.remove('active');
        group.querySelector('.menu-group-title').setAttribute('aria-expanded', 'false');
      }
    });

    currentGroup.classList.toggle('active');
    title.setAttribute('aria-expanded', String(currentGroup.classList.contains('active')));
  });
});

// CHUYỂN NHANH DỊCH VỤ BẢN ĐỒ
// Vector hiển thị toàn bộ lớp vector, trừ Khung 25K. Hai chế độ raster chỉ
// hiện raster được chọn cùng Nền biển và Nước ngoài; Khung 25K luôn chỉ bật tay.
function setLayerService(service) {
  const showVector = service === 'vector';
  const rasterLayerId = service === 'satellite' ? 'vn25k' : 'dem_vietnam';
  const rasterBackgroundLayerIds = new Set(['nenbien', 'nuocngoai']);
  const manualOnlyLayerIds = new Set(['khung25k']);

  // Không dựa vào cả nhóm "Dữ liệu nền", vì nhóm này còn có Khung 25K.
  layerConfigs.forEach(function (config) {
    const isManualOnly = manualOnlyLayerIds.has(config.id);
    const isRasterBackground = rasterBackgroundLayerIds.has(config.id);
    config.wmsLayer.setVisible(!isManualOnly && (showVector || isRasterBackground));
  });
  thematicGroups.forEach(function (group) {
    // Nhóm background phải vẫn bật ở raster để Nền biển/Nước ngoài hiển thị.
    const isBackgroundGroup = group.get('tocGroupId') === 'background';
    group.setVisible(showVector || isBackgroundGroup);
  });

  // Khi xem raster, chỉ lớp raster được chọn được phép hiển thị; dữ liệu nền vẫn nằm trên nó.
  Object.entries(rasterLayerMap).forEach(function ([id, layer]) {
    layer.setVisible(!showVector && id === rasterLayerId);
  });
  if (rasterGroup) {
    rasterGroup.setVisible(!showVector);
  }

  document.querySelectorAll('[data-layer-service]').forEach(function (item) {
    item.classList.toggle('active', item.dataset.layerService === service);
  });
}

document.querySelectorAll('[data-layer-service]').forEach(function (item) {
  item.addEventListener('click', function () {
    toolManager.closeAllTools();
    setLayerService(item.dataset.layerService);
    closeMenu();
  });
});

//#endregion

//#region 5. TRÌNH QUẢN LÝ TÌM KIẾM, CRUD VÀ CLICK BẢN ĐỒ

const searchManager = createSearchManager({
  map,
  layerConfigs,
  closeMenu,
  showFeaturePopup: popupTool.showFeaturePopup,
  hideFeaturePopup: popupTool.hideFeaturePopup
});

const crudManager = createCrudManager({
  map,
  layerConfigs,
  closeMenu,
  beforeStart: toolManager.closeAllTools,
  cleanHighlight: popupTool.clearHighlight,
  onDataChanged: function () {
    searchManager.refresh();
  }
});

const dataTableTool = createDataTableTool({
  map, crudManager, rasterGroup,
  getRasterExtent: layerCatalog.getLayerExtent,
  beforeOpen: () => { crudManager.cancel(); toolManager.closeAllTools(); closeMenu(); }
});
document.querySelector('[data-menu-action="view-data"]').addEventListener('click', () => dataTableTool.open());
document.querySelectorAll('[data-tool-action], [data-raster-action]').forEach(button => {
  button.addEventListener('click', () => dataTableTool.close());
});

let initialRasterCatalogRestored = false;
const rasterManager = createRasterManager({
  rasterGroup,
  thematicGroups,
  onRasterStyleInvalidated: layerStyle.forget,
  beforeOpen: () => { crudManager.cancel(); toolManager.closeAllTools(); closeMenu(); },
  onRasterChanged: () => {
    Object.keys(rasterLayerMap).forEach(id => delete rasterLayerMap[id]);
    [...thematicGroups, rasterGroup].forEach(group => group.getLayers().forEach(layer => {
      if (layer.get('rasterName')) rasterLayerMap[layer.get('configId')] = layer;
    }));
    if (!initialRasterCatalogRestored) {
      initialRasterCatalogRestored = true;
      layerCatalog.restoreVisibility();
    } else layerCatalog.render();
    window.dispatchEvent(new CustomEvent('webgis-rasters-changed'));
  }
});
document.querySelectorAll('[data-raster-action]').forEach(button => {
  button.addEventListener('click', () => rasterManager.open(button.dataset.rasterAction));
});
document.querySelectorAll('[data-menu-action], [data-tool-action], [data-layer-service], [data-config-action]').forEach(button => {
  button.addEventListener('click', () => rasterManager.close());
});
// Khôi phục cả raster thêm mới và trạng thái xóa sau khi tải lại trang.
rasterManager.load().catch(error => console.warn('Không tải được danh sách raster:', error.message));

let auxiliaryTools = null;
let systemTools = null;
const positionSearch = createPositionSearchTool(map);
auxiliaryTools = initWorkspaceTools({ map });
systemTools = createSystemTools();
document.querySelectorAll('[data-section]').forEach(button => {
  button.addEventListener('click', () => {
    const action = button.dataset.section;
    if (action === 'position') positionSearch.open();
    else if (action === 'tool-search') auxiliaryTools.openToolSearch();
    else if (action === 'support') systemTools.openSupport();
    else return;
    closeMenu();
  });
});
// Đóng trạng thái cũ trước khi handler mở công cụ mới. Nút thao tác trong
// bảng không đi qua đây để không hủy bản nháp CRUD vừa được tạo từ một dòng.
document.addEventListener('webgis-tool-activate', event => {
  const name = event.detail?.name;
  if (name !== 'data-view' && event.detail?.preserveDataTool !== 'data-view') dataTableTool.close();
  if (name !== 'crud') crudManager.cancel();
  if (name !== 'raster') rasterManager.close();
  if (name !== 'presentation') layerStyle.close();
  if (name !== 'overview') layerOverview.close();
  toolManager.closeAllTools();
  auxiliaryTools?.closeAll?.(name);
  systemTools?.closeAll?.(name);
  if (name !== 'position') positionSearch.close();
});
document.addEventListener('click', event => {
  const button = event.target.closest('[data-menu-action], [data-raster-action], [data-tool-action], [data-config-action], [data-section]');
  if (!button) return;
  const action = button.dataset.menuAction;
  const section = button.dataset.section || '';
  const name = action === 'view-data' ? 'data-view'
    : ['add-data', 'edit-data', 'delete-data'].includes(action) ? 'crud'
    : button.dataset.rasterAction ? 'raster'
    : layerStyle.supports(section) ? 'presentation'
    : section.endsWith('-overview') ? 'overview'
    : section.endsWith('-identify') ? 'identify'
    : section || action || 'legacy-tool';
  document.dispatchEvent(new CustomEvent('webgis-tool-activate', { detail: { name } }));
}, true);

document.querySelectorAll('[data-section]').forEach(button => {
  button.addEventListener('click', () => {
    const section = button.dataset.section;
    if (!layerStyle.supports(section) && !section.endsWith('-overview') && !section.endsWith('-identify')) return;
    crudManager.cancel();
    rasterManager.close();
    dataTableTool.close();
    toolManager.closeAllTools();
    closeMenu();
    layerStyle.close();
    if (section.endsWith('-overview')) layerOverview.open(section.startsWith('vector') ? 'vector' : 'raster');
    else if (section.endsWith('-identify')) popupTool.open(section.startsWith('raster') ? 'raster' : 'vector');
    else layerStyle.open(section);
  });
});
document.querySelectorAll('[data-menu-action], [data-raster-action], [data-tool-action], [data-config-action]').forEach(button => {
  button.addEventListener('click', () => layerStyle.close());
});

popupTool.setBeforeStart(() => {
  document.dispatchEvent(new CustomEvent('webgis-tool-activate', { detail: { name: 'identify' } }));
  crudManager.cancel();
  dataTableTool.close();
  rasterManager.close();
  layerStyle.close();
  toolManager.closeAllTools();
});

map.on('singleclick', function (event) {
  if (crudManager.handleMapClick(event)) return;
  if (dataTableTool.handleMapClick(event)) return;
  popupTool.handleMapClick(event);
});

//#endregion

//#region 6. CẤU HÌNH HIỂN THỊ
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
// Danh sách nhóm dùng cho chức năng cấu hình hiển thị.
const displayGroupConfigs = LAYER_GROUP_CONFIGS.map(function (cfg) {
  return {
    id: cfg.id,
    title: cfg.title,
    group: groupMap[cfg.id]
  };
});

// ================== LẤY DANH SÁCH LỚP CÓ THỂ CẤU HÌNH ==================
function getDisplayLayerItems() {
  const items = [];
  layerConfigs.forEach(function (config) {
    items.push({
      key: 'wms:' + config.id,
      id: config.id,
      type: 'Dữ liệu',
      title: config.title,
      layer: config.wmsLayer
    });
  });
  rasterGroup.getLayers().forEach(function (layer) {
    const id = layer.get('configId');
    items.push({
      key: 'raster:' + id,
      id,
      type: 'Raster',
      title: layer.get('title'),
      layer
    });
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
  // Tắt các tool nâng cao đang hoạt động
  if (toolManager) {
    toolManager.closeAllTools();
  }

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
applySavedLayerDisplayConfig(); // Áp dụng cấu hình lớp.
applySavedMapControlConfig(); // Áp dụng cấu hình bản đồ.
//#endregion

// Phản hồi ngắn sau khi lưu để người dùng tiếp tục thao tác trên bản đồ.
let toastTimer;
window.addEventListener('webgis-data-saved', event => {
  const toast = document.getElementById('workspace-toast');
  const labels = { add: 'Đã thêm đối tượng', edit: 'Đã lưu thay đổi', delete: 'Đã xóa đối tượng' };
  toast.textContent = `${labels[event.detail.action]} · ${event.detail.layerTitle}`;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 4500);
});

// Một cột cuộn chung giúp các icon luôn ở dưới header và không chồng lên nhau.
const primaryControls = document.getElementById('primary-map-controls');
primaryControls.append(document.querySelector('.layer-catalog-button'));
map.getControls().forEach(control => {
  if (control.element.matches('.ol-zoom, .ol-full-screen, .ol-zoom-extent, .ol-locate, .popup-info-control, .ol-rotate')) {
    primaryControls.append(control.element);
  }
});
initTooltips();
