/*
  CÔNG CỤ TRA CỨU THÔNG TIN ĐỐI TƯỢNG
  - Nút i dùng để bật/tắt công cụ tra cứu.
  - Chỉ cho chọn các lớp WMS đang hiển thị và có hasPopup = true.
  - Khi click bản đồ, gửi WMS GetFeatureInfo để lấy đối tượng.
  - Nếu tìm thấy: highlight đối tượng và hiện popup thuộc tính.
  - Nếu không tìm thấy: đóng popup và xóa highlight.
  - Popup mặc định bị ẩn để không xuất hiện thanh trắng ở góc dưới trái.
  - Khi bật công cụ sẽ đóng các công cụ khác thông qua beforeStart().
*/
import Control from 'ol/control/Control.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import Overlay from 'ol/Overlay.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import proj4 from 'proj4';
import { register } from 'ol/proj/proj4.js';
proj4.defs('EPSG:3405', '+proj=utm +zone=48 +ellps=WGS84 +towgs84=-191.90441429,-39.30318279,-111.45032835,-0.00928836,0.01975479,-0.00427372,0.252906278 +units=m +no_defs +type=crs');
register(proj4);
import { toLonLat, transform } from 'ol/proj.js';
import { Style, Fill, Stroke, Circle as CircleStyle } from 'ol/style.js';
import { escapeHTML, getConfiguredValue } from './toolUtils.js';

export function createPopupTool({ map, layerConfigs, groupMap = {} }) {
  // Trạng thái công cụ và mã request dùng để loại bỏ request cũ.
  let active = false;
  let requestId = 0;
  let beforeStart = function () {};
  const geojsonFormat = new GeoJSON();

  // =========================================================
  // 1. LỚP HIGHLIGHT ĐỐI TƯỢNG
  // =========================================================
  const highlightSource = new VectorSource();
  const highlightStyle = new Style({
    fill: new Fill({
      color: 'rgb(255, 255, 0)'
    }),
    stroke: new Stroke({
      color: '#ff0000',
      width: 3
    }),
    image: new CircleStyle({
      radius: 10,
      fill: new Fill({
        color: '#ffff00'
      }),
      stroke: new Stroke({
        color: '#ff0000',
        width: 2
      })
    })
  });
  const highlightLayer = new VectorLayer({
    source: highlightSource,
    style: highlightStyle,
    zIndex: 10000
  });
  map.addLayer(highlightLayer);

  // =========================================================
  // 2. TẠO NÚT i TRÊN BẢN ĐỒ
  // =========================================================
  const controlButton = document.createElement('button');
  controlButton.type = 'button';
  controlButton.className = 'popup-info-btn';
  controlButton.title = 'Tra cứu thông tin đối tượng';
  controlButton.innerText = 'i';

  const controlElement = document.createElement('div');
  controlElement.className = 'popup-info-control ol-unselectable ol-control';
  controlElement.appendChild(controlButton);

  const control = new Control({
    element: controlElement
  });
  map.addControl(control);

  // =========================================================
  // 3. PANEL CHỌN LỚP CẦN TRA CỨU
  // =========================================================
  const mapWrapper = document.querySelector('.map-wrapper');
  if (!mapWrapper) {
    throw new Error('createPopupTool: Không tìm thấy .map-wrapper');
  }

  const panel = document.createElement('div');
  panel.className = 'popup-tool-panel';
  panel.innerHTML = `
    <div class="popup-tool-title">Tra cứu thông tin</div>
    <label for="popup-layer-select">Lớp cần tra cứu</label>
    <select id="popup-layer-select"></select>
    <div id="popup-tool-status" class="popup-tool-status">
      Chọn lớp rồi click đối tượng trên bản đồ
    </div>
  `;
  mapWrapper.appendChild(panel);

  const layerSelect = panel.querySelector('#popup-layer-select');
  const statusElement = panel.querySelector('#popup-tool-status');

  // =========================================================
  // 4. TẠO POPUP THÔNG TIN
  // Popup phải ẩn ban đầu để tránh xuất hiện khung trắng ở góc bản đồ.
  // Không append popupElement vào mapWrapper vì OpenLayers Overlay tự quản lý.
  // =========================================================
  const popupElement = document.createElement('div');
  popupElement.className = 'ol-popup';
  popupElement.style.display = 'none';
  popupElement.style.cursor = 'default'; //Trong popup dùng con trỏ chuột bình thường
  popupElement.innerHTML = `
    <a href="#" class="ol-popup-closer popup-tool-closer" title="Đóng">×</a>
    <div class="popup-tool-content"></div>
  `;

  const popupContent = popupElement.querySelector('.popup-tool-content');
  const popupCloser = popupElement.querySelector('.popup-tool-closer');

  const popup = new Overlay({
    element: popupElement,
    autoPan: {
      animation: {
        duration: 250
      }
    }
  });
  map.addOverlay(popup);

  // =========================================================
  // 5. CẬP NHẬT DÒNG TRẠNG THÁI
  // =========================================================
  function setStatus(text) {
    statusElement.innerText = text;
  }

  // =========================================================
  // 6. KIỂM TRA LỚP CÓ ĐANG HIỂN THỊ KHÔNG
  // Lớp thường chỉ hợp lệ khi cả WMS và nhóm chứa nó đều đang bật.
  // Lớp identifyable có thể được tra cứu dù được giữ ẩn trên bản đồ.
  // =========================================================
  function isLayerVisible(config) {
    if (!config?.wmsLayer) return false;
    if (!config.wmsLayer.getVisible()) return false;

    const group = groupMap[config.group];
    if (group && !group.getVisible()) return false;

    return true;
  }

  // =========================================================
  // 7. LẤY CÁC LỚP ĐƯỢC PHÉP TRA CỨU
  // =========================================================
  function getAvailableLayers() {
    return layerConfigs.filter(function (config) {
      return config.hasPopup === true &&
        config.wmsLayer &&
        (config.identifyable === true || isLayerVisible(config));
    });
  }

  // =========================================================
  // 8. LẤY CẤU HÌNH LỚP ĐANG CHỌN TRONG COMBOBOX
  // =========================================================
  function getSelectedConfig() {
    return layerConfigs.find(function (config) {
      return config.id === layerSelect.value;
    }) || null;
  }

  // =========================================================
  // 9. CẬP NHẬT DANH SÁCH LỚP TRA CỨU
  // Giữ lại lớp cũ nếu lớp đó vẫn đang hiển thị.
  // =========================================================
  function refreshLayerOptions() {
    const oldValue = layerSelect.value;
    const availableLayers = getAvailableLayers();
    layerSelect.innerHTML = '';

    if (!availableLayers.length) {
      const option = document.createElement('option');
      option.value = '';
      option.innerText = 'Không có lớp dữ liệu đang hiển thị';
      layerSelect.appendChild(option);
      layerSelect.disabled = true;
      closePopup();
      setStatus('Không có lớp dữ liệu để tra cứu');
      return;
    }

    layerSelect.disabled = false;
    availableLayers.forEach(function (config) {
      const option = document.createElement('option');
      option.value = config.id;
      option.innerText = config.title;
      layerSelect.appendChild(option);
    });

    const oldLayerExists = availableLayers.some(function (config) {
      return config.id === oldValue;
    });
    if (oldLayerExists) {
      layerSelect.value = oldValue;
    }

    const selectedConfig = getSelectedConfig();
    if (active && selectedConfig) {
      setStatus(`Đang tra cứu lớp: ${selectedConfig.title}`);
    }
  }

  // =========================================================
  // 10. XÓA HIGHLIGHT
  // =========================================================
  function clearHighlight() {
    highlightSource.clear();
  }

  // =========================================================
  // 11. HIGHLIGHT FEATURE ĐƯỢC TRA CỨU
  // Clone feature để không thay đổi trực tiếp đối tượng gốc.
  // =========================================================
  function highlightFeature(feature) {
    clearHighlight();
    if (!feature) return;

    const geometry = feature.getGeometry?.();
    if (!geometry) return;

    const clone = feature.clone();
    clone.setGeometry(geometry.clone());
    highlightSource.addFeature(clone);
    highlightLayer.changed();
  }

  // =========================================================
  // 12. LẤY GIÁ TRỊ THUỘC TÍNH
  // Nếu không có gid/id trong thuộc tính thì thử lấy từ feature.getId().
  // =========================================================
  function getPopupValue(feature, fieldConfig) {
    const fields = fieldConfig?.fields || [];
    const value = getConfiguredValue(feature, fields);

    if (value !== '' && value !== null && value !== undefined) {
      return value;
    }

    if (!fields.includes('gid') && !fields.includes('id')) {
      return '';
    }

    const featureId = feature.getId();
    if (featureId === undefined || featureId === null || featureId === '') {
      return '';
    }

    // GeoServer thường trả ID dạng ten_lop.15 nên chỉ lấy phần sau dấu chấm.
    const parts = String(featureId).split('.');
    return parts[parts.length - 1] || '';
  }

  // =========================================================
  // 13. TẠO NỘI DUNG HTML CHO POPUP
  // Các giá trị được escapeHTML để tránh chèn HTML ngoài ý muốn.
  // =========================================================
  function createPopupContent(feature, config, coordinate) {
    const [longitude, latitude] = toLonLat(coordinate);
    const [yVN2000, xVN2000] = transform(coordinate, map.getView().getProjection(), 'EPSG:3405'); //Chuyển sang VN2000 Zone 48N
    const coordinateRow = `
      <div class="popup_content">
        <b>Tọa độ (WGS84):</b>
        ${escapeHTML(`${latitude.toFixed(6)}, ${longitude.toFixed(6)}`)}
      </div>
      <div class="popup_content">
        <b>Tọa độ phẳng (VN2000):</b>
        ${escapeHTML(`X: ${xVN2000.toFixed(3)}`)}<br>
        ${escapeHTML(`Y: ${yVN2000.toFixed(3)}`)}
      </div>
    `;
    const rows = (config.popupFields || []).map(function (fieldConfig) {
      const value = getPopupValue(feature, fieldConfig);
      return `
        <div class="popup_content">
          <b>${escapeHTML(fieldConfig.label)}:</b>
          ${escapeHTML(value)}
        </div>
      `;
    }).join('');

    return `
      <div class="popup_title">
        ${escapeHTML(config.popupHeader || config.title)}
      </div>
      ${coordinateRow}
      ${rows || '<div class="popup_content popup_content-empty">Không có thông tin thuộc tính</div>'}
    `;
  }

  // =========================================================
  // 14. HIỂN THỊ POPUP
  // Chỉ hiện popup khi đã có feature, config và tọa độ hợp lệ.
  // =========================================================
  function showFeaturePopup(feature, config, coordinate) {
    if (!feature || !config || !coordinate) return;

    highlightFeature(feature);
    popupContent.innerHTML = createPopupContent(feature, config, coordinate);

    // Hiện popup sau khi đã có nội dung.
    popupElement.style.display = 'block';
    popup.setPosition(coordinate);
  }

  // =========================================================
  // 15. ĐÓNG POPUP
  // Xóa vị trí Overlay, ẩn HTML, xóa nội dung và highlight.
  // =========================================================
  function closePopup() {
    popup.setPosition(undefined);
    popupElement.style.display = 'none';
    popupContent.innerHTML = '';
    clearHighlight();
  }

  // =========================================================
  // 16. XỬ LÝ CLICK BẢN ĐỒ
  // Luồng: chọn lớp -> tạo GetFeatureInfo -> fetch -> đọc GeoJSON
  //       -> highlight -> hiện popup.
  // =========================================================
  async function handleMapClick(event) {
    // Nếu công cụ chưa bật thì trả false để chức năng khác xử lý click.
    if (!active) return false;

    const config = getSelectedConfig();
    if (!config) {
      closePopup();
      setStatus('Chưa chọn lớp để tra cứu');
      return true;
    }

    // Nếu lớp bị tắt trong lúc đang tra cứu thì cập nhật lại danh sách.
    if (config.identifyable !== true && !isLayerVisible(config)) {
      closePopup();
      refreshLayerOptions();
      setStatus('Lớp đã được tắt trên bản đồ');
      return true;
    }

    const source = config.wmsLayer.getSource();
    const view = map.getView();
    const resolution = view.getResolution();
    const projection = view.getProjection();

    if (!resolution || !source || typeof source.getFeatureInfoUrl !== 'function') {
      closePopup();
      setStatus('Lớp không hỗ trợ tra cứu thông tin');
      return true;
    }

    // Tạo URL WMS GetFeatureInfo tại vị trí người dùng click.
    const url = source.getFeatureInfoUrl(
      event.coordinate,
      resolution,
      projection,
      {
        INFO_FORMAT: 'application/json',
        FEATURE_COUNT: 1,
        BUFFER: 8
      }
    );

    if (!url) {
      closePopup();
      setStatus('Không tạo được yêu cầu tra cứu');
      return true;
    }

    // Tăng requestId để phân biệt request mới với request cũ.
    const currentRequest = ++requestId;
    setStatus(`Đang tìm đối tượng trong lớp: ${config.title}...`);

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      // Nếu request đã cũ thì bỏ kết quả, tránh popup hiện sai khi click liên tục.
      if (currentRequest !== requestId) {
        return true;
      }

      // Không tìm thấy đối tượng tại vị trí click.
      if (!data.features?.length) {
        closePopup();
        setStatus(`Không tìm thấy đối tượng thuộc lớp ${config.title}`);
        return true;
      }

      // Đọc feature theo projection hiện tại để highlight không bị lệch.
      const features = geojsonFormat.readFeatures(data, {
        dataProjection: projection,
        featureProjection: projection
      });

      const feature = features[0];
      if (!feature?.getGeometry()) {
        closePopup();
        setStatus(`Không đọc được hình học của lớp ${config.title}`);
        return true;
      }

      // Có kết quả thì highlight và mở popup tại vị trí click.
      showFeaturePopup(feature, config, event.coordinate);
      setStatus(`Đang tra cứu lớp: ${config.title}`);
    } catch (error) {
      console.error('Lỗi tra cứu thông tin:', error);
      closePopup();
      setStatus('Không thể đọc thông tin đối tượng');
    }

    // Trả true để báo rằng click này đã được PopupTool xử lý.
    return true;
  }

  // =========================================================
  // 17. MỞ CÔNG CỤ
  // Đóng tool khác -> reset popup -> nạp lớp -> đổi con trỏ.
  // =========================================================
  function open() {
    if (active) return;

    beforeStart();
    active = true;

    // Xóa kết quả cũ trước khi bắt đầu lần tra cứu mới.
    closePopup();
    refreshLayerOptions();

    controlButton.classList.add('active');
    panel.classList.add('active');
    map.getTargetElement().style.cursor = 'crosshair';

    const config = getSelectedConfig();
    setStatus(
      config
        ? `Đang tra cứu lớp: ${config.title}`
        : 'Chọn lớp rồi click đối tượng trên bản đồ'
    );
  }

  // =========================================================
  // 18. ĐÓNG CÔNG CỤ
  // Tăng requestId để vô hiệu request đang chạy.
  // =========================================================
  function close() {
    active = false;
    requestId++;

    controlButton.classList.remove('active');
    panel.classList.remove('active');
    map.getTargetElement().style.cursor = '';

    closePopup();
  }

  // =========================================================
  // 19. BẬT/TẮT CÔNG CỤ
  // =========================================================
  function toggle() {
    if (active) {
      close();
      return;
    }
    open();
  }

  // =========================================================
  // 20. NHẬN HÀM ĐÓNG CÁC TOOL KHÁC TỪ TOOLMANAGER
  // =========================================================
  function setBeforeStart(callback) {
    beforeStart = typeof callback === 'function'
      ? callback
      : function () {};
  }

  // =========================================================
  // 21. SỰ KIỆN NÚT i
  // =========================================================
  controlButton.onclick = function () {
    toggle();
  };

  // =========================================================
  // 22. SỰ KIỆN NÚT × CỦA POPUP
  // =========================================================
  popupCloser.onclick = function (event) {
    event.preventDefault();
    closePopup();
  };

  // =========================================================
  // 23. KHI NGƯỜI DÙNG ĐỔI LỚP TRA CỨU
  // Đóng kết quả của lớp cũ rồi cập nhật trạng thái.
  // =========================================================
  layerSelect.onchange = function () {
    closePopup();

    const config = getSelectedConfig();
    setStatus(
      config
        ? `Đang tra cứu lớp: ${config.title}`
        : 'Chưa chọn lớp'
    );
  };

  // =========================================================
  // 24. THEO DÕI TRẠNG THÁI BẬT/TẮT CỦA CÁC WMS
  // Khi lớp thay đổi sẽ cập nhật lại combobox tra cứu.
  // =========================================================
  layerConfigs.forEach(function (config) {
    if (!config.wmsLayer) return;

    config.wmsLayer.on('change:visible', function () {
      refreshLayerOptions();
    });
  });

  // =========================================================
  // 25. THEO DÕI TRẠNG THÁI CỦA NHÓM LAYER
  // =========================================================
  Object.values(groupMap).forEach(function (group) {
    if (!group) return;

    group.on('change:visible', function () {
      refreshLayerOptions();
    });
  });

  // =========================================================
  // 26. CÁC HÀM CUNG CẤP CHO MAIN, SEARCH, CRUD, TOOLMANAGER
  // =========================================================
  return {
    control,
    open,
    close,
    toggle,
    handleMapClick,
    showFeaturePopup,
    hideFeaturePopup: closePopup,
    highlightFeature,
    clearHighlight,
    refreshLayerOptions,
    setBeforeStart
  };
}
