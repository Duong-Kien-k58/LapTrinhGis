import {
  createMeasureTool
} from './measureTool.js';

import {
  createSelectBoxTool
} from './selectBoxTool.js';

import {
  createGeolocationTool
} from './geolocationTool.js';

import {
  createPrintTool
} from './printTool.js';


export function createToolManager({
  map,
  layerConfigs,
  satelliteLayer,
  scaleLineControl,
  closeMenu,
  closeDisplayConfigPanel,
  popupTool
}) {
  const measureTool = createMeasureTool(map);
  const selectBoxTool = createSelectBoxTool(map, layerConfigs);
  const printTool = createPrintTool(map, satelliteLayer, scaleLineControl);
  function closeToolsBeforeLocate() {
    document.dispatchEvent(new CustomEvent('webgis-tool-activate', { detail: { name: 'geolocation' } }));
    measureTool.close();
    selectBoxTool.close();
    printTool.close();
    popupTool?.close();
    if (closeDisplayConfigPanel) closeDisplayConfigPanel();
  }
  const geolocationTool = createGeolocationTool(map, closeToolsBeforeLocate);
  function closeAllTools() {
    measureTool.close();
    selectBoxTool.close();
    geolocationTool.stop();
    printTool.close();
    popupTool?.close();
    if (closeDisplayConfigPanel) closeDisplayConfigPanel();
  }


  document
    .querySelectorAll('[data-tool-action]')
    .forEach(function (item) {
      item.addEventListener(
        'click',
        function () {
          const action =
            item.dataset.toolAction;

          closeAllTools();

          if (action === 'measure') {
            measureTool.open();
          }

          if (action === 'select-box') {
            selectBoxTool.open();

            alert(
              'Giữ Ctrl và kéo chuột để chọn đối tượng'
            );
          }

          if (action === 'print-map') {
            printTool.open();
          }

          closeMenu();
        }
      );
    });


  return {
    measureTool,
    selectBoxTool,
    geolocationTool,
    printTool,
    closeAllTools
  };
}
