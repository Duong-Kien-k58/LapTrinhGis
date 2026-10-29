import { jsPDF } from 'jspdf';
import { getPointResolution } from 'ol/proj.js';

import {
  makePanelDraggable
} from './toolUtils.js';


export function createPrintTool(
  map,
  satelliteLayer,
  scaleLineControl
) {
  const pdfDimensions = {
    a0: [1189, 841],
    a1: [841, 594],
    a2: [594, 420],
    a3: [420, 297],
    a4: [297, 210],
    a5: [210, 148]
  };

  const screenDpi = 96;
  let exporting = false;


  const panel = document.createElement('div');

  panel.id = 'print-panel';
  panel.className = 'advanced-panel';

  panel.innerHTML = `
    <div class="advanced-panel-header" id="print-panel-header">
      <span>Xuất bản đồ PDF</span>

      <button
        id="print-panel-close"
        class="advanced-panel-close"
      >
        ×
      </button>
    </div>

    <div class="advanced-panel-body">
      <label class="pdf-label">Khổ giấy</label>

      <select id="pdf-format" class="pdf-select">
        <option value="a0">A0</option>
        <option value="a1">A1</option>
        <option value="a2">A2</option>
        <option value="a3">A3</option>
        <option value="a4" selected>A4</option>
        <option value="a5">A5</option>
      </select>

      <label class="pdf-label">Hướng giấy</label>

      <select id="pdf-orientation" class="pdf-select">
        <option value="landscape" selected>Ngang</option>
        <option value="portrait">Dọc</option>
      </select>

      <label class="pdf-label">Độ phân giải</label>

      <select id="pdf-resolution" class="pdf-select">
        <option value="72">72 dpi</option>
        <option value="150" selected>150 dpi</option>
        <option value="300">300 dpi</option>
      </select>

      <label class="pdf-label">Tỷ lệ bản đồ</label>

      <div class="pdf-scale-row">
        <input
          id="pdf-scale"
          class="pdf-select"
          type="number"
          value="250000"
          min="1"
        >

        <button id="pdf-zoom-scale-btn">
          Zoom
        </button>
      </div>

      <button id="export-pdf-btn">
        Xuất PDF
      </button>
    </div>
  `;

  document
    .querySelector('.map-wrapper')
    .appendChild(panel);


  const header =
    panel.querySelector('#print-panel-header');

  const closeButton =
    panel.querySelector('#print-panel-close');

  const exportButton =
    panel.querySelector('#export-pdf-btn');

  const scaleInput =
    panel.querySelector('#pdf-scale');

  const zoomButton =
    panel.querySelector('#pdf-zoom-scale-btn');

  const formatSelect =
    panel.querySelector('#pdf-format');

  const orientationSelect =
    panel.querySelector('#pdf-orientation');

  const resolutionSelect =
    panel.querySelector('#pdf-resolution');

  makePanelDraggable(panel, header);


  function getScale() {
    return Math.max(
      1,
      Math.round(Number(scaleInput.value) || 1)
    );
  }


  function mmToPx(mm, dpi) {
    return Math.round(mm * dpi / 25.4);
  }


  function scaleToResolution(
    scale,
    dpi = screenDpi
  ) {
    const view = map.getView();

    return (
      scale / 1000
    ) / getPointResolution(
      view.getProjection(),
      dpi / 25.4,
      view.getCenter(),
      'm'
    );
  }


  function resolutionToScale(
    resolution,
    dpi = screenDpi
  ) {
    const view = map.getView();

    const pointResolution =
      getPointResolution(
        view.getProjection(),
        resolution,
        view.getCenter(),
        'm'
      );

    return (
      pointResolution *
      dpi /
      25.4 *
      1000
    );
  }


  function updateScaleInput() {
    if (exporting) return;
    if (document.activeElement === scaleInput) return;

    const resolution =
      map.getView().getResolution();

    if (!resolution) return;

    scaleInput.value = Math.round(
      resolutionToScale(resolution)
    );
  }


  function zoomToScale() {
    map.getView().animate({
      resolution: scaleToResolution(getScale()),
      duration: 400
    });
  }


  function getLayout(format, dpi, orientation) {
    const base = pdfDimensions[format];

    const dimensions =
      orientation === 'portrait'
        ? [
            Math.min(base[0], base[1]),
            Math.max(base[0], base[1])
          ]
        : [
            Math.max(base[0], base[1]),
            Math.min(base[0], base[1])
          ];

    const margin = 8;
    const headerHeight = 16;
    const footerHeight = 10;

    const pageWidth = dimensions[0];
    const pageHeight = dimensions[1];

    const mapWidth =
      pageWidth - margin * 2;

    const mapHeight =
      pageHeight -
      margin * 2 -
      headerHeight -
      footerHeight;

    return {
      margin,
      pageWidth,
      pageHeight,

      mapX: margin,
      mapY: margin + headerHeight,

      mapWidth,
      mapHeight,

      widthPx: mmToPx(mapWidth, dpi),
      heightPx: mmToPx(mapHeight, dpi)
    };
  }


  function drawMap(width, height) {
    const canvas =
      document.createElement('canvas');

    canvas.width = width;
    canvas.height = height;

    const context =
      canvas.getContext('2d');

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);

    map
      .getViewport()
      .querySelectorAll(
        '.ol-layer canvas, canvas.ol-layer'
      )
      .forEach(function (layerCanvas) {
        if (
          layerCanvas.width <= 0 ||
          layerCanvas.height <= 0
        ) {
          return;
        }

        const opacity =
          layerCanvas.parentNode?.style?.opacity || '';

        const transform =
          layerCanvas.style.transform;

        let matrix = [1, 0, 0, 1, 0, 0];

        if (
          transform &&
          transform.startsWith('matrix')
        ) {
          const match = transform.match(
            /^matrix\(([^\)]*)\)$/
          );

          if (match) {
            matrix = match[1]
              .split(',')
              .map(Number);
          }
        }

        context.globalAlpha =
          opacity === ''
            ? 1
            : Number(opacity);

        context.setTransform(...matrix);

        context.drawImage(
          layerCanvas,
          0,
          0
        );
      });

    context.globalAlpha = 1;
    context.setTransform(1, 0, 0, 1, 0, 0);

    return canvas;
  }


  function savePdf(
    canvas,
    layout,
    format,
    scale,
    orientation
  ) {
    const pdf = new jsPDF(
      orientation,
      'mm',
      format
    );

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);

    pdf.text(
      'BAN DO',
      layout.pageWidth / 2,
      layout.margin + 4,
      {
        align: 'center'
      }
    );

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);

    pdf.text(
      `Ty le: 1:${scale}`,
      layout.pageWidth / 2,
      layout.margin + 11,
      {
        align: 'center'
      }
    );

    pdf.addImage(
      canvas.toDataURL('image/jpeg', 0.95),
      'JPEG',
      layout.mapX,
      layout.mapY,
      layout.mapWidth,
      layout.mapHeight
    );

    pdf.rect(
      layout.mapX,
      layout.mapY,
      layout.mapWidth,
      layout.mapHeight
    );

    pdf.save(
      `Ban_do_${format.toUpperCase()}_1-${scale}.pdf`
    );
  }


  function open() {
    updateScaleInput();
    panel.classList.add('active');
  }


  function close() {
    panel.classList.remove('active');
  }


  function exportPdf() {
    const format = formatSelect.value;
    const orientation = orientationSelect.value;
    const dpi = Number(resolutionSelect.value);
    const scale = getScale();

    const view = map.getView();
    const mapElement = map.getTargetElement();

    const layout = getLayout(
      format,
      dpi,
      orientation
    );

    const oldState = {
      resolution: view.getResolution(),

      center: view.getCenter()
        ? [...view.getCenter()]
        : null,

      width: mapElement.style.width,
      height: mapElement.style.height,

      satelliteVisible:
        satelliteLayer?.getVisible() || false
    };


    function restore() {
      mapElement.style.width =
        oldState.width;

      mapElement.style.height =
        oldState.height;

      map.updateSize();

      if (oldState.center) {
        view.setCenter(oldState.center);
      }

      view.setResolution(oldState.resolution);

      if (satelliteLayer) {
        satelliteLayer.setVisible(
          oldState.satelliteVisible
        );
      }

      if (
        scaleLineControl &&
        scaleLineControl.setDpi
      ) {
        scaleLineControl.setDpi();
      }

      exportButton.disabled = false;
      exportButton.innerText = 'Xuất PDF';

      exporting = false;
      updateScaleInput();
    }


    exporting = true;

    exportButton.disabled = true;
    exportButton.innerText =
      'Đang xuất PDF...';

    panel.classList.remove('active');

    if (satelliteLayer) {
      satelliteLayer.setVisible(false);
    }

    if (
      scaleLineControl &&
      scaleLineControl.setDpi
    ) {
      scaleLineControl.setDpi(dpi);
    }

    mapElement.style.width =
      layout.widthPx + 'px';

    mapElement.style.height =
      layout.heightPx + 'px';

    map.updateSize();

    view.setResolution(
      scaleToResolution(scale, dpi)
    );

    map.once('rendercomplete', function () {
      try {
        const canvas = drawMap(
          layout.widthPx,
          layout.heightPx
        );

        savePdf(
          canvas,
          layout,
          format,
          scale,
          orientation
        );
      } catch (error) {
        console.error(error);

        alert(
          'Không xuất được PDF. Kiểm tra CORS.'
        );
      } finally {
        restore();
      }
    });

    map.renderSync();
  }


  zoomButton.onclick = zoomToScale;
  closeButton.onclick = close;
  exportButton.onclick = exportPdf;

  scaleInput.addEventListener(
    'keydown',
    function (event) {
      if (event.key === 'Enter') {
        zoomToScale();
      }
    }
  );

  map
    .getView()
    .on('change:resolution', updateScaleInput);


  return {
    panel,
    open,
    close,
    exportPdf
  };
}
