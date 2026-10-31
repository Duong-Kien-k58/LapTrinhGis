// Quy trình chung: tải raster, chọn vùng, tác vụ và hiển thị bản đồ 2D/3D.
// Nội dung riêng của mỗi chức năng nằm trong slopeTool.js và aspectTool.js.
import { slopeTool } from './slopeTool.js';
import { aspectTool } from './aspectTool.js';
import { createToolPanel } from './toolUtils.js';
import { requestJson } from './apiClient.js';
import Draw from 'ol/interaction/Draw.js';
import DoubleClickZoom from 'ol/interaction/DoubleClickZoom.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import Feature from 'ol/Feature.js';
import Polygon, { fromExtent } from 'ol/geom/Polygon.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import { Fill, Stroke, Style } from 'ol/style.js';
import { get as getProjection, transform, transformExtent } from 'ol/proj.js';
import { getArea } from 'ol/sphere.js';
import proj4 from 'proj4';
import { register } from 'ol/proj/proj4.js';
import { getCesiumScene, getOLCesium, is3DEnabled, pickTerrain } from './cesiumTool.js';
import * as Cesium from 'cesium';
import ImageLayer from 'ol/layer/Image.js';
import ImageStatic from 'ol/source/ImageStatic.js';
import { GEOSERVER_CONFIG } from '../config/layers.js';

const ANALYSIS_TOOLS = { slope: slopeTool, aspect: aspectTool };

// The preview pixels are Web Mercator, so a geographic single-image provider
// would stretch their latitude positions. Keep the native projection in 3D.
export function createSlopeImageryProvider(image, extent) {
  if (!image.width || !image.height || !Array.isArray(extent) || extent.length !== 4 ||
      !extent.every(Number.isFinite) || extent[0] >= extent[2] || extent[1] >= extent[3]) {
    throw new Error('Ảnh kết quả hoặc phạm vi không hợp lệ.');
  }
  const tilingScheme = new Cesium.WebMercatorTilingScheme({
    rectangleSouthwestInMeters: new Cesium.Cartesian2(extent[0], extent[1]),
    rectangleNortheastInMeters: new Cesium.Cartesian2(extent[2], extent[3]),
    numberOfLevelZeroTilesX: 1, numberOfLevelZeroTilesY: 1,
  });
  return {
    tilingScheme, rectangle: tilingScheme.rectangle, tileWidth: image.width, tileHeight: image.height,
    minimumLevel: 0, maximumLevel: 0, hasAlphaChannel: true, errorEvent: new Cesium.Event(),
    tileDiscardPolicy: undefined, credit: undefined, proxy: undefined,
    requestImage: () => Promise.resolve(image), getTileCredits: () => undefined, pickFeatures: () => undefined,
  };
}

// Kiểm tra hình học và ước tính khối lượng từ lưới raster, chưa đọc giá trị pixel.
export function inspectSlopeRegion(ring, metadata) {
  if (!Array.isArray(ring) || ring.length < 4 || ring.some(point => !Array.isArray(point) || point.length < 2 || !point.slice(0, 2).every(Number.isFinite))) {
    throw new Error('Vùng phân tích cần ít nhất 3 đỉnh hợp lệ.');
  }
  const points = ring.map(point => point.slice(0, 2));
  if (points[0][0] === points.at(-1)[0] && points[0][1] === points.at(-1)[1]) points.pop();
  if (new Set(points.map(point => point.join(','))).size !== points.length || points.length < 3) throw new Error('Vùng có đỉnh trùng nhau. Hãy vẽ lại.');
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const onSegment = (a, b, c) => cross(a, b, c) === 0 && c[0] >= Math.min(a[0], b[0]) && c[0] <= Math.max(a[0], b[0]) && c[1] >= Math.min(a[1], b[1]) && c[1] <= Math.max(a[1], b[1]);
  for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
    if (j === i + 1 || i === 0 && j === points.length - 1) continue;
    const a = points[i], b = points[(i + 1) % points.length], c = points[j], d = points[(j + 1) % points.length];
    if (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0 || onSegment(a, b, c) || onSegment(a, b, d) || onSegment(c, d, a) || onSegment(c, d, b)) {
      throw new Error('Vùng bị tự cắt. Hãy vẽ một đa giác không giao nhau.');
    }
  }
  const bbox = metadata.bbox;
  if (!Array.isArray(bbox) || bbox.length !== 4 || !bbox.every(Number.isFinite) || !(bbox[2] > bbox[0] && bbox[3] > bbox[1]) || !(metadata.width > 0 && metadata.height > 0)) {
    throw new Error('raster chưa có thông tin lưới và phạm vi hợp lệ.');
  }
  let clipped = points;
  for (const [axis, boundary, sign] of [[0, bbox[0], 1], [0, bbox[2], -1], [1, bbox[1], 1], [1, bbox[3], -1]]) {
    const result = [];
    for (let i = 0; i < clipped.length; i++) {
      const a = clipped[(i + clipped.length - 1) % clipped.length], b = clipped[i];
      const insideA = sign * (a[axis] - boundary) >= 0, insideB = sign * (b[axis] - boundary) >= 0;
      if (insideA !== insideB) {
        const t = (boundary - a[axis]) / (b[axis] - a[axis]);
        result.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
      }
      if (insideB) result.push(b);
    }
    clipped = result;
  }
  // Dịch gốc trước khi tính diện tích để giảm mất chính xác với tọa độ UTM lớn.
  const area = vertices => {
    if (vertices.length < 3) return 0;
    const origin = vertices[0];
    return Math.abs(vertices.reduce((sum, a, i) => {
      const b = vertices[(i + 1) % vertices.length];
      return sum + (a[0] - origin[0]) * (b[1] - origin[1]) - (b[0] - origin[0]) * (a[1] - origin[1]);
    }, 0)) / 2;
  };
  const inputArea = area(points), clippedArea = area(clipped);
  if (!inputArea) throw new Error('Vùng phân tích không có diện tích.');
  if (!clippedArea) throw new Error('Vùng chọn không giao với phạm vi raster.');
  const dx = (bbox[2] - bbox[0]) / metadata.width, dy = (bbox[3] - bbox[1]) / metadata.height;
  const xs = clipped.map(p => p[0]), ys = clipped.map(p => p[1]);
  const columnStart = Math.max(0, Math.floor((Math.min(...xs) - bbox[0]) / dx));
  const columnEnd = Math.min(metadata.width, Math.ceil((Math.max(...xs) - bbox[0]) / dx));
  const rowStart = Math.max(0, Math.floor((Math.min(...ys) - bbox[1]) / dy));
  const rowEnd = Math.min(metadata.height, Math.ceil((Math.max(...ys) - bbox[1]) / dy));
  return { clippedRing: [...clipped, clipped[0]], cells: Math.ceil(clippedArea / (dx * dy)),
    windowCells: (columnEnd - columnStart) * (rowEnd - rowStart), partial: clippedArea < inputArea * (1 - 1e-9) };
}

// raster tạm chỉ phục vụ phân tích; không tự xuất bản lên GeoServer.
export function createTerrainAnalysisTool({ map }) {
  let analysisType = 'slope';
  const analysisDefinition = () => ANALYSIS_TOOLS[analysisType];
  const analysisLabel = () => analysisDefinition().label;
  const rasterGridCache = new Map();
  let rasterGridVersion = 0;
  let rasterGridLoading = false;
  let rasterGridError = '';
  // Chỉ main.js khởi tạo công cụ dùng chung.
  function getDemLayers() {
    const dems = new Map();
    const collect = layer => {
      if (layer.getLayers) layer.getLayers().forEach(collect);
      const raw = layer.get('rasterMetadata');
      const metadata = raw ? { ...raw.technical_metadata, ...raw } : null;
      if (metadata?.name && !metadata.is_deleted && layer.get('rasterName')) {
        dems.set(metadata.name, { name: metadata.name, title: layer.get('title') || metadata.title || metadata.name,
          metadata: { ...metadata, ...rasterGridCache.get(metadata.name) } });
      }
    };
    map.getLayers().forEach(collect);
    return [...dems.values()];
  }
  const panel = createToolPanel({
    id: 'terrain-analysis-panel',
    title: `Phân tích ${analysisLabel()}`,
    content: `
      <div class="terrain-source-options" role="group" aria-label="Nguồn raster">
        <button type="button" data-dem-source="server" aria-pressed="true">
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="7" rx="2"/><rect x="3" y="14" width="18" height="7" rx="2"/><path d="M7 6.5h.01M7 17.5h.01M12 6.5h5M12 17.5h5"/></svg>
          <span>Lớp có sẵn</span>
        </button>
        <button type="button" data-dem-source="file" aria-pressed="false">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8ZM14 2v6h6M12 18v-7m-3 3 3-3 3 3"/></svg>
          <span>Tệp GeoTIFF</span>
        </button>
      </div>
      <div data-dem-server>
        <label for="terrain-dem-layer">Lớp raster<select id="terrain-dem-layer"></select></label>
        <label data-server-unit-row hidden>Đơn vị cao độ<select data-server-unit><option value="m">Mét (m)</option><option value="ft">Feet (ft)</option></select></label>
      </div>
      <div data-dem-file hidden>
        <label for="terrain-dem-file">Raster đầu vào<input id="terrain-dem-file" type="file" accept=".tif,.tiff"></label>
        <p class="tool-hint" data-upload-limit></p>
        <dl class="dem-file-metadata" data-file-metadata hidden></dl>
        <div class="dem-upload-options" data-upload-options hidden>
          <input data-dem-type type="hidden" value="raster">
          <label data-band-row hidden>Band cao độ<select data-dem-band></select></label>
          <label>Đơn vị cao độ<select data-dem-unit><option value="m">Mét (m)</option><option value="ft">Feet (ft)</option></select></label>
          <label data-crs-row hidden>Mã EPSG của tệp<input data-dem-epsg type="number" min="1" max="1000000" placeholder="Ví dụ: 32648"></label>
          <input data-confirm-elevation type="checkbox" checked hidden>
          <div class="dem-upload-progress" hidden><progress max="100" value="0" aria-label="Tiến trình tải raster"></progress><span></span></div>
          <div class="dem-upload-actions"><button type="button" data-upload-dem disabled>Tải lên và kiểm tra</button><button type="button" class="secondary" data-cancel-dem hidden>Hủy</button></div>
        </div>
      </div>
      <p class="terrain-dem-selection" role="status" aria-live="polite"></p>
      <fieldset class="slope-region" data-slope-region disabled>
        <legend>Phạm vi phân tích</legend>
        <label class="slope-region-option"><input type="radio" name="slope-region-mode" value="data" checked>Theo ranh giới lớp</label>
        <label class="slope-region-option"><input type="radio" name="slope-region-mode" value="polygon">Theo vùng cắt</label>
        <div class="dem-upload-actions"><button type="button" class="secondary" data-region-zoom>Đến lớp</button><button type="button" data-region-draw hidden>Vẽ vùng cắt</button></div>
        <div class="dem-upload-actions" data-drawing-actions hidden><button type="button" data-region-finish>Hoàn tất</button><button type="button" class="secondary" data-region-undo>Bỏ đỉnh cuối</button><button type="button" class="secondary" data-region-cancel>Hủy vẽ</button></div>
        <p class="tool-hint" data-region-status role="status" aria-live="polite"></p>
        <dl class="dem-file-metadata" data-region-summary hidden></dl>
        <label data-analysis-unit-row><span data-analysis-unit-label>Đơn vị ${analysisLabel()}</span><select data-slope-unit>${analysisDefinition().units.map(unit => `<option value="${unit.value}">${unit.label}</option>`).join('')}</select></label>
      </fieldset>
      <div class="terrain-analysis-footer">
        <p id="terrain-analysis-note" class="tool-hint" hidden>${analysisDefinition().note}</p>
        <button type="button" data-run-slope disabled aria-describedby="terrain-analysis-note">Phân tích</button>
        <div data-slope-progress hidden><progress max="100" value="0" aria-label="Tiến trình tính ${analysisLabel()}"></progress><p role="status" aria-live="polite" data-slope-status></p><button type="button" class="secondary" data-cancel-slope>Hủy phân tích</button></div>
      </div>
      <section data-slope-result hidden aria-label="Kết quả ${analysisLabel()}">
        <div class="terrain-analysis-heading"><strong data-analysis-result-heading>Kết quả ${analysisLabel()}</strong></div>
        <p class="tool-hint" data-result-title></p>
        <dl class="dem-file-metadata" data-result-summary></dl>
        <div data-slope-legend></div>
        <p class="tool-hint" data-result-note></p>
        <div class="dem-upload-actions"><button type="button" data-show-slope>Xem kết quả</button><a data-slope-download>GeoTIFF</a><a data-slope-report>Thống kê TXT</a></div>
        <button type="button" class="secondary" data-hide-slope>Ẩn lớp kết quả</button>
      </section>
      <div class="terrain-stop-bar">
        <button type="button" class="secondary" data-stop-analysis>Kết thúc phân tích</button>
      </div>
      <style>
        #terrain-analysis-panel.shown { display:flex; flex-direction:column; overflow:hidden; }
        #terrain-analysis-panel .tool-panel-header { flex-shrink:0; }
        #terrain-analysis-panel .terrain-source-options button { min-height:44px; padding:8px 10px; }
        #terrain-analysis-panel .terrain-source-options svg { width:18px; height:18px; }
        #terrain-analysis-panel .tool-panel-body { min-height:0; overflow:auto; }
        #terrain-analysis-panel .terrain-stop-bar { flex-shrink:0; padding:12px 16px; border-top:1px solid #ffffff14; background:#1c3440; }
        #terrain-analysis-panel [data-stop-analysis] { width:100%; color:#ffb0b8; border-color:#925568; }
        #terrain-analysis-panel .slope-region { display:grid; gap:10px; min-width:0; margin:0; padding:16px 0 0; border:0; border-top:1px solid #ffffff14; }
        #terrain-analysis-panel .slope-region legend { padding:0 0 10px; }
        #terrain-analysis-panel .slope-region:disabled { opacity:.5; }
        #terrain-analysis-panel .slope-region-option { display:flex; align-items:center; gap:8px; }
        #terrain-analysis-panel .slope-region-option input { flex:0 0 15px; width:15px; min-height:15px; margin:0; accent-color:#7bdbca; }
        #terrain-analysis-panel [data-region-status].error { color:#ffb0b8; }
        #terrain-analysis-panel [data-region-summary] { margin:0; }
        #terrain-analysis-panel [data-slope-result] { display:grid; gap:10px; border-top:1px solid #ffffff14; padding-top:16px; }
        #terrain-analysis-panel [data-slope-result][hidden], #terrain-analysis-panel [data-slope-progress][hidden] { display:none; }
        #terrain-analysis-panel [data-server-unit-row][hidden] { display:none; }
        #terrain-analysis-panel [data-slope-legend] > div { display:flex; align-items:center; gap:8px; padding:4px 0; font-size:12px; }
        #terrain-analysis-panel [data-slope-legend] i { width:15px; height:15px; border-radius:3px; flex:none; }
        #terrain-analysis-panel [data-slope-legend] span:last-child { margin-left:auto; }
        #terrain-analysis-panel [data-slope-progress] progress { width:100%; margin-top:12px; accent-color:#7bdbca; }
        #terrain-analysis-panel .dem-upload-actions a { color:#7bdbca; font-size:12px; padding:8px 4px; }
      </style>`,
  });
  // Keep the exit action visible while the form and results scroll.
  panel.append(panel.querySelector('.terrain-stop-bar'));
  const select = panel.querySelector('#terrain-dem-layer');
  const fileInput = panel.querySelector('#terrain-dem-file');
  const selection = panel.querySelector('.terrain-dem-selection');
  const info = panel.querySelector('[data-file-metadata]');
  const options = panel.querySelector('[data-upload-options]');
  const uploadButton = panel.querySelector('[data-upload-dem]');
  const cancelButton = panel.querySelector('[data-cancel-dem]');
  const bandSelect = panel.querySelector('[data-dem-band]');
  const unitSelect = panel.querySelector('[data-dem-unit]');
  const epsgInput = panel.querySelector('[data-dem-epsg]');
  const confirmation = panel.querySelector('[data-confirm-elevation]');
  const progressBox = panel.querySelector('.dem-upload-progress');
  const progress = progressBox.querySelector('progress');
  const progressLabel = progressBox.querySelector('span');
  let limits = null;
  let preview = null;
  let upload = null;
  let busy = false;
  let controller = null;
  let fileVersion = 0;
  let fileMessage = 'Chưa chọn tệp raster.';
  let fileError = false;
  let source = 'server';
  let demChoices = [];
  let regionMode = 'data';
  let inputKey = '';
  let dataFootprint = null;
  let drawnGeometry = null;
  let drawing = null;
  let sketch = null;
  let drawingCursor = '';
  let doubleClickStates = [];
  let zoomRestoreTimer = null;
  let pendingZoomRestore = null;
  let slopeBusy = false;
  let slopeRunStopped = false;
  let pendingSlopeCreation = null;
  let slopeJob = null;
  let resultJob = null;
  let resultLayer = null;
  let region3D = null;
  let result3D = null;
  let result3DJob = null;
  let loading3DJob = null;
  let result3DVersion = 0;
  let resultRequestKey = '';
  const runSlopeButton = panel.querySelector('[data-run-slope]');
  const slopeProgress = panel.querySelector('[data-slope-progress]');
  const slopeStatus = panel.querySelector('[data-slope-status]');
  const resultBox = panel.querySelector('[data-slope-result]');
  const regionBox = panel.querySelector('[data-slope-region]');
  const regionStatus = panel.querySelector('[data-region-status]');
  const regionSummary = panel.querySelector('[data-region-summary]');
  const drawButton = panel.querySelector('[data-region-draw]');
  const regionSource = new VectorSource();
  const regionLayer = new VectorLayer({ source: regionSource, visible: false, zIndex: 9999, style: feature => new Style({
    stroke: new Stroke({ color: feature.get('invalid') ? '#fb7185' : '#7bdbca', width: 2, lineDash: feature.get('boundary') ? [7, 5] : undefined }),
    fill: new Fill({ color: feature.get('boundary') ? 'rgba(0,0,0,0)' : 'rgba(45,212,191,.12)' }),
  }) });
  regionLayer.set('olcs_skip', true);
  map.addLayer(regionLayer);

  function syncRegion3D() {
    const bridge = getOLCesium(), scene = getCesiumScene();
    if (!bridge || !scene || !is3DEnabled()) return;
    if (!region3D) {
      region3D = new Cesium.CustomDataSource('Vùng phân tích địa hình');
      bridge.getDataSources().add(region3D);
    }
    region3D.show = regionLayer.getVisible();
    region3D.entities.removeAll();
    for (const feature of regionSource.getFeatures()) {
      const geometry = feature.getGeometry();
      if (!geometry) continue;
      const object = new GeoJSON().writeGeometryObject(geometry, {
        featureProjection: map.getView().getProjection(), dataProjection: 'EPSG:4326',
      });
      const polygons = object.type === 'MultiPolygon' ? object.coordinates : [object.coordinates];
      const color = Cesium.Color.fromCssColorString(feature.get('invalid') ? '#fb7185' : '#7bdbca');
      for (const rings of polygons) {
        const ring = rings[0];
        const positions = Cesium.Cartesian3.fromDegreesArray(ring.flatMap(point => point.slice(0, 2)));
        for (const boundary of rings) {
          const outline = Cesium.Cartesian3.fromDegreesArray(boundary.flatMap(point => point.slice(0, 2)));
          if (outline.length >= 2) region3D.entities.add({
            polyline: { positions: outline, width: 2, clampToGround: true, material: color },
          });
        }
        if (!feature.get('boundary') && positions.length >= 4) region3D.entities.add({
          polygon: { hierarchy: new Cesium.PolygonHierarchy(positions.slice(0, -1), rings.slice(1).map(hole =>
            new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray(hole.slice(0, -1).flatMap(point => point.slice(0, 2)))))),
            material: color.withAlpha(.12), height: 0, heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            classificationType: Cesium.ClassificationType.TERRAIN },
        });
        if (feature.get('draft')) positions.slice(0, -1).forEach(position => region3D.entities.add({
          position, point: { pixelSize: 7, color, outlineColor: Cesium.Color.WHITE, outlineWidth: 1,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY },
        }));
      }
    }
    scene.requestRender();
  }
  regionSource.on(['addfeature', 'changefeature', 'removefeature', 'clear'], syncRegion3D);
  regionLayer.on('change:visible', () => {
    if (region3D) region3D.show = regionLayer.getVisible();
    syncRegion3D();
  });

  function syncResult3D() {
    const scene = getCesiumScene();
    if (!scene) return;
    if (result3D) result3D.show = Boolean(resultLayer?.getVisible());
    if (!is3DEnabled() || !resultJob || !resultLayer?.getVisible() ||
        result3DJob === resultJob.id || loading3DJob === resultJob.id) {
      scene.requestRender();
      return;
    }
    const job = resultJob, version = ++result3DVersion;
    loading3DJob = job.id;
    const image = new Image();
    image.crossOrigin = 'use-credentials';
    image.onload = () => {
      if (version !== result3DVersion) return;
      loading3DJob = null;
      if (result3D) scene.imageryLayers.remove(result3D, true);
      result3D = scene.imageryLayers.addImageryProvider(createSlopeImageryProvider(image, job.result.preview_extent));
      result3D.alpha = .8;
      result3D.minificationFilter = Cesium.TextureMinificationFilter.NEAREST;
      result3D.magnificationFilter = Cesium.TextureMagnificationFilter.NEAREST;
      result3D.show = Boolean(resultLayer?.getVisible());
      result3DJob = job.id;
      scene.imageryLayers.raiseToTop(result3D);
      scene.requestRender();
    };
    image.onerror = () => {
      if (version !== result3DVersion) return;
      loading3DJob = null;
      slopeProgress.hidden = false;
      slopeStatus.textContent = `Không tải được ảnh ${analysisLabel()} 3D. Bấm Xem kết quả để thử lại.`;
    };
    image.src = slopeUrl(job.files.preview);
  }

  function fitAnalysisExtent(extent, projection) {
    if (is3DEnabled()) {
      const scene = getCesiumScene();
      const bounds = transformExtent(extent, projection, 'EPSG:4326', 16);
      scene.camera.flyTo({ destination: Cesium.Rectangle.fromDegrees(...bounds), duration: .6 });
      scene.requestRender();
    } else {
      const right = map.getSize()[0] > 700 ? panel.getBoundingClientRect().width + 80 : 30;
      map.getView().fit(transformExtent(extent, projection, map.getView().getProjection(), 16), {
        padding: [40, right, 40, 30], duration: 400, maxZoom: 18,
      });
    }
  }

  function activeDem() {
    if (source === 'file') return upload?.status === 'ready' && upload.expires_at * 1000 > Date.now()
      ? { source: 'upload', id: upload.id, metadata: upload.metadata } : null;
    const chosen = demChoices.find(item => item.name === select.value);
    return chosen ? { source: 'geoserver', name: chosen.name, metadata: chosen.metadata } : null;
  }

  function stopDrawing(deferZoom = false) {
    if (zoomRestoreTimer !== null) {
      clearTimeout(zoomRestoreTimer);
      pendingZoomRestore?.();
      zoomRestoreTimer = null;
      pendingZoomRestore = null;
    }
    if (drawing) {
      if (drawing.cesium) drawing.destroy();
      else map.removeInteraction(drawing);
      drawing = null;
      map.getTargetElement().style.cursor = drawingCursor;
    }
    sketch = null;
    const restore = doubleClickStates;
    doubleClickStates = [];
    const restoreZoom = () => { if (!drawing) restore.forEach(([interaction, active]) => interaction.setActive(active)); };
    if (deferZoom) {
      pendingZoomRestore = restoreZoom;
      zoomRestoreTimer = setTimeout(() => { restoreZoom(); zoomRestoreTimer = null; pendingZoomRestore = null; }, 200);
    }
    else restoreZoom();
    panel.querySelector('[data-drawing-actions]').hidden = true;
  }

  function updateRegion() {
    runSlopeButton.disabled = true;
    runSlopeButton.textContent = 'Phân tích';
    const input = activeDem();
    const metadata = input?.metadata;
    panel.querySelector('[data-server-unit-row]').hidden = source !== 'server' || !input || ['m', 'ft'].includes(metadata.elevation_unit);
    panel.querySelector('[data-server-unit]').disabled = busy || slopeBusy;
    const key = input ? JSON.stringify([input.source, input.id || input.name, metadata.bbox, metadata.width, metadata.height]) : '';
    if (key !== inputKey) {
      stopDrawing();
      inputKey = key;
      drawnGeometry = null;
      dataFootprint = null;
    }
    regionBox.disabled = !input || busy || slopeBusy;
    regionSummary.hidden = true;
    regionStatus.classList.remove('error');
    panel.slopeRequest = null;
    if (resultJob) panel.querySelector('[data-result-title]').textContent = `${resultJob.title} · Kết quả lần chạy trước`;
    drawButton.hidden = regionMode !== 'polygon';
    drawButton.disabled = false;
    drawButton.textContent = drawnGeometry ? 'Vẽ lại vùng cắt' : 'Vẽ vùng cắt';
    if (drawing) return;
    regionSource.clear();
    if (source === 'server' && (rasterGridLoading || rasterGridError)) {
      regionBox.disabled = true;
      regionStatus.textContent = rasterGridLoading ? 'Đang đọc phạm vi raster…' : rasterGridError;
      regionStatus.classList.toggle('error', Boolean(rasterGridError));
      return;
    }
    if (!input) {
      regionStatus.textContent = '';
      return;
    }
    try {
      if (!getProjection(metadata.crs) && metadata.crs_wkt) { proj4.defs(metadata.crs, metadata.crs_wkt); register(proj4); }
      if (!getProjection(metadata.crs)) throw new Error('Chưa đọc được hệ tọa độ raster. Chọn lại lớp để thử lại.');
      if (!Array.isArray(metadata.bbox) || metadata.bbox.length !== 4 || !metadata.bbox.every(Number.isFinite)) throw new Error('Raster chưa có thông tin phạm vi. Chọn lại lớp để thử lại.');
      const boundary = fromExtent(metadata.bbox).transform(metadata.crs, map.getView().getProjection());
      const boundaryFeature = new Feature(boundary);
      boundaryFeature.set('boundary', regionMode !== 'full');
      regionSource.addFeature(boundaryFeature);
      if (regionMode === 'data') {
        const dem = input.source === 'upload' ? { source: 'upload', id: input.id }
          : { source: 'geoserver', name: input.name, elevation_unit: metadata.elevation_unit || panel.querySelector('[data-server-unit]').value };
        if (dataFootprint && (dataFootprint.expires_at * 1000 <= Date.now() || JSON.stringify(dataFootprint.dem) !== JSON.stringify(dem))) dataFootprint = null;
        panel.slopeRequest = { dem, region: { mode: 'data' }, method: 'Horn', unit: panel.querySelector('[data-slope-unit]').value, operation: analysisType };
        if (!dataFootprint) {
          panel.slopeRequest.operation = 'footprint';
          runSlopeButton.textContent = 'Xác định phạm vi';
          regionStatus.textContent = 'Xác định phạm vi trước khi phân tích.';
        } else {
          const geometry = new GeoJSON().readGeometry(dataFootprint.result.geometry, {
            dataProjection: 'EPSG:4326', featureProjection: map.getView().getProjection(),
          });
          regionSource.clear();
          regionSource.addFeature(new Feature(geometry));
          panel.slopeRequest.region.footprint_id = dataFootprint.id;
          regionSummary.replaceChildren();
          for (const [label, value] of [
            ['Diện tích có dữ liệu', `${(dataFootprint.result.area_m2 / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} km²`],
            ['Số ô có dữ liệu', dataFootprint.result.valid_cells.toLocaleString('vi-VN')],
          ]) {
            const row = document.createElement('div'), term = document.createElement('dt'), definition = document.createElement('dd');
            term.textContent = label; definition.textContent = value; row.append(term, definition); regionSummary.append(row);
          }
          regionSummary.hidden = false;
          regionStatus.textContent = 'Phạm vi đã sẵn sàng.';
        }
        if (resultJob) panel.querySelector('[data-result-title]').textContent = `${resultJob.title} · ${resultRequestKey === JSON.stringify(panel.slopeRequest) ? 'Kết quả của lựa chọn hiện tại' : 'Kết quả lần chạy trước'}`;
        runSlopeButton.disabled = busy || slopeBusy;
        return;
      }
      if (regionMode === 'polygon' && !drawnGeometry) {
        regionStatus.textContent = 'Vẽ vùng cắt với ít nhất 3 đỉnh.';
        return;
      }
      const geometry = regionMode === 'full' ? fromExtent(metadata.bbox) : drawnGeometry.clone().transform(map.getView().getProjection(), metadata.crs);
      const result = inspectSlopeRegion(geometry.getCoordinates()[0], metadata);
      if (regionMode === 'polygon') regionSource.addFeature(new Feature(drawnGeometry.clone()));
      const area = getArea(new Polygon([result.clippedRing]), { projection: metadata.crs });
      regionSummary.replaceChildren();
      for (const [label, value] of [
        ['Diện tích giao (ước tính)', area >= 1e6 ? `${(area / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} km²` : `${area.toLocaleString('vi-VN', { maximumFractionDigits: 0 })} m²`],
        ['Số ô trong vùng (ước tính)', result.cells.toLocaleString('vi-VN')],
      ]) {
        const row = document.createElement('div'), term = document.createElement('dt'), definition = document.createElement('dd');
        term.textContent = label; definition.textContent = value; row.append(term, definition); regionSummary.append(row);
      }
      regionSummary.hidden = false;
      regionStatus.textContent = result.partial ? 'Chỉ phân tích phần giao với raster.' : 'Vùng cắt đã sẵn sàng.';
      panel.slopeRequest = { dem: input.source === 'upload' ? { source: 'upload', id: input.id } : { source: 'geoserver', name: input.name, elevation_unit: metadata.elevation_unit || panel.querySelector('[data-server-unit]').value },
        region: regionMode === 'full' ? { mode: 'full' } : { mode: 'polygon', geometry: new GeoJSON().writeGeometryObject(geometry, { featureProjection: metadata.crs, dataProjection: 'EPSG:4326' }), crs: 'EPSG:4326' },
        unit: panel.querySelector('[data-slope-unit]').value, method: 'Horn', operation: analysisType };
      runSlopeButton.disabled = busy || slopeBusy;
      if (resultJob) panel.querySelector('[data-result-title]').textContent = `${resultJob.title} · ${resultRequestKey === JSON.stringify(panel.slopeRequest) ? 'Kết quả của lựa chọn hiện tại' : 'Kết quả lần chạy trước'}`;
    } catch (error) {
      drawButton.disabled = true;
      regionStatus.textContent = error.message;
      regionStatus.classList.add('error');
      if (drawnGeometry) { const invalid = new Feature(drawnGeometry.clone()); invalid.set('invalid', true); regionSource.addFeature(invalid); }
    }
  }

  function showAnalysis() {
    document.dispatchEvent(new CustomEvent('webgis-tool-activate', { detail: { name: `terrain-${analysisType}` } }));
    panel.classList.add('shown');
    regionLayer.setVisible(true);
    syncRegion3D();
  }

  function finishRegion() {
    if (drawing?.cesium) { drawing.finishDrawing(); return; }
    const ring = sketch?.getGeometry().getCoordinates()[0] || [];
    if (new Set(ring.slice(0, -1).map(point => point.join(','))).size < 3) {
      regionStatus.textContent = 'Cần ít nhất 3 đỉnh để hoàn tất vùng.';
      return;
    }
    drawing?.finishDrawing();
  }

  function startDrawing3D() {
    const scene = getCesiumScene();
    const points = [];
    const draft = new Feature();
    draft.set('draft', true);
    regionSource.addFeature(draft);
    const handler = new Cesium.ScreenSpaceEventHandler(scene.canvas);
    const cursor = scene.canvas.style.cursor;
    scene.canvas.style.cursor = 'crosshair';
    scene.camera.cancelFlight();
    scene.canvas.focus({ preventScroll: true });
    function redraw(hover) {
      const coordinates = [...points, ...(hover ? [hover] : [])].map(point =>
        transform(point, 'EPSG:4326', map.getView().getProjection()));
      draft.setGeometry(coordinates.length ? new Polygon([[...coordinates, coordinates[0]]]) : undefined);
      regionStatus.textContent = `Đã chọn ${points.length} đỉnh · Chuột phải / Enter / Hoàn tất để kết thúc · Backspace để bỏ đỉnh cuối.`;
    }
    drawing = {
      cesium: true,
      destroy() { handler.destroy(); regionSource.removeFeature(draft); scene.canvas.style.cursor = cursor; scene.requestRender(); },
      removeLastPoint() { points.pop(); redraw(); },
      finishDrawing() {
        if (points.length < 3) { regionStatus.textContent = 'Cần ít nhất 3 đỉnh để hoàn tất vùng.'; return; }
        const coordinates = points.map(point => transform(point, 'EPSG:4326', map.getView().getProjection()));
        drawnGeometry = new Polygon([[...coordinates, coordinates[0]]]);
        stopDrawing();
        updateRegion();
      },
    };
    handler.setInputAction(event => {
      const position = pickTerrain(scene, event.position);
      if (!position) { regionStatus.textContent = 'Nhấp lên bề mặt địa hình để chọn đỉnh.'; return; }
      const point = Cesium.Cartographic.fromCartesian(position);
      const coordinates = [Cesium.Math.toDegrees(point.longitude), Cesium.Math.toDegrees(point.latitude)];
      if (points.length && coordinates.every((value, index) => Math.abs(value - points.at(-1)[index]) < 1e-10)) return;
      if (points.length >= 1000) { regionStatus.textContent = 'Tối đa 1000 đỉnh. Hãy hoàn tất vùng.'; return; }
      points.push(coordinates);
      redraw();
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    handler.setInputAction(event => {
      if (!points.length) return;
      const position = pickTerrain(scene, event.endPosition);
      const point = position ? Cesium.Cartographic.fromCartesian(position) : null;
      redraw(point ? [Cesium.Math.toDegrees(point.longitude), Cesium.Math.toDegrees(point.latitude)] : null);
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
    handler.setInputAction(finishRegion, Cesium.ScreenSpaceEventType.RIGHT_CLICK);
    panel.querySelector('[data-drawing-actions]').hidden = false;
    regionStatus.classList.remove('error');
    regionStatus.textContent = 'Nhấp trên địa hình 3D để thêm đỉnh. Chuột phải / Enter / Hoàn tất để kết thúc, Esc để hủy.';
  }

  drawButton.addEventListener('click', () => {
    stopDrawing();
    showAnalysis();
    drawnGeometry = null;
    updateRegion();
    panel.slopeRequest = null;
    runSlopeButton.disabled = true;
    regionSummary.hidden = true;
    if (is3DEnabled()) { startDrawing3D(); return; }
    drawingCursor = map.getTargetElement().style.cursor;
    map.getTargetElement().style.cursor = 'crosshair';
    doubleClickStates = map.getInteractions().getArray().filter(item => item instanceof DoubleClickZoom).map(item => [item, item.getActive()]);
    doubleClickStates.forEach(([item]) => item.setActive(false));
    drawing = new Draw({ type: 'Polygon', stopClick: true, maxPoints: 1000 });
    drawing.on('drawstart', event => { sketch = event.feature; });
    drawing.on('drawend', event => {
      drawnGeometry = event.feature.getGeometry().clone();
      stopDrawing(true);
      updateRegion();
    });
    map.addInteraction(drawing);
    const viewport = map.getViewport();
    viewport.tabIndex = 0;
    viewport.focus({ preventScroll: true });
    panel.querySelector('[data-drawing-actions]').hidden = false;
    regionStatus.classList.remove('error');
    regionStatus.textContent = 'Nhấp bản đồ để thêm đỉnh. Nhấp đúp/Enter để hoàn tất, Esc để hủy.';
  });
  panel.querySelector('[data-region-finish]').addEventListener('click', finishRegion);
  panel.querySelector('[data-region-undo]').addEventListener('click', () => drawing?.removeLastPoint());
  panel.querySelector('[data-region-cancel]').addEventListener('click', () => { stopDrawing(); updateRegion(); });
  panel.querySelectorAll('[name="slope-region-mode"]').forEach(item => item.addEventListener('change', () => {
    stopDrawing(); regionMode = item.value; updateRegion();
  }));
  panel.querySelector('[data-slope-unit]').addEventListener('change', updateRegion);
  panel.querySelector('[data-region-zoom]').addEventListener('click', () => {
    showAnalysis();
    updateRegion();
    const input = activeDem();
    if (!input || regionStatus.classList.contains('error')) return;
    fitAnalysisExtent(input.metadata.bbox, input.metadata.crs);
  });
  panel.addEventListener('toolpanelclose', () => { stopDrawing(); regionLayer.setVisible(false); });

  function slopeUrl(path) {
    const url = new URL(path, new URL(GEOSERVER_CONFIG.backendUrl).origin);
    if (['localhost', '127.0.0.1'].includes(url.hostname) && ['localhost', '127.0.0.1'].includes(location.hostname)) url.hostname = location.hostname;
    return url.href;
  }

  function lockSlopeInputs() {
    updateControls();
    select.disabled = slopeBusy || !demChoices.length;
    fileInput.disabled = busy || slopeBusy;
    panel.querySelectorAll('[data-dem-source]').forEach(item => { item.disabled = busy || slopeBusy; });
    cancelButton.disabled = slopeBusy;
    uploadButton.disabled ||= slopeBusy;
  }

  function showSlopeResult() {
    if (!resultJob) return;
    showAnalysis();
    resultLayer?.setVisible(true);
    syncResult3D();
    fitAnalysisExtent(resultJob.result.preview_extent, resultJob.result.preview_crs);
    panel.querySelector('[data-hide-slope]').textContent = 'Ẩn lớp kết quả';
  }

  function displaySlope(job, requestKey) {
    resultJob = job;
    resultRequestKey = requestKey;
    const r = job.result, suffix = job.unit === 'degree' ? '°' : '%';
    const definition = ANALYSIS_TOOLS[r.operation || 'slope'];
    const number = value => Number(value).toLocaleString('vi-VN', { maximumFractionDigits: 2 });
    const summary = panel.querySelector('[data-result-summary]');
    summary.replaceChildren();
    const measurements = [
      ...definition.summary(r, number, suffix),
      ['Ô tính được', number(r.valid_cells)], ['Ô bị loại trong vùng', number(r.excluded_cells)],
      ['Diện tích có kết quả', `${number(r.valid_area_m2 / 1e6)} km²`],
      ['Lưới đầu ra', `${number(r.resolution[0])} × ${number(r.resolution[1])} m · ${r.crs}`],
    ];
    for (const [label, value] of measurements) {
      const row = document.createElement('div'), term = document.createElement('dt'), valueNode = document.createElement('dd');
      term.textContent = label; valueNode.textContent = value; row.append(term, valueNode); summary.append(row);
    }
    const legend = panel.querySelector('[data-slope-legend]');
    legend.replaceChildren();
    r.classes.forEach((item, index) => {
      const row = document.createElement('div'), swatch = document.createElement('i'), label = document.createElement('span'), amount = document.createElement('span');
      swatch.style.backgroundColor = item.color;
      // Classes use [lower, upper), with the final class including its upper bound.
      label.textContent = definition.legend(item, index, r, number, suffix);
      amount.textContent = `${number(item.percent)}%`;
      row.append(swatch, label, amount); legend.append(row);
    });
    panel.querySelector('[data-result-note]').textContent = `Kết quả lưu đến ${new Date(job.expires_at * 1000).toLocaleString('vi-VN')}.`;
    panel.querySelector('[data-slope-download]').href = slopeUrl(job.files.geotiff);
    panel.querySelector('[data-slope-report]').href = slopeUrl(job.files.report);
    if (resultLayer) map.removeLayer(resultLayer);
    ++result3DVersion;
    loading3DJob = null;
    if (result3D) getCesiumScene()?.imageryLayers.remove(result3D, true);
    result3D = null;
    result3DJob = null;
    resultLayer = new ImageLayer({ title: `${definition.title} — ${job.title} (${suffix})`, opacity: .8, zIndex: 500,
      source: new ImageStatic({ url: slopeUrl(job.files.preview), imageExtent: r.preview_extent, projection: r.preview_crs, crossOrigin: 'use-credentials', interpolate: false }) });
    resultLayer.set('layerKind', 'raster');
    resultLayer.set('olcs_skip', true);
    resultLayer.getSource().set('olcs_skip', true);
    resultLayer.set('slopeResult', true);
    resultLayer.on('change:visible', syncResult3D);
    resultLayer.getSource().on('imageloaderror', () => { slopeStatus.textContent = 'Không tải được ảnh kết quả. Phiên hoặc kết quả có thể đã hết hạn.'; slopeProgress.hidden = false; });
    map.addLayer(resultLayer);
    resultBox.hidden = false;
    showSlopeResult();
    resultBox.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  runSlopeButton.addEventListener('click', async () => {
    if (slopeBusy || busy || drawing) return;
    updateRegion();
    if (!panel.slopeRequest) return;
    const request = structuredClone(panel.slopeRequest), requestKey = JSON.stringify(request);
    if (request.operation === 'footprint') {
      const input = activeDem();
      fitAnalysisExtent(input.metadata.bbox, input.metadata.crs);
    }
    slopeBusy = true;
    slopeRunStopped = false;
    slopeJob = null;
    stopDrawing();
    slopeProgress.hidden = false;
    panel.querySelector('[data-cancel-slope]').disabled = true;
    panel.querySelector('[data-cancel-slope]').hidden = false;
    slopeStatus.textContent = request.operation === 'footprint' ? 'Đang xác định phạm vi…' : 'Đang gửi yêu cầu phân tích…';
    slopeProgress.querySelector('progress').value = 0;
    lockSlopeInputs();
    try {
      pendingSlopeCreation = requestJson('/mygis/slope-jobs/', { method: 'POST', body: JSON.stringify(request) });
      slopeJob = (await pendingSlopeCreation).job;
      if (slopeRunStopped) return;
      panel.querySelector('[data-cancel-slope]').disabled = false;
      while (['queued', 'running'].includes(slopeJob.status)) {
        slopeStatus.textContent = `${slopeJob.message} ${slopeJob.progress}%`;
        slopeProgress.querySelector('progress').value = slopeJob.progress;
        await new Promise(resolve => setTimeout(resolve, 1200));
        if (slopeRunStopped) return;
        slopeJob = (await requestJson(`/mygis/slope-jobs/${slopeJob.id}/`)).job;
        if (slopeRunStopped) return;
      }
      slopeStatus.textContent = slopeJob.message;
      if (slopeJob.status === 'ready') {
        slopeProgress.querySelector('progress').value = 100;
        if (request.operation === 'footprint') {
          dataFootprint = { ...slopeJob, dem: request.dem };
          updateRegion();
        } else displaySlope(slopeJob, requestKey);
      }
    } catch (error) {
      if (!slopeRunStopped) slopeStatus.textContent = `${error.message}${slopeJob && ['queued', 'running'].includes(slopeJob.status) ? ' Tác vụ có thể vẫn chạy; bấm Hủy phân tích nếu cần.' : ''}`;
    } finally {
      pendingSlopeCreation = null;
      slopeBusy = false;
      panel.querySelector('[data-cancel-slope]').disabled = !slopeJob || !['queued', 'running'].includes(slopeJob.status);
      panel.querySelector('[data-cancel-slope]').hidden = !slopeJob || !['queued', 'running'].includes(slopeJob.status);
      lockSlopeInputs();
    }
  });
  panel.querySelector('[data-stop-analysis]').addEventListener('click', async event => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = 'Đang kết thúc…';
    slopeRunStopped = true;
    stopDrawing();
    try {
      // A stop during POST must also cancel the job once its ID arrives.
      const created = pendingSlopeCreation ? await pendingSlopeCreation.catch(() => null) : null;
      const job = created?.job || slopeJob;
      if (job && ['queued', 'running'].includes(job.status)) {
        await requestJson(`/mygis/slope-jobs/${job.id}/`, { method: 'DELETE' });
      }
      if (busy) controller?.abort();
      drawnGeometry = null;
      panel.slopeRequest = null;
      regionSource.clear();
      regionLayer.setVisible(false);
      resultLayer?.setVisible(false);
      panel.querySelector('[data-hide-slope]').textContent = 'Hiện lớp kết quả';
      panel.classList.remove('shown');
      document.getElementById('menu-btn')?.focus();
    } catch (error) {
      slopeProgress.hidden = false;
      slopeStatus.textContent = `Chưa xác nhận dừng được tác vụ: ${error.message} Bấm Kết thúc phân tích để thử lại.`;
    } finally {
      button.disabled = false;
      button.textContent = 'Kết thúc phân tích';
    }
  });
  panel.querySelector('[data-cancel-slope]').addEventListener('click', async event => {
    if (!slopeJob) return;
    event.currentTarget.disabled = true;
    try {
      await requestJson(`/mygis/slope-jobs/${slopeJob.id}/`, { method: 'DELETE' });
      slopeStatus.textContent = 'Đã yêu cầu hủy. Đang chờ bộ xử lý dừng…';
    } catch (error) { slopeStatus.textContent = error.message; panel.querySelector('[data-cancel-slope]').disabled = false; }
  });
  panel.querySelector('[data-show-slope]').addEventListener('click', showSlopeResult);
  panel.querySelector('[data-hide-slope]').addEventListener('click', event => {
    if (!resultLayer) return;
    resultLayer.setVisible(!resultLayer.getVisible());
    event.currentTarget.textContent = resultLayer.getVisible() ? 'Ẩn lớp kết quả' : 'Hiện lớp kết quả';
  });

  function message(text, error = false) {
    fileMessage = text;
    fileError = error;
    showSelection();
  }

  function displayMetadata(metadata) {
    info.replaceChildren();
    const rows = [
      ['Kích thước', `${metadata.width.toLocaleString('vi-VN')} × ${metadata.height.toLocaleString('vi-VN')} px`],
      ['Hệ tọa độ', metadata.crs || 'Chưa có — cần nhập EPSG'],
      ['Kích thước ô', `${Number(metadata.resolution_x).toPrecision(5)} × ${Number(metadata.resolution_y).toPrecision(5)} ${metadata.horizontal_unit || 'đơn vị CRS'}`],

    ];

    rows.forEach(([label, value]) => {
      const row = document.createElement('div');
      const key = document.createElement('dt');
      const text = document.createElement('dd');
      key.textContent = label;
      text.textContent = value;
      row.append(key, text);
      info.append(row);
    });
    info.hidden = false;
  }

  function updateControls() {
    const needsCrs = preview && !preview.crs;
    const valid = limits && preview && fileInput.files[0]?.size <= limits.max_bytes && confirmation.checked && unitSelect.value && (!needsCrs || epsgInput.validity.valid && epsgInput.value);
    uploadButton.disabled = busy || !valid || upload?.status === 'ready';
    uploadButton.textContent = upload?.status === 'uploading' ? 'Tiếp tục tải và kiểm tra' : upload?.status === 'ready' ? 'raster đã sẵn sàng' : 'Tải lên và kiểm tra';
    fileInput.disabled = busy;
    options.querySelectorAll('select, input').forEach(item => { item.disabled = busy || Boolean(upload); });
    panel.querySelectorAll('[data-dem-source]').forEach(item => { item.disabled = busy; });
    cancelButton.hidden = !upload && !busy;
    updateRegion();
  }

  async function cancelUpload() {
    controller?.abort();
    const previous = upload;
    upload = null;
    let removed = !previous;
    if (previous) {
      // Chunk requests may still be releasing their lock after cancellation.
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          await requestJson(`/mygis/dem-uploads/${previous.id}/`, { method: 'DELETE' });
          removed = true;
          break;
        } catch {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
    }
    panel.demInput = null;
    return removed;
  }

  async function inspectFile() {
    const version = ++fileVersion;
    await cancelUpload();
    if (version !== fileVersion) return;
    preview = null;
    info.hidden = true;
    options.hidden = true;
    progressBox.hidden = true;
    confirmation.checked = true;
    unitSelect.value = 'm';
    epsgInput.value = '';
    updateControls();
    const file = fileInput.files[0];
    if (!file) return message('Chưa chọn tệp raster.');
    if (!/\.tiff?$/i.test(file.name)) return message('Vui lòng chọn tệp .tif hoặc .tiff.', true);
    if (!file.size || limits && file.size > limits.max_bytes) return message('Tệp rỗng hoặc vượt giới hạn tải lên.', true);
    message('Đang đọc metadata GeoTIFF…');
    try {
      const { fromBlob } = await import('geotiff');
      const tiff = await fromBlob(file);
      const image = await tiff.getImage();
      if (version !== fileVersion) return;
      const keys = image.getGeoKeys() || {};
      const epsg = keys.ProjectedCSTypeGeoKey || keys.GeographicTypeGeoKey;
      const resolution = image.getResolution();
      const bandCount = image.getSamplesPerPixel();
      const directory = image.getFileDirectory();
      const photometric = directory.getValue?.('PhotometricInterpretation') ?? directory.PhotometricInterpretation;
      if (photometric === 2) throw new Error('Đây là ảnh màu RGB; hãy chọn raster chứa cao độ.');
      preview = { width: image.getWidth(), height: image.getHeight(), band_count: bandCount,
        crs: epsg && epsg !== 32767 ? `EPSG:${epsg}` : '', resolution_x: Math.abs(resolution[0]),
        resolution_y: Math.abs(resolution[1]), no_data: image.getGDALNoData(),
        horizontal_unit: keys.GeographicTypeGeoKey && !keys.ProjectedCSTypeGeoKey ? 'độ' : 'đơn vị CRS' };
      bandSelect.replaceChildren(...Array.from({ length: bandCount }, (_, index) => new Option(`Band ${index + 1}`, index + 1)));
      panel.querySelector('[data-band-row]').hidden = bandCount <= 1;
      panel.querySelector('[data-crs-row]').hidden = Boolean(preview.crs);
      if (keys.VerticalUnitsGeoKey === 9001) unitSelect.value = 'm';
      displayMetadata(preview);
      options.hidden = false;
      message(`${file.name} · ${(file.size / 1024 ** 2).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} MiB. Chưa tải lên.`);
    } catch (error) {
      preview = null;
      message(`Không đọc được GeoTIFF: ${error.message}`, true);
    }
    updateControls();
  }

  async function startUpload() {
    if (uploadButton.disabled) return;
    const file = fileInput.files[0];
    busy = true;
    controller = new AbortController();
    const signal = controller.signal;
    progressBox.hidden = false;
    updateControls();
    try {
      if (!upload) {
        const response = await requestJson('/mygis/dem-uploads/', { method: 'POST', signal, body: JSON.stringify({
          filename: file.name, size: file.size, band: Number(bandSelect.value),
          data_type: panel.querySelector('[data-dem-type]').value, elevation_unit: unitSelect.value,
          epsg: preview.crs ? '' : epsgInput.value, confirm_elevation: confirmation.checked,
        }) });
        upload = response.upload;
      } else {
        upload = (await requestJson(`/mygis/dem-uploads/${upload.id}/`, { signal })).upload;
      }
      updateControls();
      while (upload.received < file.size) {
        progress.value = upload.received / file.size * 100;
        progressLabel.textContent = `Đang tải ${Math.floor(progress.value)}%`;
        message('Đang tải raster lên vùng lưu trữ tạm…');
        const end = Math.min(upload.received + limits.chunk_bytes, file.size);
        const response = await requestJson(`/mygis/dem-uploads/${upload.id}/?offset=${upload.received}`, {
          method: 'PUT', signal, headers: { 'Content-Type': 'application/octet-stream' }, body: file.slice(upload.received, end),
        });
        upload = response.upload;
      }
      progress.value = 100;
      upload = (await requestJson(`/mygis/dem-uploads/${upload.id}/`, { method: 'POST', signal })).upload;
      while (upload.status === 'validating') {
        progress.removeAttribute('value');
        progressLabel.textContent = 'Đang kiểm tra dữ liệu cao độ…';
        message('Đã tải xong. Backend đang kiểm tra toàn bộ band cao độ.');
        await new Promise((resolve, reject) => {
          const onAbort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
          const timer = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve(); }, 1500);
          signal.addEventListener('abort', onAbort, { once: true });
          if (signal.aborted) onAbort();
        });
        upload = (await requestJson(`/mygis/dem-uploads/${upload.id}/`, { signal })).upload;
      }
      if (upload.status !== 'ready') throw new Error(upload.message || 'raster không hợp lệ.');
      progress.value = 100;
      progressLabel.textContent = 'raster sẵn sàng';
      displayMetadata(upload.metadata);
      panel.demInput = { source: 'upload', id: upload.id, metadata: upload.metadata, expires_at: upload.expires_at };
      panel.dispatchEvent(new CustomEvent('dem-input-ready', { detail: panel.demInput }));
      message('Raster đã sẵn sàng.');
    } catch (error) {
      if (error.name !== 'AbortError') {
        message(`${error.message}${upload?.status === 'uploading' ? ' Bấm Tiếp tục tải để thử lại.' : ''}`, true);
        if (upload?.status === 'failed') { await cancelUpload(); }
      }
    } finally {
      busy = false;
      updateControls();
    }
  }

  function showSelection() {
    updateRegion();
    selection.hidden = source === 'server';
    selection.classList.toggle('error', source === 'file' && fileError);
    if (source === 'server') {
      selection.textContent = select.value
        ? `Đã chọn: ${select.selectedOptions[0].textContent}`
        : select.disabled ? 'Chưa có lớp raster. Thêm dữ liệu raster hoặc chọn tệp từ máy.' : 'Chọn lớp raster để chuẩn bị phân tích.';
      return;
    }
    selection.textContent = fileMessage;
  }

  function refreshLayers() {
    const previous = select.value;
    const layers = getDemLayers();
    demChoices = layers;
    select.replaceChildren(new Option(layers.length ? 'Chọn lớp raster…' : 'Chưa có lớp raster', ''),
      ...layers.map(layer => new Option(layer.title, layer.name)));
    select.disabled = !layers.length;
    if (layers.some(layer => layer.name === previous)) select.value = previous;
    prepareRasterSelection();
  }

  async function prepareRasterSelection() {
    const name = select.value, version = ++rasterGridVersion;
    rasterGridError = '';
    rasterGridLoading = Boolean(name && !rasterGridCache.has(name));
    showSelection();
    if (!rasterGridLoading) return;
    try {
      const data = await requestJson(`/mygis/rasters/${encodeURIComponent(name)}/analysis/`);
      if (version !== rasterGridVersion) return;
      rasterGridCache.set(name, data.metadata);
      const item = demChoices.find(item => item.name === name);
      if (item) item.metadata = { ...item.metadata, ...data.metadata };
    } catch (error) {
      if (version === rasterGridVersion) rasterGridError = error.message;
    } finally {
      if (version === rasterGridVersion) {
        rasterGridLoading = false;
        showSelection();
      }
    }
  }

  panel.querySelectorAll('[data-dem-source]').forEach(button => {
    button.addEventListener('click', () => {
      source = button.dataset.demSource;
      panel.querySelectorAll('[data-dem-source]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      panel.querySelector('[data-dem-server]').hidden = source !== 'server';
      panel.querySelector('[data-dem-file]').hidden = source !== 'file';
      if (source === 'server') prepareRasterSelection();
      else showSelection();
    });
  });
  select.addEventListener('change', prepareRasterSelection);
  panel.querySelector('[data-server-unit]').addEventListener('change', updateRegion);
  fileInput.addEventListener('change', inspectFile);
  options.addEventListener('input', updateControls);
  uploadButton.addEventListener('click', startUpload);
  cancelButton.addEventListener('click', async () => {
    cancelButton.disabled = true;
    const removed = await cancelUpload();
    busy = false;
    progressBox.hidden = true;
    cancelButton.disabled = false;
    updateControls();
    message(removed ? 'Đã hủy raster tạm. Bạn có thể tải lại hoặc đổi tệp.' : 'Đã dừng trên trình duyệt; chưa xác nhận xóa được tệp tạm trên máy chủ.', !removed);
  });
  function loadLimits() {
    return requestJson('/mygis/dem-uploads/').then(data => {
    limits = data;
    panel.querySelector('[data-upload-limit]').textContent = `GeoTIFF · tối đa ${data.max_bytes / 1024 ** 3} GiB`;
    updateControls();
  }).catch(() => {
    panel.querySelector('[data-upload-limit]').textContent = 'Chưa kết nối được backend. Mở lại bảng để thử kết nối.';
  });
  }
  loadLimits();
  window.addEventListener('webgis-rasters-changed', refreshLayers);
  document.addEventListener('webgis-view-mode-change', () => {
    const visible = panel.classList.contains('shown');
    stopDrawing();
    updateRegion();
    regionLayer.setVisible(visible);
    if (region3D) region3D.show = visible && is3DEnabled();
    syncRegion3D();
    syncResult3D();
  });
  document.addEventListener('keydown', event => {
    if (drawing && event.key === 'Backspace' && !event.target.closest('input, select, textarea')) {
      event.preventDefault(); drawing.removeLastPoint(); return;
    }
    if (drawing && event.key === 'Enter' && !event.target.closest('input, select, button')) { event.preventDefault(); finishRegion(); return; }
    if (event.key === 'Escape' && panel.classList.contains('shown')) {
      if (drawing) { event.preventDefault(); stopDrawing(); updateRegion(); return; }
      panel.classList.remove('shown');
      regionLayer.setVisible(false);
      document.getElementById('menu-btn')?.focus();
    }
  });
  return {
    open(mode = 'slope') {
      if (!Object.hasOwn(ANALYSIS_TOOLS, mode)) return;
      if (mode !== analysisType && (slopeBusy || busy)) {
        panel.classList.add('shown');
        slopeProgress.hidden = false;
        slopeStatus.textContent = 'Hãy hoàn tất hoặc hủy tác vụ hiện tại trước khi đổi loại phân tích.';
        return;
      }
      if (mode !== analysisType) {
        analysisType = mode;
        const title = `Phân tích ${analysisLabel()}`;
        panel.setAttribute('aria-label', title);
        panel.querySelector('.tool-panel-header strong').textContent = title;
        panel.querySelector('[data-analysis-unit-label]').textContent = `Đơn vị ${analysisLabel()}`;
        const units = panel.querySelector('[data-slope-unit]');
        units.replaceChildren(...analysisDefinition().units.map(unit => new Option(unit.label, unit.value)));
        panel.querySelector('[data-analysis-unit-row]').hidden = analysisDefinition().units.length === 1;
        panel.querySelector('#terrain-analysis-note').textContent = analysisDefinition().note;
        panel.querySelector('[data-analysis-result-heading]').textContent = `Kết quả ${analysisLabel()}`;
        resultBox.setAttribute('aria-label', `Kết quả ${analysisLabel()}`);
        slopeProgress.querySelector('progress').setAttribute('aria-label', `Tiến trình tính ${analysisLabel()}`);
        if (resultLayer) map.removeLayer(resultLayer);
        resultLayer = null;
        if (result3D) getCesiumScene()?.imageryLayers.remove(result3D, true);
        ++result3DVersion;
        result3D = null;
        result3DJob = loading3DJob = null;
        resultJob = slopeJob = null;
        resultRequestKey = '';
        resultBox.hidden = slopeProgress.hidden = true;
      }
      if (!limits) loadLimits();
      refreshLayers();
      panel.classList.add('shown');
      regionLayer.setVisible(true);
      syncRegion3D();
      syncResult3D();
      panel.querySelector(`[data-dem-source="${source}"]`).focus();
    },
    close() { stopDrawing(); regionLayer.setVisible(false); panel.classList.remove('shown'); },
    getRequest() { updateRegion(); return panel.slopeRequest ? structuredClone(panel.slopeRequest) : null; },
  };
}
