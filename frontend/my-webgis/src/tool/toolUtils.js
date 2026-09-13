// Cho phép kéo panel bằng phần tiêu đề
export function makePanelDraggable(panel, header) {
  if (!panel || !header) return;

  let dragging = false;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;

  header.addEventListener('mousedown', function (event) {
    if (event.target.closest('button')) return;

    dragging = true;
    startX = event.clientX;
    startY = event.clientY;

    const rect = panel.getBoundingClientRect();
    startLeft = rect.left;
    startTop = rect.top;

    panel.style.left = startLeft + 'px';
    panel.style.top = startTop + 'px';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', function (event) {
    if (!dragging) return;

    panel.style.left = startLeft + event.clientX - startX + 'px';
    panel.style.top = startTop + event.clientY - startY + 'px';
  });

  document.addEventListener('mouseup', function () {
    dragging = false;
    document.body.style.userSelect = '';
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