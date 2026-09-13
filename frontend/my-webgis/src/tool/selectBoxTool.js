/*
  CÔNG CỤ CHỌN ĐỐI TƯỢNG BẰNG VÙNG HỘP
  - Người dùng bật công cụ rồi giữ Ctrl và kéo chuột để tạo vùng chọn.
  - Chỉ lấy đối tượng từ các lớp có selectable = true và có WFS.
  - Kết quả được chia theo Điểm, Đường, Vùng và Khác.
  - Click một đối tượng trong danh sách để zoom, highlight và xem thuộc tính.
  - Popup mặc định bị ẩn, chỉ hiện khi người dùng thực sự chọn đối tượng.
  - Khi đóng/xóa công cụ: xóa style chọn, popup, kết quả và DragBox.
*/

import Overlay from 'ol/Overlay.js';
import DragBox from 'ol/interaction/DragBox.js';
import { platformModifierKeyOnly, primaryAction } from 'ol/events/condition.js';
import { Style, Fill, Stroke, Circle as CircleStyle } from 'ol/style.js';
import { makePanelDraggable, escapeHTML, getConfiguredValue } from './toolUtils.js';

export function createSelectBoxTool(map, layerConfigs) {
  // =========================================================
  // 1. BIẾN TRẠNG THÁI
  // =========================================================
  let active = false;
  let selectedFeatures = [];
  let focusedFeature = null;
  let activeGroup = null;
  let popupTimer = null;

  // Chỉ lấy các lớp được phép chọn và có dữ liệu WFS.
  const selectableLayers = layerConfigs.filter(function (config) {
    return config.selectable && config.wfsLayer;
  });

  // =========================================================
  // 2. STYLE ĐỐI TƯỢNG ĐƯỢC CHỌN
  // =========================================================
  function createStyle(fillColor, strokeColor, width, radius, pointStroke) {
    return new Style({
      fill: new Fill({
        color: fillColor
      }),
      stroke: new Stroke({
        color: strokeColor,
        width: width
      }),
      image: new CircleStyle({
        radius: radius,
        fill: new Fill({
          color: strokeColor
        }),
        stroke: new Stroke({
          color: pointStroke,
          width: 3
        })
      })
    });
  }

  // Style chung cho tất cả đối tượng nằm trong vùng chọn.
  const selectedStyle = createStyle(
    'rgba(255,153,0,0.35)',
    '#ff3300',
    4,
    10,
    '#ffffff'
  );

  // Style riêng cho đối tượng đang được xem chi tiết.
  const focusedStyle = createStyle(
    'rgba(0,255,255,0.45)',
    '#00ffff',
    6,
    14,
    '#000000'
  );

  // =========================================================
  // 3. TẠO PANEL CHỌN ĐỐI TƯỢNG
  // =========================================================
  const mapWrapper = document.querySelector('.map-wrapper');
  if (!mapWrapper) {
    throw new Error('createSelectBoxTool: Không tìm thấy .map-wrapper');
  }

  const panel = document.createElement('div');
  panel.id = 'select-box-panel';
  panel.className = 'advanced-panel';
  panel.innerHTML = `
    <div class="advanced-panel-header">
      <span>Chọn đối tượng bằng vùng hộp</span>
      <button id="select-box-close" class="advanced-panel-close" title="Đóng công cụ">×</button>
    </div>
    <div class="advanced-panel-body">
      <div id="select-box-layer-list"></div>
      <button id="select-box-clear">Xóa kết quả chọn</button>
      <div class="select-box-summary">
        Số đối tượng đã chọn:
        <b id="select-box-count">0</b>
      </div>
      <div id="select-box-result" class="advanced-result-list"></div>
    </div>
  `;
  mapWrapper.appendChild(panel);

  const header = panel.querySelector('.advanced-panel-header');
  const layerList = panel.querySelector('#select-box-layer-list');
  const resultList = panel.querySelector('#select-box-result');
  const countElement = panel.querySelector('#select-box-count');
  const closeButton = panel.querySelector('#select-box-close');
  const clearButton = panel.querySelector('#select-box-clear');

  // Cho phép kéo panel bằng phần tiêu đề.
  makePanelDraggable(panel, header);

  // =========================================================
  // 4. TẠO POPUP THÔNG TIN
  // QUAN TRỌNG:
  // - Không append popup vào map-wrapper.
  // - Popup được OpenLayers Overlay tự quản lý.
  // - Ẩn popup ngay khi tạo để không sinh khung trắng có chữ X.
  // =========================================================
  const popupElement = document.createElement('div');
  popupElement.id = 'select-box-popup';
  popupElement.className = 'select-box-popup';
  popupElement.style.display = 'none';
  popupElement.innerHTML = `
    <div class="select-box-popup-header">
      <span>Thông tin đối tượng</span>
      <button type="button" class="select-box-popup-close" title="Đóng">X</button>
    </div>
    <div class="select-box-popup-content"></div>
  `;

  const popupContent = popupElement.querySelector('.select-box-popup-content');
  const popupCloseButton = popupElement.querySelector('.select-box-popup-close');

  const popupOverlay = new Overlay({
    element: popupElement,
    offset: [0, -12],
    positioning: 'bottom-center',
    stopEvent: true,
    autoPan: {
      animation: {
        duration: 250
      }
    }
  });
  map.addOverlay(popupOverlay);

  // =========================================================
  // 5. ĐÓNG POPUP
  // Xóa cả vị trí, nội dung và display để không còn popup rỗng.
  // =========================================================
  function closePopup() {
    if (popupTimer) {
      clearTimeout(popupTimer);
      popupTimer = null;
    }
    popupOverlay.setPosition(undefined);
    popupElement.style.display = 'none';
    popupContent.innerHTML = '';
  }

  popupCloseButton.onclick = function () {
    closePopup();
  };

  // =========================================================
  // 6. LẤY TÊN LỚP
  // =========================================================
  function getLayerName(config) {
    return config.selectName || config.title || config.id || 'Lớp dữ liệu';
  }

  // =========================================================
  // 7. HIỂN THỊ DANH SÁCH LỚP CÓ THỂ CHỌN
  // Chỉ hiện lớp WMS đang bật trên bản đồ.
  // =========================================================
  function renderLayerCheckboxes() {
    const visibleLayers = selectableLayers.filter(function (config) {
      return config.wmsLayer && config.wmsLayer.getVisible();
    });

    if (!visibleLayers.length) {
      layerList.innerHTML = `
        <div class="select-box-empty">
          Không có lớp dữ liệu nào đang bật
        </div>
      `;
      return;
    }

    layerList.innerHTML = visibleLayers.map(function (config) {
      return `
        <label class="select-box-layer-item">
          <input type="checkbox" value="${escapeHTML(config.id)}" checked>
          ${escapeHTML(getLayerName(config))}
        </label>
      `;
    }).join('');
  }

  // =========================================================
  // 8. LẤY CÁC LỚP NGƯỜI DÙNG ĐÃ TÍCH CHỌN
  // =========================================================
  function getCheckedLayers() {
    const checkedIds = Array.from(
      layerList.querySelectorAll('input[type="checkbox"]:checked')
    ).map(function (input) {
      return input.value;
    });

    return selectableLayers.filter(function (config) {
      return checkedIds.includes(String(config.id)) &&
        config.wmsLayer &&
        config.wmsLayer.getVisible();
    });
  }

  // =========================================================
  // 9. LẤY TÊN ĐỐI TƯỢNG
  // Dùng các searchFields đã cấu hình; nếu không có thì dùng tên lớp.
  // =========================================================
  function getFeatureName(feature, config, index) {
    return getConfiguredValue(
      feature,
      config.searchFields,
      `${getLayerName(config)} ${index + 1}`
    );
  }

  // =========================================================
  // 10. PHÂN LOẠI HÌNH HỌC
  // =========================================================
  function getGeometryGroup(feature) {
    const geometry = feature?.getGeometry();
    if (!geometry) return 'other';

    const type = geometry.getType();
    if (['Point', 'MultiPoint'].includes(type)) return 'point';
    if (['LineString', 'MultiLineString'].includes(type)) return 'line';
    if (['Polygon', 'MultiPolygon'].includes(type)) return 'polygon';
    return 'other';
  }

  // =========================================================
  // 11. TÊN NHÓM HÌNH HỌC
  // =========================================================
  function getGroupTitle(key) {
    const titles = {
      point: 'Điểm',
      line: 'Đường',
      polygon: 'Vùng',
      other: 'Khác'
    };
    return titles[key] || 'Khác';
  }

  // =========================================================
  // 12. XÁC ĐỊNH VỊ TRÍ HIỂN THỊ POPUP
  // =========================================================
  function getPopupCoordinate(feature) {
    const geometry = feature?.getGeometry();
    if (!geometry) return null;

    switch (geometry.getType()) {
      case 'Point':
        return geometry.getCoordinates();
      case 'LineString':
        return geometry.getCoordinateAt(0.5);
      case 'Polygon':
        return geometry.getInteriorPoint().getCoordinates();
      case 'MultiPoint': {
        const coordinates = geometry.getCoordinates();
        return coordinates.length ? coordinates[0] : null;
      }
      case 'MultiLineString': {
        const lines = geometry.getLineStrings();
        return lines.length ? lines[0].getCoordinateAt(0.5) : null;
      }
      case 'MultiPolygon': {
        const polygons = geometry.getPolygons();
        return polygons.length
          ? polygons[0].getInteriorPoint().getCoordinates()
          : null;
      }
      default:
        return geometry.getClosestPoint(map.getView().getCenter());
    }
  }

  // =========================================================
  // 13. TẠO NỘI DUNG POPUP
  // Hiển thị các popupFields đã khai báo trong layers.js.
  // =========================================================
  function buildPopupContent(feature, config, index) {
    const rows = (config.popupFields || []).map(function (fieldConfig) {
      const value = getConfiguredValue(feature, fieldConfig.fields);
      return `
        <tr>
          <td>${escapeHTML(fieldConfig.label)}</td>
          <td>${escapeHTML(value)}</td>
        </tr>
      `;
    }).join('');

    return `
      <div class="select-box-popup-title">
        ${escapeHTML(getFeatureName(feature, config, index))}
      </div>
      <div class="select-box-popup-layer">
        Lớp: <b>${escapeHTML(getLayerName(config))}</b>
      </div>
      <table class="select-box-popup-table">
        ${rows || '<tr><td colspan="2">Không có dữ liệu</td></tr>'}
      </table>
    `;
  }

  // =========================================================
  // 14. HIỂN THỊ POPUP
  // Chỉ bật display:block khi thực sự có đối tượng và tọa độ.
  // =========================================================
  function showPopup(item, index) {
    if (!item || !item.feature || !item.config) {
      closePopup();
      return;
    }

    const coordinate = getPopupCoordinate(item.feature);
    if (!coordinate) {
      closePopup();
      return;
    }

    popupContent.innerHTML = buildPopupContent(
      item.feature,
      item.config,
      index
    );

    popupElement.style.display = 'block';
    popupOverlay.setPosition(coordinate);
  }

  // =========================================================
  // 15. FOCUS ĐỐI TƯỢNG
  // Đối tượng cũ trở lại selectedStyle, đối tượng mới dùng focusedStyle.
  // =========================================================
  function focusFeature(feature) {
    if (!feature) return;

    if (
      focusedFeature &&
      focusedFeature !== feature &&
      selectedFeatures.includes(focusedFeature)
    ) {
      focusedFeature.setStyle(selectedStyle);
    }

    focusedFeature = feature;
    focusedFeature.setStyle(focusedStyle);
  }

  // =========================================================
  // 16. ZOOM ĐẾN ĐỐI TƯỢNG VÀ HIỂN THỊ POPUP
  // =========================================================
  function zoomToFeature(item, index) {
    if (!item?.feature) return;

    const geometry = item.feature.getGeometry();
    if (!geometry) return;

    focusFeature(item.feature);
    closePopup();

    map.getView().fit(geometry.getExtent(), {
      padding: [90, 90, 90, 90],
      duration: 500,
      maxZoom: 16
    });

    // Chờ animation zoom kết thúc rồi mới đặt popup.
    popupTimer = setTimeout(function () {
      popupTimer = null;
      if (!active) return;
      showPopup(item, index);
    }, 550);
  }

  // =========================================================
  // 17. XÓA TOÀN BỘ KẾT QUẢ CHỌN
  // Xóa style, danh sách kết quả, popup và trạng thái nhóm.
  // =========================================================
  function clear() {
    selectedFeatures.forEach(function (feature) {
      feature.setStyle(null);
    });

    selectedFeatures = [];
    focusedFeature = null;
    activeGroup = null;
    resultList.innerHTML = '';
    countElement.innerText = '0';
    closePopup();
  }

  // =========================================================
  // 18. TÌM CÁC FEATURE NẰM TRONG VÙNG HỘP
  // =========================================================
  function findFeatures(extent) {
    const items = [];

    getCheckedLayers().forEach(function (config) {
      const source = config.wfsLayer?.getSource();
      if (!source) return;

      source.forEachFeatureIntersectingExtent(extent, function (feature) {
        if (!feature?.getGeometry()) return;

        items.push({
          feature: feature,
          config: config,
          group: getGeometryGroup(feature)
        });
      });
    });

    return items;
  }

  // =========================================================
  // 19. MỞ / ĐÓNG NHÓM KẾT QUẢ
  // =========================================================
  function setActiveGroup(groupKey) {
    activeGroup = activeGroup === groupKey ? null : groupKey;

    resultList.querySelectorAll('.select-box-group').forEach(function (group) {
      const isActive = group.dataset.group === activeGroup;
      group.classList.toggle('active', isActive);

      const body = group.querySelector('.select-box-group-body');
      const icon = group.querySelector('.select-box-group-icon');

      if (body) {
        body.style.display = isActive ? 'block' : 'none';
      }

      if (icon) {
        icon.innerText = isActive ? '▼' : '▶';
      }
    });
  }

  // =========================================================
  // 20. TẠO MỘT NHÓM KẾT QUẢ
  // Click từng dòng để zoom và xem thông tin đối tượng.
  // =========================================================
  function createGroupElement(key, items) {
    const group = document.createElement('div');
    group.className = 'select-box-group';
    group.dataset.group = key;

    const groupHeader = document.createElement('div');
    groupHeader.className = 'select-box-group-header';
    groupHeader.innerHTML = `
      <span>
        <span class="select-box-group-icon">▶</span>
        ${escapeHTML(getGroupTitle(key))}
      </span>
      <b>${items.length}</b>
    `;

    const body = document.createElement('div');
    body.className = 'select-box-group-body';
    body.style.display = 'none';

    items.forEach(function (item, index) {
      const row = document.createElement('div');
      row.className = 'select-box-result-item';
      row.innerHTML = `
        <b>
          ${index + 1}. ${escapeHTML(
            getFeatureName(item.feature, item.config, index)
          )}
        </b>
        <span>${escapeHTML(getLayerName(item.config))}</span>
      `;

      // Click kết quả để zoom, focus và hiện popup.
      row.onclick = function () {
        zoomToFeature(item, index);
      };

      body.appendChild(row);
    });

    // Click tên nhóm để đóng/mở danh sách con.
    groupHeader.onclick = function () {
      setActiveGroup(key);
    };

    group.append(groupHeader, body);
    return group;
  }

  // =========================================================
  // 21. HIỂN THỊ DANH SÁCH KẾT QUẢ
  // =========================================================
  function showResults(items) {
    resultList.innerHTML = '';
    countElement.innerText = String(items.length);

    if (!items.length) {
      resultList.innerHTML = `
        <div class="select-box-empty">
          Không có đối tượng trong vùng chọn
        </div>
      `;
      return;
    }

    const groups = {
      point: [],
      line: [],
      polygon: [],
      other: []
    };

    items.forEach(function (item) {
      if (!groups[item.group]) {
        groups.other.push(item);
        return;
      }
      groups[item.group].push(item);
    });

    const order = ['point', 'line', 'polygon', 'other'];

    order.forEach(function (key) {
      if (groups[key].length) {
        resultList.appendChild(
          createGroupElement(key, groups[key])
        );
      }
    });

    // Tự động mở nhóm đầu tiên có dữ liệu.
    const firstGroup = order.find(function (key) {
      return groups[key].length > 0;
    });

    if (firstGroup) {
      setActiveGroup(firstGroup);
    }
  }

  // =========================================================
  // 22. TẠO DRAGBOX
  // Giữ Ctrl + kéo chuột trái để tạo vùng chọn.
  // =========================================================
  const dragBox = new DragBox({
    condition: function (event) {
      return (
        active &&
        platformModifierKeyOnly(event) &&
        primaryAction(event)
      );
    }
  });

  // Bắt đầu chọn vùng mới thì xóa kết quả cũ.
  dragBox.on('boxstart', function () {
    clear();
  });

  // =========================================================
  // 23. XỬ LÝ SAU KHI KÉO XONG VÙNG HỘP
  // =========================================================
  dragBox.on('boxend', function () {
    if (!active) return;

    const geometry = dragBox.getGeometry();
    if (!geometry) return;

    const extent = geometry.getExtent();
    const items = findFeatures(extent);

    // Gán style chọn cho toàn bộ feature tìm thấy.
    items.forEach(function (item) {
      if (!selectedFeatures.includes(item.feature)) {
        selectedFeatures.push(item.feature);
      }
      item.feature.setStyle(selectedStyle);
    });

    showResults(items);

    // Nếu vùng chọn chỉ có 1 đối tượng thì zoom và hiện popup ngay.
    if (items.length === 1) {
      zoomToFeature(items[0], 0);
    }
  });

  // =========================================================
  // 24. MỞ CÔNG CỤ
  // =========================================================
  function open() {
    if (active) return;

    active = true;
    clear();
    renderLayerCheckboxes();

    // Chỉ thêm interaction nếu nó chưa tồn tại trên bản đồ.
    if (!map.getInteractions().getArray().includes(dragBox)) {
      map.addInteraction(dragBox);
    }

    panel.classList.add('active');
  }

  // =========================================================
  // 25. ĐÓNG CÔNG CỤ
  // Xóa toàn bộ kết quả và gỡ DragBox khỏi bản đồ.
  // =========================================================
  function close() {
    if (!active && !panel.classList.contains('active')) {
      closePopup();
      return;
    }

    active = false;
    clear();

    if (map.getInteractions().getArray().includes(dragBox)) {
      map.removeInteraction(dragBox);
    }

    panel.classList.remove('active');
  }

  // =========================================================
  // 26. THEO DÕI BẬT / TẮT LỚP
  // Nếu đang mở công cụ và lớp thay đổi thì xóa kết quả cũ.
  // =========================================================
  selectableLayers.forEach(function (config) {
    if (!config.wmsLayer) return;

    config.wmsLayer.on('change:visible', function () {
      if (!panel.classList.contains('active')) return;

      clear();
      renderLayerCheckboxes();
    });
  });

  // =========================================================
  // 27. SỰ KIỆN NÚT
  // =========================================================
  closeButton.onclick = function () {
    close();
  };

  clearButton.onclick = function () {
    clear();
  };

  // =========================================================
  // 28. HÀM CHO TOOLMANAGER / FILE KHÁC SỬ DỤNG
  // =========================================================
  return {
    panel,
    dragBox,
    open,
    close,
    clear
  };
}