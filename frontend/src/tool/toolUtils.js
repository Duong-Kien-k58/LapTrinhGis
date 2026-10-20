// Bố cục bảng raster theo PTN, dùng vùng bản đồ của LapTrinhGis.
export function createToolPanel({ id, title, content }) {
  const panel = document.createElement('section');
  panel.id = id;
  panel.className = 'raster-tool-panel';
  panel.setAttribute('aria-label', title);
  panel.innerHTML = `<header class="tool-panel-header"><strong>${title}</strong><button type="button" aria-label="Đóng">×</button></header><div class="tool-panel-body">${content}</div>`;
  document.querySelector('.map-wrapper').appendChild(panel);
  const header = panel.querySelector('header');
  makePanelDraggable(panel, header);
  header.querySelector('button').addEventListener('click', () => {
    panel.classList.remove('shown');
    panel.dispatchEvent(new CustomEvent('toolpanelclose'));
  });
  return panel;
}

// Cho phép kéo panel bằng phần tiêu đề
export function makePanelDraggable(panel, header) {
  if (!panel || !header) return;
  const key = panel.id ? `webgis-panel-position:${panel.id}` : null;
  function clamp(left, top) {
    const container = panel.closest('.map-wrapper') || document.documentElement;
    const headerHeight = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-height')) || 0;
    return {
      left: Math.max(8, Math.min(left, container.clientWidth - (panel.offsetWidth || 340) - 8)),
      top: Math.max(headerHeight + 8, Math.min(top, container.clientHeight - Math.min(panel.offsetHeight || 100, container.clientHeight - headerHeight - 16) - 8))
    };
  }
  function position(left, top) {
    const value = clamp(left, top);
    Object.assign(panel.style, { left: `${value.left}px`, top: `${value.top}px`, right: 'auto', bottom: 'auto' });
    return value;
  }
  try {
    const saved = key && JSON.parse(localStorage.getItem(key));
    if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)) position(saved.left, saved.top);
  } catch { /* Giữ vị trí mặc định khi trình duyệt không cho lưu. */ }
  header.style.touchAction = 'none';
  header.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.target.closest('button, input, select, a')) return;
    event.preventDefault();
    const box = panel.getBoundingClientRect();
    const start = { x: event.clientX, y: event.clientY, left: box.left, top: box.top };
    header.setPointerCapture?.(event.pointerId);
    const move = current => position(start.left + current.clientX - start.x, start.top + current.clientY - start.y);
    const end = () => {
      header.removeEventListener('pointermove', move);
      header.removeEventListener('pointerup', end);
      header.removeEventListener('pointercancel', end);
      if (key) try { localStorage.setItem(key, JSON.stringify({ left: panel.offsetLeft, top: panel.offsetTop })); } catch {}
    };
    header.addEventListener('pointermove', move);
    header.addEventListener('pointerup', end);
    header.addEventListener('pointercancel', end);
  });
  new MutationObserver(() => {
    if (panel.getClientRects().length && panel.style.left) position(parseFloat(panel.style.left), parseFloat(panel.style.top));
  }).observe(panel, { attributes: true, attributeFilter: ['class'] });
  window.addEventListener('resize', () => {
    if (panel.getClientRects().length && panel.style.left) position(parseFloat(panel.style.left), parseFloat(panel.style.top));
  });
}

// Xử lý ký tự đặc biệt khi đưa dữ liệu vào HTML
export function escapeHTML(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

// Lấy giá trị hợp lệ đầu tiên theo danh sách field trong cấu hình
export function getConfiguredValue(source, fields = [], fallback = '') {
  for (const field of fields || []) {
    const value = typeof source?.get === 'function'
      ? source.get(field)
      : source?.[field];

    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }

  return fallback;
}

// Lấy phần tử HTML bắt buộc phải tồn tại.
export function getRequiredElement(id) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Không tìm thấy #${id}`);
  return element;
}

// Tooltip dùng chung, nằm ngoài panel cuộn và không đè lên nút đang trỏ.
export function initTooltips() {
  if (document.getElementById('webgis-tooltip')) return;
  const tooltip = document.createElement('div');
  tooltip.id = 'webgis-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.hidden = true;
  document.body.append(tooltip);
  const selector = '[data-ui-tooltip], button[aria-label], [role="button"][aria-label]';
  let active = null;
  let timer;
  let scrollTimer;
  let pointerPosition = null;

  function convertTitle(element) {
    if (!element.hasAttribute('title')) return;
    const text = element.getAttribute('title').trim();
    const previous = element.dataset.uiTooltip;
    if (text) {
      if (!element.hasAttribute('aria-label') || element.getAttribute('aria-label') === previous) element.setAttribute('aria-label', text);
      element.dataset.uiTooltip = text;
    } else delete element.dataset.uiTooltip;
    element.removeAttribute('title');
  }
  function scan(element) {
    if (!(element instanceof Element)) return;
    convertTitle(element);
    element.querySelectorAll('[title]').forEach(convertTitle);
  }
  function hide() {
    clearTimeout(timer);
    clearTimeout(scrollTimer);
    if (active) {
      const ids = (active.getAttribute('aria-describedby') || '').split(/\s+/).filter(id => id && id !== tooltip.id);
      if (ids.length) active.setAttribute('aria-describedby', ids.join(' '));
      else active.removeAttribute('aria-describedby');
    }
    active = null;
    tooltip.hidden = true;
  }
  function show(element) {
    if (!element.isConnected || !element.getClientRects().length || element.closest('[inert], [hidden]')) return hide();
    const text = element.dataset.uiTooltip || element.getAttribute('aria-label');
    if (!text) return hide();
    tooltip.textContent = text;
    tooltip.style.visibility = 'hidden';
    tooltip.hidden = false;
    const box = element.getBoundingClientRect();
    const { width, height } = tooltip.getBoundingClientRect();
    const gap = 14, edge = 8;
    const positions = {
      left: { left: box.left - gap - width, top: box.top + (box.height - height) / 2 },
      right: { left: box.right + gap, top: box.top + (box.height - height) / 2 },
      top: { left: box.left + (box.width - width) / 2, top: box.top - gap - height },
      bottom: { left: box.left + (box.width - width) / 2, top: box.bottom + gap }
    };
    const order = element.closest('#right-map-tools') ? ['left', 'right', 'top', 'bottom'] : ['top', 'bottom', 'left', 'right'];
    for (const side of ['top', 'bottom']) positions[side].left = Math.max(edge, Math.min(positions[side].left, innerWidth - width - edge));
    for (const side of ['left', 'right']) positions[side].top = Math.max(edge, Math.min(positions[side].top, innerHeight - height - edge));
    const fits = position => position.left >= edge && position.top >= edge && position.left + width <= innerWidth - edge && position.top + height <= innerHeight - edge;
    const position = order.map(side => positions[side]).find(fits) || positions[order[0]];
    tooltip.style.left = `${Math.max(edge, Math.min(position.left, innerWidth - width - edge))}px`;
    tooltip.style.top = `${Math.max(edge, Math.min(position.top, innerHeight - height - edge))}px`;
    tooltip.style.visibility = 'visible';
    const ids = new Set((element.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
    ids.add(tooltip.id);
    element.setAttribute('aria-describedby', [...ids].join(' '));
  }
  function activate(element, delay) {
    if (active === element) return;
    hide();
    active = element;
    timer = setTimeout(() => { if (active === element) show(element); }, delay);
  }
  scan(document.body);
  new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'attributes') convertTitle(record.target);
      else record.addedNodes.forEach(scan);
    }
    if (active && !active.isConnected) hide();
    else if (active && !tooltip.hidden) {
      const text = active.dataset.uiTooltip || active.getAttribute('aria-label');
      if (text !== tooltip.textContent) show(active);
    }
  }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['title', 'aria-label'] });
  document.addEventListener('pointerover', event => {
    if (event.pointerType === 'touch') return;
    pointerPosition = { x: event.clientX, y: event.clientY };
    const element = event.target.closest?.(selector);
    if (element) activate(element, 200);
  });
  document.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch' || event.buttons) return;
    pointerPosition = { x: event.clientX, y: event.clientY };
    const element = event.target.closest?.(selector);
    if (element) activate(element, 200);
  });
  document.addEventListener('pointerout', event => {
    if (active && active.contains(event.target) && !active.contains(event.relatedTarget)) hide();
  });
  document.addEventListener('focusin', event => {
    const element = event.target.closest?.(selector);
    if (element?.matches(':focus-visible')) activate(element, 0);
  });
  document.addEventListener('focusout', hide);
  document.addEventListener('pointerdown', hide, true);
  document.addEventListener('scroll', () => {
    hide();
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      if (!pointerPosition) return;
      const element = document.elementFromPoint(pointerPosition.x, pointerPosition.y)?.closest(selector);
      if (element) activate(element, 80);
    }, 120);
  }, true);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') hide(); });
  window.addEventListener('resize', hide);
  window.addEventListener('blur', () => { pointerPosition = null; hide(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) hide(); });
}

// SLD dài không phù hợp URL GET; GeoServer nhận cùng tham số qua form POST.
export function loadWmsImage(image, src) {
  const element = image.getImage();
  if (src.length < 8000) { element.src = src; return; }
  const url = new URL(src, window.location.href);
  const body = new URLSearchParams(url.search);
  url.search = '';
  fetch(url, { method: 'POST', body, signal: AbortSignal.timeout(30000) })
    .then(async response => {
      if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw new Error('Không tải được ảnh WMS.');
      const objectUrl = URL.createObjectURL(await response.blob());
      const release = () => {
        URL.revokeObjectURL(objectUrl);
        element.removeEventListener('load', release);
        element.removeEventListener('error', release);
      };
      element.addEventListener('load', release, { once: true });
      element.addEventListener('error', release, { once: true });
      element.src = objectUrl;
    })
    .catch(() => { element.src = 'data:image/png;base64,invalid'; });
}
