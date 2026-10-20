import { GEOSERVER_CONFIG, MAP_LAYER_CONFIGS } from '../config/layers.js'
import { createToolPanel } from './toolUtils.js'

const STORAGE_KEY = 'webgis-layer-presentation-v1'
const COLOR_MAPPED_RASTER_TYPES = new Set(['dem', 'thematic'])
const DEFAULT_RASTER_RANGE = { min: 0, max: 3000 }
const DEFAULT_RASTER_STEPS = 15
const MIN_RASTER_STEPS = 5
const MAX_RASTER_STEPS = 30
const PALETTES = {
  terrain: ['#006837', '#1a9850', '#66bd63', '#a6d96a', '#d9ef8b', '#ffffbf', '#fee08b', '#fdae61', '#f46d43', '#d73027', '#8c1d18', '#f5f5f5'],
  elevation: ['#0b3d2e', '#146b3a', '#2f8f46', '#62ad55', '#9fcf6b', '#d8e68a', '#f2e6a2', '#d6b46c', '#ad7d4f', '#805238', '#57382e', '#d9d9d9', '#ffffff'],
  spectral: ['#5e4fa2', '#3f75b5', '#3288bd', '#41b6c4', '#66c2a5', '#a6d96a', '#d9ef8b', '#ffffbf', '#fee08b', '#fdae61', '#f46d43', '#d53e4f', '#9e0142'],
  viridis: ['#440154', '#482878', '#3e4989', '#31688e', '#26828e', '#1f9e89', '#35b779', '#6ece58', '#b5de2b', '#fde725'],
  earth: ['#183a37', '#285943', '#3f7652', '#659157', '#91b45f', '#c4cd73', '#e2d49a', '#cfb27c', '#aa7b55', '#81503b', '#5b342d', '#e8e1d5'],
  blue: ['#f7fbff', '#e3eef9', '#cfe1f2', '#b5d4e9', '#93c4df', '#6baed6', '#4292c6', '#2171b5', '#08519c', '#08306b'],
  warm: ['#ffffcc', '#ffeda0', '#fed976', '#feb24c', '#fd8d3c', '#fc4e2a', '#e31a1c', '#bd0026', '#800026'],
  category: ['#2dd4bf', '#60a5fa', '#fbbf24', '#f87171', '#a78bfa', '#34d399', '#fb7185'],
}

const SECTION_CONFIG = {
  'vector-point': { kind: 'vector', geometry: 'Point', title: 'Trình bày dữ liệu điểm' },
  'vector-line': { kind: 'vector', geometry: 'LineString', title: 'Trình bày dữ liệu đường' },
  'vector-polygon': { kind: 'vector', geometry: 'Polygon', title: 'Trình bày dữ liệu vùng' },
  'vector-thematic': { kind: 'vector', thematic: true, title: 'Trình bày vector chuyên đề' },
  'raster-satellite': { kind: 'raster', rasterType: 'satellite', title: 'Trình bày ảnh vệ tinh' },
  'raster-aerial': { kind: 'raster', rasterType: 'aerial', title: 'Trình bày ảnh hàng không' },
  'raster-dem': { kind: 'raster', rasterType: 'dem', title: 'Trình bày dữ liệu DEM' },
  'raster-thematic': { kind: 'raster', rasterType: 'thematic', title: 'Trình bày raster chuyên đề' },
}

function escapeXml(value) {
  return String(value).replace(/[<>&'\"]/g, (character) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;',
  })[character])
}

function number(value, fallback, min = -Infinity, max = Infinity) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, min), max) : fallback
}

function interpolatePalette(paletteName, count) {
  const anchors = PALETTES[paletteName] || PALETTES.terrain
  if (count <= 1) return [anchors[0]]
  return Array.from({ length: count }, (_, index) => {
    const position = index * (anchors.length - 1) / (count - 1)
    const left = Math.floor(position)
    const right = Math.min(left + 1, anchors.length - 1)
    const ratio = position - left
    const channels = [1, 3, 5].map((offset) => {
      const start = parseInt(anchors[left].slice(offset, offset + 2), 16)
      const end = parseInt(anchors[right].slice(offset, offset + 2), 16)
      return Math.round(start + (end - start) * ratio).toString(16).padStart(2, '0')
    })
    return `#${channels.join('')}`
  })
}

function steppedGradient(colors) {
  const stops = colors.flatMap((color, index) => {
    const start = index * 100 / colors.length
    const end = (index + 1) * 100 / colors.length
    return [`${color} ${start}%`, `${color} ${end}%`]
  })
  return `linear-gradient(90deg, ${stops.join(', ')})`
}

function svgElement(name, attributes) {
  const element = document.createElementNS('http://www.w3.org/2000/svg', name)
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value))
  return element
}

function starPoints(centerX, centerY, outerRadius, innerRadius) {
  return Array.from({ length: 10 }, (_, index) => {
    const angle = -Math.PI / 2 + index * Math.PI / 5
    const radius = index % 2 ? innerRadius : outerRadius
    return `${centerX + Math.cos(angle) * radius},${centerY + Math.sin(angle) * radius}`
  }).join(' ')
}

function getLayerName(layer) {
  return layer.getSource()?.getParams?.().LAYERS || ''
}

function getSldLayerName(layer) {
  const qualifiedName = getLayerName(layer)
  const [workspace, shortName] = qualifiedName.split(':')
  if (!workspace || !shortName) return layer.get('layerKind') === 'raster' ? `${GEOSERVER_CONFIG.workspace}:${qualifiedName}` : qualifiedName

  // GeoServer ghép NamedLayer không đồng nhất trên endpoint WMS theo workspace:
  // coverage raster cần namespace, còn feature type vector cần tên ngắn.
  if (layer.get('layerKind') === 'raster') return qualifiedName
  const sourceUrl = (layer.getSource()?.getUrls?.()?.[0] || layer.getSource()?.getUrl?.())
  if (!sourceUrl) return qualifiedName
  const pathname = new URL(sourceUrl, window.location.origin).pathname.replace(/\/+$/, '')
  return pathname.endsWith(`/geoserver/${workspace}/wms`) ? shortName : qualifiedName
}

function readSavedStyles() {
  try {
    const styles = JSON.parse(localStorage.getItem(STORAGE_KEY))
    return styles && typeof styles === 'object' && !Array.isArray(styles) ? styles : {}
  } catch {
    return {}
  }
}

function writeSavedStyles(styles) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(styles))
    return true
  } catch {
    return false
  }
}

function wrapSld(layerName, symbolizer, rules = '') {
  return `<?xml version="1.0" encoding="UTF-8"?>
<sld:StyledLayerDescriptor version="1.0.0" xmlns="http://www.opengis.net/sld" xmlns:sld="http://www.opengis.net/sld" xmlns:ogc="http://www.opengis.net/ogc">
  <sld:NamedLayer><sld:Name>${escapeXml(layerName)}</sld:Name><sld:UserStyle><sld:FeatureTypeStyle>
    ${rules || `<sld:Rule>${symbolizer}</sld:Rule>`}
  </sld:FeatureTypeStyle></sld:UserStyle></sld:NamedLayer>
</sld:StyledLayerDescriptor>`
}

function vectorSymbolizer(geometry, style) {
  const stroke = `<sld:Stroke><sld:CssParameter name="stroke">${style.stroke}</sld:CssParameter><sld:CssParameter name="stroke-width">${style.width}</sld:CssParameter><sld:CssParameter name="stroke-opacity">${style.strokeOpacity ?? 1}</sld:CssParameter>${style.dash && style.dash !== 'solid' ? `<sld:CssParameter name="stroke-dasharray">${style.dash}</sld:CssParameter>` : ''}</sld:Stroke>`
  if (geometry === 'Point') {
    return `<sld:PointSymbolizer><sld:Graphic><sld:Mark><sld:WellKnownName>${style.shape || 'circle'}</sld:WellKnownName><sld:Fill><sld:CssParameter name="fill">${style.fill}</sld:CssParameter><sld:CssParameter name="fill-opacity">${style.fillOpacity}</sld:CssParameter></sld:Fill>${stroke}</sld:Mark><sld:Size>${style.radius * 2}</sld:Size></sld:Graphic></sld:PointSymbolizer>`
  }
  if (geometry === 'LineString') return `<sld:LineSymbolizer>${stroke}</sld:LineSymbolizer>`
  return `<sld:PolygonSymbolizer><sld:Fill><sld:CssParameter name="fill">${style.fill}</sld:CssParameter><sld:CssParameter name="fill-opacity">${style.fillOpacity}</sld:CssParameter></sld:Fill>${stroke}</sld:PolygonSymbolizer>`
}

function buildSimpleVectorSld(layer, geometry, style) {
  return wrapSld(getSldLayerName(layer), vectorSymbolizer(geometry, style))
}

function buildThematicVectorSld(layer, geometry, state, classes) {
  const rules = classes.map((item, index) => {
    const color = PALETTES[state.palette][index % PALETTES[state.palette].length]
    const lowerFilter = `<ogc:PropertyIsGreaterThanOrEqualTo><ogc:PropertyName>${escapeXml(state.field)}</ogc:PropertyName><ogc:Literal>${item.min}</ogc:Literal></ogc:PropertyIsGreaterThanOrEqualTo>`
    const upperOperator = index === classes.length - 1 ? 'PropertyIsLessThanOrEqualTo' : 'PropertyIsLessThan'
    const filter = state.method === 'range'
      ? `<ogc:And>${lowerFilter}<ogc:${upperOperator}><ogc:PropertyName>${escapeXml(state.field)}</ogc:PropertyName><ogc:Literal>${item.max}</ogc:Literal></ogc:${upperOperator}></ogc:And>`
      : `<ogc:PropertyIsEqualTo><ogc:PropertyName>${escapeXml(state.field)}</ogc:PropertyName><ogc:Literal>${escapeXml(item.value)}</ogc:Literal></ogc:PropertyIsEqualTo>`
    const style = geometry === 'LineString'
      ? { stroke: color, width: 3, strokeOpacity: 1 }
      : geometry === 'Point'
        ? { fill: color, fillOpacity: .85, stroke: '#ffffff', width: 1.2, radius: 6 }
        : { fill: color, fillOpacity: .7, stroke: '#263238', width: 1, strokeOpacity: 1 }
    return `<sld:Rule><sld:Title>${escapeXml(item.label)}</sld:Title><ogc:Filter>${filter}</ogc:Filter>${vectorSymbolizer(geometry, style)}</sld:Rule>`
  }).join('')
  const otherStyle = geometry === 'LineString'
    ? { stroke: '#94a3b8', width: 2, strokeOpacity: .75 }
    : geometry === 'Point'
      ? { fill: '#94a3b8', fillOpacity: .65, stroke: '#ffffff', width: 1, radius: 5 }
      : { fill: '#94a3b8', fillOpacity: .35, stroke: '#475569', width: 1, strokeOpacity: 1 }
  const otherRule = state.method === 'unique'
    ? `<sld:Rule><sld:Title>Giá trị khác</sld:Title><ogc:ElseFilter/>${vectorSymbolizer(geometry, otherStyle)}</sld:Rule>`
    : ''
  return wrapSld(getSldLayerName(layer), '', rules + otherRule)
}

function buildRasterSld(layer, state, withColorMap) {
  let colorMap = ''
  if (withColorMap) {
    if (state.max <= state.min) throw new Error('Giá trị lớn nhất phải lớn hơn giá trị nhỏ nhất.')
    const steps = number(state.steps, DEFAULT_RASTER_STEPS, MIN_RASTER_STEPS, MAX_RASTER_STEPS)
    const colors = interpolatePalette(state.palette, steps)
    const step = (state.max - state.min) / steps
    const entries = colors.map((color, index) => {
      const quantity = state.min + step * index
      const nextQuantity = state.min + step * (index + 1)
      return `<sld:ColorMapEntry color="${color}" quantity="${quantity}" label="${quantity.toFixed(1)} – ${nextQuantity.toFixed(1)}"/>`
    })
    // GeoServer tạo khoảng giữa hai entry liên tiếp, vì vậy cần thêm
    // mốc cuối để số khoảng trên bản đồ khớp với giá trị người dùng chọn.
    entries.push(`<sld:ColorMapEntry color="${colors.at(-1)}" quantity="${state.max}" label="${state.max.toFixed(1)}"/>`)
    colorMap = `<sld:ColorMap type="intervals">${entries.join('')}</sld:ColorMap>`
  }
  // ColorMap phân loại theo giá trị pixel gốc. Normalize/Gamma làm thay đổi
  // giá trị trước khi phân màu nên chỉ dùng cho ảnh RGB.
  const contrast = !withColorMap && (state.normalize || state.gamma !== 1)
    ? `<sld:ContrastEnhancement>${state.normalize ? '<sld:Normalize/>' : ''}<sld:GammaValue>${state.gamma}</sld:GammaValue></sld:ContrastEnhancement>`
    : ''
  const symbolizer = `<sld:RasterSymbolizer>${colorMap}${contrast}</sld:RasterSymbolizer>`
  return wrapSld(getSldLayerName(layer), symbolizer)
}

async function validateSld(layer, sld) {
  const source = layer.getSource()
  const sourceUrl = (source?.getUrls?.()?.[0] || source?.getUrl?.())
  if (!sourceUrl) throw new Error('Lớp không có địa chỉ WMS để áp dụng style.')
  const url = new URL(sourceUrl, window.location.origin)
  url.search = ''
  const params = {
    service: 'WMS', version: '1.1.1', request: 'GetMap', layers: getLayerName(layer),
    styles: '', sld_body: sld, srs: 'EPSG:4326', bbox: '-180,-90,180,90',
    width: '2', height: '2', format: 'image/png', transparent: 'true',
  }
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value))
  const body = new URLSearchParams(url.search)
  const usePost = url.href.length >= 8000
  if (usePost) url.search = ''
  const response = await fetch(url, usePost ? { method: 'POST', body } : undefined)
  const contentType = response.headers.get('content-type') || ''
  if (!response.ok || !contentType.startsWith('image/')) {
    const detail = (await response.text()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 220)
    throw new Error(detail || `GeoServer từ chối style (HTTP ${response.status}).`)
  }
}

export function createLayerStyleTool({ thematicGroups, rasterGroup }) {
  const panel = createToolPanel({
    id: 'layer-style-panel',
    title: 'Trình bày lớp dữ liệu',
    content: `
      <label>Lớp dữ liệu<select data-style-layer></select></label>
      <div class="layer-style-preview" data-style-preview></div>
      <div class="layer-style-controls" data-style-controls></div>
      <p class="tool-hint">Áp dụng chỉ thay đổi phiên làm việc hiện tại. Lưu sẽ ghi cấu hình vào trình duyệt này.</p>
      <div class="crud-status" data-style-status>Chọn lớp và thiết lập cách trình bày.</div>
      <div class="crud-form-actions"><button type="button" data-style-apply>Áp dụng</button><button type="button" data-style-save>Lưu</button><button type="button" class="secondary" data-style-reset>Mặc định</button></div>
    `,
  })
  const title = panel.querySelector('.tool-panel-header strong')
  const layerSelect = panel.querySelector('[data-style-layer]')
  const controls = panel.querySelector('[data-style-controls]')
  const preview = panel.querySelector('[data-style-preview]')
  const status = panel.querySelector('[data-style-status]')
  const actionButtons = panel.querySelectorAll('[data-style-apply], [data-style-save], [data-style-reset]')
  const configs = new Map(MAP_LAYER_CONFIGS.map(config => [config.id, { ...config, type: config.geometryType?.replace(/^Multi/, ''), fields: (config.fields || config.editFields || []).map(field => ({ ...field, id: field.id || field.name })) }]))
  const sessionStyles = new Map()
  let currentSection = ''
  let currentDefinition = null
  let currentLayers = []
  let applyVersion = 0

  function allVectorLayers() {
    return [...thematicGroups, rasterGroup].flatMap(group => group.getLayers().getArray()).filter(layer => configs.has(layer.get('configId')))
  }

  function rasterType(layer) {
    const metadata = layer.get('rasterMetadata') || {}
    return metadata.presentation_type || 'thematic'
  }

  function availableLayers(definition) {
    if (definition.kind === 'raster') {
      return [...thematicGroups, rasterGroup].flatMap(group => group.getLayers().getArray()).filter((layer) => layer.get('rasterName') && rasterType(layer) === definition.rasterType)
    }
    return allVectorLayers().filter((layer) => {
      const config = configs.get(layer.get('configId'))
      return definition.thematic || config?.type === definition.geometry
    })
  }

  function currentLayer() {
    return currentLayers.find((layer) => getLayerName(layer) === layerSelect.value)
  }

  function setStatus(message, isError = false) {
    status.textContent = message
    status.classList.toggle('error', isError)
  }

  function fieldsFor(layer) {
    return configs.get(layer?.get('configId'))?.fields || []
  }

  function rasterRange(layer) {
    const metadata = layer?.get('rasterMetadata') || {}
    const technical = metadata.technical_metadata || {}
    const min = number(technical.value_min ?? metadata.value_min, DEFAULT_RASTER_RANGE.min)
    const max = number(technical.value_max ?? metadata.value_max, DEFAULT_RASTER_RANGE.max)
    return max > min ? { min, max } : { ...DEFAULT_RASTER_RANGE }
  }

  function renderControls() {
    const layer = currentLayer()
    controls.replaceChildren()
    preview.replaceChildren()
    actionButtons.forEach((button) => { button.disabled = !layer })
    if (!layer) return setStatus('Chưa có lớp phù hợp với loại dữ liệu này.', true)

    if (currentDefinition.thematic) {
      const fields = fieldsFor(layer)
      controls.innerHTML = `
        <label>Trường phân loại<select data-field></select></label>
        <label>Phương pháp<select data-method><option value="unique">Giá trị riêng biệt</option><option value="range">Khoảng đều</option></select></label>
        <label>Số lớp<input data-classes type="number" min="2" max="7" value="5"></label>
        <label>Bảng màu<select data-palette><option value="category">Phân loại</option><option value="terrain">Địa hình</option><option value="blue">Xanh lam</option><option value="warm">Màu nóng</option></select></label>`
      const fieldSelect = controls.querySelector('[data-field]')
      fieldSelect.replaceChildren(...fields.map((field) => new Option(field.label || field.id, field.id)))
      if (!fields.length) setStatus('Lớp chưa khai báo trường dùng để phân loại.', true)
    } else if (currentDefinition.kind === 'vector') {
      const pointFields = currentDefinition.geometry === 'Point' ? `
        <label>Hình dạng<select data-shape><option value="circle">Hình tròn</option><option value="square">Hình vuông</option><option value="triangle">Tam giác</option><option value="star">Ngôi sao</option></select></label>
        <label>Kích thước<input data-radius type="number" min="2" max="30" value="6"></label>` : ''
      const fillFields = currentDefinition.geometry !== 'LineString' ? `
        <label>Màu nền<input data-fill type="color" value="#2dd4bf"></label>
        <label>Độ trong suốt nền<input data-fill-opacity type="range" min="0" max="1" step="0.05" value="0.65"></label>` : ''
      const strokeLabel = currentDefinition.geometry === 'LineString' ? 'Màu nét' : 'Màu đường viền'
      const widthLabel = currentDefinition.geometry === 'LineString' ? 'Độ rộng nét' : 'Độ rộng đường viền'
      controls.innerHTML = `${pointFields}${fillFields}
        <label>${strokeLabel}<input data-stroke type="color" value="#0f172a"></label>
        <label>${widthLabel}<input data-width type="number" min="0.5" max="12" step="0.5" value="2"></label>
        <label>Kiểu đường<select data-dash><option value="solid">Nét liền</option><option value="8 5">Nét đứt</option><option value="2 4">Nét chấm</option></select></label>`
    } else {
      const hasColorMap = COLOR_MAPPED_RASTER_TYPES.has(currentDefinition.rasterType)
      const range = rasterRange(layer)
      const rasterStyleFields = hasColorMap ? `
        <label>Giá trị nhỏ nhất<input data-min type="number" value="${range.min}"></label>
        <label>Giá trị lớn nhất<input data-max type="number" value="${range.max}"></label>
        <label>Số khoảng màu<input data-steps type="number" min="${MIN_RASTER_STEPS}" max="${MAX_RASTER_STEPS}" value="${DEFAULT_RASTER_STEPS}"></label>
        <label>Bảng màu<select data-palette><option value="terrain">Địa hình</option><option value="elevation">Cao độ tự nhiên</option><option value="spectral">Phổ màu</option><option value="viridis">Viridis</option><option value="earth">Màu đất</option><option value="blue">Xanh lam</option><option value="warm">Màu nóng</option></select></label>` : `
        <label>Gamma<input data-gamma type="range" min="0.2" max="3" step="0.1" value="1"></label>
        <label class="tool-option"><input data-normalize type="checkbox"> Chuẩn hóa tương phản</label>`
      controls.innerHTML = `
        <label>Độ hiển thị<input data-opacity type="range" min="0" max="1" step="0.05" value="1"></label>
        ${rasterStyleFields}`
    }
    renderPreview()
    setStatus('Điều chỉnh thông số rồi bấm Áp dụng hoặc Lưu.')
  }

  function readState() {
    if (currentDefinition.thematic) {
      return {
        section: currentSection,
        field: controls.querySelector('[data-field]')?.value || '',
        method: controls.querySelector('[data-method]')?.value || 'unique',
        classes: number(controls.querySelector('[data-classes]')?.value, 5, 2, 7),
        palette: controls.querySelector('[data-palette]')?.value || 'category',
      }
    }
    if (currentDefinition.kind === 'vector') {
      return {
        section: currentSection,
        fill: controls.querySelector('[data-fill]')?.value || '#2dd4bf',
        fillOpacity: number(controls.querySelector('[data-fill-opacity]')?.value, .65, 0, 1),
        stroke: controls.querySelector('[data-stroke]')?.value || '#0f172a',
        strokeOpacity: 1,
        width: number(controls.querySelector('[data-width]')?.value, 2, .5, 12),
        radius: number(controls.querySelector('[data-radius]')?.value, 6, 2, 30),
        shape: controls.querySelector('[data-shape]')?.value || 'circle',
        dash: controls.querySelector('[data-dash]')?.value || 'solid',
      }
    }
    const min = number(controls.querySelector('[data-min]')?.value, 0)
    const max = number(controls.querySelector('[data-max]')?.value, 3000)
    return {
      section: currentSection,
      opacity: number(controls.querySelector('[data-opacity]')?.value, 1, 0, 1),
      gamma: number(controls.querySelector('[data-gamma]')?.value, 1, .2, 3),
      normalize: Boolean(controls.querySelector('[data-normalize]')?.checked),
      palette: controls.querySelector('[data-palette]')?.value || 'terrain',
      steps: number(controls.querySelector('[data-steps]')?.value, DEFAULT_RASTER_STEPS, MIN_RASTER_STEPS, MAX_RASTER_STEPS),
      min,
      max,
    }
  }

  function fillControls(state) {
    Object.entries(state || {}).forEach(([key, value]) => {
      const input = controls.querySelector(`[data-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}]`)
      if (!input) return
      if (input.type === 'checkbox') input.checked = Boolean(value)
      else input.value = value
    })
    renderPreview()
  }

  function renderPreview() {
    const state = readState()
    preview.replaceChildren()
    preview.style.opacity = ''
    if (currentDefinition.thematic) {
      const colors = PALETTES[state.palette] || PALETTES.terrain
      const ramp = document.createElement('div')
      ramp.className = 'layer-style-ramp'
      ramp.style.background = `linear-gradient(90deg, ${colors.join(', ')})`
      preview.append(ramp)
      return
    }
    if (currentDefinition.kind === 'raster') {
      const hasColorMap = COLOR_MAPPED_RASTER_TYPES.has(currentDefinition.rasterType)
      const visual = document.createElement('div')
      visual.className = `layer-style-raster-visual${hasColorMap ? '' : ' original'}`
      visual.style.opacity = state.opacity
      if (hasColorMap) {
        const colors = interpolatePalette(state.palette, state.steps)
        visual.style.background = steppedGradient(colors)
      } else {
        visual.textContent = 'Ảnh gốc'
      }
      const details = document.createElement('div')
      details.className = 'layer-style-preview-details'
      const range = hasColorMap
        ? `${state.min} – ${state.max}${state.max <= state.min ? ' (không hợp lệ)' : ''} · `
        : ''
      const contrast = hasColorMap
        ? `${state.steps} khoảng màu theo giá trị pixel gốc`
        : `Gamma ${state.gamma} · ${state.normalize ? 'Có' : 'Không'} chuẩn hóa`
      details.textContent = `${range}Hiển thị ${Math.round(state.opacity * 100)}% · ${contrast}`
      preview.append(visual, details)
      return
    }
    const svg = svgElement('svg', { class: 'layer-style-vector-preview', viewBox: '0 0 120 70', 'aria-hidden': 'true' })
    const common = {
      stroke: state.stroke,
      'stroke-width': state.width,
      'stroke-dasharray': state.dash === 'solid' ? '' : state.dash,
    }
    let symbol
    if (currentDefinition.geometry === 'Point') {
      const radius = state.radius
      const pointAttributes = { ...common, fill: state.fill, 'fill-opacity': state.fillOpacity }
      if (state.shape === 'square') {
        symbol = svgElement('rect', { x: 60 - radius, y: 35 - radius, width: radius * 2, height: radius * 2, ...pointAttributes })
      } else if (state.shape === 'triangle') {
        symbol = svgElement('polygon', { points: `60,${35 - radius} ${60 + radius},${35 + radius} ${60 - radius},${35 + radius}`, ...pointAttributes })
      } else if (state.shape === 'star') {
        symbol = svgElement('polygon', { points: starPoints(60, 35, radius, radius * .45), ...pointAttributes })
      } else {
        symbol = svgElement('circle', { cx: 60, cy: 35, r: radius, ...pointAttributes })
      }
    } else if (currentDefinition.geometry === 'LineString') {
      symbol = svgElement('line', { x1: 12, y1: 52, x2: 108, y2: 18, fill: 'none', ...common })
    } else {
      symbol = svgElement('polygon', {
        points: '24,52 35,18 88,13 103,45 75,58',
        fill: state.fill,
        'fill-opacity': state.fillOpacity,
        ...common,
      })
    }
    svg.append(symbol)
    preview.append(svg)
  }

  async function thematicClasses(layer, state) {
    if (!state.field) throw new Error('Hãy chọn trường phân loại.')
    const url = new URL(GEOSERVER_CONFIG.wfsUrl, window.location.origin)
    url.searchParams.set('service', 'WFS')
    url.searchParams.set('version', '2.0.0')
    url.searchParams.set('request', 'GetFeature')
    url.searchParams.set('typeNames', getLayerName(layer))
    url.searchParams.set('propertyName', state.field)
    url.searchParams.set('count', '1000')
    url.searchParams.set('outputFormat', 'application/json')
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Không đọc được dữ liệu phân loại (HTTP ${response.status}).`)
    const collection = await response.json()
    const values = collection.features.map((feature) => feature.properties?.[state.field]).filter((value) => value !== null && value !== undefined && value !== '')
    if (!values.length) throw new Error('Trường đã chọn không có dữ liệu để phân loại.')
    if (state.method === 'unique') {
      return [...new Set(values.map(String))]
        .sort((first, second) => first.localeCompare(second, 'vi', { numeric: true }))
        .slice(0, state.classes)
        .map((value) => ({ value, label: value }))
    }
    const numeric = values.map(Number).filter(Number.isFinite)
    if (!numeric.length) throw new Error('Phân loại khoảng đều chỉ dùng được với trường kiểu số.')
    const min = Math.min(...numeric)
    const max = Math.max(...numeric)
    const step = max === min ? 1 : (max - min) / state.classes
    return Array.from({ length: max === min ? 1 : state.classes }, (_, index) => {
      const lower = min + step * index
      const upper = index === state.classes - 1 ? max : min + step * (index + 1)
      return { min: lower, max: upper, label: `${lower.toFixed(2)} – ${upper.toFixed(2)}` }
    })
  }

  function setLayerStyle(layer, sld, state) {
    const source = layer.getSource()
    if (!layer.get('webgisDefaultWmsParams')) layer.set('webgisDefaultWmsParams', { ...source.getParams() })
    if (layer.get('webgisDefaultOpacity') === undefined) layer.set('webgisDefaultOpacity', layer.getOpacity())
    // GeoWebCache không đưa SLD_BODY vào khóa cache mặc định: phải render WMS trực tiếp.
    source.updateParams({ SLD_BODY: sld, STYLES: '', TILED: false })
    if (state.opacity !== undefined) layer.setOpacity(state.opacity)
  }

  function setApplying(isApplying) {
    layerSelect.disabled = isApplying
    actionButtons.forEach((button) => {
      button.disabled = isApplying || !currentLayer()
    })
  }

  async function apply(save = false) {
    const layer = currentLayer()
    if (!layer) return
    const state = readState()
    const version = ++applyVersion
    setApplying(true)
    setStatus(currentDefinition.thematic ? 'Đang đọc dữ liệu để phân loại…' : 'Đang áp dụng style…')
    try {
      let sld
      let classes = []
      if (currentDefinition.thematic) {
        const config = configs.get(layer.get('configId'))
        classes = await thematicClasses(layer, state)
        sld = buildThematicVectorSld(layer, config.type, state, classes)
      } else if (currentDefinition.kind === 'vector') {
        sld = buildSimpleVectorSld(layer, currentDefinition.geometry, state)
      } else {
        sld = buildRasterSld(layer, state, COLOR_MAPPED_RASTER_TYPES.has(currentDefinition.rasterType))
      }
      await validateSld(layer, sld)
      if (version !== applyVersion) return
      const appliedState = { ...state, classes }
      setLayerStyle(layer, sld, appliedState)
      sessionStyles.set(getLayerName(layer), appliedState)
      if (save) {
        const styles = readSavedStyles()
        styles[getLayerName(layer)] = appliedState
        if (!writeSavedStyles(styles)) throw new Error('Đã áp dụng style nhưng trình duyệt không cho phép lưu cấu hình.')
      }
      const parent = [...thematicGroups, rasterGroup].find(group => group.getLayers().getArray().includes(layer))
      const hiddenHint = !layer.getVisible() || !parent?.getVisible() ? ' Lớp đang tắt; bật trong mục lục để xem.' : ''
      setStatus((save ? 'Đã lưu và áp dụng style trên trình duyệt này.' : 'Đã áp dụng style cho phiên làm việc hiện tại.') + hiddenHint)
    } catch (error) {
      if (version !== applyVersion) return
      setStatus(error.message, true)
    } finally {
      if (version === applyVersion) setApplying(false)
    }
  }

  function restoreLayer(layer) {
    const source = layer.getSource()
    sessionStyles.delete(getLayerName(layer))
    const defaults = layer.get('webgisDefaultWmsParams')
    if (defaults) source.setParams(defaults)
    else {
      const params = { ...source.getParams() }
      delete params.SLD_BODY
      source.setParams(params)
    }
    layer.setOpacity(layer.get('webgisDefaultOpacity') ?? 1)
    const styles = readSavedStyles()
    delete styles[getLayerName(layer)]
    writeSavedStyles(styles)
  }

  async function prepareDefaultLabels(layer) {
    if (!['vn_tinh', 'vn_xa'].includes(layer.get('configId'))) return
    const source = layer.getSource()
    const defaults = { ...source.getParams() }
    // Khởi tạo trước style đã lưu để nút Mặc định vẫn giữ đúng cấu hình gốc.
    layer.set('webgisDefaultWmsParams', defaults)
    try {
      const url = new URL(source.getUrl(), window.location.href)
      url.search = new URLSearchParams({ SERVICE: 'WMS', VERSION: '1.1.1', REQUEST: 'GetStyles', LAYERS: getLayerName(layer) }).toString()
      const response = await fetch(url, { signal: AbortSignal.timeout(15000) })
      if (!response.ok) return
      const doc = new DOMParser().parseFromString(await response.text(), 'text/xml')
      if (doc.getElementsByTagName('parsererror').length) return
      let removed = 0
      const serializer = new XMLSerializer()
      for (const rule of doc.getElementsByTagNameNS('*', 'Rule')) {
        const seen = new Set()
        for (const text of [...rule.children].filter(child => child.localName === 'TextSymbolizer')) {
          const clone = text.cloneNode(true)
          for (const parameter of [...clone.getElementsByTagNameNS('*', 'CssParameter')]) {
            if (parameter.getAttribute('name') === 'font-family') parameter.remove()
          }
          const key = serializer.serializeToString(clone).replace(/>\s+</g, '><').trim()
          if (seen.has(key)) { text.remove(); removed++ } else seen.add(key)
        }
      }
      if (!removed) return
      const sld = serializer.serializeToString(doc).replace(/>\s+</g, '><')
      const corrected = { ...defaults, SLD_BODY: sld, STYLES: '', TILED: false }
      layer.set('webgisDefaultWmsParams', corrected)
      if (!source.getParams().SLD_BODY) source.setParams(corrected)
    } catch {
      // Giữ style GeoServer nếu dịch vụ chưa cung cấp được GetStyles.
    }
  }

  function reset() {
    const layer = currentLayer()
    if (!layer) return
    restoreLayer(layer)
    renderControls()
    setStatus('Đã khôi phục style mặc định của GeoServer.')
  }

  function applyStoredStyle(layer) {
    const saved = readSavedStyles()[getLayerName(layer)]
    if (!saved) return
    const definition = SECTION_CONFIG[saved.section]
    if (!definition) return
    try {
      const config = configs.get(layer.get('configId'))
      if (definition.thematic && !saved.classes?.length) throw new Error('Thiếu lớp phân loại đã lưu.')
      const sld = definition.thematic
        ? buildThematicVectorSld(layer, config?.type || 'Polygon', saved, saved.classes)
        : definition.kind === 'vector'
          ? buildSimpleVectorSld(layer, definition.geometry, saved)
          : buildRasterSld(layer, saved, COLOR_MAPPED_RASTER_TYPES.has(definition.rasterType))
      setLayerStyle(layer, sld, saved)
      sessionStyles.set(getLayerName(layer), saved)
    } catch {
      const styles = readSavedStyles()
      delete styles[getLayerName(layer)]
      writeSavedStyles(styles)
    }
  }

  function open(sectionName) {
    applyVersion++
    currentSection = sectionName
    currentDefinition = SECTION_CONFIG[sectionName]
    if (!currentDefinition) return
    title.textContent = currentDefinition.title
    panel.dataset.sectionAction = sectionName
    currentLayers = availableLayers(currentDefinition)
    layerSelect.replaceChildren(...currentLayers.map((layer) => new Option(layer.get('title') || getLayerName(layer), getLayerName(layer))))
    panel.classList.add('shown')
    renderControls()
    const activeState = sessionStyles.get(layerSelect.value) || readSavedStyles()[layerSelect.value]
    if (activeState?.section === sectionName) fillControls(activeState)
  }

  function close() {
    applyVersion++
    panel.classList.remove('shown')
  }

  function forget(layerName) {
    const layer = [...thematicGroups, rasterGroup].flatMap(group => group.getLayers().getArray()).find((item) => item.get('rasterName') === layerName)
    if (layer) restoreLayer(layer)
    else {
      sessionStyles.delete(layerName); sessionStyles.delete(`${GEOSERVER_CONFIG.workspace}:${layerName}`)
      const styles = readSavedStyles()
      delete styles[layerName]; delete styles[`${GEOSERVER_CONFIG.workspace}:${layerName}`]
      writeSavedStyles(styles)
    }
  }

  layerSelect.addEventListener('change', () => {
    applyVersion++
    renderControls()
    const activeState = sessionStyles.get(layerSelect.value) || readSavedStyles()[layerSelect.value]
    if (activeState?.section === currentSection) fillControls(activeState)
  })
  // Gắn một listener duy nhất; nội dung controls được render lại nhiều lần.
  controls.addEventListener('input', () => {
    renderPreview()
    setStatus('Có thay đổi chưa được áp dụng.')
  })
  panel.querySelector('[data-style-apply]').addEventListener('click', () => apply(false))
  panel.querySelector('[data-style-save]').addEventListener('click', () => apply(true))
  panel.querySelector('[data-style-reset]').addEventListener('click', reset)
  panel.addEventListener('toolpanelclose', close)

  allVectorLayers().forEach(layer => { prepareDefaultLabels(layer); applyStoredStyle(layer) })
  rasterGroup.getLayers().forEach(applyStoredStyle)
  rasterGroup.getLayers().on('add', (event) => applyStoredStyle(event.element))

  return { open, close, forget, supports: (sectionName) => Boolean(SECTION_CONFIG[sectionName]) }
}
