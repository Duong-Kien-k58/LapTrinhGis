import { createToolPanel } from './toolUtils.js'
import { requestJson } from './apiClient.js'
import { GEOSERVER_CONFIG } from '../config/layers.js'

function setServiceStatus(element, name, online, detail = '') {
  element.className = `system-service ${online ? 'online' : 'offline'}`
  element.textContent = `${name}: ${online ? 'Đang hoạt động' : 'Không kết nối được'}${detail ? ` (${detail})` : ''}`
}

export function createSystemTools() {
  const supportPanel = createToolPanel({
    id: 'support-panel',
    title: 'Hỗ trợ sử dụng',
    content: `
      <p class="tool-hint">Chọn công cụ trên thanh bên phải để thao tác với bản đồ.</p>
      <ul class="system-list">
        <li><strong>Mục lục lớp:</strong> bật/tắt và sắp xếp lớp dữ liệu.</li>
        <li><strong>Đo đạc:</strong> đo chiều dài hoặc diện tích trực tiếp trên bản đồ.</li>
        <li><strong>Tìm kiếm:</strong> nhập địa danh hoặc tọa độ WGS84/VN-2000.</li>
        <li><strong>Tra cứu:</strong> chọn lớp rồi nhấp bản đồ để xem thuộc tính hoặc pixel raster.</li>
      </ul>
      <strong>Trạng thái dịch vụ</strong>
      <div class="system-services" data-support-services>Đang kiểm tra…</div>
      <button type="button" class="secondary" data-refresh-support>Làm mới trạng thái</button>
    `,
  })
  supportPanel.dataset.sectionAction = 'support'

  async function checkServices(container) {
    const backend = document.createElement('div')
    const geoserver = document.createElement('div')
    container.replaceChildren(backend, geoserver)
    setServiceStatus(backend, 'Backend', false, 'đang kiểm tra')
    setServiceStatus(geoserver, 'GeoServer', false, 'đang kiểm tra')

    const [backendResult, geoserverResult] = await Promise.allSettled([
      requestJson('/mygis/health/').then(data => data.success !== false),
      fetch(`${GEOSERVER_CONFIG.wmsUrl}?SERVICE=WMS&REQUEST=GetCapabilities&VERSION=1.3.0`, { signal: AbortSignal.timeout(10000) }).then(async response => response.ok && /WMS_Capabilities|WMT_MS_Capabilities/.test(await response.text())),
    ])
    setServiceStatus(backend, 'Backend', backendResult.status === 'fulfilled' && backendResult.value)
    setServiceStatus(geoserver, 'GeoServer', geoserverResult.status === 'fulfilled' && geoserverResult.value)
  }

  function closeAll(except = '') {
    if (except !== 'support') supportPanel.classList.remove('shown')
  }

  function openSupport() {
    document.dispatchEvent(new CustomEvent('webgis-tool-activate', { detail: { name: 'support' } }))
    supportPanel.classList.add('shown')
    checkServices(supportPanel.querySelector('[data-support-services]'))
  }

  supportPanel.querySelector('[data-refresh-support]').addEventListener('click', () => {
    checkServices(supportPanel.querySelector('[data-support-services]'))
  })
  return { openSupport, closeAll, close: () => closeAll() }
}
