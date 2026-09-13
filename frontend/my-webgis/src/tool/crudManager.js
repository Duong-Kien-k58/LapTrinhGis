import { TabulatorFull as Tabulator } from 'tabulator-tables';
import 'tabulator-tables/dist/css/tabulator.min.css';
import Draw from 'ol/interaction/Draw.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import { Style, Fill, Stroke, Circle as CircleStyle } from 'ol/style.js';
import { GEOSERVER_CONFIG, DEFAULT_ID_FIELDS } from '../config/layers.js';
import { getConfiguredValue, getRequiredElement } from './toolUtils.js';


export function createCrudManager({
  map,
  layerConfigs,
  closeMenu = function () {},
  highlightFeature = function () {},
  cleanHighlight = function () {},
  onDataChanged = function () {}
}) {
  const editableLayers = layerConfigs.filter(
    config => config.editable && config.wfsLayer
  );

  const geojsonFormat = new GeoJSON();

  let currentAction = null;
  let currentLayerConfig = null;
  let drawInteraction = null;
  let newFeature = null;
  let editingFeature = null;
  let deletingFeature = null;

  let attributeTable = null;
  let attributeCache = [];
  let attributeHighlightLayer = null;
  let attributeAddMode = false;

  const chooseLayerPopup = getRequiredElement('choose-layer-popup');
  const chooseLayerTitle = getRequiredElement('choose-layer-title');
  const chooseLayerSelect = getRequiredElement('choose-layer-select');
  const chooseLayerCancel = getRequiredElement('choose-layer-cancel');
  const chooseLayerOk = getRequiredElement('choose-layer-ok');

  const attributePopup = getRequiredElement('attribute-popup');
  const attributeForm = getRequiredElement('attribute-form');
  const attributeCancel = getRequiredElement('attribute-cancel');
  const attributeSave = getRequiredElement('attribute-save');

  const attributeTablePanel = getRequiredElement('attribute-table-panel');
  const attributeLayerSelect = getRequiredElement('attribute-layer-select');
  const loadAttributeBtn = getRequiredElement('load-attribute-btn');
  const closeAttributeTableBtn = getRequiredElement('close-attribute-table');
  const tableAddBtn = getRequiredElement('table-btn-add');

  const attributeLayerConfigs = layerConfigs.filter(
    config => config.attributeTable && config.wfsLayer
  );

  function isMissingId(value) {
    return value === null || value === undefined || value === '';
  }

  async function requestJson(url, options = {}) {
    const response = await fetch(url, options);
    const text = await response.text();
    let data = {};

    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { message: text };
      }
    }

    if (!response.ok || data.success === false) {
      throw new Error(
        data.message || `Backend trả về lỗi HTTP ${response.status}`
      );
    }

    return data;
  }

  function getBackendUrl(config, suffix) {
    const baseUrl = GEOSERVER_CONFIG.backendUrl.replace(/\/+$/, '');
    const apiName = encodeURIComponent(config.apiName || config.id);
    return `${baseUrl}/${apiName}/${suffix}`;
  }

  function addFeatureToBackend(config, geojson) {
    return requestJson(getBackendUrl(config, 'add/'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geojson)
    });
  }

  function editFeatureOnBackend(config, featureId, geojson) {
    const suffix = `${encodeURIComponent(featureId)}/edit/`;
    return requestJson(getBackendUrl(config, suffix), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geojson)
    });
  }

  function deleteFeatureFromBackend(config, featureId) {
    const suffix = `${encodeURIComponent(featureId)}/delete/`;
    return requestJson(getBackendUrl(config, suffix), {
      method: 'DELETE'
    });
  }

  function featureToGeoJSON(feature) {
    return geojsonFormat.writeFeatureObject(feature, {
      featureProjection: map.getView().getProjection(),
      dataProjection: 'EPSG:4326'
    });
  }

  function getFeatureId(feature, config) {
    const value = getConfiguredValue(
      feature,
      config.idFields || DEFAULT_ID_FIELDS,
      null
    );

    if (!isMissingId(value)) return value;

    const featureId = feature.getId();
    if (isMissingId(featureId)) return null;

    const parts = String(featureId).split('.');
    return parts.length === 2 ? parts[1] : featureId;
  }

  function findFeatureInCurrentLayer(coordinate) {
    if (!currentLayerConfig?.wfsLayer) return null; // Chưa chọn WFS.
    const source = currentLayerConfig.wfsLayer.getSource(); // Lấy source WFS.
    const features = source.getFeaturesAtCoordinate(coordinate); // Tìm feature tại tọa độ click.
    return features[0] || null; // Lấy đối tượng đầu tiên.
  }

  function stopDrawInteraction() {
    if (!drawInteraction) return;
    map.removeInteraction(drawInteraction);
    drawInteraction = null;
  }

  function resetCrudState() {
    currentAction = null;
    currentLayerConfig = null;
    newFeature = null;
    editingFeature = null;
    deletingFeature = null;
    stopDrawInteraction();
    map.getTargetElement().style.cursor = '';
    updateAttributeAddButton(false);
  }

  function refreshLayer(config) {
    const source = config?.wfsLayer?.getSource();
    if (!source) return;
    source.clear(true);
    source.refresh();
  }

  function refreshAllMapLayers() {
    layerConfigs.forEach(function (config) {
      const wfsSource = config.wfsLayer?.getSource();
      if (wfsSource) {
        wfsSource.clear(true);
        wfsSource.refresh();
      }

      const wmsSource = config.wmsLayer?.getSource();
      if (wmsSource?.updateParams) {
        wmsSource.updateParams({ _reload: Date.now() });
      }
    });
  }

  function refreshAfterCrud(config) {
    refreshAllMapLayers(); // Làm mới dữ liệu bản đồ.
    onDataChanged(config); // Làm mới Search.
    reloadAttributeTableAfterCrud(config); // Làm mới bảng thuộc tính.
  }

  function openChooseLayerPopup(action) {
    currentAction = action;

    const titles = {
      add: 'Chọn lớp để thêm đối tượng',
      edit: 'Chọn lớp để sửa đối tượng',
      delete: 'Chọn lớp để xóa đối tượng'
    };

    chooseLayerTitle.innerText = titles[action] || 'Chọn lớp dữ liệu';
    chooseLayerSelect.innerHTML = '';

    editableLayers.forEach(function (config) {
      const option = document.createElement('option');
      option.value = config.id;
      option.innerText = `${config.title} - ${config.geometryType}`;
      chooseLayerSelect.appendChild(option);
    });

    chooseLayerPopup.classList.add('active');
  }

  function closeChooseLayerPopup() {
    chooseLayerPopup.classList.remove('active');
  }

  function createInputField(field, value = '') {
    const label = document.createElement('label');
    label.innerText = field.label;

    const input = document.createElement('input');
    input.type = field.type || 'text';
    input.name = field.name;
    input.value = value ?? '';

    attributeForm.append(label, input);
  }

  function openAddAttributePopup() {
    if (!currentLayerConfig) {
      alert('Chưa chọn lớp dữ liệu');
      return;
    }

    attributeForm.innerHTML = '';
    (currentLayerConfig.editFields || []).forEach(createInputField);
    attributePopup.classList.add('active');
  }

  function openEditAttributePopup() {
    if (!currentLayerConfig || !editingFeature) {
      alert('Chưa chọn đối tượng để sửa');
      return;
    }

    attributeForm.innerHTML = '';
    (currentLayerConfig.editFields || []).forEach(function (field) {
      createInputField(field, editingFeature.get(field.name));
    });
    attributePopup.classList.add('active');
  }

  function closeAttributePopup() {
    attributePopup.classList.remove('active');
  }

  function startAdd() {
    if (!currentLayerConfig) {
      alert('Bạn chưa chọn lớp');
      return;
    }

    stopDrawInteraction();
    alert('Bây giờ hãy vẽ đối tượng trên bản đồ');

    drawInteraction = new Draw({
      source: currentLayerConfig.wfsLayer.getSource(),
      type: currentLayerConfig.geometryType
    });

    map.addInteraction(drawInteraction);

    drawInteraction.on('drawend', function (event) {
      newFeature = event.feature;
      stopDrawInteraction();
      openAddAttributePopup();
    });
  }

  function cancelAdd() {
    if (newFeature && currentLayerConfig?.wfsLayer) {
      currentLayerConfig.wfsLayer.getSource().removeFeature(newFeature);
    }
    resetCrudState();
  }

  function startEdit() {
    if (!currentLayerConfig) {
      alert('Bạn chưa chọn lớp');
      return;
    }
    alert('Hãy click vào đối tượng cần sửa trên bản đồ');
  }

  function handleEditClick(event) {
    const feature = findFeatureInCurrentLayer(event.coordinate);

    if (!feature) {
      alert('Không tìm thấy đối tượng thuộc lớp đã chọn');
      return;
    }

    editingFeature = feature;
    highlightFeature(feature);
    openEditAttributePopup();
  }

  function cancelEdit() {
    editingFeature = null;
    cleanHighlight();
    resetCrudState();
  }

  function startDelete() {
    if (!currentLayerConfig) {
      alert('Bạn chưa chọn lớp');
      return;
    }
    alert('Hãy click vào đối tượng cần xóa trên bản đồ');
  }

  async function saveAddAttributes(inputs) {
    if (!newFeature || !currentLayerConfig) {
      alert('Chưa có đối tượng mới để lưu');
      return;
    }

    const feature = newFeature;
    const config = currentLayerConfig;

    inputs.forEach(input => feature.set(input.name, input.value));

    try {
      await addFeatureToBackend(config, featureToGeoJSON(feature));
      alert('Đã lưu đối tượng vào database');
      closeAttributePopup();
      cleanHighlight();
      clearAttributeHighlight();
      refreshAfterCrud(config);
      resetCrudState();
    } catch (error) {
      console.error('Lỗi thêm đối tượng:', error);
      config.wfsLayer.getSource().removeFeature(feature);
      closeAttributePopup();
      cleanHighlight();
      clearAttributeHighlight();
      resetCrudState();
      alert('Lỗi thêm dữ liệu: ' + error.message);
    }
  }

  async function saveEditAttributes(inputs) {
    if (!editingFeature || !currentLayerConfig) {
      alert('Chưa chọn đối tượng để sửa');
      return;
    }

    const feature = editingFeature;
    const config = currentLayerConfig;
    const oldValues = {};

    inputs.forEach(function (input) {
      oldValues[input.name] = feature.get(input.name);
      feature.set(input.name, input.value);
    });

    const featureId = getFeatureId(feature, config);

    if (isMissingId(featureId)) {
      restoreFeatureValues(feature, oldValues);
      alert('Không tìm thấy ID đối tượng để sửa');
      return;
    }

    try {
      await editFeatureOnBackend(
        config,
        featureId,
        featureToGeoJSON(feature)
      );

      alert('Đã sửa dữ liệu trong database');
      closeAttributePopup();
      cleanHighlight();
      clearAttributeHighlight();
      refreshAfterCrud(config);
      resetCrudState();
    } catch (error) {
      console.error('Lỗi sửa đối tượng:', error);
      restoreFeatureValues(feature, oldValues);
      refreshLayer(config);
      closeAttributePopup();
      cleanHighlight();
      clearAttributeHighlight();
      resetCrudState();
      alert('Lỗi sửa dữ liệu: ' + error.message);
    }
  }

  function restoreFeatureValues(feature, values) {
    Object.entries(values).forEach(function ([field, value]) {
      feature.set(field, value);
    });
  }

  async function deleteFeatureWithConfirm(feature) {
    if (!feature || !currentLayerConfig) {
      alert('Chưa chọn đối tượng để xóa');
      return;
    }

    deletingFeature = feature;
    highlightFeature(feature);

    if (!confirm('Bạn có chắc chắn muốn xóa đối tượng này không?')) {
      cleanHighlight();
      clearAttributeHighlight();
      deletingFeature = null;
      return;
    }

    const config = currentLayerConfig;
    const featureId = getFeatureId(feature, config);
    
    if (isMissingId(featureId)) {
      alert('Không tìm thấy ID đối tượng để xóa');
      cleanHighlight();
      clearAttributeHighlight();
      deletingFeature = null;
      return;
    }

    try {
      await deleteFeatureFromBackend(config, featureId);
      alert('Đã xóa dữ liệu trong database');
      cleanHighlight();
      clearAttributeHighlight();
      refreshAfterCrud(config);
      resetCrudState();
    } catch (error) {
      console.error('Lỗi xóa đối tượng:', error);
      cleanHighlight();
      clearAttributeHighlight();
      resetCrudState();
      alert('Lỗi xóa dữ liệu: ' + error.message);
    }
  }

  function handleDeleteClick(event) {
    const feature = findFeatureInCurrentLayer(event.coordinate);

    if (!feature) {
      alert('Không tìm thấy đối tượng thuộc lớp đã chọn');
      return;
    }

    deleteFeatureWithConfirm(feature);
  }

  function handleMapClick(event) {
    if (drawInteraction || currentAction === 'add') return true;

    if (currentAction === 'edit') {
      handleEditClick(event);
      return true;
    }

    if (currentAction === 'delete') {
      handleDeleteClick(event);
      return true;
    }

    return false;
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

  function setCrudLayerFromAttributeTable() {
    const config = getCurrentAttributeConfig();

    if (!config?.editable) {
      alert('Lớp này chưa được cấu hình để thêm / sửa / xóa');
      return null;
    }

    currentLayerConfig = config;
    return config;
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
    renderAttributeLayerOptions();
    attributeTablePanel.classList.add('active');
  }

  function closeAttributeTable() {
    attributeTablePanel.classList.remove('active');
    clearAttributeHighlight();

    if (attributeTable) attributeTable.clearData();
    if (currentAction === 'add') cancelAdd();
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
    const config = setCrudLayerFromAttributeTable();
    const feature = getFeatureFromAttributeRow(rowData);

    if (!config || !feature) {
      if (!feature) alert('Không tìm thấy đối tượng để sửa');
      return;
    }

    currentAction = 'edit';
    editingFeature = feature;
    zoomToAttributeFeature(rowData);
    highlightFeature(feature);
    openEditAttributePopup();
  }

  function deleteAttributeRow(rowData) {
    const config = setCrudLayerFromAttributeTable();
    const feature = getFeatureFromAttributeRow(rowData);

    if (!config || !feature) {
      if (!feature) alert('Không tìm thấy đối tượng để xóa');
      return;
    }

    currentAction = 'delete';
    deletingFeature = feature;
    zoomToAttributeFeature(rowData);
    highlightFeature(feature);
    deleteFeatureWithConfirm(feature);
  }

  function addAttributeRow() {
    if (currentAction === 'add' && attributeAddMode) {
      cancelAdd();
      closeAttributePopup();
      clearAttributeHighlight();
      cleanHighlight();
      return;
    }

    const config = setCrudLayerFromAttributeTable();
    if (!config) return;

    cleanHighlight();
    clearAttributeHighlight();
    stopDrawInteraction();
    currentAction = 'add';
    newFeature = null;
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
            <button class="table-row-btn edit" data-row-action="edit" title="Sửa đối tượng">Sửa</button>
            <button class="table-row-btn delete" data-row-action="delete" title="Xóa đối tượng">Xóa</button>
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

    loadAttributeBtn.disabled = true;
    loadAttributeBtn.innerText = 'Đang tải...';

    try {
      const response = await fetch(attributeUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      const features = data.features || [];
      attributeCache = features;

      if (!features.length) {
        alert('Lớp này không có dữ liệu');
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

      const mapFeatures = geojsonFormat.readFeatures(data, {
        featureProjection: map.getView().getProjection(),
        dataProjection: 'EPSG:4326'
      });

      config.wfsLayer.getSource().clear(true);
      config.wfsLayer.getSource().addFeatures(mapFeatures);
    } catch (error) {
      console.error('Lỗi tải bảng thuộc tính:', error);
      alert('Không tải được dữ liệu từ GeoServer');
    } finally {
      loadAttributeBtn.disabled = false;
      loadAttributeBtn.innerText = 'Tải dữ liệu';
    }
  }

  function reloadAttributeTableAfterCrud(config) {
    if (!attributeTablePanel.classList.contains('active')) return;
    if (getCurrentAttributeConfig()?.wfsLayer !== config?.wfsLayer) return;
    setTimeout(loadAttributeTable, 300);
  }

  function bindEvents() {
    chooseLayerCancel.addEventListener('click', closeChooseLayerPopup);

    chooseLayerOk.addEventListener('click', function () {
      currentLayerConfig = editableLayers.find(
        config => config.id === chooseLayerSelect.value
      ) || null;

      closeChooseLayerPopup();

      if (!currentLayerConfig) {
        alert('Không tìm thấy cấu hình lớp');
        resetCrudState();
        return;
      }

      if (currentAction === 'add') startAdd();
      if (currentAction === 'edit') startEdit();
      if (currentAction === 'delete') startDelete();
    });

    attributeSave.addEventListener('click', function () {
      const inputs = attributeForm.querySelectorAll('input');
      if (currentAction === 'add') saveAddAttributes(inputs);
      else if (currentAction === 'edit') saveEditAttributes(inputs);
      else alert('Chưa chọn thao tác thêm hoặc sửa');
    });

    attributeCancel.addEventListener('click', function () {
      if (currentAction === 'add') cancelAdd();
      else if (currentAction === 'edit') cancelEdit();
      closeAttributePopup();
    });

    loadAttributeBtn.addEventListener('click', loadAttributeTable);
    closeAttributeTableBtn.addEventListener('click', closeAttributeTable);
    tableAddBtn.addEventListener('click', addAttributeRow);

    attributeLayerSelect.addEventListener('change', function () {
      clearAttributeHighlight();
      cleanHighlight();
      attributeCache = [];
      if (attributeTable) attributeTable.clearData();
      if (currentAction === 'add') cancelAdd();
    });

    document.querySelectorAll('[data-menu-action]').forEach(function (button) {
      button.addEventListener('click', function () {
        const action = button.dataset.menuAction;
        let handled = true;

        if (action === 'add-data') openChooseLayerPopup('add');
        else if (action === 'edit-data') openChooseLayerPopup('edit');
        else if (action === 'delete-data') openChooseLayerPopup('delete');
        else if (action === 'attribute-table') openAttributeTable();
        else handled = false;

        if (handled) closeMenu();
      });
    });
  }

  bindEvents();

  return {
    handleMapClick,
    openChooseLayerPopup,
    openAttributeTable,
    closeAttributeTable,
    cancel: resetCrudState,
    getCurrentAction: () => currentAction
  };
}
