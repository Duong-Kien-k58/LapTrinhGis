import { createToolPanel } from './toolUtils.js';

const normalize = value => String(value).toLocaleLowerCase('vi-VN').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
const TOOL_SELECTOR = ':is(.menu-content, .map-actions) :is([data-section], [data-menu-action], [data-tool-action], [data-raster-action], [data-config-action])';

export function initWorkspaceTools({ map }) {
  const panel = createToolPanel({
    id: 'tool-search-panel', title: 'Tìm công cụ',
    content: `<label for="workspace-tool-query">Bạn muốn sử dụng công cụ nào?</label>
      <div class="workspace-tool-query-wrap">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>
        <input id="workspace-tool-query" role="combobox" aria-autocomplete="list" aria-controls="workspace-tool-results" aria-expanded="false" autocomplete="off" placeholder="Tìm tên công cụ, ví dụ: đo đạc…">
        <button type="button" class="workspace-tool-clear" aria-label="Xóa từ khóa" title="Xóa từ khóa" hidden>×</button>
      </div>
      <div class="workspace-tool-results-heading"><span>KẾT QUẢ TÌM KIẾM</span><span data-tool-result-count aria-live="polite"></span></div>
      <div id="workspace-tool-results" class="workspace-tool-results" role="listbox"></div>
      <p class="workspace-tool-keyboard"><span><kbd>↑</kbd><kbd>↓</kbd> Chọn</span><span><kbd>Enter</kbd> Mở công cụ</span><span><kbd>Esc</kbd> Đóng</span></p>`
  });
  const input = panel.querySelector('input');
  const results = panel.querySelector('#workspace-tool-results');
  const clearButton = panel.querySelector('.workspace-tool-clear');
  const resultCount = panel.querySelector('[data-tool-result-count]');
  const summary = document.createElement('section');
  summary.className = 'workspace-status';
  summary.setAttribute('aria-label', 'Thống kê lớp bản đồ');
  summary.innerHTML = `<div class="workspace-layer-statistics"><span>Tổng lớp <b data-workspace-total>0</b></span><span>Đang bật <b data-workspace-visible>0</b></span><span>Vector <b data-workspace-vector>0</b></span><span>Raster <b data-workspace-raster>0</b></span></div>`;
  document.querySelector('.workspace-header')?.append(summary);
  let candidates = [];
  let selectedIndex = -1;

  function toolLabel(button) {
    return (button.textContent.trim() || button.title || button.getAttribute('aria-label') || 'Công cụ').replace(/^[＋+✎×]\s*/, '');
  }
  function close() {
    panel.classList.remove('shown');
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }
  function select(index) {
    selectedIndex = index;
    results.querySelectorAll('button').forEach((button, i) => {
      button.classList.toggle('selected', i === index);
      button.setAttribute('aria-selected', String(i === index));
    });
    const selected = results.querySelectorAll('button')[index];
    if (selected) {
      input.setAttribute('aria-activedescendant', selected.id);
      selected.scrollIntoView({ block: 'nearest' });
    }
  }
  function openCandidate(index) {
    const candidate = candidates[index];
    if (!candidate || candidate.disabled) return;
    close();
    candidate.click();
  }
  function render() {
    const keyword = normalize(input.value.trim());
    clearButton.hidden = !input.value;
    candidates = [...document.querySelectorAll(TOOL_SELECTOR)].filter(button => {
      if (button.disabled || button.closest('[hidden]') || button.dataset.section === 'tool-search') return false;
      const group = button.closest('.menu-group')?.querySelector('.menu-group-title')?.textContent || '';
      return keyword && normalize(`${toolLabel(button)} ${group}`).includes(keyword);
    }).slice(0, 12);
    results.replaceChildren();
    resultCount.textContent = keyword ? `${candidates.length} kết quả` : '';
    if (!candidates.length) {
      const empty = document.createElement('div');
      empty.className = 'workspace-tool-empty';
      const heading = document.createElement('strong');
      const detail = document.createElement('span');
      heading.textContent = keyword ? 'Không tìm thấy công cụ' : 'Tìm nhanh công cụ bản đồ';
      detail.textContent = keyword ? 'Thử từ khóa khác, ví dụ: raster, tọa độ hoặc trình bày.' : 'Nhập tên chức năng hoặc nhóm công cụ để bắt đầu.';
      empty.append(heading, detail);
      results.append(empty);
      selectedIndex = -1;
      input.removeAttribute('aria-activedescendant');
    } else candidates.forEach((candidate, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.id = `workspace-tool-result-${index}`;
      button.setAttribute('role', 'option');
      const icon = document.createElement('span');
      icon.className = 'workspace-tool-result-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.innerHTML = '<svg viewBox="0 0 24 24"><path d="m3 7 9-4 9 4-9 4-9-4Zm0 5 9 4 9-4M3 17l9 4 9-4"/></svg>';
      const copy = document.createElement('span');
      copy.className = 'workspace-tool-result-copy';
      const title = document.createElement('strong');
      const group = document.createElement('small');
      title.textContent = toolLabel(candidate);
      group.textContent = candidate.closest('.menu-group')?.querySelector('.menu-group-title')?.textContent.trim() || 'Công cụ bản đồ';
      const arrow = document.createElement('span');
      arrow.className = 'workspace-tool-result-arrow';
      arrow.setAttribute('aria-hidden', 'true');
      arrow.textContent = '↵';
      copy.append(title, group);
      button.append(icon, copy, arrow);
      button.addEventListener('mouseenter', () => select(index));
      button.addEventListener('click', () => openCandidate(index));
      results.append(button);
    });
    if (candidates.length) select(0);
    input.setAttribute('aria-expanded', String(candidates.length > 0));
  }
  input.addEventListener('input', render);
  clearButton.addEventListener('click', () => { input.value = ''; render(); input.focus(); });
  input.addEventListener('keydown', event => {
    if (event.key === 'Escape') { close(); return; }
    if (event.key === 'Enter') { event.preventDefault(); openCandidate(selectedIndex); return; }
    if (!candidates.length || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    select((selectedIndex + (event.key === 'ArrowDown' ? 1 : -1) + candidates.length) % candidates.length);
  });
  function updateStatistics() {
    const counts = { total: 0, visible: 0, vector: 0, raster: 0 };
    const collect = (layer, parentVisible = true) => {
      const visible = parentVisible && layer.getVisible();
      if (layer.getLayers) layer.getLayers().forEach(child => collect(child, visible));
      else {
        const kind = layer.get('layerKind');
        if (!['wms', 'vector', 'raster'].includes(kind)) return;
        counts.total++;
        if (visible) { counts.visible++; counts[kind === 'raster' ? 'raster' : 'vector']++; }
      }
    };
    map.getLayers().forEach(layer => collect(layer));
    Object.entries(counts).forEach(([key, value]) => { summary.querySelector(`[data-workspace-${key}]`).textContent = value; });
  }
  const layers = new WeakSet();
  const collections = new WeakSet();
  function observeCollection(collection) {
    if (collections.has(collection)) return;
    collections.add(collection);
    collection.forEach(observeLayer);
    collection.on('add', event => { observeLayer(event.element); updateStatistics(); });
    collection.on('remove', updateStatistics);
  }
  function observeLayer(layer) {
    if (layers.has(layer)) return;
    layers.add(layer);
    layer.on('change:visible', updateStatistics);
    if (layer.getLayers) observeCollection(layer.getLayers());
  }
  observeCollection(map.getLayers());
  updateStatistics();
  return {
    openToolSearch() {
      document.dispatchEvent(new CustomEvent('webgis-tool-activate', { detail: { name: 'tool-search' } }));
      panel.classList.add('shown'); input.value = ''; render(); input.focus();
    },
    close,
    closeAll(except = '') { if (except !== 'tool-search') close(); },
    updateStatistics
  };
}
