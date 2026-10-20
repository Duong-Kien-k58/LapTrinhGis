import OverviewMap from 'ol/control/OverviewMap.js'
import Feature from 'ol/Feature.js'
import GeoJSON from 'ol/format/GeoJSON.js'
import { fromExtent as polygonFromExtent } from 'ol/geom/Polygon.js'
import TileLayer from 'ol/layer/Tile.js'
import VectorLayer from 'ol/layer/Vector.js'
import TileWMS from 'ol/source/TileWMS.js'
import VectorSource from 'ol/source/Vector.js'
import { transformExtent } from 'ol/proj.js'
import { Circle as CircleStyle, Fill, Stroke, Style, Text } from 'ol/style.js'
import { GEOSERVER_CONFIG } from '../config/layers.js'
import { createOverviewBaseLayer } from './basicTools.js'
import { loadWmsImage } from './toolUtils.js'

const geoJson = new GeoJSON()
const WFS_PAGE_SIZE = 1000
const previewStyles = {
  Point: new Style({ image: new CircleStyle({ radius: 3.5, fill: new Fill({ color: '#ffd84d' }), stroke: new Stroke({ color: '#d62828', width: 1.2 }) }) }),
  LineString: new Style({ stroke: new Stroke({ color: '#d62828', width: 2.5 }) }),
  Polygon: new Style({ fill: new Fill({ color: 'rgba(255, 216, 77, .42)' }), stroke: new Stroke({ color: '#d62828', width: 1.8 }) }),
}

function overviewFeatureStyle(feature) {
  const type = feature.getGeometry()?.getType()
  if (type === 'Point' || type === 'MultiPoint') return previewStyles.Point
  if (type === 'LineString' || type === 'MultiLineString') return previewStyles.LineString
  return previewStyles.Polygon
}

function getLayerExtentFromCapabilities(capabilities, layerName) {
  const shortName = layerName.split(':').at(-1)
  const wmsLayer = Array.from(capabilities.getElementsByTagName('*')).find((element) => (
    element.localName === 'Layer'
      && [layerName, shortName].includes(Array.from(element.children).find((child) => child.localName === 'Name')?.textContent)
  ))
  const bounds = wmsLayer && Array.from(wmsLayer.children).find((child) => child.localName === 'EX_GeographicBoundingBox')
  if (!bounds) return null

  const value = (name) => Number(Array.from(bounds.children).find((child) => child.localName === name)?.textContent)
  const extent = [value('westBoundLongitude'), value('southBoundLatitude'), value('eastBoundLongitude'), value('northBoundLatitude')]
  return extent.every(Number.isFinite) ? extent : null
}

function copyWmsLayer(layer) {
  const source = layer.getSource()
  const url = (source?.getUrls?.()?.[0] || source?.getUrl?.())
  if (!url) return null
  return new TileLayer({
    source: new TileWMS({
      tileLoadFunction: loadWmsImage,
      url,
      params: { ...source.getParams() },
      serverType: 'geoserver',
      transition: 0,
    }),
  })
}

// Bản đồ overview chỉ hiển thị một lớp đang bật để lớp đó luôn dễ nhận biết.
export function createLayerOverviewTool({ map, thematicGroups, rasterGroup }) {
  const baseLayer = createOverviewBaseLayer(map)
  const control = new OverviewMap({
    collapsed: false,
    collapsible: false,
    layers: [baseLayer],
  })
  control.element.classList.add('layer-overview-control')
  map.addControl(control)

  const header = document.createElement('div')
  header.className = 'layer-overview-header'
  const closeButton = document.createElement('button')
  closeButton.type = 'button'
  closeButton.className = 'layer-overview-close'
  closeButton.title = 'Đóng overview'
  closeButton.setAttribute('aria-label','Đóng overview')
  closeButton.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8"/></svg>'

  const picker = document.createElement('div')
  picker.className = 'layer-overview-picker'
  const pickerButton = document.createElement('button')
  pickerButton.type = 'button'
  pickerButton.className = 'layer-overview-picker-button'
  pickerButton.setAttribute('aria-expanded', 'false')
  pickerButton.innerHTML = '<strong>Chưa có layer đang bật</strong><small>CHỌN LAYER ĐỂ XEM TỔNG QUAN</small><i>⌄</i>'
  const pickerValue = pickerButton.querySelector('strong')
  const pickerMeta = pickerButton.querySelector('small')
  const optionList = document.createElement('div')
  optionList.className = 'layer-overview-options'
  optionList.setAttribute('role', 'listbox')
  optionList.hidden = true
  picker.append(pickerButton, optionList)
  header.append(picker, closeButton)
  control.element.prepend(header)

  const capabilitiesCache = new Map()
  let activeKind = null
  let selectedLayer = null
  let updateVersion = 0

  function getActiveLayers() {
    const groups = [...thematicGroups, rasterGroup]
    return groups.flatMap((group) => {
      if (!group.getVisible()) return []
      return group.getLayers().getArray()
        .filter((layer) => layer.getVisible() && (activeKind === 'raster' ? Boolean(layer.get('rasterName')) : ['wms', 'vector'].includes(layer.get('layerKind'))))
        .map((layer) => ({ layer, label: layer.get('title') || layer.get('configId') }))
    })
  }

  async function drawHighlight(layer, version) {
    const source = layer.getSource()
    const layerName = source?.getParams?.().LAYERS
    const sourceUrl = (source?.getUrls?.()?.[0] || source?.getUrl?.())
    if (!layerName || !sourceUrl) return

    if (!capabilitiesCache.has(sourceUrl)) {
      const url = new URL(sourceUrl, window.location.origin)
      url.search = ''
      url.searchParams.set('service', 'WMS')
      url.searchParams.set('request', 'GetCapabilities')
      capabilitiesCache.set(sourceUrl, fetch(url).then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return new DOMParser().parseFromString(await response.text(), 'text/xml')
      }))
    }

    try {
      const geographicExtent = getLayerExtentFromCapabilities(await capabilitiesCache.get(sourceUrl), layerName)
      if (version !== updateVersion || !geographicExtent) return
      const extent = transformExtent(geographicExtent, 'EPSG:4326', map.getView().getProjection())
      const highlight = new VectorLayer({
        source: new VectorSource({ features: [new Feature(polygonFromExtent(extent))] }),
        zIndex: 30,
        style: new Style({
          fill: new Fill({ color: 'rgba(255, 216, 77, .16)' }),
          stroke: new Stroke({ color: '#d62828', width: 2.2 }),
          text: new Text({
            text: layer.get('title') || layer.get('configId'),
            font: '600 11px system-ui, sans-serif',
            fill: new Fill({ color: '#6b1010' }),
            backgroundFill: new Fill({ color: 'rgba(255, 244, 190, .94)' }),
            padding: [3, 5, 3, 5],
            overflow: true,
          }),
        }),
      })
      control.getOverviewMap().getLayers().push(highlight)
    } catch {
      // Không có phạm vi WMS thì vẫn giữ lớp đang chọn trong overview.
    }
  }

  async function drawVectorPreview(layer, version) {
    const layerName = layer.getSource()?.getParams?.().LAYERS
    if (!layerName) return
    if (version === updateVersion) pickerMeta.textContent = 'ĐANG TẢI TOÀN BỘ DỮ LIỆU VECTOR…'

    try {
      const features = []
      let startIndex = 0
      let numberMatched = Infinity

      const pageStarts = new Set()
      while (startIndex < numberMatched && startIndex < 50000) {
        const url = new URL(GEOSERVER_CONFIG.wfsUrl, window.location.origin)
        url.searchParams.set('service', 'WFS')
        url.searchParams.set('version', '2.0.0')
        url.searchParams.set('request', 'GetFeature')
        url.searchParams.set('typeNames', layerName)
        url.searchParams.set('outputFormat', 'application/json')
        url.searchParams.set('srsName', map.getView().getProjection().getCode())
        url.searchParams.set('count', String(WFS_PAGE_SIZE))
        url.searchParams.set('startIndex', String(startIndex))

        const response = await fetch(url)
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const collection = await response.json()
        const page = geoJson.readFeatures(collection, { featureProjection: map.getView().getProjection() })
        const matched = Number(collection.numberMatched)
        if (Number.isFinite(matched)) numberMatched = matched
        const firstId = page[0]?.getId()
        if (firstId !== undefined && pageStarts.has(firstId)) break
        if (firstId !== undefined) pageStarts.add(firstId)
        features.push(...page)
        if (!page.length) break
        startIndex += page.length
        if (startIndex >= numberMatched || (!Number.isFinite(matched) && page.length < WFS_PAGE_SIZE)) break
        if (version !== updateVersion) return
      }

      if (version !== updateVersion || !features.length) return
      control.getOverviewMap().getLayers().push(new VectorLayer({
        source: new VectorSource({ features }),
        style: overviewFeatureStyle,
        zIndex: 20,
      }))
      pickerMeta.textContent = `TOÀN BỘ ${features.length.toLocaleString('vi-VN')} ĐỐI TƯỢNG VECTOR`
    } catch {
      // WFS có thể không được publish; khung phạm vi vẫn mô tả được overview.
      if (version === updateVersion) pickerMeta.textContent = 'PHẠM VI LỚP VECTOR ĐANG BẬT'
    }
  }

  function updateMap() {
    const version = ++updateVersion
    const overviewLayers = control.getOverviewMap().getLayers()
    overviewLayers.clear()
    overviewLayers.push(baseLayer)
    const copiedLayer = selectedLayer && copyWmsLayer(selectedLayer)
    if (copiedLayer) overviewLayers.push(copiedLayer)
    if (selectedLayer) {
      if (['wms', 'vector'].includes(selectedLayer.get('layerKind'))) drawVectorPreview(selectedLayer, version)
      drawHighlight(selectedLayer, version)
    }
  }

  function refresh() {
    const entries = getActiveLayers()
    if (!entries.some((entry) => entry.layer === selectedLayer)) selectedLayer = entries[0]?.layer || null
    pickerValue.textContent = selectedLayer?.get('title') || 'Chưa có layer đang bật'
    pickerButton.disabled = !selectedLayer
    optionList.replaceChildren(...entries.map(({ layer, label }) => {
      const option = document.createElement('button')
      option.type = 'button'
      option.setAttribute('role', 'option')
      option.setAttribute('aria-selected', String(layer === selectedLayer))
      option.classList.toggle('selected', layer === selectedLayer)
      option.textContent = label
      option.addEventListener('click', (event) => {
        event.stopPropagation()
        selectedLayer = layer
        optionList.hidden = true
        pickerButton.setAttribute('aria-expanded', 'false')
        refresh()
      })
      return option
    }))
    updateMap()
  }

  function close() {
    activeKind = null
    updateVersion++
    selectedLayer = null
    control.element.classList.remove('shown')
    document.querySelectorAll('[data-section="vector-overview"], [data-section="raster-overview"]')
      .forEach((button) => button.classList.remove('active', 'opened'))
  }

  function open(kind) {
    if (activeKind === kind && control.element.classList.contains('shown')) {
      close()
      return
    }
    activeKind = kind
    pickerMeta.textContent = kind === 'vector'
      ? 'DỮ LIỆU VECTOR · HIỂN THỊ KHÔNG PHỤ THUỘC TỶ LỆ'
      : 'DỮ LIỆU RASTER ĐANG BẬT'
    control.element.classList.add('shown')
    refresh()
    requestAnimationFrame(() => control.getOverviewMap().updateSize())
    document.querySelectorAll('[data-section="vector-overview"], [data-section="raster-overview"]')
      .forEach((button) => button.classList.remove('active', 'opened'))
    document.querySelector(`[data-section="${kind}-overview"]`)?.classList.add('active', 'opened')
  }

  pickerButton.addEventListener('click', (event) => {
    event.stopPropagation()
    optionList.hidden = !optionList.hidden
    pickerButton.setAttribute('aria-expanded', String(!optionList.hidden))
  }, { capture: true })
  closeButton.addEventListener('click', close)
  document.addEventListener('click', (event) => {
    if (!picker.contains(event.target)) {
      optionList.hidden = true
      pickerButton.setAttribute('aria-expanded', 'false')
    }
  })

  ;[...thematicGroups, rasterGroup].forEach((group) => {
    group.on('change:visible', () => { if (activeKind) refresh() })
    group.getLayers().on('add', (event) => {
      event.element.on('change:visible', () => { if (activeKind) refresh() })
      if (activeKind) refresh()
    })
    group.getLayers().on('remove', () => { if (activeKind) refresh() })
    group.getLayers().forEach((layer) => layer.on('change:visible', () => { if (activeKind) refresh() }))
  })

  return { open, close, refresh }
}
