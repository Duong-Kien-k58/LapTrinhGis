import { fromLonLat, toLonLat } from 'ol/proj.js'
import Feature from 'ol/Feature.js'
import Point from 'ol/geom/Point.js'
import VectorLayer from 'ol/layer/Vector.js'
import VectorSource from 'ol/source/Vector.js'
import { Circle as CircleStyle, Fill, Stroke, Style } from 'ol/style.js'
import { createToolPanel } from './toolUtils.js'

const PLACES = {
  'hà nội': [105.8342, 21.0278],
  'đà nẵng': [108.2022, 16.0544],
  'thành phố hồ chí minh': [106.6297, 10.8231],
}

function parsePair(value) {
  const parts = value.split(',').map(item => item.trim())
  if (parts.some(item => !item)) return null
  const values = parts.map(Number)
  return values.length === 2 && values.every(Number.isFinite) ? values : null
}

function getProjectionZoneWidth() {
  return Number(document.querySelector('input[name="projection-zone"]:checked')?.value || 6)
}

function getCentralMeridian(longitude, zoneWidth) {
  return zoneWidth === 3
    ? Math.round(longitude / 3) * 3
    : (Math.floor((longitude + 180) / 6) + 1) * 6 - 183
}

// Đổi ngược tọa độ phẳng VN2000 (X Bắc, Y Đông) về WGS84 để định vị bản đồ.
export function fromVn2000(northing, easting, centralMeridian, zoneWidth) {
  const semiMajorAxis = 6378137
  const eccentricitySquared = 0.00669438
  const scaleFactor = zoneWidth === 3 ? 0.9999 : 0.9996
  const eccentricityPrimeSquared = eccentricitySquared / (1 - eccentricitySquared)
  const e1 = (1 - Math.sqrt(1 - eccentricitySquared)) / (1 + Math.sqrt(1 - eccentricitySquared))
  const meridianArc = northing / scaleFactor
  const mu = meridianArc / (semiMajorAxis * (1 - eccentricitySquared / 4 - 3 * eccentricitySquared ** 2 / 64 - 5 * eccentricitySquared ** 3 / 256))
  const phi1 = mu
    + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu)
    + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
    + (151 * e1 ** 3 / 96) * Math.sin(6 * mu)
    + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu)
  const sinPhi1 = Math.sin(phi1)
  const cosPhi1 = Math.cos(phi1)
  const tangent1 = Math.tan(phi1)
  const tangent1Squared = tangent1 ** 2
  const radius1 = semiMajorAxis / Math.sqrt(1 - eccentricitySquared * sinPhi1 ** 2)
  const radiusCurvature1 = semiMajorAxis * (1 - eccentricitySquared) / (1 - eccentricitySquared * sinPhi1 ** 2) ** 1.5
  const d = (easting - 500000) / (radius1 * scaleFactor)
  const latitude = phi1 - (radius1 * tangent1 / radiusCurvature1) * (
    d ** 2 / 2
    - (5 + 3 * tangent1Squared + 10 * eccentricityPrimeSquared * cosPhi1 ** 2 - 4 * eccentricityPrimeSquared ** 2 * cosPhi1 ** 4 - 9 * eccentricityPrimeSquared) * d ** 4 / 24
    + (61 + 90 * tangent1Squared + 298 * eccentricityPrimeSquared * cosPhi1 ** 2 + 45 * tangent1Squared ** 2 - 252 * eccentricityPrimeSquared - 3 * eccentricityPrimeSquared ** 2 * cosPhi1 ** 4) * d ** 6 / 720
  )
  const longitude = centralMeridian * Math.PI / 180 + (
    d
    - (1 + 2 * tangent1Squared + eccentricityPrimeSquared * cosPhi1 ** 2) * d ** 3 / 6
    + (5 - 2 * eccentricityPrimeSquared * cosPhi1 ** 2 + 28 * tangent1Squared - 3 * eccentricityPrimeSquared ** 2 * cosPhi1 ** 4 + 8 * eccentricityPrimeSquared + 24 * tangent1Squared ** 2) * d ** 5 / 120
  ) / cosPhi1
  return [longitude * 180 / Math.PI, latitude * 180 / Math.PI]
}

export function createPositionSearchTool(map) {
  const temporaryPointSource = new VectorSource()
  const temporaryPointLayer = new VectorLayer({
    source: temporaryPointSource,
    zIndex: 9997,
    style: new Style({
      image: new CircleStyle({
        radius: 9,
        fill: new Fill({ color: 'rgba(255, 221, 0, .9)' }),
        stroke: new Stroke({ color: '#ef4444', width: 3 }),
      }),
    }),
  })
  map.addLayer(temporaryPointLayer)

  const panel = createToolPanel({
    id: 'position-search-panel',
    title: 'Tìm kiếm vị trí',
    content: `
      <form>
        <div class="coordinate-mode-tabs" role="group" aria-label="Hệ tọa độ tìm kiếm">
          <button type="button" data-coordinate-mode="wgs84" class="active">WGS84</button>
          <button type="button" data-coordinate-mode="vn2000">VN2000</button>
        </div>
        <label data-search-label>Địa danh hoặc tọa độ WGS84</label>
        <input data-search-input placeholder="Ví dụ: Hà Nội hoặc 21.02, 105.83">
        <button type="submit">Tìm kiếm vị trí</button>
        <p class="tool-hint" data-search-hint>Nhập địa danh hoặc vĩ độ, kinh độ theo thứ tự Lat, Long.</p>
      </form>
    `,
  })
  const form = panel.querySelector('form')
  const input = panel.querySelector('[data-search-input]')
  const label = panel.querySelector('[data-search-label]')
  const hint = panel.querySelector('[data-search-hint]')
  const modeButtons = panel.querySelectorAll('[data-coordinate-mode]')
  input.id = 'position-search-query'
  label.htmlFor = input.id
  hint.setAttribute('role', 'status')
  modeButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.coordinateMode === 'wgs84')))
  let mode = 'wgs84'

  function updateMode(nextMode) {
    mode = nextMode
    const isWgs84 = mode === 'wgs84'
    modeButtons.forEach(button => { const selected = button.dataset.coordinateMode === mode; button.classList.toggle('active', selected); button.setAttribute('aria-pressed', String(selected)) })
    label.textContent = isWgs84 ? 'Địa danh hoặc tọa độ WGS84' : 'Tọa độ phẳng VN2000'
    input.value = ''
    input.placeholder = isWgs84 ? 'Ví dụ: Hà Nội hoặc 21.02, 105.83' : 'Ví dụ: 2329089.18, 524092.03'
    hint.textContent = isWgs84
      ? 'Nhập địa danh hoặc vĩ độ, kinh độ theo thứ tự Lat, Long.'
      : `Nhập X, Y (Bắc, Đông) theo múi ${getProjectionZoneWidth()}°; kinh tuyến trục được chọn theo tâm bản đồ.`
    input.focus()
  }

  function readWgs84(value) {
    const knownPlace = PLACES[value.toLocaleLowerCase('vi-VN')]
    if (knownPlace) return knownPlace
    const pair = parsePair(value)
    if (!pair) return null
    const [latitude, longitude] = pair
    return Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 ? [longitude, latitude] : null
  }

  function readVn2000(value) {
    const pair = parsePair(value)
    if (!pair) return null
    const [northing, easting] = pair
    if (northing < 0 || easting < 0) return null
    const zoneWidth = getProjectionZoneWidth()
    const [viewLongitude] = toLonLat(map.getView().getCenter(), map.getView().getProjection())
    const coordinates = fromVn2000(northing, easting, getCentralMeridian(viewLongitude, zoneWidth), zoneWidth)
    return coordinates.every(Number.isFinite) && Math.abs(coordinates[0]) <= 180 && Math.abs(coordinates[1]) <= 90
      ? coordinates
      : null
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault()
    const coordinates = mode === 'wgs84' ? readWgs84(input.value.trim()) : readVn2000(input.value.trim())
    if (!coordinates) {
      hint.textContent = mode === 'wgs84'
        ? 'Không tìm thấy vị trí. Nhập Lat, Long hợp lệ hoặc một địa danh được hỗ trợ.'
        : 'Tọa độ VN2000 không hợp lệ. Nhập theo định dạng X, Y.'
      return
    }

    const mapCoordinate = fromLonLat(coordinates, map.getView().getProjection())
    temporaryPointSource.clear()
    temporaryPointSource.addFeature(new Feature(new Point(mapCoordinate)))
    map.getView().animate({ center: mapCoordinate, zoom: 13, duration: 500 })
    hint.textContent = `Đã đến: ${coordinates[1].toFixed(6)}, ${coordinates[0].toFixed(6)} (WGS84).`
  })
  modeButtons.forEach((button) => button.addEventListener('click', () => updateMode(button.dataset.coordinateMode)))

  const clear = () => temporaryPointSource.clear()
  panel.addEventListener('toolpanelclose', clear)
  document.querySelectorAll('input[name="projection-zone"]').forEach(radio => radio.addEventListener('change', () => { if (mode === 'vn2000') hint.textContent = `Nhập X, Y (Bắc, Đông) theo múi ${getProjectionZoneWidth()}°; kinh tuyến trục được chọn theo tâm bản đồ.` }))
  return {
    open() {
      document.dispatchEvent(new CustomEvent('webgis-tool-activate', { detail: { name: 'position' } }))
      panel.classList.add('shown')
      input.focus()
    },
    close() {
      panel.classList.remove('shown')
      temporaryPointSource.clear()
    },
  }
}
