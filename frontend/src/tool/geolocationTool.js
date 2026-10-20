import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import Geolocation from 'ol/Geolocation.js';
import Control from 'ol/control/Control.js';
import {Style, Fill, Stroke, Circle as CircleStyle} from 'ol/style.js';

//Hàm tạo công  cụ định vị
export function createGeolocationTool(map, beforeStart = function () {}) {
  let active = false;
  let hasZoomed = false;

  //Khởi tạo đối tượng định vị
  const geolocation = new Geolocation({
    trackingOptions: {
      enableHighAccuracy: true
    },
    projection: map.getView().getProjection()
  });

  //Tạo đối tượng hiển thị vị trí
  const positionFeature = new Feature();
  positionFeature.setStyle(new Style({
      image: new CircleStyle({
        radius: 8,
        fill: new Fill({
          color: '#cc0f2b'
        }),
        stroke: new Stroke({
          color: '#ffffff',
          width: 3
        })
      })
    })
  );

  //Tạo lớp chứa vị trí
  const positionLayer = new VectorLayer({
    visible: false,
    source: new VectorSource({
      features: [positionFeature]
    }),
    zIndex: 9999
  });
  map.addLayer(positionLayer);

  //Tạo nút định vị
  const button = document.createElement('button');
  button.className = 'ol-locate-btn';
  button.title = 'Định vị vị trí hiện tại';
  button.innerHTML = `<svg class="map-control-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><circle class="icon-fill" cx="12" cy="12" r="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>`;
  //Tạo control định vị
  const element = document.createElement('div');
  element.className = 'ol-locate ol-control';
  element.appendChild(button);
  const control = new Control({
    element
  });
  map.addControl(control);

  //Cập nhật trạng thái nút
  function updateButton() {
    button.classList.toggle('active', active);
    button.title = active
      ? 'Tắt định vị vị trí hiện tại'
      : 'Định vị vị trí hiện tại';
  }

  //Hàm bật vị trí  
  function start() {
    active = true;
    hasZoomed = false;
    positionLayer.setVisible(true);
    geolocation.setTracking(true);
    updateButton();
  }

  //Hàm tắt vị trí
  function stop() {
    active = false;
    hasZoomed = false;
    geolocation.setTracking(false);
    positionFeature.setGeometry(null);
    positionLayer.setVisible(false);
    updateButton();
  }

  //Hàm bật/tắt vị trí
  function toggle() {
    if (active) {
      stop();
      return;
    }
    beforeStart();
    start();
  }

  //Hàm xử lí khi vị trí thay đổi
  geolocation.on('change:position', function () {
    if (!active) return;

    const coordinates = geolocation.getPosition(); //Lấy tọa độ hiện tại của người dùng
    if (!coordinates) return;

    //Cập nhật vị trí điểm
    positionFeature.setGeometry(
      new Point(coordinates)
    );
    positionLayer.setVisible(true);

    //Đưa bản đồ tới vị trí mới
    if (!hasZoomed) {
      map.getView().animate({
        center: coordinates,
        zoom: 15,
        duration: 800
      });
      hasZoomed = true;
    }
  });

  //Xử lí khi có lỗi xảy ra
  geolocation.on('error', function (error) {
    alert( 'Không lấy được vị trí: ' + error.message);
    stop();
  });

  button.onclick = toggle;

  return {
    button,
    control,
    positionLayer,
    start,
    stop,
    toggle
  };
}