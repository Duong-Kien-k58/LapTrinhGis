import { GEOSERVER_CONFIG } from '../config/layers.js';

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
      const tokenResponse = await fetch(`${target.origin}/mygis/rasters/csrf/`, { credentials: 'include' });
      const tokenData = await tokenResponse.json();
      if (!tokenResponse.ok) throw new Error('Không lấy được mã xác thực yêu cầu.');
    headers.set('X-CSRFToken', tokenData.token);
    if (!headers.has('Content-Type') && typeof options.body === 'string') headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(url, { ...options, headers, credentials: 'include' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) throw new Error(data.message || `Lỗi HTTP ${response.status}`);
  return data;
}
