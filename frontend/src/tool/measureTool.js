import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import Overlay from 'ol/Overlay.js';
import Draw from 'ol/interaction/Draw.js';
import LineString from 'ol/geom/LineString.js';
import {Style, Fill, Stroke, Circle as CircleStyle} from 'ol/style.js';
import { getLength, getArea } from 'ol/sphere.js';
import { makePanelDraggable } from './toolUtils.js';


export function createMeasureTool(map) {
  const measureSource = new VectorSource(); //Tạo nguồn dữ liệu đo đạc
  const measureLayer = new VectorLayer({ //Tạo lớp đo đạc
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

  //Các biến để lưu trữ trạng thái đo đạc
  let measureDraw = null;  //Lưu trữ đối tượng Draw để đo đạc
  let movingTooltip = null; //Lưu trữ overlay tooltip di chuyển
  let movingTooltipElement = null; //Lưu trữ phần tử tooltip di chuyển
  let segmentCount = 0; //Đếm số đoạn đã đo để hiển thị nhãn đoạn
  let tooltipOverlays = []; //Lưu trữ các overlay tooltip để hiển thị kết quả đo đạc


  // Tạo panel
  const panel = document.createElement('div');
  panel.id = 'measure-panel';
  panel.className = 'advanced-panel';

  panel.innerHTML = `
    <div class="advanced-panel-header" id="measure-panel-header">
      <span>Công cụ đo đạc</span>

      <button id="measure-panel-close" class="advanced-panel-close" title="Tắt công cụ" >
        ×
      </button>
    </div>

    <div class="advanced-panel-body">
      <button id="measure-line-btn">
        Đo khoảng cách
      </button>

      <button id="measure-area-btn">
        Đo diện tích
      </button>

      <button id="measure-clear-btn">
        Xóa kết quả đo
      </button>
    </div>
  `;

  document.querySelector('.map-wrapper').appendChild(panel);

  const header = panel.querySelector('#measure-panel-header');
  const closeButton = panel.querySelector('#measure-panel-close');
  const lineButton = panel.querySelector('#measure-line-btn');
  const areaButton = panel.querySelector('#measure-area-btn');
  const clearButton = panel.querySelector('#measure-clear-btn');

  // Cho phép kéo panel bằng phần tiêu đề
  makePanelDraggable(panel, header);

  // Hàm định dạng kết quả đo đạc
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
  function getMidPoint(point1, point2) {
    return [
      (point1[0] + point2[0]) / 2,
      (point1[1] + point2[1]) / 2
    ];
  }

  //Hàm tạo tooltip để hiển thị kết quả đo đạc
  function createTooltip(className, offset = [0, -12]) {
    const element = document.createElement('div');
    element.className = className;

    const overlay = new Overlay({
      element,
      offset,
      positioning: 'bottom-center',
      stopEvent: false
    });

    map.addOverlay(overlay);
    tooltipOverlays.push(overlay);

    return {
      element,
      overlay
    };
  }

  //Hàm tạo tooltip động khi đang vẽ
  function createMovingTooltip() {
    const tooltip = createTooltip(
      'measure-tooltip',
      [10, -15]
    );

    movingTooltipElement = tooltip.element;
    movingTooltip = tooltip.overlay;
  }

  //Hàm tạo tooltip tĩnh để hiển thị kết quả đo đạc cuối cùng
  function createStaticTooltip(text, coordinate, extraClass = '') {
    const tooltip = createTooltip(
      'measure-tooltip measure-tooltip-static ' + extraClass, [0, -10]
    );

    tooltip.element.innerHTML = text;
    tooltip.overlay.setPosition(coordinate);
  }

  //Xóa tooltip
  function removeTooltip(overlay) {
    if (!overlay) return;
    map.removeOverlay(overlay);
    tooltipOverlays = tooltipOverlays.filter(
      function (item) {
        return item !== overlay;
      }
    );
  }

  //Xóa tooltip động khi kết thúc đo đạc
  function removeMovingTooltip() {
    if (movingTooltip) {
      removeTooltip(movingTooltip);
    }

    movingTooltip = null;
    movingTooltipElement = null;
  }

  //Hàm dừng đo đạc
  function stop() {
    if (measureDraw) {
      map.removeInteraction(measureDraw);
      measureDraw = null;
    }

    removeMovingTooltip();
    segmentCount = 0;
  }
  // Tạo nhãn chiều dài cho từng đoạn
  function addSegmentLabels(coordinates, maxIndex) {
    for (let index = segmentCount; index < maxIndex; index++) {
      const start = coordinates[index];
      const end = coordinates[index + 1];

      if (!start || !end) continue;

      const segment = new LineString([start, end]);

      createStaticTooltip(
        formatLength(segment),
        getMidPoint(start, end),
        'measure-tooltip-segment'
      );
    }

    segmentCount = maxIndex;
  }

  // Bắt đầu đo khoảng cách
  function startLine() {
    measureLayer.setVisible(true);
    stop();
    createMovingTooltip();

    measureDraw = new Draw({
      source: measureSource,
      type: 'LineString'
    });

    map.addInteraction(measureDraw);

    measureDraw.on('drawstart', function (event) {
      const geometry = event.feature.getGeometry();

      geometry.on('change', function (changeEvent) {
        const line = changeEvent.target;
        const coordinates = line.getCoordinates();

        if (coordinates.length < 2) return;

        const completedSegments = Math.max(coordinates.length - 2, 0);
        addSegmentLabels(coordinates, completedSegments);

        const start = coordinates[coordinates.length - 2];
        const end = coordinates[coordinates.length - 1];
        const segment = new LineString([start, end]);

        if (movingTooltip && movingTooltipElement) {
          movingTooltipElement.innerHTML = formatLength(segment);
          movingTooltip.setPosition(getMidPoint(start, end));
        }
      });
    });

    measureDraw.on('drawend', function (event) {
      const geometry = event.feature.getGeometry();
      const coordinates = geometry.getCoordinates();

      addSegmentLabels(coordinates, coordinates.length - 1);

      createStaticTooltip(
        'Tổng: ' + formatLength(geometry),
        coordinates[coordinates.length - 1],
        'measure-tooltip-total'
      );

      stop();
    });
  }

  // Bắt đầu đo diện tích
  function startArea() {
    measureLayer.setVisible(true);
    stop();
    createMovingTooltip();

    measureDraw = new Draw({
      source: measureSource,
      type: 'Polygon'
    });

    map.addInteraction(measureDraw);

    measureDraw.on('drawstart', function (event) {
      const geometry = event.feature.getGeometry();

      geometry.on('change', function (changeEvent) {
        const polygon = changeEvent.target;
        const center = polygon.getInteriorPoint().getCoordinates();

        if (movingTooltip && movingTooltipElement) {
          movingTooltipElement.innerHTML = formatArea(polygon);
          movingTooltip.setPosition(center);
        }
      });
    });

    measureDraw.on('drawend', function (event) {
      const polygon = event.feature.getGeometry();
      const center = polygon.getInteriorPoint().getCoordinates();

      createStaticTooltip(
        'Diện tích: ' + formatArea(polygon),
        center,
        'measure-tooltip-total'
      );

      stop();
    });
  }

  // Xóa toàn bộ kết quả đo
  function clear() {
    stop();
    measureSource.clear();
    tooltipOverlays.slice().forEach(removeTooltip);

    tooltipOverlays = [];
    segmentCount = 0;
  }

  // Mở và đóng bảng đo đạc
  function open() {
    panel.classList.add('active');
  }

  function close() {
    stop();
    panel.classList.remove('active');
  }

  // Ẩn hoặc hiện nhãn theo trạng thái lớp đo
  measureLayer.on('change:visible', function () {
    const visible = measureLayer.getVisible();

    tooltipOverlays.forEach(function (overlay) {
      const element = overlay.getElement();
      if (element) element.style.display = visible ? '' : 'none';
    });

    if (!visible) stop();
  });

  // Gắn sự kiện cho các nút
  lineButton.onclick = startLine;
  areaButton.onclick = startArea;
  clearButton.onclick = clear;
  closeButton.onclick = close;

  return {
    open,
    close
  };
}