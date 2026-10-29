import { TabulatorFull as Tabulator } from 'tabulator-tables';
import Draw from 'ol/interaction/Draw.js';
import Modify from 'ol/interaction/Modify.js';
import Snap from 'ol/interaction/Snap.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import MultiPoint from 'ol/geom/MultiPoint.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import { Style, Fill, Stroke, Circle as CircleStyle } from 'ol/style.js';
import { GEOSERVER_CONFIG, DEFAULT_ID_FIELDS } from '../config/layers.js';
import { getConfiguredValue, getRequiredElement, fetchWms } from './toolUtils.js';

export function createCrudManager({
  map, layerConfigs, closeMenu = () => {}, cleanHighlight = () => {},
  onDataChanged = () => {}, beforeStart = () => {}
}) {
  const editableLayers = layerConfigs.filter(config => config.editable && config.wfsLayer);
  const attributeLayerConfigs = layerConfigs.filter(config => config.attributeTable && config.wfsLayer);
  const geojsonFormat = new GeoJSON();
  const panel = getRequiredElement('crud-panel');
  const title = getRequiredElement('crud-title');
  const layerSelect = getRequiredElement('crud-layer');
  const status = getRequiredElement('crud-status');
  const workspace = getRequiredElement('crud-workspace');
  const actions = getRequiredElement('crud-actions');
  const closeButton = getRequiredElement('crud-close');
  const attributeTablePanel = getRequiredElement('attribute-table-panel');
  const attributeLayerSelect = getRequiredElement('attribute-layer-select');
  const loadAttributeBtn = getRequiredElement('load-attribute-btn');
  const closeAttributeTableBtn = getRequiredElement('close-attribute-table');
  const tableAddBtn = getRequiredElement('table-btn-add');
  const sketchSource = new VectorSource();
  const vertexStyle = new Style({
    geometry: feature => {
      const collect = coords => typeof coords[0] === 'number' ? [coords] : coords.flatMap(collect);
      return new MultiPoint(collect(feature.getGeometry().getCoordinates()));
    },
    image: new CircleStyle({ radius: 6, fill: new Fill({ color: '#22d3ee' }),
      stroke: new Stroke({ color: '#fff', width: 2 }) })
  });
  const sketchStyle = new Style({
    fill: new Fill({ color: 'rgba(255, 221, 0, .25)' }),
    stroke: new Stroke({ color: '#ef4444', width: 3 }),
    image: new CircleStyle({ radius: 8, fill: new Fill({ color: '#ffdd00' }),
      stroke: new Stroke({ color: '#ef4444', width: 2 }) })
  });
  const sketchLayer = new VectorLayer({ source: sketchSource, zIndex: 10000,
    style: () => modifyInteraction ? [sketchStyle, vertexStyle] : sketchStyle });
  map.addLayer(sketchLayer);

  let currentAction = null;
  let currentLayerConfig = null;
  let selectedFeature = null;
  let drawInteraction = null;
  let modifyInteraction = null;
  let snapInteraction = null;
  let geometryChanged = false;
  let isSelecting = false;
  let isSaving = false;
  let selectionRequest = null;
  let snapRequest = null;
  let hiddenWmsFeature = null;
  let attributeTable = null;
  let attributeCache = [];
  let attributeHighlightLayer = null;
  let attributeAddMode = false;
  let attributeRequestVersion = 0;
  let attributeKeyword = '';
  const attributeStatus = document.getElementById('attribute-table-status');
  const attributeFilter = document.getElementById('attribute-quick-filter');
  function setAttributeStatus(message) { if (attributeStatus) attributeStatus.textContent = message; }
  function applyAttributeFilter() {
    attributeTable?.setFilter(row => Object.entries(row).some(([key, value]) => !key.startsWith('__') && String(value ?? '').toLocaleLowerCase('vi-VN').includes(attributeKeyword)));
  }
  attributeFilter?.addEventListener('input', () => {
    attributeKeyword = attributeFilter.value.trim().toLocaleLowerCase('vi-VN');
    applyAttributeFilter();
  });

  function setStatus(message, error = false) {
    status.textContent = message;
    status.classList.toggle('error', error);
  }

  function button(label, handler, danger = false) {
    const element = document.createElement('button');
    element.type = 'button';
    element.textContent = label;
    element.classList.toggle('danger', danger);
    element.addEventListener('click', handler);
    return element;
  }

  function isMissingId(value) {
    return value === null || value === undefined || value === '';
  }

  function getFeatureId(feature, config) {
    const value = getConfiguredValue(feature, config.idFields || DEFAULT_ID_FIELDS, null);
    if (!isMissingId(value)) return value;
    const id = feature.getId();
    if (isMissingId(id)) return null;
    return String(id).split('.').at(-1);
  }

  async function requestJson(url, options = {}, send = fetch) {
    const response = await send(url, options);
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; }
    catch { throw new Error(`Máy chủ trả dữ liệu không hợp lệ (HTTP ${response.status})`); }
    if (!response.ok || data.success === false) {
      throw new Error(data.message || `HTTP ${response.status}`);
    }
    return data;
  }

  function getBackendUrl(config, suffix) {
    return `${GEOSERVER_CONFIG.backendUrl.replace(/\/+$/, '')}/${encodeURIComponent(config.apiName || config.id)}/${suffix}`;
  }

  // Tính cả trạng thái nhóm cha; WFS ẩn chỉ phục vụ đọc, không quyết định lớp đang bật.
  function isLayerVisible(config) {
    function containsVisible(collection, parentVisible = true) {
      return collection.getArray().some(layer => {
        const visible = parentVisible && layer.getVisible();
        if (layer === config.wmsLayer) return visible;
        return layer.getLayers ? containsVisible(layer.getLayers(), visible) : false;
      });
    }
    return containsVisible(map.getLayers());
  }

  function stopDrawInteraction() {
    snapRequest?.abort();
    snapRequest = null;
    [drawInteraction, modifyInteraction, snapInteraction].forEach(interaction => {
      if (interaction) map.removeInteraction(interaction);
    });
    drawInteraction = modifyInteraction = snapInteraction = null;
    sketchLayer.changed();
    map.getTargetElement().style.cursor = '';
  }

  function restoreWms() {
    if (!hiddenWmsFeature) return;
    hiddenWmsFeature.source.updateParams({
      CQL_FILTER: hiddenWmsFeature.filter || 'INCLUDE', _reload: Date.now()
    });
    hiddenWmsFeature = null;
  }

  function hideOriginalFromWms() {
    if (hiddenWmsFeature || !selectedFeature) return;
    const source = currentLayerConfig.wmsLayer?.getSource();
    const id = getFeatureId(selectedFeature, currentLayerConfig);
    const idField = (currentLayerConfig.idFields || DEFAULT_ID_FIELDS)[0];
    if (!source?.updateParams || !/^\d+$/.test(String(id)) || !/^\w+$/.test(idField)) return;
    const filter = source.getParams().CQL_FILTER;
    const exclusion = `${idField} <> ${id}`;
    hiddenWmsFeature = { source, filter };
    source.updateParams({ CQL_FILTER: filter ? `(${filter}) AND (${exclusion})` : exclusion });
  }

  function clearWorkspace() {
    selectionRequest?.abort();
    selectionRequest = null;
    stopDrawInteraction();
    restoreWms();
    selectedFeature = null;
    geometryChanged = false;
    isSelecting = false;
    sketchSource.clear();
    clearAttributeHighlight();
    cleanHighlight();
    workspace.replaceChildren();
    actions.replaceChildren();
  }

  function resetCrudState() {
    if (isSaving) return;
    clearWorkspace();
    currentAction = null;
    currentLayerConfig = null;
    panel.classList.remove('active');
    document.querySelectorAll('.workspace-tools button').forEach(button => {
      button.classList.remove('is-active');
      button.setAttribute('aria-pressed', 'false');
    });
    updateAttributeAddButton(false);
  }

  function renderStart() {
    clearWorkspace();
    actions.replaceChildren(button(currentAction === 'add' ? 'Bắt đầu vẽ' : 'Bắt đầu chọn', () => {
      if (currentAction === 'add') startAdd();
      else {
        isSelecting = true;
        map.getTargetElement().style.cursor = 'crosshair';
        setStatus('Nhấp vào đối tượng trên bản đồ.');
      }
    }), button('Hủy', resetCrudState));
    actions.firstChild.disabled = !currentLayerConfig;
    setStatus(currentLayerConfig ? 'Chọn lớp rồi bắt đầu thao tác.' : 'Hãy bật một lớp có thể biên tập trong danh sách lớp.', !currentLayerConfig);
  }

  function renderLayerOptions(preferred) {
    layerSelect.replaceChildren();
    editableLayers.filter(isLayerVisible).forEach(config => {
      const option = document.createElement('option');
      option.value = config.id;
      option.textContent = `${config.title} (${config.geometryType})`;
      layerSelect.appendChild(option);
    });
    if ([...layerSelect.options].some(option => option.value === preferred)) layerSelect.value = preferred;
    layerSelect.disabled = !layerSelect.options.length;
    currentLayerConfig = editableLayers.find(config => config.id === layerSelect.value) || null;
  }

  function openChooseLayerPopup(action, config = null) {
    if (isSaving) return;
    document.dispatchEvent(new CustomEvent('webgis-tool-activate', {
      detail: { name: 'crud', preserveDataTool: attributeTablePanel.classList.contains('active') ? 'data-view' : undefined }
    }));
    beforeStart();
    resetCrudState();
    currentAction = action;
    panel.dataset.action = action;
    const quickButton = document.querySelector(`.workspace-tools [data-menu-action="${action}-data"]`);
    quickButton?.classList.add('is-active');
    quickButton?.setAttribute('aria-pressed', 'true');
    title.textContent = { add: 'Thêm đối tượng', edit: 'Sửa đối tượng', delete: 'Xóa đối tượng' }[action];
    renderLayerOptions(config?.id);
    panel.classList.add('active');
    renderStart();
  }

  function renderPropertyForm() {
    workspace.replaceChildren();
    const form = document.createElement('form');
    form.id = 'crud-property-form';
    (currentLayerConfig.editFields || []).forEach(field => {
      const label = document.createElement('label');
      label.textContent = field.label;
      const input = document.createElement('input');
      input.name = field.name;
      input.type = field.type || 'text';
      input.value = selectedFeature?.get(field.name) ?? '';
      input.required = Boolean(field.required);
      if (field.type === 'number') input.step = 'any';
      label.appendChild(input);
      form.appendChild(label);
    });
    form.addEventListener('submit', event => { event.preventDefault(); saveFeature(); });
    workspace.appendChild(form);
    const save = button('Lưu thay đổi', saveFeature);
    actions.replaceChildren(save, button('Hủy', resetCrudState));
  }

  function startAdd(replace = false) {
    if (!currentLayerConfig || !isLayerVisible(currentLayerConfig)) return;
    stopDrawInteraction();
    isSelecting = false;
    if (replace) {
      workspace.querySelectorAll('input').forEach(input => selectedFeature.set(input.name, input.value));
      hideOriginalFromWms();
    }
    workspace.replaceChildren();
    actions.replaceChildren(button('Hủy', resetCrudState));
    drawInteraction = new Draw({ type: currentLayerConfig.geometryType });
    map.addInteraction(drawInteraction);
    // Dùng dữ liệu sẵn có trước, bổ sung WFS ngầm khi bắt đầu vẽ mới.
    const snapFeatures = currentLayerConfig.wfsLayer.getSource().getFeatures();
    const snapSource = new VectorSource({ features: replace ? [selectedFeature] : snapFeatures });
    snapInteraction = new Snap({ source: snapSource, pixelTolerance: 16 });
    map.addInteraction(snapInteraction);
    map.getTargetElement().style.cursor = 'crosshair';
    setStatus(replace ? 'Vẽ hình thay thế; nhấp đúp để kết thúc.' : 'Nhấp để vẽ; đường và vùng kết thúc bằng nhấp đúp. Có thể bắt dính vào dữ liệu đã tải.');
    if (!replace) loadSnapFeatures(snapSource, currentLayerConfig, drawInteraction);
    drawInteraction.once('drawend', event => {
      stopDrawInteraction();
      if (replace) selectedFeature.setGeometry(event.feature.getGeometry().clone());
      else selectedFeature = event.feature;
      geometryChanged = true;
      sketchSource.clear();
      sketchSource.addFeature(selectedFeature);
      renderPropertyForm();
      setStatus('Kiểm tra thuộc tính rồi lưu thay đổi.');
    });
  }

  async function loadSnapFeatures(source, config, interaction) {
    const rawUrl = getAttributeUrl(config);
    if (!rawUrl) return;
    const url = new URL(rawUrl);
    url.searchParams.set('maxFeatures', '5000');
    url.searchParams.set('srsName', 'EPSG:4326');
    const controller = new AbortController();
    snapRequest = controller;
    try {
      const data = await requestJson(url, { signal: controller.signal });
      if (drawInteraction !== interaction || controller.signal.aborted) return;
      const features = geojsonFormat.readFeatures(data, {
        dataProjection: geojsonFormat.readProjection(data) || 'EPSG:4326',
        featureProjection: map.getView().getProjection()
      });
      source.clear();
      source.addFeatures(features);
      setStatus(`Vẽ đối tượng mới; nhấp đúp để kết thúc đường/vùng. Bắt dính vào ${features.length} đối tượng trong lớp.`);
    } catch (error) {
      if (error.name !== 'AbortError' && drawInteraction === interaction) {
        setStatus('Không tải được dữ liệu bắt dính. Bạn vẫn có thể tiếp tục vẽ.', true);
      }
    }
  }

  function startGeometryEditing() {
    stopDrawInteraction();
    hideOriginalFromWms();
    clearAttributeHighlight();
    renderPropertyForm();
    modifyInteraction = new Modify({ source: sketchSource, pixelTolerance: 16 });
    map.addInteraction(modifyInteraction);
    if (currentLayerConfig.geometryType !== 'Point') {
      snapInteraction = new Snap({ source: sketchSource, pixelTolerance: 16 });
      map.addInteraction(snapInteraction);
      actions.appendChild(button('Vẽ hình thay thế', () => startAdd(true)));
    }
    modifyInteraction.on('modifyend', () => {
      geometryChanged = true;
      setStatus('Đã chỉnh hình học. Có thể tiếp tục kéo hoặc lưu thay đổi.');
    });
    sketchLayer.changed();
    map.getTargetElement().style.cursor = 'move';
    setStatus(currentLayerConfig.geometryType === 'Point'
      ? 'Kéo nút cyan để di chuyển điểm rồi lưu.' : 'Kéo đỉnh/cạnh để sửa hình học; giữ Alt và nhấp đỉnh để bỏ đỉnh.');
  }

  function chooseFeature(feature) {
    selectionRequest?.abort();
    selectionRequest = null;
    map.getTargetElement().style.cursor = '';
    // Chỉnh trên bản sao để Hủy luôn giữ nguyên dữ liệu gốc và bảng thuộc tính.
    selectedFeature = feature.clone();
    selectedFeature.setId(feature.getId());
    isSelecting = false;
    sketchSource.clear();
    sketchSource.addFeature(selectedFeature);
    workspace.replaceChildren();
    actions.replaceChildren();
    if (currentAction === 'delete') {
      setStatus('Đã chọn đối tượng. Kiểm tra hình được tô sáng trước khi xác nhận xóa.');
      actions.append(button('Xác nhận xóa', saveFeature, true), button('Hủy', resetCrudState));
    } else {
      setStatus('Chọn cách sửa đối tượng.');
      actions.append(button('Sửa thuộc tính', () => {
        renderPropertyForm();
        setStatus('Sửa thuộc tính rồi lưu thay đổi.');
      }), button(currentLayerConfig.geometryType === 'Point' ? 'Di chuyển điểm' : 'Sửa hình học', startGeometryEditing), button('Hủy', resetCrudState));
    }
  }

  async function selectFeatureFromMap(coordinate) {
    const config = currentLayerConfig;
    if (!config || !isLayerVisible(config)) return;
    selectionRequest?.abort();
    const controller = new AbortController();
    selectionRequest = controller;
    setStatus('Đang tìm đối tượng tại vị trí đã chọn…');
    try {
      const view = map.getView();
      const url = config.wmsLayer.getSource().getFeatureInfoUrl(coordinate, view.getResolution(), view.getProjection(), {
        INFO_FORMAT: 'application/json', FEATURE_COUNT: 20, BUFFER: 8
      });
      if (!url) throw new Error('Không tạo được yêu cầu GetFeatureInfo');
      const data = await requestJson(url, { signal: controller.signal }, fetchWms);
      if (selectionRequest !== controller) return;
      const crs = data.crs?.properties?.name;
      const epsg = String(crs || '').match(/EPSG(?::|::)(\d+)$/i);
      const features = geojsonFormat.readFeatures(data, {
        dataProjection: epsg ? `EPSG:${epsg[1]}` : view.getProjection(),
        featureProjection: view.getProjection()
      }).filter(feature => feature.getGeometry() && !isMissingId(getFeatureId(feature, config)));
      workspace.replaceChildren();
      if (!features.length) {
        setStatus('Không tìm thấy đối tượng. Hãy nhấp vị trí khác.', true);
        return;
      }
      features.forEach(feature => {
        const name = (config.editFields || []).map(field => feature.get(field.name)).find(value => !isMissingId(value));
        workspace.appendChild(button(`${name || config.title} (#${getFeatureId(feature, config)})`, () => chooseFeature(feature)));
      });
      setStatus(`Tìm thấy ${features.length} đối tượng. Chọn đối tượng trong danh sách hoặc nhấp vị trí khác.`);
    } catch (error) {
      if (error.name !== 'AbortError') setStatus(`Không đọc được đối tượng: ${error.message}`, true);
    }
  }

  function handleMapClick(event) {
    if (!currentAction) return false;
    if (isSelecting && !isSaving) selectFeatureFromMap(event.coordinate);
    return true;
  }

  function refreshAfterCrud(config) {
    const source = config.wfsLayer.getSource();
    source.clear(true);
    source.refresh();
    config.wmsLayer?.getSource()?.updateParams({ _reload: Date.now() });
    onDataChanged(config);
    reloadAttributeTableAfterCrud(config);
  }

  async function saveFeature() {
    if (isSaving || !selectedFeature || !currentLayerConfig) return;
    const config = currentLayerConfig;
    if (!isLayerVisible(config)) { setStatus('Lớp đang thao tác đã tắt.', true); return; }
    const form = workspace.querySelector('form');
    if (form && !form.reportValidity()) return;
    const id = getFeatureId(selectedFeature, config);
    if (currentAction !== 'add' && isMissingId(id)) { setStatus('Không xác định được mã đối tượng.', true); return; }
    if (currentAction === 'delete' && !confirm('Bạn có chắc chắn muốn xóa đối tượng đã chọn?')) return;
    const properties = {};
    form?.querySelectorAll('input').forEach(input => { properties[input.name] = input.value; });
    const payload = { type: 'Feature', properties };
    // Sửa thuộc tính không gửi geometry từ GetFeatureInfo về PostGIS.
    if (currentAction === 'add' || geometryChanged) {
      payload.geometry = geojsonFormat.writeFeatureObject(selectedFeature, {
        featureProjection: map.getView().getProjection(), dataProjection: 'EPSG:4326'
      }).geometry;
    }
    const action = currentAction;
    const suffix = action === 'add' ? 'add/' : `${encodeURIComponent(id)}/${action}/`;
    stopDrawInteraction();
    isSaving = true;
    panel.classList.add('is-busy');
    panel.setAttribute('aria-busy', 'true');
    panel.querySelectorAll('button, input, select').forEach(element => { element.disabled = true; });
    setStatus('Đang lưu thay đổi…');
    try {
      await requestJson(getBackendUrl(config, suffix), {
        method: { add: 'POST', edit: 'PUT', delete: 'DELETE' }[action],
        ...(action === 'delete' ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      });
      restoreWms();
      window.dispatchEvent(new CustomEvent('webgis-data-saved', { detail: { action, layerTitle: config.title } }));
      isSaving = false;
      resetCrudState();
      refreshAfterCrud(config);
    } catch (error) {
      setStatus(`Không lưu được: ${error.message}. Bạn có thể thử lưu lại hoặc hủy.`, true);
    } finally {
      isSaving = false;
      panel.classList.remove('is-busy');
      panel.setAttribute('aria-busy', 'false');
      panel.querySelectorAll('button, input, select').forEach(element => { element.disabled = false; });
    }
  }

  function renderAttributeLayerOptions() {
    attributeLayerSelect.innerHTML = '';

    attributeLayerConfigs.forEach(function (config) {
      const option = document.createElement('option');
      option.value = config.id;
      option.innerText = config.title;
      attributeLayerSelect.appendChild(option);
    });

    if (!attributeLayerConfigs.length) {
      const option = document.createElement('option');
      option.value = '';
      option.innerText = 'Không có lớp WFS';
      attributeLayerSelect.appendChild(option);
    }
  }

  function getCurrentAttributeConfig() {
    return attributeLayerConfigs.find(
      config => config.id === attributeLayerSelect.value
    ) || null;
  }

  function updateAttributeAddButton(active) {
    attributeAddMode = active;
    tableAddBtn.classList.toggle('active', active);
    tableAddBtn.innerText = active ? '⛔ Hủy thêm' : '➕ Thêm';
    tableAddBtn.title = active
      ? 'Tắt chức năng thêm đối tượng'
      : 'Thêm đối tượng mới';
  }

  function openAttributeTable() {
    attributeRequestVersion++;
    attributeCache = [];
    attributeKeyword = '';
    if (attributeFilter) attributeFilter.value = '';
    setAttributeStatus('Chọn lớp rồi tải bảng thuộc tính.');
    attributeTable?.clearData();
    renderAttributeLayerOptions();
    tableAddBtn.disabled = !getCurrentAttributeConfig()?.editable;
    attributeTablePanel.classList.add('active');
  }

  function closeAttributeTable() {
    attributeRequestVersion++;
    attributeCache = [];
    attributeTablePanel.classList.remove('active');
    clearAttributeHighlight();

    if (attributeTable) attributeTable.clearData();
    if (!isSaving) resetCrudState();
  }

  function clearAttributeHighlight() {
    if (!attributeHighlightLayer) return;
    map.removeLayer(attributeHighlightLayer);
    attributeHighlightLayer = null;
  }

  function getAttributeUrl(config) {
    const rawUrl = config.wfsLayer?.getSource()?.getUrl?.();
    if (typeof rawUrl !== 'string') return null;

    const url = new URL(rawUrl, window.location.href);
    url.searchParams.set('maxFeatures', '50000');
    url.searchParams.set('outputFormat', 'application/json');
    url.searchParams.set('_reload', Date.now());
    return url.toString();
  }

  function getFeatureFromAttributeRow(rowData) {
    const rawFeature = attributeCache[rowData.__index];
    if (!rawFeature) return null;

    const feature = geojsonFormat.readFeature(rawFeature, {
      featureProjection: map.getView().getProjection(),
      dataProjection: 'EPSG:4326'
    });

    if (rawFeature.id) feature.setId(rawFeature.id);
    return feature;
  }

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
      source: new VectorSource({ features: [feature] }),
      style: new Style({
        fill: new Fill({ color: 'rgba(255, 0, 0, 0.25)' }),
        stroke: new Stroke({ color: 'red', width: 3 }),
        image: new CircleStyle({
          radius: 8,
          fill: new Fill({ color: 'red' }),
          stroke: new Stroke({ color: 'white', width: 2 })
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

  function editAttributeRow(rowData) {
    openFromTable('edit', rowData);
  }

  function deleteAttributeRow(rowData) {
    openFromTable('delete', rowData);
  }

  function openFromTable(action, rowData) {
    if (isSaving) return;
    const config = getCurrentAttributeConfig();
    const feature = getFeatureFromAttributeRow(rowData);
    if (!config?.editable || !feature) return;
    if (!isLayerVisible(config)) {
      alert('Hãy bật lớp dữ liệu trước khi thao tác.');
      return;
    }
    openChooseLayerPopup(action, config);
    zoomToAttributeFeature(rowData);
    chooseFeature(feature);
  }

  function addAttributeRow() {
    if (isSaving) return;
    if (currentAction === 'add' && attributeAddMode) {
      resetCrudState();
      return;
    }
    const config = getCurrentAttributeConfig();
    if (!config?.editable) {
      alert('Lớp này chưa được cấu hình để thêm / sửa / xóa');
      return;
    }
    if (!isLayerVisible(config)) {
      alert('Hãy bật lớp dữ liệu trước khi thao tác.');
      return;
    }
    openChooseLayerPopup('add', config);
    updateAttributeAddButton(true);
    startAdd();
  }

  function getAttributeFields(features) {
    return Object.keys(features[0]?.properties || {}).map(function (name) {
      return {
        name,
        label: name.toUpperCase()
      };
    });
  }

  function createAttributeColumns(config, features) {
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
            <button class="table-row-btn view" data-row-action="view" title="Xem đối tượng">Xem</button>
            <button ${config.editable ? '' : 'disabled'} class="table-row-btn edit" data-row-action="edit" title="Sửa đối tượng">Sửa</button>
            <button ${config.editable ? '' : 'disabled'} class="table-row-btn delete" data-row-action="delete" title="Xóa đối tượng">Xóa</button>
          </div>
        `;
      },
      cellClick: function (event, cell) {
        const button = event.target.closest('[data-row-action]');
        if (!button) return;

        event.stopPropagation();
        const rowData = cell.getRow().getData();

        if (button.dataset.rowAction === 'view') zoomToAttributeFeature(rowData);
        if (button.dataset.rowAction === 'edit') editAttributeRow(rowData);
        if (button.dataset.rowAction === 'delete') deleteAttributeRow(rowData);
      }
    };

    const columns = getAttributeFields(features).map(function (field) {
      return {
        title: field.label,
        field: field.name,
        headerFilter: 'input',
        minWidth: 120
      };
    });

    return [actionColumn, ...columns];
  }

  async function loadAttributeTable() {
    const config = getCurrentAttributeConfig();

    if (!config) {
      alert('Chưa có lớp WFS để tải dữ liệu');
      return;
    }

    const attributeUrl = getAttributeUrl(config);

    if (!attributeUrl) {
      alert('Không lấy được URL WFS của lớp');
      return;
    }

    const requestVersion = ++attributeRequestVersion;
    loadAttributeBtn.disabled = true;
    loadAttributeBtn.innerText = 'Đang tải...';
    setAttributeStatus('Đang tải bảng thuộc tính…');

    try {
      const response = await fetch(attributeUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      if (requestVersion !== attributeRequestVersion) return;
      const features = data.features || [];
      attributeCache = features;

      if (!features.length) {
        setAttributeStatus('Lớp này không có dữ liệu.');
        if (attributeTable) attributeTable.clearData();
        config.wfsLayer.getSource().clear(true);
        return;
      }

      const rows = features.map(function (feature, index) {
        return { ...feature.properties, __index: index };
      });

      if (attributeTable) attributeTable.destroy();

      attributeTable = new Tabulator('#tabulator-table', {
        data: rows,
        columns: createAttributeColumns(config, features),
        layout: 'fitDataStretch',
        pagination: 'local',
        paginationSize: 10,
        height: '100%',
        selectable: 1,
        placeholder: 'Không có dữ liệu',
        rowClick: function (event, row) {
          row.select();
        },
        rowDblClick: function (event, row) {
          zoomToAttributeFeature(row.getData());
        }
      });
      attributeTable.on('tableBuilt', applyAttributeFilter);
      setAttributeStatus(`Đã tải ${features.length} đối tượng. Dùng Xem, Sửa hoặc Xóa trên từng dòng.`);

      const mapFeatures = geojsonFormat.readFeatures(data, {
        featureProjection: map.getView().getProjection(),
        dataProjection: 'EPSG:4326'
      });

      config.wfsLayer.getSource().clear(true);
      config.wfsLayer.getSource().addFeatures(mapFeatures);
    } catch (error) {
      if (requestVersion !== attributeRequestVersion) return;
      console.error('Lỗi tải bảng thuộc tính:', error);
      setAttributeStatus(`Không tải được dữ liệu từ GeoServer: ${error.message}`);
    } finally {
      loadAttributeBtn.disabled = false;
      loadAttributeBtn.innerText = 'Tải dữ liệu';
    }
  }

  function reloadAttributeTableAfterCrud(config) {
    if (!attributeTablePanel.classList.contains('active')) return;
    if (attributeTablePanel.dataset.dataType === 'raster') return;
    if (getCurrentAttributeConfig()?.wfsLayer !== config?.wfsLayer) return;
    setTimeout(loadAttributeTable, 300);
  }

  layerSelect.addEventListener('change', () => {
    if (isSaving) return;
    currentLayerConfig = editableLayers.find(config => config.id === layerSelect.value) || null;
    renderStart();
  });
  closeButton.addEventListener('click', resetCrudState);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') resetCrudState();
  });
  document.querySelectorAll('[data-tool-action]').forEach(element => {
    element.addEventListener('click', resetCrudState);
  });
  // Theo dõi cả nhóm cha để hủy bản nháp khi lớp đang biên tập bị tắt.
  function watchVisibility(collection) {
    collection.forEach(layer => {
      layer.on('change:visible', () => {
        if (!currentAction || isSaving) return;
        const previousId = currentLayerConfig?.id;
        const stillVisible = currentLayerConfig && isLayerVisible(currentLayerConfig);
        renderLayerOptions(previousId);
        if (!stillVisible) renderStart();
      });
      if (layer.getLayers) watchVisibility(layer.getLayers());
    });
  }
  watchVisibility(map.getLayers());
  loadAttributeBtn.addEventListener('click', loadAttributeTable);
  closeAttributeTableBtn.addEventListener('click', closeAttributeTable);
  tableAddBtn.addEventListener('click', addAttributeRow);
  attributeLayerSelect.addEventListener('change', () => {
    if (!isSaving) resetCrudState();
    attributeRequestVersion++;
    attributeCache = [];
    tableAddBtn.disabled = !getCurrentAttributeConfig()?.editable;
    attributeTable?.clearData();
    attributeKeyword = '';
    if (attributeFilter) attributeFilter.value = '';
    setAttributeStatus('Chọn “Tải dữ liệu” để xem lớp mới.');
  });
  document.querySelectorAll('[data-menu-action]').forEach(element => {
    element.addEventListener('click', () => {
      const action = element.dataset.menuAction;
      if (action === 'add-data') openChooseLayerPopup('add');
      else if (action === 'edit-data') openChooseLayerPopup('edit');
      else if (action === 'delete-data') openChooseLayerPopup('delete');
      else if (action === 'attribute-table') openAttributeTable();
      else return;
      closeMenu();
    });
  });
  return {
    handleMapClick, openChooseLayerPopup, openAttributeTable, closeAttributeTable,
    setAttributeDataType(type) {
      attributeTablePanel.dataset.dataType = type;
      if (type === 'raster') { attributeRequestVersion++; clearAttributeHighlight(); }
      else attributeTable?.redraw(true);
    },
    cancel: resetCrudState, getCurrentAction: () => currentAction
  };
}
