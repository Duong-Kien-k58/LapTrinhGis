const STORAGE_KEY = 'webgis_layer_catalog_v1';

function getSavedState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; // Đọc thứ tự đã lưu
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
  const rasterConfigById = new Map(Object.keys(rasterLayerMap).map(id => [id, rasterLayerMap[id]]));
  const defaultGroupOrder = getUiOrder(map.getLayers())
    .filter(layer => groups.includes(layer));
  const defaultLayerOrders = new Map(
    groups.map(group => [group, getUiOrder(group.getLayers())])
  );
  const defaultCollapsed = new Map(
    [...groups, baseGroup].filter(Boolean)
      .map(group => [group, Boolean(group.get('tocCollapsed'))])
  );

  let selectedLayer = null;
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
    <div class="layer-catalog-content"></div>
  `;

  wrapper.append(button, panel);

  const content = panel.querySelector('.layer-catalog-content');
  const closeButton = panel.querySelector('.layer-catalog-close');
  const saveButton = panel.querySelector('.layer-catalog-save');
  const resetButton = panel.querySelector('.layer-catalog-reset');

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
      groups: {},
      expanded: {}
    };

    groups.forEach(group => {
      const id = group.get('tocGroupId');
      state.groups[id] = getUiOrder(group.getLayers()).map(getLayerId).filter(Boolean); // Lưu thứ tự layer
      state.expanded[id] = !group.get('tocCollapsed'); // Lưu đóng/mở nhóm
    });

    state.expanded.base = !baseGroup.get('tocCollapsed');
    setSavedState(state);
  }

  function applyState() {
    const state = getSavedState();

    const orderedGroups = [];
    (state.groupOrder || []).forEach(function (id) {
      const group = groupById.get(id);
      if (group && !orderedGroups.includes(group)) orderedGroups.push(group);
    });

    groups.forEach(group => {
      if (!orderedGroups.includes(group)) orderedGroups.push(group); // Bổ sung nhóm mới
    });

    const fixedLayers = map.getLayers().getArray().filter(layer => !groups.includes(layer));
    map.getLayers().clear();
    map.getLayers().extend([...fixedLayers, ...orderedGroups.reverse()]);

    groups.forEach(group => {
      const groupId = group.get('tocGroupId');
      const desiredIds = state.groups?.[groupId] || [];
      const currentUiLayers = getUiOrder(group.getLayers());

      const desiredLayers = desiredIds
        .map(id => currentUiLayers.find(layer => getLayerId(layer) === id))
        .filter(Boolean);

      currentUiLayers.forEach(layer => {
        if (!desiredLayers.includes(layer)) desiredLayers.push(layer); // Thêm layer mới chưa được lưu
      });

      moveCollectionToUiOrder(group.getLayers(), desiredLayers);
      group.set('tocCollapsed', state.expanded?.[groupId] === false);
    });

    baseGroup.set('tocCollapsed', state.expanded?.base === false);
  }

  function resetCatalog() {
    localStorage.removeItem(STORAGE_KEY);

    const fixedLayers = map.getLayers().getArray().filter(layer => !groups.includes(layer));
    map.getLayers().clear();
    map.getLayers().extend([...fixedLayers, ...defaultGroupOrder.slice().reverse()]);

    groups.forEach(group => {
      moveCollectionToUiOrder(group.getLayers(), defaultLayerOrders.get(group) || []);
    });
    defaultCollapsed.forEach(function (collapsed, group) {
      group.set('tocCollapsed', collapsed);
    });
    render();
  }

  function setLayerGroup(layer, targetGroup) {
    const config = getConfigForLayer(layer);
    if (!config) return;

    const groupId = targetGroup.get('tocGroupId');
    if (groupId !== 'raster') config.group = groupId; // Cập nhật nhóm của layer
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

  return { render };
}
