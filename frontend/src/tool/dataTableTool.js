import { transform, transformExtent, get as getProjection } from 'ol/proj.js';
import { GEOSERVER_CONFIG, RASTER_LAYER_CONFIGS } from '../config/layers.js';
import { RASTER_PRESENTATION_TYPES } from './rasterManager.js';
import { requestJson } from './apiClient.js';
import { makePanelDraggable } from './toolUtils.js';

const RASTER_API_URL = `${GEOSERVER_CONFIG.backendUrl.replace(/\/features$/, '')}/rasters`;
const RASTER_TYPE_LABELS = Object.fromEntries(RASTER_PRESENTATION_TYPES.map(item => [item.id, item.title]));

export function createDataTableTool({ map, crudManager, rasterGroup, getRasterExtent, beforeOpen = () => {} }) {
  function rasterLayers() {
    const result = [];
    function collect(layer) {
      if (layer.getLayers) layer.getLayers().forEach(collect);
      else if (layer.get('rasterName')) result.push(layer);
    }
    map.getLayers().forEach(collect);
    return result;
  }
  const panel = document.getElementById('attribute-table-panel');
  const typeButtons = [...panel.querySelectorAll('[data-table-type]')];
  const vectorView = panel.querySelector('[data-vector-view]');
  const rasterView = panel.querySelector('[data-raster-view]');
  const rasterSelect = document.getElementById('data-raster-layer');
  const rasterStatus = document.getElementById('data-raster-status');
  const rasterDetails = document.getElementById('data-raster-details');
  const rasterPixel = document.getElementById('data-raster-pixel');
  let rasters = [];
  let dataType = 'vector';
  let listVersion = 0;
  let pixelVersion = 0;
  let zoomVersion = 0;
  const isRasterActive = () => panel.classList.contains('active') && dataType === 'raster';
  makePanelDraggable(panel, panel.querySelector('.data-view-header'));
  function getCurrentRaster() {
    return rasters.find((raster) => raster.name === rasterSelect.value)
  }

  function getRasterLayer(name) {
    return rasterLayers().find((layer) => layer.get('rasterName') === name)
  }

  function setRasterStatus(message) {
    rasterStatus.textContent = message
  }

  function formatValue(value) {
    if (value === null || value === undefined || value === '') return 'Chưa có dữ liệu'
    if (Array.isArray(value)) return value.join(', ')
    return String(value)
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return null
    const units = ['B', 'KB', 'MB', 'GB']
    const index = bytes ? Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1) : 0
    return `${(bytes / 1024 ** index).toFixed(index ? 2 : 0)} ${units[index]}`
  }

  function getRasterMetrics(raster) {
    if (!raster.bbox || raster.bbox.length !== 4 || !raster.width || !raster.height) return {}
    const [minX, minY, maxX, maxY] = raster.bbox.map(Number)
    const resolutionX = Math.abs(maxX - minX) / raster.width
    const resolutionY = Math.abs(maxY - minY) / raster.height
    const isGeographic = /EPSG:(4326|4258|4269)/i.test(raster.crs || '')
    const formatResolution = (value) => value.toFixed(2)
    const latitude = (minY + maxY) / 2 * Math.PI / 180
    const resolutionMetersX = resolutionX * 111320 * Math.cos(latitude)
    const resolutionMetersY = resolutionY * 110574
    const result = {
      resolution: isGeographic
        ? `${formatResolution(resolutionMetersX)} × ${formatResolution(resolutionMetersY)} m/pixel`
        : `${formatResolution(resolutionX)} × ${formatResolution(resolutionY)} ${getProjection(raster.crs)?.getUnits() || 'đơn vị CRS'}/pixel`,
      coverageArea: isGeographic
        ? `~${(Math.abs((maxX - minX) * 111320 * Math.cos(latitude) * (maxY - minY) * 110574) / 1e6).toFixed(2)} km²`
        : getProjection(raster.crs)?.getUnits() === 'm' ? `${(Math.abs((maxX - minX) * (maxY - minY)) / 1e6).toFixed(2)} km²` : null,
    }
    try {
      const extent = transformExtent(raster.bbox, raster.crs, 'EPSG:4326')
      result.wgs84Extent = `${extent[0].toFixed(5)}, ${extent[1].toFixed(5)} → ${extent[2].toFixed(5)}, ${extent[3].toFixed(5)}`
    } catch {
      result.wgs84Extent = null
    }
    return result
  }

  function renderRasterDetails() {
    const raster = getCurrentRaster()
    rasterDetails.replaceChildren()
    rasterPixel.textContent = 'Chưa chọn điểm trên raster.'
    if (!raster) return
    const technical = raster.technical_metadata || {}
    const metrics = getRasterMetrics(raster)
    const rows = [
      ['Tên raster', raster.name],
      ['Tên hiển thị', raster.title],
      ['Loại dữ liệu', RASTER_TYPE_LABELS[raster.presentation_type]],
      ['Tên file', raster.source_filename],
      ['CRS', raster.crs],
      ['BBox / phạm vi', raster.bbox?.length === 4 ? raster.bbox.map((value) => Number(value).toFixed(3)).join(', ') : null],
      ['Phạm vi WGS84', metrics.wgs84Extent],
      ['Kích thước', raster.width && raster.height ? `${raster.width} × ${raster.height} px` : null],
      ['Độ phân giải', metrics.resolution],
      ['Diện tích phủ', metrics.coverageArea],
      ['Dung lượng file', formatBytes(technical.file_size_bytes)],
      ['Số band', technical.band_count],
      ['Bits / pixel', technical.bits_per_sample],
      ['Kiểu dữ liệu pixel', technical.data_type],
      ['Kiểu mẫu pixel', technical.sample_format],
      ['NoData', technical.no_data],
      ['Ngày tạo', raster.created_at ? new Date(raster.created_at).toLocaleString('vi-VN') : null],
      ['Ngày cập nhật', raster.updated_at ? new Date(raster.updated_at).toLocaleString('vi-VN') : null],
    ]
    rows.forEach(([label, value]) => {
      const row = document.createElement('div')
      const key = document.createElement('span')
      const content = document.createElement('strong')
      key.textContent = label
      content.textContent = formatValue(value)
      row.append(key, content)
      rasterDetails.appendChild(row)
    })
  }


  function renderRasterOptions(items) {
    const selected = rasterSelect.value;
    rasters = items;
    rasterSelect.replaceChildren(...rasters.map(item => new Option(item.title || item.name, item.name)));
    if (rasters.some(item => item.name === selected)) rasterSelect.value = selected;
    pixelVersion++;
    zoomVersion++;
    renderRasterDetails();
    panel.querySelector('#data-raster-zoom').disabled = !getCurrentRaster();
  }

  async function loadRasters() {
    const version = ++listVersion;
    setRasterStatus('Đang tải thông tin raster…');
    const onMap = rasterLayers().map(layer => ({
      name: layer.get('rasterName'), title: layer.get('title'), ...layer.get('rasterMetadata')
    })).filter(item => item.name);
    try {
      const response = await requestJson(`${RASTER_API_URL}/`);
      if (version !== listVersion || !isRasterActive()) return;
      const deleted = new Set(response.deleted_names || []);
      const configured = RASTER_LAYER_CONFIGS.map(item => ({ name: item.layerName, title: item.title }));
      const items = new Map([...configured, ...onMap, ...response.rasters].filter(item => !deleted.has(item.name)).map(item => [item.name, item]));
      renderRasterOptions([...items.values()]);
      setRasterStatus(rasters.length ? 'Chọn raster để xem thông tin. Bấm bản đồ để đọc giá trị pixel.' : 'Chưa có raster để xem.');
    } catch (error) {
      if (version !== listVersion || !isRasterActive()) return;
      renderRasterOptions(onMap);
      setRasterStatus(`Chưa tải được metadata từ backend: ${error.message}. Đang hiển thị thông tin các lớp trên bản đồ.`);
    }
  }

  async function zoomToRaster() {
    const raster = getCurrentRaster();
    const layer = raster && getRasterLayer(raster.name);
    if (!layer) return setRasterStatus('Không tìm thấy lớp raster trên bản đồ.');
    const version = ++zoomVersion;
    setRasterStatus('Đang lấy phạm vi raster…');
    try {
      const extent = await getRasterExtent(layer);
      if (version !== zoomVersion || !isRasterActive()) return;
      layer.setVisible(true);
      function revealParent(item) {
        if (item === layer) return true;
        if (item.getLayers?.().getArray().some(revealParent)) { item.setVisible(true); return true; }
        return false;
      }
      map.getLayers().forEach(revealParent);
      map.getView().fit(extent, { padding: [40, 40, 40, 40], maxZoom: 17, duration: 350 });
      setRasterStatus('Đã zoom tới raster. Bấm bản đồ để đọc giá trị pixel.');
    } catch (error) {
      if (version === zoomVersion) setRasterStatus(`Không thể zoom tới raster: ${error.message}`);
    }
  }

  async function identifyRasterPixel(event) {
    const raster = getCurrentRaster();
    const source = raster && getRasterLayer(raster.name)?.getSource();
    const version = ++pixelVersion;
    if (!source?.getFeatureInfoUrl) { rasterPixel.textContent = 'Lớp raster chưa có nguồn WMS để đọc pixel.'; return; }
    const url = source.getFeatureInfoUrl(event.coordinate, map.getView().getResolution(), map.getView().getProjection(), {
      INFO_FORMAT: 'application/json', FEATURE_COUNT: 1
    });
    if (!url) return;
    rasterPixel.textContent = 'Đang đọc giá trị pixel…';
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (version !== pixelVersion || !isRasterActive()) return;
      const properties = data.features?.[0]?.properties;
      if (!properties || !Object.keys(properties).length) throw new Error('Không có giá trị tại điểm này.');
      const coordinate = transform(event.coordinate, map.getView().getProjection(), 'EPSG:4326');
      rasterPixel.replaceChildren(...[
        `Tọa độ: ${coordinate[0].toFixed(6)}, ${coordinate[1].toFixed(6)}`,
        ...Object.entries(properties).map(([key, value]) => `${key}: ${formatValue(value)}`)
      ].map(text => { const row = document.createElement('div'); row.textContent = text; return row; }));
    } catch (error) {
      if (version === pixelVersion && isRasterActive()) rasterPixel.textContent = `Không thể đọc pixel: ${error.message}`;
    }
  }

  function selectDataType(type) {
    dataType = type;
    pixelVersion++;
    zoomVersion++;
    listVersion++;
    vectorView.hidden = type !== 'vector';
    rasterView.hidden = type !== 'raster';
    typeButtons.forEach(button => {
      const active = button.dataset.tableType === type;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    crudManager.setAttributeDataType(type);
    if (type === 'raster') loadRasters();
  }

  function close() {
    pixelVersion++;
    zoomVersion++;
    listVersion++;
    crudManager.closeAttributeTable();
  }

  typeButtons.forEach(button => button.addEventListener('click', () => selectDataType(button.dataset.tableType)));
  rasterSelect.addEventListener('change', () => {
    pixelVersion++;
    zoomVersion++;
    renderRasterDetails();
    setRasterStatus('Bấm bản đồ để đọc pixel hoặc chọn “Zoom tới raster”.');
  });
  panel.querySelector('#data-raster-load').addEventListener('click', loadRasters);
  panel.querySelector('#data-raster-zoom').addEventListener('click', zoomToRaster);
  document.getElementById('close-attribute-table').addEventListener('click', () => { pixelVersion++; listVersion++; zoomVersion++; });
  window.addEventListener('webgis-rasters-changed', () => { if (isRasterActive()) loadRasters(); });

  return {
    open() { beforeOpen(); crudManager.openAttributeTable(); selectDataType(dataType); },
    close,
    handleMapClick(event) {
      if (!isRasterActive()) return false;
      identifyRasterPixel(event);
      return true;
    }
  };
}
