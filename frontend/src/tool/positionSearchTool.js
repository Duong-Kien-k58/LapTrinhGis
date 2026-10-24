import { fromLonLat, toLonLat } from 'ol/proj.js'
import Feature from 'ol/Feature.js'
import Point from 'ol/geom/Point.js'
import VectorLayer from 'ol/layer/Vector.js'
import VectorSource from 'ol/source/Vector.js'
import { Circle as CircleStyle, Fill, Stroke, Style } from 'ol/style.js'
import { createToolPanel } from './toolUtils.js'

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
      <form novalidate>
        <div class="coordinate-mode-tabs" role="group" aria-label="Hệ tọa độ tìm kiếm">
          <button type="button" data-coordinate-mode="wgs84" class="active">WGS84</button>
          <button type="button" data-coordinate-mode="vn2000">VN2000</button>
        </div>
        <div class="coordinate-fields">
          <label for="position-coordinate-first"><span data-coordinate-label="first">Vĩ độ <small>°</small></span><input id="position-coordinate-first" name="first" type="number" inputmode="decimal" step="any" min="-90" max="90" required placeholder="21.0278" aria-describedby="position-search-hint"></label>
          <label for="position-coordinate-second"><span data-coordinate-label="second">Kinh độ <small>°</small></span><input id="position-coordinate-second" name="second" type="number" inputmode="decimal" step="any" min="-180" max="180" required placeholder="105.8342" aria-describedby="position-search-hint"></label>
        </div>
        <button type="submit">Tìm kiếm vị trí</button>
        <p id="position-search-hint" class="tool-hint" data-search-hint>Nhập vĩ độ và kinh độ theo đơn vị độ thập phân.</p>
      </form>
    `,
  })
  const form = panel.querySelector('form')
  const inputs = [...panel.querySelectorAll('.coordinate-fields input')]
  const labels = [...panel.querySelectorAll('[data-coordinate-label]')]
  const input = inputs[0]
  const hint = panel.querySelector('[data-search-hint]')
  const modeButtons = panel.querySelectorAll('[data-coordinate-mode]')
  hint.setAttribute('role', 'status')
  modeButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.coordinateMode === 'wgs84')))
  let mode = 'wgs84'

  function updateMode(nextMode) {
    mode = nextMode
    const isWgs84 = mode === 'wgs84'
    modeButtons.forEach(button => { const selected = button.dataset.coordinateMode === mode; button.classList.toggle('active', selected); button.setAttribute('aria-pressed', String(selected)) })
    labels[0].innerHTML = isWgs84 ? 'Vĩ độ <small>°</small>' : 'X · Bắc <small>m</small>'
    labels[1].innerHTML = isWgs84 ? 'Kinh độ <small>°</small>' : 'Y · Đông <small>m</small>'
    inputs.forEach((field, index) => {
      field.value = ''
      field.removeAttribute('aria-invalid')
      field.min = isWgs84 ? String(index === 0 ? -90 : -180) : '0'
      if (isWgs84) field.max = String(index === 0 ? 90 : 180)
      else field.removeAttribute('max')
      field.placeholder = isWgs84 ? ['21.0278', '105.8342'][index] : ['2329089.18', '524092.03'][index]
    })
    hint.dataset.state = ''
    hint.textContent = isWgs84
      ? 'Nhập vĩ độ và kinh độ theo đơn vị độ thập phân.'
      : vn2000Hint()
    input.focus()
  }

  function readWgs84(pair) {
    const [latitude, longitude] = pair
    return Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 ? [longitude, latitude] : null
  }

  function readVn2000(pair) {
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
    const invalid = inputs.find(field => !field.validity.valid || !Number.isFinite(field.valueAsNumber))
    inputs.forEach(field => field.setAttribute('aria-invalid', String(!field.validity.valid || !Number.isFinite(field.valueAsNumber))))
    if (invalid) {
      hint.dataset.state = 'error'
      hint.textContent = !invalid.value ? 'Vui lòng nhập đủ hai giá trị tọa độ.' : mode === 'wgs84' ? 'Vĩ độ từ −90 đến 90°, kinh độ từ −180 đến 180°.' : 'X và Y phải là số không âm, đơn vị mét.'
      invalid.focus()
      return
    }
    const pair = inputs.map(field => field.valueAsNumber)
    const coordinates = mode === 'wgs84' ? readWgs84(pair) : readVn2000(pair)
    if (!coordinates) {
      hint.dataset.state = 'error'
      hint.textContent = mode === 'wgs84'
        ? 'Vĩ độ hoặc kinh độ không hợp lệ.'
        : 'Tọa độ VN2000 không hợp lệ. Kiểm tra lại X và Y.'
      return
    }

    const mapCoordinate = fromLonLat(coordinates, map.getView().getProjection())
    temporaryPointSource.clear()
    temporaryPointSource.addFeature(new Feature(new Point(mapCoordinate)))
    map.getView().animate({ center: mapCoordinate, zoom: 13, duration: 500 })
    hint.dataset.state = 'success'
    hint.textContent = `Đã đến: ${coordinates[1].toFixed(6)}, ${coordinates[0].toFixed(6)} (WGS84).`
  })
  inputs.forEach(field => field.addEventListener('input', () => {
    field.removeAttribute('aria-invalid')
    hint.dataset.state = ''
    hint.textContent = mode === 'wgs84' ? 'Nhập vĩ độ và kinh độ theo đơn vị độ thập phân.' : vn2000Hint()
  }))
  const vn2000Hint = () => `Múi ${getProjectionZoneWidth()}° · Kinh tuyến trục theo tâm bản đồ.`
  modeButtons.forEach((button) => button.addEventListener('click', () => updateMode(button.dataset.coordinateMode)))

  const clear = () => temporaryPointSource.clear()
  panel.addEventListener('toolpanelclose', clear)
  document.querySelectorAll('input[name="projection-zone"]').forEach(radio => radio.addEventListener('change', () => { if (mode === 'vn2000') hint.textContent = vn2000Hint() }))
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
