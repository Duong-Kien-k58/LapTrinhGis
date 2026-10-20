import WMSCapabilities from 'ol/format/WMSCapabilities.js';
import { get as getProjection, transformExtent } from 'ol/proj.js';
import { extend, createEmpty } from 'ol/extent.js';

const STORAGE_KEY = 'webgis_layer_catalog_v1';

function getSavedState() {
  try {
    const state = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return state && typeof state === 'object' && !Array.isArray(state) ? state : {};
  } catch {
    return {};
  }
}

function setSavedState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); // Lưu thứ tự vào trình duyệt
}

function moveCollectionToUiOrder(collection, uiOrder) {
  const nextOrder = [...uiOrder].reverse(); // UI trên->dưới, OpenLayers dưới->trên
  collection.clear();
  collection.extend(nextOrder);
}

function getUiOrder(collection) {
  return collection.getArray().slice().reverse(); // Lấy thứ tự giống TOC
}

function getLayerId(layer) {
  return layer.get('configId');
}

export function createLayerCatalogTool({
  map,
  baseGroup,
  thematicGroups,
  rasterGroup,
  wfsGroup,
  layerConfigs,
  rasterLayerMap
}) {
  const wrapper = document.querySelector('.map-wrapper');
  if (!wrapper) throw new Error('Không tìm thấy vùng chứa bản đồ');

  const groups = [...thematicGroups, rasterGroup]; // Các nhóm được phép kéo
  const groupById = new Map(groups.map(group => [group.get('tocGroupId'), group]));
  const configById = new Map(layerConfigs.map(config => [config.id, config]));
  const allGroups = [...groups, baseGroup].filter(Boolean);
  const defaultGroupOrder = getUiOrder(map.getLayers())
    .filter(layer => groups.includes(layer));
  const defaultLayerOrders = new Map(
    allGroups.map(group => [group, getUiOrder(group.getLayers())])
  );
  const defaultCollapsed = new Map(
    allGroups
      .map(group => [group, Boolean(group.get('tocCollapsed'))])
  );
  const defaultGroupVisibility = new Map(allGroups.map(group => [group, group.getVisible()]));
  const defaultLayerVisibility = new Map();
  const defaultGroupByLayer = new Map();

  function rememberLayer(layer, group) {
    if (defaultGroupByLayer.has(layer)) return;
    // Raster mới luôn trở về nhóm raster khi chọn Khôi phục.
    const home = layer.get('layerKind') === 'raster' || layer.get('rasterName') ? rasterGroup : group;
    defaultGroupByLayer.set(layer, home);
    defaultLayerVisibility.set(layer, layer.getVisible());
    const defaults = defaultLayerOrders.get(home);
    if (defaults && !defaults.includes(layer)) defaults.push(layer);
  }

  allGroups.forEach(group => {
    group.getLayers().forEach(layer => rememberLayer(layer, group));
    group.getLayers().on('add', event => rememberLayer(event.element, group));
  });

  function liveMovableLayers() {
    const layers = new Map();
    groups.forEach(group => group.getLayers().forEach(layer => {
      const id = getLayerId(layer) || layer;
      if (!layers.has(id)) layers.set(id, layer);
    }));
    return [...layers.values()];
  }

  function placeLayers(desiredByGroup) {
    // Xóa khỏi tất cả nhóm trước khi thêm để một lớp chỉ có một nhóm cha.
    groups.forEach(group => group.getLayers().clear());
    groups.forEach(group => {
      const layers = desiredByGroup.get(group) || [];
      group.getLayers().extend(layers.slice().reverse());
      layers.forEach(layer => setLayerGroup(layer, group));
    });
  }

  let selectedLayer = null;
  let zoomRequest = 0;
  const capabilitiesCache = new Map();
  let dragged = null; // Đối tượng đang được kéo

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'layer-catalog-button';
  button.title = 'Mục lục lớp bản đồ';
  button.setAttribute('aria-label', 'Mở mục lục lớp bản đồ');
  button.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 4.5h14a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18V6A1.5 1.5 0 0 1 5 4.5Z" />
      <path d="M7 8h10M7 12h10M7 16h6" />
    </svg>`;

  const panel = document.createElement('section');
  panel.className = 'layer-catalog-panel';
  panel.innerHTML = `
    <header class="layer-catalog-header">
      <span class="layer-catalog-heading">
        <span class="layer-catalog-heading-icon">▤</span>
        Mục lục bản đồ
      </span>
      <button type="button" class="layer-catalog-close" title="Đóng">×</button>
    </header>
    <div class="layer-catalog-toolbar">
      <span>Kéo thả layer hoặc nhóm để đổi thứ tự</span>
      <div class="layer-catalog-actions">
        <button type="button" class="layer-catalog-save">Lưu</button>
        <button type="button" class="layer-catalog-reset">Khôi phục</button>
      </div>
    </div>
    <div class="toc-zoom-status" role="status" hidden></div>
    <div class="layer-catalog-content"></div>
  `;

  wrapper.append(button, panel);

  const content = panel.querySelector('.layer-catalog-content');
  const closeButton = panel.querySelector('.layer-catalog-close');
  const saveButton = panel.querySelector('.layer-catalog-save');
  const resetButton = panel.querySelector('.layer-catalog-reset');
  const zoomStatus = panel.querySelector('.toc-zoom-status');

  function validExtent(extent) {
    return Array.isArray(extent) && extent.length === 4 && extent.every(Number.isFinite)
      && extent[0] <= extent[2] && extent[1] <= extent[3];
  }

  async function getLayerExtent(layer, refresh = false) {
    const projection = map.getView().getProjection();
    const metadata = layer.get('rasterMetadata');
    if (validExtent(metadata?.bbox) && getProjection(metadata.crs)) {
      const extent = transformExtent(metadata.bbox, metadata.crs, projection, 8);
      if (validExtent(extent)) return extent;
    }
    if (validExtent(layer.getExtent())) return layer.getExtent();
    const source = layer.getSource();
    if (isBaseLayer(layer)) return projection.getExtent();
    if (typeof source?.getExtent === 'function' && validExtent(source.getExtent())) return source.getExtent();

    // WMS cung cấp phạm vi WGS84 cả khi CRS gốc của raster chưa được đăng ký.
    const serviceUrl = source?.getUrls?.()?.[0] || source?.getUrl?.();
    const names = String(source?.getParams?.().LAYERS || '').split(',').filter(Boolean);
    if (!serviceUrl || !names.length) throw new Error('Lớp chưa có thông tin phạm vi.');
    const url = new URL(serviceUrl, window.location.href);
    url.search = '';
    url.searchParams.set('SERVICE', 'WMS');
    url.searchParams.set('REQUEST', 'GetCapabilities');
    url.searchParams.set('VERSION', '1.3.0');
    const key = url.href;
    if (!capabilitiesCache.has(key)) {
      const request = fetch(key, { signal: AbortSignal.timeout(15000) }).then(async response => {
        if (!response.ok) throw new Error('Không tải được phạm vi lớp từ GeoServer.');
        const capabilities = new WMSCapabilities().read(await response.text());
        if (!capabilities?.Capability?.Layer) throw new Error('GeoServer không trả về danh mục lớp hợp lệ.');
        return capabilities.Capability.Layer;
      }).catch(error => { capabilitiesCache.delete(key); throw error; });
      capabilitiesCache.set(key, request);
    }
    const root = await capabilitiesCache.get(key);
    const extent = createEmpty();
    const found = new Set();
    function visit(node) {
      const matched = names.filter(name => node.Name === name || (!name.includes(':') && node.Name?.split(':').at(-1) === name));
      if (matched.length && validExtent(node.EX_GeographicBoundingBox)) {
        extend(extent, transformExtent(node.EX_GeographicBoundingBox, 'EPSG:4326', projection, 8));
        matched.forEach(name => found.add(name));
      }
      (node.Layer || []).forEach(visit);
    }
    visit(root);
    // Raster vừa publish có thể chưa nằm trong danh mục đã tải trước đó.
    if (found.size !== names.length && !refresh) {
      capabilitiesCache.delete(key);
      return getLayerExtent(layer, true);
    }
    if (found.size !== names.length || !validExtent(extent)) throw new Error('Không tìm thấy phạm vi của lớp trên GeoServer.');
    return extent;
  }

  async function zoomToLayer(layer, group, eye) {
    const request = ++zoomRequest;
    eye.disabled = true;
    eye.setAttribute('aria-busy', 'true');
    zoomStatus.hidden = false;
    zoomStatus.textContent = `Đang lấy phạm vi ${layer.get('title')}…`;
    try {
      const extent = await getLayerExtent(layer);
      if (request !== zoomRequest) return;
      if (!validExtent(extent)) throw new Error('Phạm vi của lớp không hợp lệ.');
      if (isBaseLayer(layer)) baseGroup.getLayers().forEach(item => item.setVisible(item === layer));
      else layer.setVisible(true);
      group.setVisible(true);
      selectedLayer = layer;
      const width = map.getSize()?.[0] || 0;
      const panelWidth = panel.getBoundingClientRect().width;
      const compact = width < panelWidth + 200;
      if (compact) closePanel();
      map.getView().cancelAnimations();
      map.getView().fit(extent, { duration: 500, maxZoom: 17, padding: [40, compact ? 40 : panelWidth + 40, 40, 40] });
      zoomStatus.hidden = true;
      render();
    } catch (error) {
      if (request === zoomRequest) zoomStatus.textContent = error.message || 'Không thể zoom tới lớp. Hãy thử lại.';
    } finally {
      eye.disabled = false;
      eye.removeAttribute('aria-busy');
    }
  }

  function getConfigForLayer(layer) {
    return configById.get(getLayerId(layer)) || null;
  }

  function isBaseLayer(layer) {
    return layer.get('layerKind') === 'base';
  }

  function clearDropTargets() {
    document.querySelectorAll('.toc-drop-target').forEach(item => item.classList.remove('toc-drop-target')); // Xóa trạng thái kéo
  }

  function saveState() {
    const state = {
      groupOrder: getUiOrder(map.getLayers())
        .filter(layer => groups.includes(layer))
        .map(group => group.get('tocGroupId')),
      groups: {}, expanded: {},
      visibility: { groups: {}, layers: {} }
    };
    allGroups.forEach(group => {
      const id = group.get('tocGroupId');
      if (groups.includes(group)) state.groups[id] = getUiOrder(group.getLayers()).map(getLayerId).filter(Boolean);
      state.expanded[id] = !group.get('tocCollapsed');
      state.visibility.groups[id] = group.getVisible();
      group.getLayers().forEach(layer => {
        const layerId = getLayerId(layer);
        if (layerId) state.visibility.layers[layerId] = layer.getVisible();
      });
    });
    setSavedState(state);
  }

  function applyState() {
    const state = getSavedState();
    const orderedGroups = [];
    (Array.isArray(state.groupOrder) ? state.groupOrder : []).forEach(id => {
      const group = groupById.get(id);
      if (group && !orderedGroups.includes(group)) orderedGroups.push(group);
    });
    groups.forEach(group => {
      if (!orderedGroups.includes(group)) orderedGroups.push(group);
    });

    const fixedLayers = map.getLayers().getArray().filter(layer => !groups.includes(layer));
    map.getLayers().clear();
    map.getLayers().extend([...fixedLayers, ...orderedGroups.slice().reverse()]);

    // Tìm theo tập lớp toàn cục để khôi phục cả các lớp đã kéo sang nhóm khác.
    const currentLayers = liveMovableLayers();
    const byId = new Map(currentLayers.map(layer => [getLayerId(layer), layer]));
    const currentGroup = new Map(groups.flatMap(group => group.getLayers().getArray().map(layer => [layer, group])));
    const desiredByGroup = new Map(groups.map(group => [group, []]));
    const placed = new Set();
    groups.forEach(group => {
      const desiredIds = state.groups?.[group.get('tocGroupId')];
      (Array.isArray(desiredIds) ? desiredIds : []).forEach(id => {
        const layer = byId.get(id);
        if (!layer || placed.has(layer)) return;
        desiredByGroup.get(group).push(layer);
        placed.add(layer);
      });
    });
    currentLayers.forEach(layer => {
      if (placed.has(layer)) return;
      const group = currentGroup.get(layer) || defaultGroupByLayer.get(layer) || rasterGroup;
      desiredByGroup.get(group).push(layer);
    });
    placeLayers(desiredByGroup);

    allGroups.forEach(group => {
      const id = group.get('tocGroupId');
      if (typeof state.expanded?.[id] === 'boolean') group.set('tocCollapsed', !state.expanded[id]);
      if (typeof state.visibility?.groups?.[id] === 'boolean') group.setVisible(state.visibility.groups[id]);
      group.getLayers().forEach(layer => {
        const visible = state.visibility?.layers?.[getLayerId(layer)];
        if (typeof visible === 'boolean') layer.setVisible(visible);
      });
    });
  }

  function resetCatalog() {
    localStorage.removeItem(STORAGE_KEY);
    const fixedLayers = map.getLayers().getArray().filter(layer => !groups.includes(layer));
    map.getLayers().clear();
    map.getLayers().extend([...fixedLayers, ...defaultGroupOrder.slice().reverse()]);

    // Chỉ khôi phục đối tượng còn tồn tại: không hồi sinh raster đã xóa.
    const currentLayers = new Set(liveMovableLayers());
    const desiredByGroup = new Map(groups.map(group => [group, []]));
    const placed = new Set();
    groups.forEach(group => {
      (defaultLayerOrders.get(group) || []).forEach(layer => {
        if (!currentLayers.has(layer) || placed.has(layer)) return;
        const home = defaultGroupByLayer.get(layer) || group;
        desiredByGroup.get(home).push(layer);
        placed.add(layer);
      });
    });
    currentLayers.forEach(layer => {
      if (placed.has(layer)) return;
      const home = defaultGroupByLayer.get(layer) || rasterGroup;
      desiredByGroup.get(home).push(layer);
    });
    placeLayers(desiredByGroup);
    allGroups.forEach(group => {
      group.set('tocCollapsed', defaultCollapsed.get(group));
      group.setVisible(defaultGroupVisibility.get(group));
      group.getLayers().forEach(layer => layer.setVisible(defaultLayerVisibility.get(layer) ?? true));
    });
    const currentBase = baseGroup.getLayers().getArray();
    moveCollectionToUiOrder(baseGroup.getLayers(), [
      ...(defaultLayerOrders.get(baseGroup) || []).filter(layer => currentBase.includes(layer)),
      ...currentBase.filter(layer => !defaultLayerOrders.get(baseGroup)?.includes(layer))
    ]);
    if (selectedLayer && !currentLayers.has(selectedLayer) && !currentBase.includes(selectedLayer)) selectedLayer = null;
    render();
  }

  function setLayerGroup(layer, targetGroup) {
    const groupId = targetGroup.get('tocGroupId');
    const config = getConfigForLayer(layer);
    if (config) config.group = groupId;
    layer.set('catalogGroupId', groupId);
  }

  function createLayerRow(layer, group, canDrag = true) {
    const layerId = getLayerId(layer) || layer.get('title');
    const row = document.createElement('div');

    row.className = 'toc-layer-row';
    row.dataset.layerId = layerId;
    row.draggable = canDrag;

    if (layer === selectedLayer) row.classList.add('selected');

    const checkbox = document.createElement('input');
    checkbox.type = isBaseLayer(layer) ? 'radio' : 'checkbox';
    checkbox.name = isBaseLayer(layer) ? 'toc-base-layer' : `toc-${group.get('tocGroupId')}`;
    checkbox.checked = layer.getVisible();
    checkbox.title = 'Bật hoặc tắt lớp';

    checkbox.addEventListener('change', function () {
      if (isBaseLayer(layer) && checkbox.checked) {
        baseGroup.getLayers().forEach(item => item.setVisible(item === layer)); // Chỉ bật một basemap
      } else {
        layer.setVisible(checkbox.checked);
      }
      render();
    });

    const label = document.createElement('span');
    label.className = 'toc-layer-title';
    label.innerText = layer.get('title') || layerId;

    row.append(checkbox, label);

    const eye = document.createElement('button');
    eye.type = 'button';
    eye.className = 'toc-zoom-layer';
    eye.title = `Zoom tới lớp ${layer.get('title') || layerId}`;
    eye.setAttribute('aria-label', eye.title);
    eye.draggable = false;
    eye.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
    eye.addEventListener('click', event => { event.stopPropagation(); zoomToLayer(layer, group, eye); });
    eye.addEventListener('dragstart', event => { event.preventDefault(); event.stopPropagation(); });
    row.append(eye);

    row.addEventListener('click', function (event) {
      if (event.target === checkbox) return;
      selectedLayer = layer;
      render();
    });

    if (canDrag) {
      row.addEventListener('dragstart', function (event) {
        dragged = { type: 'layer', layer, sourceGroup: group }; // Ghi nhớ layer đang kéo
        row.classList.add('dragging');
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', String(layerId)); // Giúp drag ổn định trên Chrome/Edge
      });

      row.addEventListener('dragend', function () {
        dragged = null;
        row.classList.remove('dragging');
        clearDropTargets();
      });

      row.addEventListener('dragover', function (event) {
        if (dragged?.type !== 'layer') return;
        event.preventDefault(); // Bắt buộc để cho phép drop
        event.stopPropagation(); // Không cho group xử lý lại
        clearDropTargets();
        row.classList.add('toc-drop-target');
        event.dataTransfer.dropEffect = 'move';
      });

      row.addEventListener('dragleave', function () {
        row.classList.remove('toc-drop-target');
      });

      row.addEventListener('drop', function (event) {
        event.preventDefault();
        event.stopPropagation(); // QUAN TRỌNG: ngăn drop chạy thêm ở children
        row.classList.remove('toc-drop-target');

        if (dragged?.type !== 'layer' || dragged.layer === layer) return;

        const layers = getUiOrder(group.getLayers()).filter(item => item !== dragged.layer); // Bỏ layer đang kéo
        const targetIndex = layers.indexOf(layer);
        if (targetIndex < 0) return;

        const rect = row.getBoundingClientRect();
        const after = event.clientY > rect.top + rect.height / 2; // Nửa trên = đặt trên, nửa dưới = đặt dưới
        layers.splice(targetIndex + (after ? 1 : 0), 0, dragged.layer); // Chèn đúng vị trí

        if (dragged.sourceGroup !== group) {
          const oldLayers = getUiOrder(dragged.sourceGroup.getLayers())
            .filter(item => item !== dragged.layer);
          moveCollectionToUiOrder(dragged.sourceGroup.getLayers(), oldLayers); // Xóa khỏi nhóm cũ
        }

        moveCollectionToUiOrder(group.getLayers(), layers); // Cập nhật thứ tự thực tế
        setLayerGroup(dragged.layer, group);
        render();
      });
    }

    return row;
  }

  function createGroupNode(group, options = {}) {
    const groupId = group.get('tocGroupId');
    const node = document.createElement('section');

    node.className = 'toc-group';
    node.dataset.groupId = groupId;
    node.draggable = false;

    const header = document.createElement('div');
    header.className = 'toc-group-header';
    header.draggable = options.draggable === true;

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'toc-collapse';
    toggle.innerText = group.get('tocCollapsed') ? '▸' : '▾';
    toggle.title = 'Thu gọn hoặc mở rộng';

    toggle.onclick = function () {
      group.set('tocCollapsed', !group.get('tocCollapsed')); // Đóng/mở nhóm
      render();
    };

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = group.getVisible();
    checkbox.title = 'Bật hoặc tắt cả nhóm';

    checkbox.onchange = function () {
      group.setVisible(checkbox.checked);
      render();
    };

    const title = document.createElement('span');
    title.className = 'toc-group-title';
    title.innerText = group.get('title') || groupId;

    header.append(toggle, checkbox, title);
    node.append(header);

    const children = document.createElement('div');
    children.className = 'toc-group-children';
    children.hidden = Boolean(group.get('tocCollapsed'));

    getUiOrder(group.getLayers()).forEach(layer => {
      children.append(createLayerRow(layer, group, options.acceptLayers !== false));
    });

    node.append(children);

    if (options.acceptLayers !== false) {
      children.addEventListener('dragover', function (event) {
        if (dragged?.type !== 'layer') return;
        if (event.target.closest?.('.toc-layer-row')) return; // Row tự xử lý khi con trỏ đang trên layer

        event.preventDefault();
        children.classList.add('toc-drop-target');
      });

      children.addEventListener('dragleave', function (event) {
        if (event.relatedTarget && children.contains(event.relatedTarget)) return;
        children.classList.remove('toc-drop-target');
      });

      children.addEventListener('drop', function (event) {
        if (event.target.closest?.('.toc-layer-row')) return; // Không xử lý lần thứ hai
        event.preventDefault();
        event.stopPropagation();
        children.classList.remove('toc-drop-target');

        if (dragged?.type !== 'layer') return;

        const layers = getUiOrder(group.getLayers()).filter(item => item !== dragged.layer);
        layers.push(dragged.layer); // Thả vùng trống = đưa xuống cuối nhóm

        if (dragged.sourceGroup !== group) {
          const oldLayers = getUiOrder(dragged.sourceGroup.getLayers())
            .filter(item => item !== dragged.layer);
          moveCollectionToUiOrder(dragged.sourceGroup.getLayers(), oldLayers);
        }

        moveCollectionToUiOrder(group.getLayers(), layers);
        setLayerGroup(dragged.layer, group);
        render();
      });
    }

    if (options.draggable) {
      header.addEventListener('dragstart', function (event) {
        if (event.target === toggle || event.target === checkbox) {
          event.preventDefault();
          return;
        }

        dragged = { type: 'group', group }; // Ghi nhớ nhóm đang kéo
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', String(groupId));
      });

      header.addEventListener('dragover', function (event) {
        if (dragged?.type !== 'group' || dragged.group === group) return;
        event.preventDefault();
        event.stopPropagation();
        clearDropTargets();
        node.classList.add('toc-drop-target');
      });

      header.addEventListener('dragleave', function () {
        node.classList.remove('toc-drop-target');
      });

      header.addEventListener('drop', function (event) {
        event.preventDefault();
        event.stopPropagation();
        node.classList.remove('toc-drop-target');

        if (dragged?.type !== 'group' || dragged.group === group) return;

        const uiGroups = getUiOrder(map.getLayers())
          .filter(layer => groups.includes(layer) && layer !== dragged.group);

        const targetIndex = uiGroups.indexOf(group);
        if (targetIndex < 0) return;

        const rect = header.getBoundingClientRect();
        const after = event.clientY > rect.top + rect.height / 2; // Cho phép kéo group cả lên và xuống
        uiGroups.splice(targetIndex + (after ? 1 : 0), 0, dragged.group);

        const fixedLayers = map.getLayers().getArray().filter(layer => !groups.includes(layer));
        map.getLayers().clear();
        map.getLayers().extend([...fixedLayers, ...uiGroups.reverse()]);

        render();
      });

      header.addEventListener('dragend', function () {
        dragged = null;
        clearDropTargets();
      });
    }

    return node;
  }

  function render() {
    content.replaceChildren();

    getUiOrder(map.getLayers())
      .filter(layer => groups.includes(layer))
      .forEach(group => {
        content.append(createGroupNode(group, { draggable: true, acceptLayers: true }));
      });

    content.append(createGroupNode(baseGroup, { draggable: false, acceptLayers: false }));
  }

  function closePanel() {
    panel.classList.remove('shown');
  }

  button.onclick = function () {
    render(); // Đồng bộ checkbox sau khi công cụ khác thay đổi visibility.
    panel.classList.toggle('shown');
  };

  closeButton.onclick = closePanel;

  document.addEventListener('pointerdown', function (event) {
    if (!panel.classList.contains('shown')) return;
    if (panel.contains(event.target) || button.contains(event.target)) return;
    closePanel();
  }, true);

  saveButton.onclick = function () {
    saveState();
    saveButton.textContent = 'Đã lưu';
    setTimeout(function () {
      saveButton.textContent = 'Lưu';
    }, 1400);
  };

  resetButton.onclick = function () {
    resetCatalog();
  };

  applyState(); // Khôi phục thứ tự
  render(); // Hiển thị TOC

  return {
    render, getLayerExtent,
    // Áp dụng lại cả placement cho raster động được tải sau lần khởi tạo catalog.
    restoreVisibility() { applyState(); render(); }
  };
}
