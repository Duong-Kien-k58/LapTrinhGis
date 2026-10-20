import { RASTER_LAYER_CONFIGS, GEOSERVER_CONFIG } from '../config/layers.js'
import { RASTER_PRESENTATION_TYPES, createPublishedRasterLayer } from './rasterLayers.js'
import { requestJson } from './apiClient.js'
import { createToolPanel } from './toolUtils.js'

const RASTER_API_URL = `${GEOSERVER_CONFIG.backendUrl.replace(/\/features$/, '')}/rasters`
const CONFIGURED_RASTERS = RASTER_LAYER_CONFIGS.map(item => ({ ...item, name: item.layerName }))
const MAX_PREVIEW_PIXELS = 20_000_000
const MAX_RASTER_BYTES = 512 * 1024 * 1024

function rasterNameFromFile(filename) {
  return filename.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^[^a-zA-Z]+/, '').slice(0, 63)
}

export function createRasterManager({ rasterGroup, thematicGroups = [], beforeOpen = () => {}, onRasterChanged = () => {}, onRasterStyleInvalidated = () => {} }) {
  const groups = [...thematicGroups, rasterGroup];
  const rasterLayers = () => groups.flatMap(group => group.getLayers().getArray()).filter(layer => layer.get('rasterName'));
  const panel = createToolPanel({
    id: 'raster-manager-panel',
    title: 'Quản trị dữ liệu raster',
    content: `
      <label data-raster-select-row>Raster đã xuất bản<select data-raster-select></select></label>
      <label data-raster-name-row>Tên raster<input data-raster-name maxlength="63" placeholder="vd: dem_daklak"></label>
      <label data-raster-title-row>Tên hiển thị<input data-raster-title maxlength="150"></label>
      <label data-raster-type-row>Loại trình bày<select data-raster-type></select></label>
      <label data-raster-file-row>Tệp GeoTIFF<input data-raster-file type="file" accept=".tif,.tiff,image/tiff"></label>
      <p class="tool-hint" data-raster-upload-hint>Web chỉ upload GeoTIFF nhỏ hơn 512 MB. File lớn hơn: publish GeoServer thủ công, sau đó khai báo trong layers.js.</p>
      <div class="raster-info" data-raster-info>Chọn GeoTIFF để đọc thông tin và preview.</div>
      <section class="raster-preview" data-raster-preview hidden>
        <strong>Xem nhanh raster</strong><canvas data-raster-preview-canvas></canvas>
      </section>
      <button type="button" class="secondary" data-raster-clear-preview hidden>Ẩn preview</button>
      <div class="crud-status" data-raster-status></div>
      <div class="crud-form-actions"><button type="button" data-raster-save>Thực hiện</button><button type="button" class="secondary" data-raster-metadata hidden>Cập nhật thông tin</button><button type="button" class="secondary" data-raster-cancel>Hủy</button></div>
    `,
  })
  panel.dataset.featureAction = 'raster'
  panel.querySelector('[data-raster-status]').setAttribute('role', 'status')
  const select = panel.querySelector('[data-raster-select]')
  const nameInput = panel.querySelector('[data-raster-name]')
  const titleInput = panel.querySelector('[data-raster-title]')
  const presentationTypeInput = panel.querySelector('[data-raster-type]')
  const fileInput = panel.querySelector('[data-raster-file]')
  const info = panel.querySelector('[data-raster-info]')
  const status = panel.querySelector('[data-raster-status]')
  const saveButton = panel.querySelector('[data-raster-save]')
  const updateMetadataButton = panel.querySelector('[data-raster-metadata]')
  const clearPreviewButton = panel.querySelector('[data-raster-clear-preview]')
  const previewBox = panel.querySelector('[data-raster-preview]')
  const previewCanvas = panel.querySelector('[data-raster-preview-canvas]')
  const selectRow = panel.querySelector('[data-raster-select-row]')
  const nameRow = panel.querySelector('[data-raster-name-row]')
  const fileRow = panel.querySelector('[data-raster-file-row]')
  const typeRow = panel.querySelector('[data-raster-type-row]')
  let currentAction = null
  let previewMetadata = null
  let previewVersion = 0
  let busy = false
  let loadVersion = 0
  let rasters = []
  presentationTypeInput.replaceChildren(...RASTER_PRESENTATION_TYPES.map((item) => new Option(item.title, item.id)))

  function setStatus(message, isError = false) {
    status.textContent = message
    status.classList.toggle('error', isError)
  }

  function requestRasterApi(path = '', options) {
    return requestJson(`${RASTER_API_URL}${path}`, options)
  }

  function clearPreview(resetFile = true) {
    previewVersion++
    previewCanvas.getContext('2d').clearRect(0, 0, previewCanvas.width, previewCanvas.height)
    previewMetadata = null
    updateMetadataButton.textContent = 'Cập nhật thông tin'
    previewBox.hidden = true
    clearPreviewButton.hidden = true
    if (resetFile) fileInput.value = ''
  }

  function renderInfo(metadata = null) {
    if (!metadata) return (info.textContent = 'Chọn GeoTIFF để đọc thông tin và preview.')
    const lines = [
      ["strong", metadata.filename],
      ["span", `CRS: ${metadata.crs || 'Không xác định'}`],
      ["span", `BBox: ${metadata.bbox.map((value) => Number(value).toFixed(3)).join(', ')}`],
      ["span", `Kích thước: ${metadata.width} × ${metadata.height} px`],
    ]
    const technical = metadata.technical_metadata || {}
    if (Number.isFinite(Number(technical.value_min)) && Number.isFinite(Number(technical.value_max))) {
      lines.push(["span", `Khoảng giá trị: ${technical.value_min} – ${technical.value_max}`])
    }
    info.replaceChildren(...lines.map(([tag, text]) => {
      const element = document.createElement(tag)
      element.textContent = text
      return element
    }))
  }

  function syncRasterLayers(items) {
    const byName = new Map(items.map((item) => [item.name, item]))
    groups.forEach(group => group.getLayers().getArray().slice().forEach((layer) => {
      const rasterName = layer.get('rasterName')
      if (rasterName && !byName.has(rasterName)) group.getLayers().remove(layer)
    }))
    items.forEach((raster) => {
      const layer = rasterLayers().find((item) => item.get('rasterName') === raster.name)
      if (layer) {
        const previousType = layer.get('rasterMetadata')?.presentation_type
        if (previousType && previousType !== raster.presentation_type) onRasterStyleInvalidated(raster.name)
        layer.set('title', raster.title)
        layer.set('rasterMetadata', raster)
        layer.getSource()?.updateParams({ _reload: Date.now() })
      } else rasterGroup.getLayers().push(createPublishedRasterLayer(raster))
    })
    onRasterChanged()
  }

  function syncSelectedRaster() {
    clearPreview()
    const raster = rasters.find((item) => item.name === select.value)
    if (raster && currentAction !== 'add') {
      titleInput.value = raster.title
      nameInput.value = raster.name
      presentationTypeInput.value = raster.presentation_type || 'thematic'
      renderInfo(raster.width ? { ...raster, filename: raster.source_filename || raster.name } : null)
    }
  }

  async function loadRasters() {
    const version = ++loadVersion
    const data = await requestRasterApi('/')
    if (version !== loadVersion) return
    const rasterByName = new Map(CONFIGURED_RASTERS.filter(item => !(data.deleted_names || []).includes(item.name)).map((raster) => [raster.name, raster]))
    data.rasters.forEach((raster) => {
      rasterByName.set(raster.name, { ...rasterByName.get(raster.name), ...raster })
    })
    rasters = [...rasterByName.values()]
    const selected = select.value
    select.replaceChildren(...rasters.map((raster) => new Option(raster.title, raster.name)))
    if (rasters.some((raster) => raster.name === selected)) select.value = selected
    syncRasterLayers(rasters)
    syncSelectedRaster()
  }

  async function previewRaster() {
    const file = fileInput.files[0]
    if (!file) { clearPreview(); saveButton.disabled = false; return }
    clearPreview(false)
    const selectionVersion = ++previewVersion
    const metadataOnly = file.size >= MAX_RASTER_BYTES
    // Xóa metadata của file trước nhưng giữ file mới trong input.
    saveButton.disabled = true
    if (metadataOnly && currentAction !== 'edit') {
      return setStatus('File từ 512 MB phải publish thủ công lên GeoServer rồi khai báo trong RASTER_LAYER_CONFIGS.', true)
    }
    try {
      const { fromBlob } = await import('geotiff')
      const tiff = await fromBlob(file)
      const image = await tiff.getImage()
      const geoKeys = image.getGeoKeys()
      const epsg = geoKeys.ProjectedCSTypeGeoKey || geoKeys.GeographicTypeGeoKey
      const technicalMetadata = getTechnicalMetadata(image, file)
      try {
        Object.assign(technicalMetadata, await readValueRange(image))
      } catch {
        // Metadata cơ bản vẫn dùng được nếu GeoTIFF không cho đọc mẫu.
      }
      if (selectionVersion !== previewVersion) return
      previewMetadata = {
        filename: file.name,
        crs: epsg ? `EPSG:${epsg}` : 'Không xác định',
        bbox: image.getBoundingBox().map(Number),
        width: image.getWidth(),
        height: image.getHeight(),
        technical_metadata: technicalMetadata,
      }
      if (currentAction === 'add') {
        nameInput.value ||= rasterNameFromFile(file.name)
        titleInput.value ||= file.name.replace(/\.[^.]+$/, '')
      }
      renderInfo(previewMetadata)
      saveButton.disabled = metadataOnly
      updateMetadataButton.textContent = 'Lưu thông tin tệp'
      if (metadataOnly) {
        setStatus('Đã đọc metadata từ GeoTIFF lớn. Bấm “Lưu thông tin tệp”; web sẽ không upload raster này.')
        return
      }
      if (previewMetadata.width * previewMetadata.height > MAX_PREVIEW_PIXELS) {
        setStatus('Đã đọc metadata. Không tạo preview vì ảnh quá lớn; bạn vẫn có thể thêm hoặc cập nhật raster.')
        return
      }
      try {
        await drawPreview(image, selectionVersion)
        if (selectionVersion !== previewVersion) return
        previewBox.hidden = false
        clearPreviewButton.hidden = false
        setStatus(`Preview tạm thời đã sẵn sàng. Bấm “${currentAction === 'add' ? 'Thêm Raster' : 'Cập nhật Raster'}” để lưu chính thức.`)
      } catch {
        setStatus('Đã đọc metadata nhưng không thể tạo preview. Bạn vẫn có thể lưu thông tin tệp.')
      }
    } catch (error) {
      if (selectionVersion !== previewVersion) return
      clearPreview()
      renderInfo()
      saveButton.disabled = false
      setStatus(`Không thể đọc GeoTIFF: ${error.message}`, true)
    }
  }

  async function readValueRange(image) {
    // Ưu tiên thống kê gốc của GeoTIFF; nếu không có thì lấy mẫu
    // band đầu để tránh đọc toàn bộ DEM dung lượng lớn.
    const gdalMetadata = image.getGDALMetadata?.(0) || {}
    const metadataMin = Number(gdalMetadata.STATISTICS_MINIMUM)
    const metadataMax = Number(gdalMetadata.STATISTICS_MAXIMUM)
    if (Number.isFinite(metadataMin) && Number.isFinite(metadataMax) && metadataMax > metadataMin) {
      return { value_min: metadataMin, value_max: metadataMax }
    }

    const scale = Math.min(512 / image.getWidth(), 512 / image.getHeight(), 1)
    const width = Math.max(1, Math.round(image.getWidth() * scale))
    const height = Math.max(1, Math.round(image.getHeight() * scale))
    const values = await image.readRasters({ samples: [0], width, height, interleave: true })
    const rawNoData = image.getGDALNoData?.()
    const noData = rawNoData == null ? NaN : Number(rawNoData)
    let valueMin = Infinity
    let valueMax = -Infinity
    for (const rawValue of values) {
      const value = Number(rawValue)
      if (!Number.isFinite(value) || (Number.isFinite(noData) && value === noData)) continue
      valueMin = Math.min(valueMin, value)
      valueMax = Math.max(valueMax, value)
    }
    return Number.isFinite(valueMin) && valueMax > valueMin
      ? { value_min: valueMin, value_max: valueMax }
      : {}
  }

  async function drawPreview(image, selectionVersion) {
    const scale = Math.min(360 / image.getWidth(), 150 / image.getHeight(), 1)
    const width = Math.max(1, Math.round(image.getWidth() * scale))
    const height = Math.max(1, Math.round(image.getHeight() * scale))
    previewCanvas.width = width
    previewCanvas.height = height
    const context = previewCanvas.getContext('2d')
    const output = context.createImageData(width, height)
    try {
      const rgb = await image.readRGB({ width, height, interleave: true })
      for (let pixel = 0; pixel < width * height; pixel += 1) {
        output.data.set([rgb[pixel * 3], rgb[pixel * 3 + 1], rgb[pixel * 3 + 2], 255], pixel * 4)
      }
    } catch {
      const values = await image.readRasters({ width, height, interleave: true })
      const bandCount = image.getSamplesPerPixel()
      const firstBand = Array.from({ length: width * height }, (_, pixel) => values[pixel * bandCount])
      const minimum = Math.min(...firstBand)
      const maximum = Math.max(...firstBand)
      firstBand.forEach((value, pixel) => {
        const gray = maximum === minimum ? 0 : Math.round((value - minimum) * 255 / (maximum - minimum))
        output.data.set([gray, gray, gray, 255], pixel * 4)
      })
    }
    if (selectionVersion === previewVersion) context.putImageData(output, 0, 0)
  }

  function getTechnicalMetadata(image, file) {
    const bandCount = image.getSamplesPerPixel()
    const bits = Array.from({ length: bandCount }, (_, index) => image.getBitsPerSample(index))
    const sampleFormats = Array.from({ length: bandCount }, (_, index) => image.getSampleFormat(index))
    const bitsPerSample = [...new Set(bits)].join(', ')
    const sampleFormat = [...new Set(sampleFormats)].join(', ')
    const sampleFormatCode = sampleFormats[0]
    const dataType = { 1: 'Số nguyên không dấu', 2: 'Số nguyên có dấu', 3: 'Số thực' }[sampleFormatCode]
    return {
      band_count: bandCount,
      bits_per_sample: bitsPerSample ? `${bitsPerSample} bit × ${bandCount} band` : null,
      sample_format: sampleFormat || null,
      data_type: dataType ? `${dataType} (${bitsPerSample} bit)` : null,
      no_data: image.getGDALNoData?.() ?? null,
      file_size_bytes: file.size,
    }
  }

  function updatePanel() {
    const isAdd = currentAction === 'add'
    const isDelete = currentAction === 'delete'
    selectRow.hidden = isAdd
    nameRow.hidden = !isAdd
    fileRow.hidden = isDelete
    titleInput.closest('label').hidden = isDelete
    typeRow.hidden = isDelete
    updateMetadataButton.hidden = isAdd || isDelete
    if (isAdd) presentationTypeInput.value = 'thematic'
    saveButton.disabled = false
    saveButton.textContent = isAdd ? 'Thêm Raster' : isDelete ? 'Xác nhận xóa' : 'Cập nhật Raster'
  }

  async function executeRasterAction() {
    const rasterName = currentAction === 'add' ? nameInput.value.trim() : select.value
    if (busy) return
    if (!rasterName) return setStatus('Hãy nhập hoặc chọn raster.', true)
    setBusy(true)
    try {
      if (currentAction === 'delete') {
        if (!window.confirm(`Xóa raster “${rasterName}”?`)) return
        await requestRasterApi(`/${encodeURIComponent(rasterName)}/delete/`, { method: 'DELETE' })
        onRasterStyleInvalidated(rasterName)
        await loadRasters()
        return setStatus('Đã xóa raster khỏi GeoServer, danh sách quản trị và bản đồ.')
      }
      if (!fileInput.files[0] || !previewMetadata) return setStatus('Hãy chọn GeoTIFF hợp lệ để preview trước.', true)
      const formData = new FormData()
      formData.append('file', fileInput.files[0])
      formData.append('name', rasterName)
      formData.append('title', titleInput.value.trim() || rasterName)
      formData.append('presentation_type', presentationTypeInput.value)
      formData.append('source_filename', previewMetadata.filename)
      formData.append('crs', previewMetadata.crs)
      formData.append('bbox', JSON.stringify(previewMetadata.bbox))
      formData.append('width', previewMetadata.width)
      formData.append('height', previewMetadata.height)
      formData.append('technical_metadata', JSON.stringify(previewMetadata.technical_metadata))
      const path = currentAction === 'add' ? '/upload/' : `/${encodeURIComponent(rasterName)}/upload/`
      await requestRasterApi(path, { method: 'POST', body: formData })
      if (currentAction === 'edit') onRasterStyleInvalidated(rasterName)
      clearPreview()
      await loadRasters()
      const savedLayer = rasterLayers().find(layer => layer.get('rasterName') === rasterName)
      savedLayer?.setVisible(true)
      groups.find(group => group.getLayers().getArray().includes(savedLayer))?.setVisible(true)
      onRasterChanged()
      setStatus('Đã publish GeoServer, lưu PostgreSQL và thêm raster vào bản đồ.')
    } catch (error) {
      setStatus(error.message, true)
    } finally {
      setBusy(false)
    }
  }

  async function updateRasterMetadata() {
    const rasterName = select.value
    if (!rasterName) return setStatus('Hãy chọn raster cần cập nhật.', true)
    if (busy) return
    setBusy(true)
    try {
      if (previewMetadata) {
        const formData = new FormData()
        formData.append('name', rasterName)
        formData.append('title', titleInput.value.trim() || rasterName)
        formData.append('presentation_type', presentationTypeInput.value)
        formData.append('source_filename', previewMetadata.filename)
        formData.append('crs', previewMetadata.crs)
        formData.append('bbox', JSON.stringify(previewMetadata.bbox))
        formData.append('width', previewMetadata.width)
        formData.append('height', previewMetadata.height)
        formData.append('technical_metadata', JSON.stringify(previewMetadata.technical_metadata))
        await requestRasterApi(`/${encodeURIComponent(rasterName)}/metadata/`, { method: 'POST', body: formData })
        onRasterStyleInvalidated(rasterName)
        setStatus('Đã lưu metadata từ GeoTIFF. Raster trên GeoServer không bị thay đổi.')
      } else {
        const raster = rasters.find((item) => item.name === rasterName)
        const formData = new FormData()
        formData.append('title', titleInput.value.trim() || rasterName)
        formData.append('presentation_type', presentationTypeInput.value)
        formData.append('store_name', raster?.store_name || rasterName)
        await requestRasterApi(`/${encodeURIComponent(rasterName)}/sync/`, { method: 'POST', body: formData })
        setStatus('Đã đọc và lưu metadata từ GeoServer.')
      }
      await loadRasters()
    } catch (error) {
      setStatus(error.message, true)
    } finally {
      setBusy(false)
    }
  }

  function setBusy(value) {
    busy = value
    panel.querySelectorAll('input, select, button').forEach(item => { item.disabled = value })
    panel.setAttribute('aria-busy', String(value))
    if (!value) saveButton.disabled = !!fileInput.files[0] && fileInput.files[0].size >= MAX_RASTER_BYTES
  }

  async function open(selectedAction) {
    if (busy) return
    beforeOpen()
    currentAction = selectedAction.replace('-raster', '')
    panel.classList.add('shown')
    updatePanel()
    clearPreview()
    renderInfo()
    if (currentAction === 'add') { nameInput.value = ''; titleInput.value = '' }
    try {
      await loadRasters()
      setStatus(currentAction === 'add' ? 'Chọn GeoTIFF để xem preview trước khi thêm.' : 'Chọn raster để thực hiện thao tác.')
    } catch (error) {
      setStatus(error.message, true)
    }
  }

  saveButton.addEventListener('click', executeRasterAction)
  updateMetadataButton.addEventListener('click', updateRasterMetadata)
  fileInput.addEventListener('change', previewRaster)
  select.addEventListener('change', syncSelectedRaster)
  clearPreviewButton.addEventListener('click', () => { clearPreview(); renderInfo(); setStatus('Đã ẩn preview. Raster chưa được thêm chính thức.') })
  panel.querySelector('[data-raster-cancel]').addEventListener('click', () => { clearPreview(); panel.classList.remove('shown') })
  panel.addEventListener('toolpanelclose', clearPreview)

  return { open, load: loadRasters, close: () => { clearPreview(); panel.classList.remove('shown') } }
}
