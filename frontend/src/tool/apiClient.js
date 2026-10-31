import { GEOSERVER_CONFIG } from '../config/layers.js';

async function fetchBackend(url, options) {
  try {
    return await fetch(url, options);
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('Không kết nối được máy chủ dữ liệu. Kiểm tra backend rồi thử lại.');
  }
}

export async function requestJson(url, options = {}) {
  const target = new URL(url, window.location.href);
  const backend = new URL(GEOSERVER_CONFIG.backendUrl, window.location.href);
  if (target.origin === window.location.origin && target.pathname.startsWith('/mygis/')) {
    target.protocol = backend.protocol;
    target.host = backend.host;
  }
  const localHosts = ['localhost', '127.0.0.1'];
  if (localHosts.includes(target.hostname) && localHosts.includes(window.location.hostname)) {
    target.hostname = window.location.hostname;
  }
  url = target.href;
  const headers = new Headers(options.headers);
  if (!['GET', 'HEAD', 'OPTIONS'].includes((options.method || 'GET').toUpperCase())) {
    // Lấy token mới vì Django xoay CSRF token sau đăng nhập.
      const tokenResponse = await fetchBackend(`${target.origin}/mygis/rasters/csrf/`, { credentials: 'include', signal: options.signal });
      const tokenData = await tokenResponse.json();
      if (!tokenResponse.ok) throw new Error('Không lấy được mã xác thực yêu cầu.');
    headers.set('X-CSRFToken', tokenData.token);
    if (!headers.has('Content-Type') && typeof options.body === 'string') headers.set('Content-Type', 'application/json');
  }
  const response = await fetchBackend(url, { ...options, headers, credentials: 'include' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) throw new Error(data.message || `Lỗi HTTP ${response.status}`);
  return data;
}
