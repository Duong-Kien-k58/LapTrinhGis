/*
  QUẢN LÝ TÌM KIẾM ĐỐI TƯỢNG
  - Nạp dữ liệu từ các lớp WFS được cấu hình searchable.
  - Tìm kiếm theo searchFields trong layers.js.
  - Hiển thị danh sách gợi ý, zoom và popup kết quả.
  - Cung cấp refresh() để nạp lại dữ liệu sau CRUD.
*/

import GeoJSON from 'ol/format/GeoJSON.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import { Style, Fill, Stroke, Circle as CircleStyle } from 'ol/style.js';
import { escapeHTML, getConfiguredValue, getRequiredElement } from './toolUtils.js';

export function createSearchManager({
  map,
  layerConfigs,
  closeMenu = function () {},
  showFeaturePopup = function () {},
  hideFeaturePopup = function () {},
  preloadDelay = 800,
  resultLimit = 10
}) {
  if (!map) throw new Error('createSearchManager: thiếu map');
  if (!Array.isArray(layerConfigs)) {
    throw new Error('createSearchManager: layerConfigs phải là mảng');
  }

  const searchInput = getRequiredElement('search-input');
  const searchBtn = getRequiredElement('search-btn');
  const searchSuggestPanel = getRequiredElement('search-suggest-panel');
  const searchSuggestList = getRequiredElement('search-suggest-list');

  const searchLayers = layerConfigs.filter(
    config => config.wfsLayer
  );

  const geojsonFormat = new GeoJSON();
  const searchStyle = new Style({
    fill: new Fill({ color: 'rgba(255,255,0,0.35)' }),
    stroke: new Stroke({ color: '#ffff00', width: 4 }),
    image: new CircleStyle({
      radius: 9,
      fill: new Fill({ color: '#ffff00' }),
      stroke: new Stroke({ color: '#ffffff', width: 2 })
    })
  });

  let searchTimer = null;
  let searchIndex = [];
  let searchReadyPromise = null;
  let searchHighlightLayer = null;
  let refreshTimer = null;
  let indexVersion = 0;
  let searchVersion = 0;
  let loadFailures = 0;

  function normalizeText(value) {
    return String(value ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .trim();
  }

  function getWfsUrl(layer) {
    const rawUrl = layer?.getSource?.()?.getUrl?.();
    if (typeof rawUrl !== 'string') return null;

    const url = new URL(rawUrl, window.location.href);
    url.searchParams.set('service', 'WFS');
    url.searchParams.set('version', '1.0.0');
    url.searchParams.set('request', 'GetFeature');
    url.searchParams.set('outputFormat', 'application/json');
    url.searchParams.set('maxFeatures', '100000');
    return url.toString();
  }

  function makeDescription(feature, config) {
    const values = (config.searchFields || [])
      .map(field => feature.get(field))
      .filter(value => value !== undefined && value !== null && value !== '');

    return values.length
      ? values.slice(0, 3).join(', ')
      : config.searchTitle || config.title;
  }

  async function loadSearchLayer(config) {
    const version = indexVersion;
    const url = getWfsUrl(config.wfsLayer);
    if (!url) return [];

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`${config.title}: HTTP ${response.status}`);
    }

    const data = await response.json();
    if (version !== indexVersion) return [];
    const features = geojsonFormat.readFeatures(data, {
      featureProjection: map.getView().getProjection(),
      dataProjection: 'EPSG:4326'
    });

    const source = config.wfsLayer.getSource();
    source.clear(true);
    source.addFeatures(features);

    return features.map(function (feature, index) {
      const name = getConfiguredValue(
        feature,
        config.searchFields,
        `${config.searchTitle || config.title} ${index + 1}`
      );
      const description = makeDescription(feature, config);
      const allValues = Object.entries(feature.getProperties())
        .filter(([key]) => key !== feature.getGeometryName())
        .map(([, value]) => typeof value === 'object' ? JSON.stringify(value) : value)
        .join(' ');

      return {
        feature,
        config,
        name,
        description,
        searchText: normalizeText(`${name} ${description} ${allValues}`)
      };
    });
  }

  function preloadData() {
    if (searchReadyPromise) return searchReadyPromise;

    const version = indexVersion;
    searchReadyPromise = Promise.allSettled(searchLayers.map(loadSearchLayer))
      .then(function (results) {
        if (version !== indexVersion) return [];
        loadFailures = results.filter(result => result.status === 'rejected').length;
        if (loadFailures === searchLayers.length && searchLayers.length) throw new Error('Không thể tải các lớp tìm kiếm');
        searchIndex = results.filter(result => result.status === 'fulfilled').flatMap(result => result.value);
        console.log('Đã nạp dữ liệu tìm kiếm:', searchIndex.length, 'đối tượng');
        return searchIndex;
      })
      .catch(function (error) {
        if (version !== indexVersion) return [];
        searchIndex = [];
        searchReadyPromise = null;
        console.error('Lỗi nạp dữ liệu tìm kiếm:', error);
        throw error;
      });

    return searchReadyPromise;
  }

  function showMessage(text, className = 'search-suggest-empty') {
    searchSuggestList.innerHTML = `
      <div class="${className}">${escapeHTML(text)}</div>
    `;
    searchSuggestPanel.classList.add('active');
  }

  function close() {
    searchVersion++;
    clearTimeout(searchTimer);
    searchSuggestPanel.classList.remove('active');
  }

  function clearHighlight() {
    if (!searchHighlightLayer) return;
    map.removeLayer(searchHighlightLayer);
    searchHighlightLayer = null;
  }

  function getPopupCoordinate(geometry) {
    if (!geometry) return null;

    switch (geometry.getType()) {
      case 'Point':
        return geometry.getCoordinates();
      case 'MultiPoint':
        return geometry.getCoordinates()[0] || null;
      case 'LineString':
        return geometry.getCoordinateAt(0.5);
      case 'MultiLineString':
        return geometry.getLineStrings()[0]?.getCoordinateAt(0.5) || null;
      case 'Polygon':
        return geometry.getInteriorPoint().getCoordinates();
      case 'MultiPolygon':
        return geometry.getInteriorPoints().getFirstCoordinate();
      default: {
        const extent = geometry.getExtent();
        return [
          (extent[0] + extent[2]) / 2,
          (extent[1] + extent[3]) / 2
        ];
      }
    }
  }

  function zoomToResult(item) {
    const geometry = item.feature.getGeometry();
    if (!geometry) {
      alert('Đối tượng không có hình học');
      return;
    }

    clearHighlight();
    searchHighlightLayer = new VectorLayer({
      source: new VectorSource({ features: [item.feature.clone()] }),
      style: searchStyle,
      zIndex: 9999
    });
    map.addLayer(searchHighlightLayer);

    if (['Point', 'MultiPoint'].includes(geometry.getType())) {
      map.getView().animate({
        center: getPopupCoordinate(geometry),
        zoom: 14,
        duration: 400
      });
    } else {
      map.getView().fit(geometry.getExtent(), {
        padding: [90, 90, 90, 90],
        duration: 400,
        maxZoom: 15
      });
    }

    showFeaturePopup(
      item.feature,
      item.config,
      getPopupCoordinate(geometry)
    );
    close();
  }

  function renderResults(results) {
    searchSuggestList.innerHTML = '';

    if (!results.length) {
      showMessage('Không tìm thấy kết quả phù hợp');
      return;
    }

    results.forEach(function (item) {
      const resultElement = document.createElement('div');
      resultElement.className = 'search-suggest-item';
      resultElement.innerHTML = `
        <div class="search-suggest-icon">
          ${escapeHTML(item.config.searchIcon || '▣')}
        </div>
        <div class="search-suggest-main">
          <div class="search-suggest-name">${escapeHTML(item.name)}</div>
          <div class="search-suggest-desc">
            ${escapeHTML(
              item.description ||
              item.config.searchTitle ||
              item.config.title
            )}
          </div>
        </div>
      `;

      resultElement.addEventListener('click', function () {
        searchInput.value = item.name;
        zoomToResult(item);
      });

      searchSuggestList.appendChild(resultElement);
    });

    searchSuggestPanel.classList.add('active');
  }

  async function searchNow() {
    const version = ++searchVersion;
    const keyword = searchInput.value.trim();

    if (keyword.length < 2) {
      showMessage('Nhập ít nhất 2 ký tự để tìm kiếm');
      return;
    }

    if (!searchIndex.length) {
      showMessage(
        'Đang nạp dữ liệu tìm kiếm lần đầu...',
        'search-suggest-loading'
      );
    }

    try {
      await preloadData();
      if (version !== searchVersion) return;
      const normalizedKeyword = normalizeText(keyword);
      const results = searchIndex
        .filter(item => item.searchText.includes(normalizedKeyword))
        .slice(0, resultLimit);
      renderResults(results);
      if (loadFailures) {
        const warning = document.createElement('div');
        warning.className = 'search-suggest-empty';
        warning.textContent = `${loadFailures} lớp chưa tải được. Kết quả hiện tại chỉ bao gồm các lớp tải thành công.`;
        searchSuggestList.append(warning);
      }
    } catch (error) {
      if (version !== searchVersion) return;
      showMessage('Không thể nạp dữ liệu tìm kiếm');
    }
  }

  function open() {
    searchInput.focus();
    showMessage('Nhập từ khóa tìm kiếm đối tượng');
  }

  function refresh(delay = 500) {
    indexVersion++;
    searchVersion++;
    clearTimeout(refreshTimer);
    searchIndex = [];
    searchReadyPromise = null;

    refreshTimer = setTimeout(function () {
      preloadData().catch(function () {});
    }, delay);
  }

  function bindEvents() {
    searchInput.addEventListener('input', function () {
      searchVersion++;
      clearTimeout(searchTimer);

      if (!searchInput.value.trim()) {
        close();
        clearHighlight();
        hideFeaturePopup();
        return;
      }

      searchTimer = setTimeout(searchNow, 250);
    });

    searchInput.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') searchNow();
      if (event.key === 'Escape') {
        close();
        clearHighlight();
        hideFeaturePopup();
      }
    });

    searchInput.addEventListener('focus', function () {
      if (!searchInput.value.trim()) {
        showMessage('Nhập từ khóa tìm kiếm đối tượng');
      }
    });

    searchBtn.addEventListener('click', searchNow);

    document.addEventListener('click', function (event) {
      const clickedSearch =
        event.target.closest('.search-box') ||
        event.target.closest('#search-suggest-panel');
      if (!clickedSearch) close();
    });

    const searchMenuButton = document.querySelector(
      '[data-menu-action="search-data"]'
    );
    if (searchMenuButton) {
      searchMenuButton.addEventListener('click', function () {
        open();
        closeMenu();
      });
    }
  }

  bindEvents();
  setTimeout(function () {
    preloadData().catch(function () {});
  }, preloadDelay);

  return {
    open,
    close,
    searchNow,
    refresh,
    clearHighlight,
    preloadData
  };
}
