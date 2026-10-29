//#region Imports
import * as Cesium from 'cesium';
import ImageWMS from 'ol/source/ImageWMS.js';
import TileWMS from 'ol/source/TileWMS.js';
import { get as getProjection, fromLonLat } from 'ol/proj.js';
import { STARTUP_3D_VIEW } from '../config/layers.js';
//#endregion

//#region 1. Đồng bộ cây lớp OpenLayers và Cesium
// OL-Cesium thêm một lớp động với parents=[]; khi TOC khôi phục hoặc kéo
// lớp giữa các nhóm, cần tìm lại cha từ cây OpenLayers trước khi gắn listener.
export function findLayerParents(root, target, ancestors = []) {
  if (root === target) return ancestors.slice().reverse();
  const children = root.getLayers?.();
  if (!children) return null;
  for (const child of children.getArray()) {
    const parents = findLayerParents(child, target, [...ancestors, root]);
    if (parents) return parents;
  }
  return null;
}

export function withCurrentLayerParents(Synchronizer) {
  return class extends Synchronizer {
    createSingleLayerCounterparts(layerWithParents) {
      const root = this.map.getLayerGroup();
      // OL-Cesium cố ý ẩn root để dừng vẽ 2D khi mở 3D; không kế thừa
      // visibility/opacity của root, chỉ kế thừa các nhóm dữ liệu thực tế.
      const parents = findLayerParents(root, layerWithParents.layer)?.filter(parent => parent !== root);
      return super.createSingleLayerCounterparts({
        ...layerWithParents,
        parents: parents ?? layerWithParents.parents,
      });
    }
  };
}
//#endregion

//#region 2. Tải ảnh WMS và gửi style bằng POST
export function wmsPostRequest(src) {
  const url = new URL(src, typeof location === 'undefined' ? 'http://localhost/' : location.href);
  const hasStyle = [...url.searchParams.keys()].some(key => key.toUpperCase() === 'SLD_BODY');
  if (!hasStyle && src.length < 8000) return null;
  const data = url.searchParams.toString();
  url.search = '';
  return { url: url.href, data };
}

// Dùng Resource để POST vẫn tuân theo hàng đợi và hủy request của Cesium.
export function loadPostImage(Cesium, spec, request) {
  const resource = new Cesium.Resource({ url: spec.url, request });
  const pending = resource.post(spec.data, {
    responseType: 'blob',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
  });
  // Cesium yêu cầu undefined khi hàng đợi đầy để thử lại ở frame sau.
  if (!pending) return undefined;
  return pending.then(blob => {
    if (!blob.type?.toLowerCase().startsWith('image/')) throw new Error('GeoServer không trả về ảnh WMS hợp lệ.');
    const objectUrl = URL.createObjectURL(blob);
    return Cesium.Resource.fetchImage({ url: objectUrl, preferImageBitmap: true, flipY: true })
      .finally(() => URL.revokeObjectURL(objectUrl));
  });
}

export function wrapWmsProvider(provider, source, map, loadImage) {
  const originalRequest = provider.requestImage.bind(provider);
  const imageSource = source instanceof ImageWMS;
  const tileSource = imageSource ? new TileWMS({
    url: source.getUrl(), projection: source.getProjection(), params: source.getParams(),
  }) : source;
  let revision = source.getRevision();
  provider.requestImage = function (x, y, level, request) {
    if (!provider.ready) return originalRequest(x, y, level, request);
    if (imageSource && revision !== source.getRevision()) {
      tileSource.setUrl(source.getUrl());
      tileSource.setParams(source.getParams());
      revision = source.getRevision();
    }
    const projection = getProjection(source.get('olcs_projection')) || source.getProjection() || map.getView().getProjection();
    const zoom = provider.shouldRequestNextLevel ? level + 1 : level;
    const url = tileSource.getTileUrlFunction().call(tileSource, [zoom, x, y], 1, projection);
    if (!url) return originalRequest(x, y, level, request);
    const spec = wmsPostRequest(url);
    if (!spec) return originalRequest(x, y, level, request);
    // Proxy chuyển đổi URL dịch vụ, không đưa SLD dài trở lại query string.
    if (provider.proxy) spec.url = provider.proxy.getURL(spec.url);
    return loadImage(spec, request);
  };
}

export function withWmsPostRequests(Synchronizer, Cesium) {
  return class extends Synchronizer {
    convertLayerToCesiumImageries(layer, projection) {
      const images = super.convertLayerToCesiumImageries(layer, projection);
      const source = layer.getSource?.();
      if (source instanceof TileWMS || source instanceof ImageWMS) {
        images?.forEach(image => wrapWmsProvider(image.imageryProvider, source, this.map,
          (spec, request) => loadPostImage(Cesium, spec, request)));
      }
      return images;
    }
  };
}
//#endregion

//#region 3. Tính toán địa hình: lấy mẫu, chiều dài và diện tích
const ellipsoid = Cesium.Ellipsoid.WGS84;

// Lấy điểm trên địa hình, không lấy mái công trình hoặc mặt phẳng ellipsoid.
export function pickTerrain(scene, pixel) {
  const ray = scene.camera.getPickRay(pixel);
  return ray ? scene.globe.pick(ray, scene) : undefined;
}

export function samplePath(vertices, targetStep = 20, maxSamples = 4096) {
  if (vertices.length < 2) throw new Error('Chọn ít nhất hai điểm.');
  const segments = vertices.slice(1).map((end, index) =>
    new Cesium.EllipsoidGeodesic(vertices[index], end, ellipsoid));
  const total = segments.reduce((sum, segment) => sum + segment.surfaceDistance, 0);
  if (total < .1) throw new Error('Đường quá ngắn. Hãy chọn hai vị trí khác nhau.');
  const step = Math.max(targetStep, total / (maxSamples - segments.length - 1));
  const positions = [Cesium.Cartographic.clone(vertices[0])];
  const distances = [0];
  let offset = 0;
  for (const segment of segments) {
    const count = Math.max(1, Math.ceil(segment.surfaceDistance / step));
    for (let index = 1; index <= count; index++) {
      positions.push(segment.interpolateUsingFraction(index / count));
      distances.push(offset + segment.surfaceDistance * index / count);
    }
    offset += segment.surfaceDistance;
  }
  return { positions, distances, step };
}

export async function sampleHeights(provider, positions) {
  if (!provider?.availability) throw new Error('Địa hình chưa sẵn sàng hoặc không hỗ trợ lấy mẫu cao độ.');
  // Không thay cao độ lỗi bằng 0: kết quả đo phải xuất phát từ dữ liệu thật.
  const result = await Cesium.sampleTerrainMostDetailed(provider, positions, true);
  if (result.some(position => !Number.isFinite(position.height))) {
    throw new Error('Thiếu cao độ trên tuyến đo. Hãy thử lại khi địa hình tải xong.');
  }
  return result;
}

export function pathStatistics(positions, distances) {
  let length3D = 0, ascent = 0, descent = 0;
  for (let index = 1; index < positions.length; index++) {
    const height = positions[index].height - positions[index - 1].height;
    length3D += Math.hypot(distances[index] - distances[index - 1], height);
    ascent += Math.max(0, height);
    descent += Math.max(0, -height);
  }
  return {
    length3D, horizontal: distances.at(-1), ascent, descent,
    min: Math.min(...positions.map(point => point.height)),
    max: Math.max(...positions.map(point => point.height)),
  };
}

// Chặn vùng tự cắt trước khi chia lưới, kể cả các cạnh chạm nhau.
export function validateArea(vertices) {
  if (vertices.length < 3) throw new Error('Chọn ít nhất ba điểm cho vùng đo.');
  const center = ellipsoid.cartographicToCartesian(vertices[0]);
  const inverse = Cesium.Matrix4.inverseTransformation(Cesium.Transforms.eastNorthUpToFixedFrame(center), new Cesium.Matrix4());
  const points = vertices.map(point => Cesium.Matrix4.multiplyByPoint(inverse, ellipsoid.cartographicToCartesian(point), new Cesium.Cartesian3()));
  const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const onSegment = (a, b, p) => Math.abs(cross(a, b, p)) < 1e-6 && p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x) && p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y);
  for (let index = 0; index < points.length; index++) {
    const a = points[index], b = points[(index + 1) % points.length];
    if (Cesium.Cartesian3.distance(a, b) < .1) throw new Error('Các đỉnh vùng đo phải khác nhau.');
    for (let next = index + 1; next < points.length; next++) {
      if (next === index + 1 || (index === 0 && next === points.length - 1)) continue;
      const c = points[next], d = points[(next + 1) % points.length];
      if ((cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) ||
          onSegment(a, b, c) || onSegment(a, b, d) || onSegment(c, d, a) || onSegment(c, d, b)) {
        throw new Error('Vùng đo tự cắt. Hãy vẽ đường bao không giao nhau.');
      }
    }
  }
}

export function areaMesh(vertices) {
  validateArea(vertices);
  const positions = vertices.map(point => ellipsoid.cartographicToCartesian(point));
  const sphere = Cesium.BoundingSphere.fromPoints(positions);
  if (sphere.radius > 100000) throw new Error('Vùng đo quá rộng. Hãy đo từng vùng có bán kính dưới 100 km.');
  const spacing = Math.max(30, sphere.radius / 24);
  const geometry = Cesium.PolygonGeometry.createGeometry(Cesium.PolygonGeometry.fromPositions({
    positions, vertexFormat: Cesium.VertexFormat.POSITION_ONLY,
    granularity: spacing / ellipsoid.maximumRadius,
  }));
  if (!geometry) throw new Error('Vùng đo không hợp lệ.');
  const values = geometry.attributes.position.values;
  if (values.length / 3 > 16000) throw new Error('Vùng quá phức tạp. Hãy chia thành các vùng nhỏ hơn.');
  const samples = [];
  for (let index = 0; index < values.length; index += 3) {
    samples.push(ellipsoid.cartesianToCartographic(Cesium.Cartesian3.fromArray(values, index)));
  }
  return { positions: samples, indices: geometry.indices, spacing };
}

export function meshArea(positions, indices) {
  const points = positions.map(position => ellipsoid.cartographicToCartesian(position));
  let area = 0;
  const ab = new Cesium.Cartesian3(), ac = new Cesium.Cartesian3(), cross = new Cesium.Cartesian3();
  for (let index = 0; index < indices.length; index += 3) {
    const a = points[indices[index]];
    Cesium.Cartesian3.subtract(points[indices[index + 1]], a, ab);
    Cesium.Cartesian3.subtract(points[indices[index + 2]], a, ac);
    area += Cesium.Cartesian3.magnitude(Cesium.Cartesian3.cross(ab, ac, cross)) / 2;
  }
  if (!(area > .01)) throw new Error('Diện tích vùng đo quá nhỏ hoặc các điểm thẳng hàng.');
  return area;
}

export const formatDistance = value => value >= 1000 ? `${(value / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} km` : `${value.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} m`;
export const formatArea = value => value >= 1e6 ? `${(value / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 3 })} km²` : `${value.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} m²`;
//#endregion

//#region 4. Giao diện đo 3D và mặt cắt địa hình
export function createCesiumTerrainTools({ ol3d, getTerrain, activate, setInfo, measureButton, profileButton }) {
  const scene = ol3d.getCesiumScene();
  const source = new Cesium.CustomDataSource('Phân tích địa hình 3D');
  ol3d.getDataSources().add(source);
  const panel = document.createElement('section');
  panel.className = 'terrain-tool-panel';
  panel.id = 'terrain-tool-panel';
  panel.hidden = true;
  panel.setAttribute('aria-labelledby', 'terrain-tool-title');
  panel.innerHTML = `
    <header><div><small>PHÂN TÍCH ĐỊA HÌNH</small><h2 id="terrain-tool-title">Đo 3D</h2></div><button type="button" data-terrain-close aria-label="Đóng phân tích địa hình">×</button></header>
    <div class="terrain-tool-body">
      <div class="terrain-tool-tabs" role="group" aria-label="Kiểu đo 3D"><button type="button" data-terrain-mode="distance">Khoảng cách</button><button type="button" data-terrain-mode="area">Diện tích bề mặt</button></div>
      <p class="terrain-tool-hint" role="status" aria-live="polite"></p>
      <div class="terrain-draw-actions"><button type="button" data-terrain-finish>Hoàn tất</button><button type="button" data-terrain-undo>Bỏ điểm cuối</button><button type="button" data-terrain-redraw>Vẽ lại</button></div>
      <div class="terrain-tool-results" hidden></div>
      <p class="terrain-tool-note">Đo trên địa hình Cesium World Terrain. Cao độ so với ellipsoid WGS84; kết quả xấp xỉ theo độ phân giải địa hình.</p>
    </div>`;
  document.querySelector('.map-wrapper').append(panel);
  const hint = panel.querySelector('.terrain-tool-hint');
  const results = panel.querySelector('.terrain-tool-results');
  const finishButton = panel.querySelector('[data-terrain-finish]');
  const undoButton = panel.querySelector('[data-terrain-undo]');
  let mode = 'distance', vertices = [], moving = null, handler = null, version = 0, busy = false;
  let samples = null, cursorEntity = null, plotted = null;
  const teal = Cesium.Color.fromCssColorString('#82f1d5');

  function updateButtons() {
    finishButton.disabled = busy || !handler || vertices.length < (mode === 'area' ? 3 : 2);
    undoButton.disabled = busy || !handler || !vertices.length;
    panel.querySelectorAll('[data-terrain-mode]').forEach(button => {
      const selected = button.dataset.terrainMode === mode;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }

  function destroyHandler() {
    if (handler && !handler.isDestroyed()) handler.destroy();
    handler = null;
    scene.canvas.style.cursor = '';
  }

  function reset() {
    version++;
    destroyHandler();
    source.entities.removeAll();
    vertices = [];
    moving = null;
    samples = null;
    plotted = null;
    cursorEntity = null;
    busy = false;
    results.replaceChildren();
    results.hidden = true;
  }

  function close() {
    reset();
    panel.hidden = true;
    source.show = false;
    measureButton.classList.remove('active');
    profileButton.classList.remove('active');
    measureButton.setAttribute('aria-pressed', 'false');
    profileButton.setAttribute('aria-pressed', 'false');
  }

  function positions() {
    return [...vertices, ...(moving ? [moving] : [])].map(point => Cesium.Ellipsoid.WGS84.cartographicToCartesian(point));
  }

  function addVertex(point) {
    source.entities.add({
      position: Cesium.Ellipsoid.WGS84.cartographicToCartesian(point),
      point: { pixelSize: 8, color: teal, outlineColor: Cesium.Color.fromCssColorString('#102b35'), outlineWidth: 2, heightReference: Cesium.HeightReference.CLAMP_TO_TERRAIN, disableDepthTestDistance: Number.POSITIVE_INFINITY },
    });
  }

  function redrawDraft() {
    source.entities.removeAll();
    vertices.forEach(addVertex);
    source.entities.add({ polyline: {
      positions: new Cesium.CallbackProperty(() => {
        const points = positions();
        if (mode === 'area' && points.length >= 3) points.push(points[0]);
        return points.length >= 2 ? points : [];
      }, false),
      width: 3, material: teal, clampToGround: true, classificationType: Cesium.ClassificationType.TERRAIN,
    } });
  }

  function start(nextMode) {
    if (!ol3d.getEnabled()) return;
    activate();
    reset();
    mode = nextMode;
    panel.dataset.mode = mode;
    panel.hidden = false;
    source.show = true;
    panel.querySelector('h2').textContent = mode === 'profile' ? 'Mặt cắt địa hình' : mode === 'area' ? 'Đo diện tích bề mặt' : 'Đo khoảng cách 3D';
    panel.querySelector('.terrain-tool-tabs').hidden = mode === 'profile';
    panel.querySelector('[data-terrain-finish]').textContent = mode === 'profile' ? 'Tạo mặt cắt' : 'Tính kết quả';
    panel.querySelector('[data-terrain-redraw]').textContent = mode === 'profile' ? 'Vẽ tuyến mới' : 'Đo lại';
    panel.querySelector('.terrain-tool-note').textContent = mode === 'profile'
      ? 'Biểu đồ cao độ theo khoảng cách ngang, lấy mẫu từ Cesium World Terrain. Độ dốc tính trên từng đoạn lấy mẫu; cao độ so với ellipsoid WGS84.'
      : 'Đo bám địa hình Cesium World Terrain, không đo theo mái công trình. Kết quả xấp xỉ theo độ phân giải địa hình.';
    measureButton.classList.toggle('active', mode !== 'profile');
    profileButton.classList.toggle('active', mode === 'profile');
    measureButton.setAttribute('aria-pressed', String(mode !== 'profile'));
    profileButton.setAttribute('aria-pressed', String(mode === 'profile'));
    hint.textContent = mode === 'area'
      ? 'Click ít nhất 3 đỉnh tạo vùng. Chuột phải hoặc Enter để tính diện tích bề mặt.'
      : mode === 'profile'
        ? 'Click ít nhất 2 điểm để vẽ tuyến mặt cắt. Chuột phải hoặc Enter để tạo biểu đồ cao độ.'
        : 'Click ít nhất 2 điểm trên tuyến cần đo. Chuột phải hoặc Enter để tính chiều dài bám địa hình.';
    setInfo(mode === 'profile' ? 'Vẽ tuyến mặt cắt trên địa hình.' : 'Đo 3D: chọn các điểm trên địa hình.');
    redrawDraft();
    handler = new Cesium.ScreenSpaceEventHandler(scene.canvas);
    scene.canvas.style.cursor = 'crosshair';
    scene.canvas.focus({ preventScroll: true });
    handler.setInputAction(event => {
      const position = pickTerrain(scene, event.position);
      if (!position) { hint.textContent = 'Hãy chọn điểm trên địa hình, không chọn bầu trời.'; return; }
      const point = Cesium.Cartographic.fromCartesian(position);
      if (vertices.length && Cesium.Cartesian3.distance(position, Cesium.Ellipsoid.WGS84.cartographicToCartesian(vertices.at(-1))) < .1) return;
      if (vertices.length >= 64) { hint.textContent = 'Tối đa 64 đỉnh. Hãy hoàn tất hoặc vẽ tuyến ngắn hơn.'; return; }
      vertices.push(point);
      moving = null;
      addVertex(point);
      hint.textContent = `Đã chọn ${vertices.length} điểm · Chuột phải / Enter để hoàn tất · Backspace để bỏ điểm cuối.`;
      updateButtons();
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    handler.setInputAction(event => {
      if (!vertices.length) return;
      const position = pickTerrain(scene, event.endPosition);
      moving = position ? Cesium.Cartographic.fromCartesian(position) : null;
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
    handler.setInputAction(finish, Cesium.ScreenSpaceEventType.RIGHT_CLICK);
    updateButtons();
  }

  function undo() {
    if (!handler || busy) return;
    vertices.pop();
    moving = null;
    redrawDraft();
    hint.textContent = `Đã chọn ${vertices.length} điểm. Tiếp tục click để vẽ.`;
    updateButtons();
  }

  async function finish() {
    if (finishButton.disabled || busy) return;
    const requestVersion = ++version;
    const chosen = vertices.map(point => Cesium.Cartographic.clone(point));
    busy = true;
    destroyHandler();
    moving = null;
    redrawDraft();
    updateButtons();
    hint.textContent = 'Đang lấy mẫu cao độ chi tiết trên địa hình…';
    try {
      const provider = await getTerrain();
      if (requestVersion !== version || !ol3d.getEnabled()) return;
      if (mode === 'area') {
        const mesh = areaMesh(chosen);
        await sampleHeights(provider, mesh.positions);
        if (requestVersion !== version || !ol3d.getEnabled()) return;
        const area = meshArea(mesh.positions, mesh.indices);
        results.innerHTML = `<div class="terrain-result-main"><span>Diện tích bề mặt địa hình</span><strong>${formatArea(area)}</strong></div><p>Lưới ${mesh.positions.length.toLocaleString('vi-VN')} điểm · bước lưới khoảng ${formatDistance(mesh.spacing)}</p>`;
        source.entities.add({ polygon: { hierarchy: chosen.map(point => Cesium.Ellipsoid.WGS84.cartographicToCartesian(point)), material: teal.withAlpha(.22), classificationType: Cesium.ClassificationType.TERRAIN } });
        setInfo(`Diện tích bề mặt 3D: ${formatArea(area)}`);
      } else {
        const path = samplePath(chosen);
        await sampleHeights(provider, path.positions);
        if (requestVersion !== version || !ol3d.getEnabled()) return;
        const stats = pathStatistics(path.positions, path.distances);
        source.entities.removeAll();
        source.entities.add({ polyline: {
          positions: path.positions.map(point => Cesium.Ellipsoid.WGS84.cartographicToCartesian(point)),
          width: 4, material: teal, clampToGround: true, classificationType: Cesium.ClassificationType.TERRAIN,
        } });
        addVertex(path.positions[0]);
        addVertex(path.positions.at(-1));
        if (mode === 'profile') {
          samples = path;
          renderProfile(stats);
          setInfo(`Mặt cắt: cao độ ${stats.min.toFixed(1)} – ${stats.max.toFixed(1)} m · Tổng lên ${formatDistance(stats.ascent)} · Tổng xuống ${formatDistance(stats.descent)}`);
        } else {
          renderDistance(stats);
          setInfo(`Khoảng cách 3D: ${formatDistance(stats.length3D)} · Chiều dài ngang ${formatDistance(stats.horizontal)}`);
        }
      }
      results.hidden = false;
      hint.textContent = mode === 'profile'
        ? 'Đã tạo mặt cắt. Rê trên biểu đồ hoặc kéo thanh trượt để xem cao độ, độ dốc và vị trí trên bản đồ.'
        : mode === 'area'
          ? 'Đã tính diện tích bề mặt. Chọn Đo lại để đo vùng khác.'
          : 'Đã tính chiều dài bám địa hình. Chọn Đo lại để đo tuyến khác.';
    } catch (error) {
      if (requestVersion !== version) return;
      hint.textContent = `Không thể tính kết quả: ${error.message} Chọn ${mode === 'profile' ? 'Vẽ tuyến mới' : 'Đo lại'} để thử lại.`;
    } finally {
      if (requestVersion === version) { busy = false; updateButtons(); }
    }
  }

  //#region 4.1. Kết quả đo khoảng cách: chỉ hiển thị số đo
  function renderDistance(stats) {
    results.innerHTML = `<div class="terrain-result-main"><span>Chiều dài bám địa hình</span><strong>${formatDistance(stats.length3D)}</strong></div>
      <div class="terrain-result-stats"><span>Chiều dài ngang <b>${formatDistance(stats.horizontal)}</b></span></div>
      <p>Tuyến đo gồm ${vertices.length} điểm đã chọn. Chiều dài bám địa hình tính cả thay đổi cao độ dọc tuyến.</p>`;
  }
  //#endregion

  //#region 4.2. Mặt cắt: biểu đồ cao độ, lên/xuống và độ dốc dọc tuyến
  function renderProfile(stats) {
    const { positions: points, distances } = samples;
    const width = 640, height = 224, left = 58, right = 18, top = 16, bottom = 36;
    const range = Math.max(10, stats.max - stats.min);
    const min = stats.min - range * .1, max = stats.max + range * .1;
    const x = distance => left + (width - left - right) * distance / distances.at(-1);
    const y = value => top + (height - top - bottom) * (max - value) / (max - min);
    const coords = points.map((point, index) => `${x(distances[index]).toFixed(2)},${y(point.height).toFixed(2)}`);
    let grid = '';
    for (let index = 0; index <= 4; index++) {
      const level = min + (max - min) * index / 4;
      grid += `<line x1="${left}" x2="${width - right}" y1="${y(level)}" y2="${y(level)}" class="profile-grid"/><text x="${left - 9}" y="${y(level) + 4}" text-anchor="end">${Math.round(level)}</text>`;
      const distance = distances.at(-1) * index / 4;
      grid += `<text x="${x(distance)}" y="${height - 12}" text-anchor="${index === 0 ? 'start' : index === 4 ? 'end' : 'middle'}">${formatDistance(distance)}</text>`;
    }
    results.innerHTML = `<div class="terrain-result-main"><span>Khoảng cao độ địa hình</span><strong>${stats.min.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} – ${stats.max.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} m</strong></div>
      <div class="terrain-result-stats"><span>Tuyến ngang <b>${formatDistance(stats.horizontal)}</b></span><span>Tổng lên <b>+${formatDistance(stats.ascent)}</b></span><span>Tổng xuống <b>−${formatDistance(stats.descent)}</b></span></div>
      <div class="terrain-profile-chart"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Mặt cắt cao độ địa hình theo khoảng cách ngang, đơn vị mét">${grid}
      <text x="8" y="12">h (m)</text><path class="profile-fill" d="M${left},${height - bottom} L${coords.join(' L')} L${width - right},${height - bottom} Z"/>
      <polyline class="profile-line" points="${coords.join(' ')}"/><line data-profile-cursor x1="${left}" x2="${left}" y1="${top}" y2="${height - bottom}"/><circle data-profile-dot cx="${left}" cy="${y(points[0].height)}" r="4"/></svg></div>
      <label class="profile-slider-label" for="terrain-profile-slider">Vị trí trên tuyến <output id="terrain-profile-readout"></output></label>
      <input id="terrain-profile-slider" type="range" min="0" max="${points.length - 1}" step="1" value="0" aria-describedby="terrain-profile-readout">
      <p>${points.length.toLocaleString('vi-VN')} mẫu cao độ · khoảng cách lấy mẫu tối đa ${formatDistance(Math.max(...distances.slice(1).map((value, index) => value - distances[index])))}. Độ dốc dương khi đi lên, âm khi đi xuống theo chiều vẽ tuyến.</p>`;
    plotted = { x, y };
    const chart = results.querySelector('.terrain-profile-chart');
    chart.addEventListener('pointermove', event => {
      const rect = chart.getBoundingClientRect();
      const at = Math.max(0, Math.min(1, ((event.clientX - rect.left) * width / rect.width - left) / (width - left - right)));
      const distance = at * distances.at(-1);
      let low = 0, high = distances.length - 1;
      while (low < high) { const middle = (low + high) >> 1; if (distances[middle] < distance) low = middle + 1; else high = middle; }
      updateCursor(low);
    });
    results.querySelector('input').addEventListener('input', event => updateCursor(Number(event.target.value)));
    updateCursor(0);
  }

  function updateCursor(index) {
    if (!samples || !plotted) return;
    const point = samples.positions[index], distance = samples.distances[index];
    const { x, y } = plotted;
    results.querySelector('[data-profile-cursor]').setAttribute('x1', x(distance));
    results.querySelector('[data-profile-cursor]').setAttribute('x2', x(distance));
    results.querySelector('[data-profile-dot]').setAttribute('cx', x(distance));
    results.querySelector('[data-profile-dot]').setAttribute('cy', y(point.height));
    results.querySelector('input').value = index;
    const end = Math.max(1, index);
    const run = samples.distances[end] - samples.distances[end - 1];
    const slope = run > 0 ? (samples.positions[end].height - samples.positions[end - 1].height) / run * 100 : 0;
    results.querySelector('output').textContent = `${formatDistance(distance)} · h = ${point.height.toFixed(1)} m · Dốc đoạn: ${slope > 0 ? '+' : ''}${slope.toFixed(1)}%`;
    const position = Cesium.Ellipsoid.WGS84.cartographicToCartesian(point);
    if (!cursorEntity) cursorEntity = source.entities.add({ position, point: { pixelSize: 12, color: Cesium.Color.YELLOW, outlineColor: Cesium.Color.BLACK, outlineWidth: 2, heightReference: Cesium.HeightReference.CLAMP_TO_TERRAIN, disableDepthTestDistance: Number.POSITIVE_INFINITY } });
    else cursorEntity.position = position;
    scene.requestRender();
  }
  //#endregion

  panel.querySelector('[data-terrain-close]').addEventListener('click', close);
  panel.querySelector('[data-terrain-redraw]').addEventListener('click', () => start(mode));
  undoButton.addEventListener('click', undo);
  finishButton.addEventListener('click', finish);
  panel.querySelectorAll('[data-terrain-mode]').forEach(button => button.addEventListener('click', () => start(button.dataset.terrainMode)));
  document.addEventListener('keydown', event => {
    if (panel.hidden || !ol3d.getEnabled() || event.target.closest('input, select, textarea, [contenteditable="true"]')) return;
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    if (event.key === 'Enter' && (event.target === document.body || event.target === scene.canvas)) { event.preventDefault(); finish(); }
    if (event.key === 'Backspace') { event.preventDefault(); undo(); }
  });
  return { start, close };
}
//#endregion

//#region 5. Khởi tạo, giao diện và điều khiển bản đồ 3D
//#region 5.1. Trạng thái và cấu hình dùng chung
let ol3d = null, map2D = null, toggleButton = null, identifyHandler = null;
let markerSource, marker, infoPanel, headerInfo, terrainTools, terrainPromise;
let osmBuildings = null, buildingsLoading = false, buildingsWanted = false;
let identifySequence = 0;
let lastTileError = 0, effectsPanel, messageTimer;
let selectedLocation = null;
let waterMaterial;
let fogStage;
const weather = {};
const lightScratch = new Cesium.Cartesian3();
const weatherOffset = new Cesium.Cartesian3();
const previousWeatherCamera = new Cesium.Cartesian3();
let effectsFrameTime = 0;
const EFFECTS = [
  ['water', 'Mặt nước chuyển động', 'Độ rõ và tốc độ gợn sóng tại vùng có mặt nạ nước.'],
  ['lighting', 'Chiếu sáng địa hình', 'Ánh sáng xiên làm rõ sườn núi, thung lũng và độ dốc.'],
  ['fog', 'Sương khí quyển', 'Tăng độ dày màn sương chân trời khi nhìn gần địa hình.'],
  ['atmosphere', 'Khí quyển quanh Trái Đất', 'Tăng độ sáng quầng khí quyển và sắc xanh ở chân trời.'],
  ['rain', 'Mưa', 'Mô phỏng hạt mưa quanh điểm nhìn, không phải thời tiết thực.'],
  ['snow', 'Tuyết', 'Mô phỏng bông tuyết; tăng cường độ để tuyết rơi dày hơn.']
];
const effectTargets = Object.fromEntries(EFFECTS.map(([id]) => [id, 0]));
const effectValues = { ...effectTargets };
const disabledEffects = { ...effectTargets };
const effectControls = new Map();
const buttons = {};
const svg = path => `<svg viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;
//#endregion

//#region 5.2. Khởi tạo Cesium và nguồn địa hình
export async function createCesiumTool(map) {
  if (!map || ol3d) return ol3d;
  window.Cesium = Cesium;
  map2D = map;
  const { default: OLCesium, RasterSynchronizer, VectorSynchronizer, OverlaySynchronizer } = await import('olcs');
  const GroupRasterSynchronizer = withCurrentLayerParents(withWmsPostRequests(RasterSynchronizer, Cesium));
  const GroupVectorSynchronizer = withCurrentLayerParents(VectorSynchronizer);
  Cesium.Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_ION_TOKEN;
  ol3d = new OLCesium({
    map,
    stopOpenLayersEventsPropagation: true,
    createSynchronizers: (olMap, scene) => [
      new GroupRasterSynchronizer(olMap, scene),
      new GroupVectorSynchronizer(olMap, scene),
      new OverlaySynchronizer(olMap, scene),
    ],
  });
  const scene = ol3d.getCesiumScene();
  scene.globe.enableLighting = false;
  scene.globe.showWaterEffect = false;
  scene.fog.enabled = false;
  scene.globe.showGroundAtmosphere = false;
  if (scene.skyAtmosphere) scene.skyAtmosphere.show = false;
  scene.globe.depthTestAgainstTerrain = true;
  scene.canvas.tabIndex = 0;
  markerSource = new Cesium.CustomDataSource('Điểm tra cứu 3D');
  ol3d.getDataSources().add(markerSource);
  // Tải water mask một lần, không thay địa hình mỗi khi bật hiệu ứng.
  getTerrainProvider().catch(() => { if (is3DEnabled()) showInfo('Không tải được địa hình. Kiểm tra kết nối và quyền Cesium ion.'); });
  createUI();
  // Tọa độ WGS84/VN2000 cũ vẫn cập nhật theo con trỏ trong chế độ 3D.
  const readoutHandler = new Cesium.ScreenSpaceEventHandler(scene.canvas);
  readoutHandler.setInputAction(event => {
    if (!is3DEnabled()) return;
    const position = pickTerrain(scene, event.endPosition);
    if (!position) return;
    const point = Cesium.Cartographic.fromCartesian(position);
    document.dispatchEvent(new CustomEvent('webgis-coordinate-update', { detail: {
      longitude: Cesium.Math.toDegrees(point.longitude), latitude: Cesium.Math.toDegrees(point.latitude),
    } }));
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
  terrainTools = createCesiumTerrainTools({
    ol3d, getTerrain: getTerrainProvider, activate: activateAnalysis, setInfo: setHeaderInfo,
    measureButton: buttons.measure, profileButton: buttons.profile,
  });
  document.addEventListener('webgis-tool-activate', event => {
    if (event.detail?.name !== 'cesium') stopAnalysis();
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (!effectsPanel.hidden) effectsPanel.querySelector('header button').click();
    if (identifyHandler) { stopIdentify(); setHeaderInfo('Tra cứu 3D đã tắt.'); }
  });
  return ol3d;
}

function getTerrainProvider() {
  if (!terrainPromise) terrainPromise = Cesium.createWorldTerrainAsync({ requestVertexNormals: true, requestWaterMask: true })
    .then(provider => {
      ol3d.getCesiumScene().terrainProvider = provider;
      if (effectsPanel) updateEffects();
      return provider;
    })
    .catch(error => { terrainPromise = null; throw error; });
  return terrainPromise;
}

//#endregion

//#region 5.3. Nút điều khiển và panel
function button(name, label, title, action) {
  const element = document.createElement('button');
  element.id = `cesium-${name}-btn`;
  element.type = 'button';
  element.className = 'map-control-btn cesium-tool-btn';
  element.innerHTML = label;
  element.title = title;
  element.setAttribute('aria-label', title);
  element.hidden = true;
  element.addEventListener('click', action);
  buttons[name] = element;
  return element;
}

function pressed(element, enabled) {
  element.classList.toggle('active', enabled);
  element.setAttribute('aria-pressed', String(enabled));
}

function createUI() {
  const container = document.createElement('div');
  container.id = 'cesium-toggle-control';
  container.className = 'map-control-group cesium-toggle-control';
  toggleButton = document.createElement('button');
  toggleButton.id = 'cesium-toggle-btn';
  toggleButton.type = 'button';
  toggleButton.className = 'map-control-btn cesium-toggle-btn';
  toggleButton.textContent = '3D';
  toggleButton.title = 'Chuyển sang chế độ 3D';
  toggleButton.setAttribute('aria-label', toggleButton.title);
  toggleButton.addEventListener('click', toggle3D);
  container.append(toggleButton);
  container.append(
    button('reset', svg('<path d="m12 3 6 17-6-4-6 4Z"/><path d="M12 3v13"/>'), 'Đưa hướng nhìn về Bắc, giữ nguyên vị trí và độ zoom', resetViewDirection),
    button('identify', svg('<circle cx="12" cy="12" r="6"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>'), 'Tra cứu vị trí và cao độ 3D', toggleIdentify),
    button('buildings', svg('<path d="M4 21V5h11v16M15 21V2h5v19M8 9h3M8 13h3M8 17h3M17 6h1M17 10h1M17 14h1"/>'), 'Bật công trình OSM 3D theo chiều cao', () => setBuildings(!buildingsWanted)),
    button('effects', svg('<path d="M3 8c2 2 4 2 6 0s4-2 6 0 4 2 6 0M3 13c2 2 4 2 6 0s4-2 6 0 4 2 6 0M3 18c2 2 4 2 6 0s4-2 6 0 4 2 6 0"/>'), 'Hiệu ứng cảnh 3D', () => togglePanel(effectsPanel, buttons.effects)),
    button('zoom-in', '+', 'Phóng to bản đồ 3D', () => zoomCamera(1)),
    button('zoom-out', '−', 'Thu nhỏ bản đồ 3D', () => zoomCamera(-1)),
    button('measure', svg('<path d="m3 16 13-13 5 5L8 21zM7 12l3 3M11 8l3 3M15 4l3 3"/>'), 'Đo khoảng cách và diện tích bề mặt 3D', () => terrainTools.start('distance')),
    button('profile', svg('<path d="M3 3v18h18M5 17l4-7 4 4 4-9 4 4M9 21v-3M15 21v-3"/>'), 'Vẽ tuyến xem mặt cắt địa hình', () => terrainTools.start('profile')),
  );
  pressed(buttons.buildings, false);
  // Giữ nút chuyển 2D/3D ngay dưới danh sách lớp trong cả hai chế độ.
  const primaryControls = document.getElementById('primary-map-controls');
  const layerCatalogButton = primaryControls.querySelector('.layer-catalog-button');
  primaryControls.insertBefore(container, layerCatalogButton ? layerCatalogButton.nextSibling : primaryControls.firstChild);
  headerInfo = document.createElement('div');
  headerInfo.id = 'cesium-header-info';
  headerInfo.hidden = true;
  headerInfo.setAttribute('role', 'status');
  headerInfo.setAttribute('aria-live', 'polite');
  headerInfo.innerHTML = `<div class="cesium-location-heading">${svg('<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/>')}<span>Điểm chọn 3D</span><small data-location-surface>WGS84</small></div>
    <div class="cesium-location-values"><div><span>Vĩ độ</span><output data-location-lat>—</output></div><div><span>Kinh độ</span><output data-location-lon>—</output></div><div><span>Cao độ <small>m</small></span><output data-location-height>—</output></div></div>
    <p class="cesium-location-hint">Bật tra cứu rồi click bản đồ để chọn điểm.</p>`;
  document.querySelector('.workspace-header .map-readout').before(headerInfo);
  infoPanel = document.createElement('div');
  infoPanel.id = 'cesium-info-panel';
  infoPanel.className = 'cesium-info-panel';
  infoPanel.hidden = true;
  infoPanel.setAttribute('role', 'status');
  document.querySelector('.map-wrapper').append(infoPanel);
  effectsPanel = createPanel('cesium-effects-panel', 'Hiệu ứng cảnh 3D', `
    <div class="cesium-effects-summary"><span data-effects-summary role="status">Chưa bật hiệu ứng</span><button type="button" data-effects-reset>Tắt tất cả</button></div>
    ${EFFECTS.map(([id, title, hint]) => `
    <div class="cesium-effect" data-effect-card="${id}">
      <label class="cesium-option"><span>${title}<small id="effect-hint-${id}">${hint}</small></span><input type="checkbox" role="switch" data-effect="${id}" aria-describedby="effect-hint-${id}"></label>
      <label class="cesium-effect-strength" for="effect-${id}"><span>Cường độ <output data-effect-value="${id}" for="effect-${id}">50%</output></span>
        <input id="effect-${id}" data-strength="${id}" aria-label="Cường độ ${title.toLowerCase()}" type="range" min="0" max="100" value="50" disabled>
      </label>
    </div>`).join('')}
    <p class="cesium-effects-note">0%: không tác động · 100%: mạnh nhất. Mưa và tuyết là mô phỏng; sóng cần địa hình có mặt nạ nước.</p>`);
  for (const [id] of EFFECTS) effectControls.set(id, {
    toggle: effectsPanel.querySelector(`[data-effect="${id}"]`),
    slider: effectsPanel.querySelector(`[data-strength="${id}"]`),
    output: effectsPanel.querySelector(`[data-effect-value="${id}"]`),
    card: effectsPanel.querySelector(`[data-effect-card="${id}"]`),
  });
  effectsPanel.querySelector('[data-effects-reset]').addEventListener('click', () => {
    effectControls.forEach(({ toggle }) => { toggle.checked = false; });
    updateEffects();
  });
  buttons.effects.setAttribute('aria-controls', effectsPanel.id);
  buttons.effects.setAttribute('aria-expanded', 'false');
  effectsPanel.addEventListener('input', updateEffects);
  document.addEventListener('visibilitychange', () => { resetEffectsFrame(); updateEffects(); });
  updateEffects();
  Cesium.Cartesian3.clone(ol3d.getCesiumScene().camera.positionWC, previousWeatherCamera);
  ol3d.getCesiumScene().preUpdate.addEventListener(() => {
    const scene = ol3d.getCesiumScene();
    const now = performance.now();
    const seconds = effectsFrameTime ? (now - effectsFrameTime) / 1000 : 0;
    effectsFrameTime = now;
    // Không phát bù hàng nghìn hạt sau khi tab hoặc máy bị khựng lâu.
    if (seconds > 2) {
      Object.values(weather).forEach(particles => scene.primitives.remove(particles));
      Object.keys(weather).forEach(type => delete weather[type]);
    }
    for (const [id] of EFFECTS) effectValues[id] = smoothEffectStrength(effectValues[id], effectTargets[id], seconds);
    applyEffectValues(scene);
    if (waterMaterial && scene.globe.material === waterMaterial) {
      waterMaterial.uniforms.time += Math.min(seconds, 0.1) * (0.08 + effectValues.water * 0.4);
    }
    Cesium.Cartesian3.subtract(scene.camera.positionWC, previousWeatherCamera, weatherOffset);
    Cesium.Cartesian3.clone(scene.camera.positionWC, previousWeatherCamera);
    Object.values(weather).forEach(particles => {
      Cesium.Matrix4.fromTranslation(scene.camera.positionWC, particles.modelMatrix);
    });
  });
}

function createPanel(id, title, body) {
  const panel = document.createElement('section');
  panel.id = id;
  panel.className = 'cesium-options-panel';
  panel.hidden = true;
  panel.setAttribute('aria-label', title);
  panel.innerHTML = `<header><h2>${title}</h2><button type="button" aria-label="Đóng ${title.toLowerCase()}">×</button></header><div class="cesium-options-body">${body}</div>`;
  panel.querySelector('header button').addEventListener('click', () => {
    const control = buttons.effects;
    panel.hidden = true;
    control.setAttribute('aria-expanded', 'false');
    control.focus();
  });
  document.querySelector('.map-wrapper').append(panel);
  return panel;
}

function togglePanel(panel, control) {
  if (!is3DEnabled()) return;
  const open = panel.hidden;
  effectsPanel.hidden = true;
  buttons.effects.setAttribute('aria-expanded', 'false');
  panel.hidden = !open;
  control.setAttribute('aria-expanded', String(open));
  if (open) panel.querySelector('header button').focus();
}

//#endregion

//#region 5.4. Điều phối công cụ và thông báo
function activateAnalysis() {
  stopIdentify();
  effectsPanel.hidden = true;
  buttons.effects.setAttribute('aria-expanded', 'false');
  document.dispatchEvent(new CustomEvent('webgis-tool-activate', { detail: { name: 'cesium' } }));
}

function stopAnalysis() {
  stopIdentify();
  terrainTools?.close();
  if (effectsPanel) effectsPanel.hidden = true;
  buttons.effects?.setAttribute('aria-expanded', 'false');
}

function setHeaderInfo(message) {
  // Hướng dẫn công cụ không ghi đè tọa độ điểm đang chọn.
  if (!selectedLocation) headerInfo.querySelector('.cesium-location-hint').textContent = message;
  headerInfo.hidden = !is3DEnabled();
}

function setLocationInfo(point, surface, heightState = 'ready') {
  selectedLocation = point;
  headerInfo.classList.add('has-location');
  headerInfo.querySelector('[data-location-lat]').textContent = `${Cesium.Math.toDegrees(point.latitude).toFixed(6)}°`;
  headerInfo.querySelector('[data-location-lon]').textContent = `${Cesium.Math.toDegrees(point.longitude).toFixed(6)}°`;
  const height = headerInfo.querySelector('[data-location-height]');
  height.textContent = heightState === 'loading' ? 'Đang tải…' : heightState === 'error' ? 'Chưa có' : point.height.toFixed(1);
  height.dataset.state = heightState;
  headerInfo.querySelector('[data-location-surface]').textContent = surface;
  headerInfo.hidden = !is3DEnabled();
}

function showInfo(message) {
  infoPanel.textContent = message;
  infoPanel.hidden = false;
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => { infoPanel.hidden = true; }, 6000);
}

//#endregion

//#region 5.5. Tra cứu vị trí và cao độ
function stopIdentify() {
  identifySequence++;
  if (identifyHandler && !identifyHandler.isDestroyed()) identifyHandler.destroy();
  identifyHandler = null;
  if (buttons.identify) pressed(buttons.identify, false);
  if (ol3d) ol3d.getCesiumScene().canvas.style.cursor = '';
}

function toggleIdentify() {
  if (!is3DEnabled()) return;
  if (identifyHandler) { stopIdentify(); return; }
  activateAnalysis();
  terrainTools.close();
  const scene = ol3d.getCesiumScene();
  identifyHandler = new Cesium.ScreenSpaceEventHandler(scene.canvas);
  identifyHandler.setInputAction(async event => {
    const request = ++identifySequence;
    const picked = scene.pick(event.position);
    let position;
    // Ưu tiên depth cho công trình; pin và đường đo không thay thế mặt đất.
    if (picked instanceof Cesium.Cesium3DTileFeature && scene.pickPositionSupported) position = scene.pickPosition(event.position);
    position ||= pickTerrain(scene, event.position);
    if (!position) { setHeaderInfo('Không có bề mặt tại đây. Hãy click lên địa hình hoặc công trình.'); return; }
    const cartographic = Cesium.Cartographic.fromCartesian(position);
    if (!marker) marker = markerSource.entities.add({
      position,
      billboard: { image: `${import.meta.env.BASE_URL}assets/map-location-pin.svg`, width: 32, height: 42, verticalOrigin: Cesium.VerticalOrigin.BOTTOM, disableDepthTestDistance: Number.POSITIVE_INFINITY },
    });
    else marker.position = position;
    const building = picked instanceof Cesium.Cesium3DTileFeature;
    const name = building ? picked.getProperty('name') || 'Công trình OSM' : 'Điểm địa hình';
    setLocationInfo(cartographic, name, building ? 'ready' : 'loading');
    scene.requestRender();
    if (!building) {
      try {
        const provider = await getTerrainProvider();
        if (request !== identifySequence || !is3DEnabled()) return;
        const [sample] = await sampleHeights(provider, [Cesium.Cartographic.clone(cartographic)]);
        if (request !== identifySequence || !is3DEnabled()) return;
        marker.position = Cesium.Cartographic.toCartesian(sample);
        setLocationInfo(sample, name);
        scene.requestRender();
      } catch {
        if (request === identifySequence && is3DEnabled()) setLocationInfo(cartographic, name, 'error');
      }
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  pressed(buttons.identify, true);
  scene.canvas.style.cursor = 'crosshair';
  setHeaderInfo('Tra cứu 3D · Click một vị trí để ghim tọa độ và cao độ.');
}

//#endregion

//#region 5.6. Tải và trình bày công trình OSM
async function setBuildings(enabled) {
  if (!is3DEnabled()) return;
  buildingsWanted = enabled;
  updateBuildingsButton();
  if (osmBuildings) {
    osmBuildings.show = enabled;
    ol3d.getCesiumScene().requestRender();
    return;
  }
  if (!enabled || buildingsLoading) return;
  buildingsLoading = true;
  buttons.buildings.setAttribute('aria-busy', 'true');
  try {
    const tileset = await Cesium.createOsmBuildingsAsync();
    tileset.maximumScreenSpaceError = 8;
    tileset.shadows = Cesium.ShadowMode.DISABLED;
    tileset.tileFailed.addEventListener(() => {
      if (buildingsWanted && is3DEnabled() && Date.now() - lastTileError > 15000) {
        lastTileError = Date.now();
        showInfo('Một số công trình chưa tải được. Kiểm tra kết nối và quyền truy cập Cesium ion.');
      }
    });
    osmBuildings = tileset;
    ol3d.getCesiumScene().primitives.add(tileset);
    tileset.show = buildingsWanted;
    styleBuildings();
    ol3d.getCesiumScene().requestRender();
  } catch {
    if (buildingsWanted && is3DEnabled()) showInfo('Không tải được công trình. Kiểm tra kết nối và quyền Cesium ion, sau đó bật lại để thử.');
    buildingsWanted = false;
    updateBuildingsButton();
  } finally {
    buildingsLoading = false;
    buttons.buildings.removeAttribute('aria-busy');
  }
}

function updateBuildingsButton() {
  pressed(buttons.buildings, buildingsWanted);
  buttons.buildings.title = buildingsWanted ? 'Ẩn công trình OSM 3D' : 'Bật công trình OSM 3D theo chiều cao';
  buttons.buildings.setAttribute('aria-label', buttons.buildings.title);
}

function styleBuildings() {
  if (!osmBuildings) return;
  osmBuildings.style = new Cesium.Cesium3DTileStyle({ color: { conditions: [
    ["Number(${feature['cesium#estimatedHeight']}) >= 100", 'color("#f2ab7a")'],
    ["Number(${feature['cesium#estimatedHeight']}) >= 30", 'color("#86d4ca")'],
    ['true', 'color("#b9d0de")'],
  ] } });
}

//#endregion

//#region 5.7. Hiệu ứng cảnh: cường độ, ánh sáng, khí quyển và thời tiết
function resetEffectsFrame() {
  effectsFrameTime = 0;
  Cesium.Cartesian3.clone(ol3d.getCesiumScene().camera.positionWC, previousWeatherCamera);
  Cesium.Cartesian3.clone(Cesium.Cartesian3.ZERO, weatherOffset);
}

export function smoothEffectStrength(current, target, seconds) {
  if (target === 0 || Math.abs(target - current) < 0.001) return target;
  return current + (target - current) * (1 - Math.exp(-12 * Math.min(seconds, 0.1)));
}

function updateLightDirection(scene) {
  // Chiếu xiên từ trên trái thay vì rọi thẳng: tạo chênh sáng giữa các sườn núi.
  const direction = scene.light.direction;
  Cesium.Cartesian3.normalize(scene.camera.positionWC, direction);
  Cesium.Cartesian3.negate(direction, direction);
  Cesium.Cartesian3.add(direction, Cesium.Cartesian3.multiplyByScalar(scene.camera.rightWC, 0.6, lightScratch), direction);
  Cesium.Cartesian3.add(direction, Cesium.Cartesian3.multiplyByScalar(scene.camera.upWC, -0.4, lightScratch), direction);
  Cesium.Cartesian3.normalize(direction, direction);
}

function createWeather(scene, type) {
  const snow = type === 'snow';
  const image = document.createElement('canvas');
  image.width = snow ? 32 : 4;
  image.height = 32;
  const context = image.getContext('2d');
  if (snow) {
    const gradient = context.createRadialGradient(16, 16, 0, 16, 16, 14);
    gradient.addColorStop(0, '#fff');
    gradient.addColorStop(1, '#ffffff00');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 32, 32);
  } else {
    context.strokeStyle = '#c8e4ff';
    context.lineWidth = 1.3;
    context.beginPath(); context.moveTo(2, 1); context.lineTo(1, 31); context.stroke();
  }
  const movement = new Cesium.Cartesian3();
  return scene.primitives.add(new Cesium.ParticleSystem({
    image, emitter: new Cesium.SphereEmitter(180), speed: 0,
    modelMatrix: Cesium.Matrix4.fromTranslation(scene.camera.positionWC),
    particleLife: snow ? 8 : 3,
    imageSize: new Cesium.Cartesian2(snow ? 8 : 3, snow ? 8 : 22),
    startColor: Cesium.Color.WHITE.withAlpha(snow ? 0.9 : 0.7),
    endColor: Cesium.Color.WHITE.withAlpha(0),
    updateCallback(particle, seconds) {
      // Hạt bám quanh điểm nhìn khi pan/zoom, không bị bỏ lại ở vị trí cũ.
      Cesium.Cartesian3.add(particle.position, weatherOffset, particle.position);
      const intensity = effectValues[type];
      particle.startColor.alpha = (snow ? 0.9 : 0.7) * Math.sqrt(intensity);
      particle.imageSize.x = snow ? 4 + 6 * intensity : 2 + 2 * intensity;
      particle.imageSize.y = snow ? particle.imageSize.x : 12 + 14 * intensity;
      Cesium.Cartesian3.normalize(particle.position, movement);
      Cesium.Cartesian3.multiplyByScalar(movement, -(snow ? 5 : 55) * seconds, movement);
      Cesium.Cartesian3.add(particle.position, movement, particle.position);
      if (snow) {
        Cesium.Cartesian3.multiplyByScalar(scene.camera.rightWC, Math.sin(particle.age * 2) * seconds * 2, movement);
        Cesium.Cartesian3.add(particle.position, movement, particle.position);
      }
    }
  }));
}

function updateEffects() {
  const scene = ol3d.getCesiumScene();
  let count = 0;
  for (const [id, { toggle, slider, output, card }] of effectControls) {
    const checked = toggle.checked;
    slider.disabled = !checked;
    output.textContent = `${slider.value}%`;
    effectTargets[id] = checked ? Number(slider.value) / 100 : 0;
    if (effectTargets[id] === 0) effectValues[id] = 0;
    card.classList.toggle('is-active', effectTargets[id] > 0);
    slider.style.setProperty('--effect-progress', `${slider.value}%`);
    if (effectTargets[id] > 0) count++;
  }
  effectsPanel.querySelector('[data-effects-summary]').textContent = count ? `Đang bật ${count}/${EFFECTS.length} hiệu ứng` : 'Chưa bật hiệu ứng';
  effectsPanel.querySelector('[data-effects-reset]').disabled = ![...effectControls.values()].some(({ toggle }) => toggle.checked);
  applyEffectValues(scene);
  pressed(buttons.effects, count > 0);
  scene.requestRender();
}

function applyEffectValues(scene) {
  const strength = is3DEnabled() && !document.hidden ? effectValues : disabledEffects;
  scene.globe.enableLighting = strength.lighting > 0;
  if (scene.globe.enableLighting) {
    if (!(scene.light instanceof Cesium.DirectionalLight)) scene.light = new Cesium.DirectionalLight({ direction: Cesium.Cartesian3.negate(scene.camera.positionWC, new Cesium.Cartesian3()) });
    // Tăng tương phản sườn núi thay vì tăng phơi sáng toàn ảnh lên trắng.
    scene.light.intensity = 1;
    scene.globe.vertexShadowDarkness = 1 - strength.lighting * 0.65;
    scene.globe.lambertDiffuseMultiplier = strength.lighting * 0.9;
    updateLightDirection(scene);
  } else if (scene.light instanceof Cesium.DirectionalLight) scene.light = new Cesium.SunLight();
  // Chỉ pha màu theo khoảng cách, không dùng sương để cắt bớt ô địa hình.
  scene.fog.enabled = false;
  if (strength.fog > 0 && !fogStage) {
    fogStage = scene.postProcessStages.add(new Cesium.PostProcessStage({
      name: 'webgis-fog',
      uniforms: { strength: 0, cameraHeight: () => scene.camera.positionCartographic.height },
      fragmentShader: `uniform sampler2D colorTexture;
        uniform sampler2D depthTexture;
        uniform float strength;
        uniform float cameraHeight;
        in vec2 v_textureCoordinates;
        void main() {
          vec4 color = texture(colorTexture, v_textureCoordinates);
          float depth = texture(depthTexture, v_textureCoordinates).r;
          vec4 positionEC = czm_windowToEyeCoordinates(gl_FragCoord.xy, depth);
          float distanceToEye = length(positionEC.xyz / positionEC.w);
          float distanceInFog = max(0.0, distanceToEye - max(cameraHeight, 0.0) * 0.7);
          float fade = 1.0 - smoothstep(300000.0, 800000.0, cameraHeight);
          float fog = (1.0 - exp(-pow(distanceInFog * 0.00004 * strength, 2.0))) * fade;
          if (depth >= 1.0) fog = 0.0;
          out_FragColor = vec4(mix(color.rgb, vec3(0.68, 0.76, 0.82), fog * 0.9), color.a);
        }`
    }));
  }
  if (fogStage) {
    fogStage.enabled = strength.fog > 0 && scene.camera.positionCartographic.height < 800000;
    fogStage.uniforms.strength = strength.fog;
  }
  scene.globe.showGroundAtmosphere = strength.atmosphere > 0;
  scene.globe.atmosphereLightIntensity = strength.atmosphere * 14;
  if (scene.skyAtmosphere) {
    scene.skyAtmosphere.show = strength.atmosphere > 0;
    scene.skyAtmosphere.atmosphereLightIntensity = strength.atmosphere * 70;
  }
  // Sóng mặc định có cường độ cố định; chỉ dùng material điều khiển được để 1% khác 100%.
  scene.globe.showWaterEffect = false;
  if (strength.water > 0 && scene.terrainProvider.hasWaterMask) {
    waterMaterial ??= new Cesium.Material({ fabric: {
      type: 'WaterMotion', uniforms: { strength: 0.5, time: 0, normalMap: Cesium.buildModuleUrl('Assets/Textures/waterNormalsSmall.jpg') },
      source: `czm_material czm_getMaterial(czm_materialInput materialInput) {
        czm_material material = czm_getDefaultMaterial(materialInput);
        material.alpha = 0.0;
        #ifdef HAS_WATER_MASK
        float visibility = 1.0 - smoothstep(100000.0, 500000.0, length(materialInput.positionToEyeEC));
        if (visibility <= 0.0) return material;
        vec3 positionWC = (czm_inverseView * vec4(-materialInput.positionToEyeEC, 1.0)).xyz;
        vec2 uv = czm_ellipsoidTextureCoordinates(normalize(positionWC));
        vec4 noise = czm_getWaterNoise(normalMap, uv * 1250000.0, time, 0.0);
        float crest = clamp(0.5 + noise.x * 4.0 + noise.y * 3.0, 0.0, 1.0);
        material.diffuse = mix(vec3(0.02, 0.14, 0.22), vec3(0.75, 0.88, 0.94), crest * crest);
        material.alpha = clamp(materialInput.waterMask, 0.0, 1.0) * strength * visibility * 0.65;
        #endif
        return material;
      }`
    } });
    waterMaterial.uniforms.strength = strength.water;
    scene.globe.material = waterMaterial;
  } else scene.globe.material = undefined;
  for (const type of ['rain', 'snow']) {
    if (strength[type] > 0 && is3DEnabled() && !document.hidden) {
      weather[type] ??= createWeather(scene, type);
      const area = scene.canvas.clientWidth * scene.canvas.clientHeight / (1440 * 900);
      weather[type].emissionRate = strength[type] * (type === 'rain' ? 1400 : 320) * Cesium.Math.clamp(area, 0.5, 1.25);
      weather[type].startColor.alpha = (type === 'snow' ? 0.9 : 0.7) * Math.sqrt(strength[type]);
    } else if (weather[type]) {
      scene.primitives.remove(weather[type]);
      delete weather[type];
    }
  }
}

//#endregion

//#region 5.8. Camera và chuyển chế độ 2D/3D
function zoomCamera(direction) {
  if (!is3DEnabled()) return;
  const scene = ol3d.getCesiumScene();
  const camera = scene.camera;
  const ground = scene.globe.getHeight(camera.positionCartographic) || 0;
  const amount = Math.max(5, (camera.positionCartographic.height - ground) * .35);
  if (direction > 0) camera.zoomIn(amount); else camera.zoomOut(amount);
  scene.requestRender();
}

function resetViewDirection() {
  if (!is3DEnabled()) return;
  const scene = ol3d.getCesiumScene();
  const camera = scene.camera;
  camera.cancelFlight();
  // Không truyền destination: chỉ sửa hướng, giữ nguyên tọa độ và cao độ camera.
  camera.setView({ orientation: { heading: 0, pitch: camera.pitch, roll: 0 } });
  scene.requestRender();
}

function setEnabled(enabled) {
  if (!ol3d || enabled === ol3d.getEnabled()) return;
  stopAnalysis();
  document.dispatchEvent(new CustomEvent('webgis-tool-activate', { detail: { name: 'cesium', viewModeChange: true } }));
  ol3d.setEnabled(enabled);
  resetEffectsFrame();
  updateEffects();
  document.querySelector('.map-wrapper').classList.toggle('is-3d', enabled);
  Object.values(buttons).forEach(control => { control.hidden = !enabled; });
  headerInfo.hidden = !enabled;
  markerSource.show = enabled;
  clearTimeout(messageTimer);
  infoPanel.hidden = true;
  if (enabled) {
    setHeaderInfo('Chế độ 3D · Tra cứu vị trí, đo bám địa hình hoặc vẽ mặt cắt.');
  } else {
    map2D.getView().setRotation(0);
    map2D.render();
  }
  toggleButton.textContent = enabled ? '2D' : '3D';
  toggleButton.title = enabled ? 'Chuyển sang chế độ 2D' : 'Chuyển sang chế độ 3D';
  toggleButton.setAttribute('aria-label', toggleButton.title);
  pressed(toggleButton, enabled);
  document.dispatchEvent(new CustomEvent('webgis-view-mode-change', { detail: { enabled } }));
}

export function toggle3D() { if (ol3d) setEnabled(!ol3d.getEnabled()); }
export function enable3D() { setEnabled(true); }
export function applyStartupCamera(bridge, map) {
  const { center, distance, tilt } = STARTUP_3D_VIEW;
  const view = map.getView();
  view.cancelAnimations();
  view.setCenter(fromLonLat(center, view.getProjection()));
  view.setRotation(0);
  bridge.getCamera().setTilt(Cesium.Math.toRadians(tilt));
  bridge.getCamera().setDistance(distance);
  const scene = bridge.getCesiumScene();
  scene.camera.setView({ orientation: { heading: scene.camera.heading, pitch: scene.camera.pitch, roll: 0 } });
  scene.requestRender();
}
export function showStartup3D() {
  if (!ol3d) return;
  setEnabled(true);
  applyStartupCamera(ol3d, map2D);
  document.dispatchEvent(new CustomEvent('webgis-coordinate-update', { detail: {
    longitude: STARTUP_3D_VIEW.center[0], latitude: STARTUP_3D_VIEW.center[1]
  } }));
}
export function disable3D() { setEnabled(false); }
export function is3DEnabled() { return ol3d ? ol3d.getEnabled() : false; }
export function getCesiumScene() { return ol3d?.getCesiumScene() || null; }
export function getOLCesium() { return ol3d; }
//#endregion
//#endregion
