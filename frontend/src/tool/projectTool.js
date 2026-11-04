import { createToolPanel, escapeHTML } from './toolUtils.js';

const TASKS = [
  ['search', 'Tra cứu dữ liệu'],
  ['edit', 'Biên tập dữ liệu'],
  ['slope', 'Phân tích độ dốc'],
  ['aspect', 'Phân tích hướng dốc'],
  ['pdf', 'Xuất bản đồ PDF'],
];

// Bước 1: chỉ xem trước giao diện, không xác thực hoặc ghi dữ liệu dự án.
export function initProjectUI({ closeMenu }) {
  let preview = null;
  const panel = createToolPanel({ id: 'project-info-panel', title: 'Thông tin dự án', content: '' });
  panel.classList.add('project-info-panel');
  const body = panel.querySelector('.tool-panel-body');
  panel.addEventListener('toolpanelclose', () => document.getElementById('menu-btn').focus());

  function createDialog(id, title, content) {
    const dialog = document.createElement('dialog');
    dialog.id = id;
    dialog.className = 'project-dialog';
    dialog.setAttribute('aria-labelledby', `${id}-title`);
    dialog.innerHTML = `
      <header class="project-dialog-header">
        <div><span class="project-eyebrow">KHÔNG GIAN LÀM VIỆC</span><h2 id="${id}-title">${title}</h2></div>
        <button type="button" class="project-close" data-project-dismiss aria-label="Đóng ${title.toLocaleLowerCase('vi-VN')}">×</button>
      </header>${content}`;
    document.body.append(dialog);
    dialog.querySelectorAll('[data-project-dismiss]').forEach(button => {
      button.addEventListener('click', () => dialog.close());
    });
    dialog.addEventListener('close', () => {
      if (document.querySelector('dialog[open]')) return;
      const target = panel.classList.contains('shown') ? panel.querySelector('header button') : document.getElementById('menu-btn');
      target.focus();
    });
    return dialog;
  }

  const newDialog = createDialog('project-new-dialog', 'Tạo dự án mới', `
    <form id="project-new-form" class="project-form">
      <p class="project-notice">Bản xem trước giao diện. Thông tin chỉ được giữ trong trang hiện tại và sẽ mất khi tải lại trang.</p>
      <fieldset>
        <legend><span>1</span> Tài khoản và thông tin dự án</legend>
        <label for="project-account">Người thực hiện</label>
        <input id="project-account" value="Chưa đăng nhập" readonly aria-describedby="project-account-hint">
        <p id="project-account-hint" class="project-hint">Đăng nhập sẽ được kết nối ở bước tiếp theo.</p>
        <label for="project-name">Tên dự án <span aria-hidden="true">*</span></label>
        <input id="project-name" name="name" maxlength="150" required placeholder="Ví dụ: Khảo sát địa hình khu vực A" autocomplete="off">
        <label for="project-description">Mô tả</label>
        <textarea id="project-description" name="description" rows="2" maxlength="2000" placeholder="Mục đích và nội dung công việc…"></textarea>
      </fieldset>
      <fieldset aria-describedby="project-scope-hint">
        <legend><span>2</span> Phạm vi làm việc</legend>
        <label class="project-choice"><input type="radio" name="scope" value="viewport" checked><span>Phạm vi bản đồ hiện tại</span></label>
        <label class="project-choice"><input type="radio" name="scope" value="polygon"><span>Vẽ đa giác trên bản đồ</span></label>
        <p id="project-scope-hint" class="project-hint">Chọn cách xác định phạm vi. Chức năng lấy vùng và vẽ ranh giới chưa được kết nối.</p>
      </fieldset>
      <fieldset>
        <legend><span>3</span> Nhiệm vụ cần thực hiện</legend>
        <div class="project-task-options">${TASKS.map(([id, title]) => `<label class="project-choice"><input type="checkbox" name="tasks" value="${id}"><span>${title}</span></label>`).join('')}</div>
        <p class="project-hint">Có thể chọn nhiều nhiệm vụ. Công cụ thực hiện sẽ được kết nối ở bước sau.</p>
      </fieldset>
      <footer class="project-actions">
        <button type="button" class="secondary" data-project-dismiss>Hủy</button>
        <button type="submit">Xem trước dự án</button>
      </footer>
    </form>`);

  const openDialog = createDialog('project-open-dialog', 'Mở dự án', `
    <div class="project-dialog-body">
      <div class="project-empty"><strong>Chưa có danh sách dự án đã lưu</strong><p>Danh sách sẽ xuất hiện sau khi kết nối chức năng lưu và mở dự án.</p></div>
      <div id="project-current-preview" hidden>
        <span class="project-eyebrow">BẢN XEM TRƯỚC TRONG TRANG</span>
        <p id="project-current-name"></p>
        <button type="button" id="project-show-preview">Xem thông tin</button>
      </div>
      <footer class="project-actions"><button type="button" class="secondary" data-project-dismiss>Đóng</button><button type="button" id="project-open-new">Tạo dự án mới</button></footer>
    </div>`);

  const exitDialog = createDialog('project-exit-dialog', 'Thoát dự án', `
    <div class="project-dialog-body">
      <p id="project-exit-message"></p>
      <footer class="project-actions"><button type="button" class="secondary" data-project-dismiss>Hủy</button><button type="button" id="project-confirm-exit">Đóng bản xem trước</button></footer>
    </div>`);

  function showDialog(dialog) {
    closeMenu();
    dialog.showModal();
  }

  function showNewDialog(editing = false) {
    const form = newDialog.querySelector('form');
    form.reset();
    form.elements.name.setCustomValidity('');
    if (editing && preview) {
      form.elements.name.value = preview.name;
      form.elements.description.value = preview.description;
      form.querySelector(`[name="scope"][value="${preview.scope}"]`).checked = true;
      form.querySelectorAll('[name="tasks"]').forEach(input => { input.checked = preview.tasks.includes(input.value); });
    }
    showDialog(newDialog);
    form.elements.name.focus();
  }

  function showPreview() {
    body.innerHTML = `
      <span class="project-eyebrow">BẢN XEM TRƯỚC · CHƯA LƯU</span>
      <h3 class="project-name">${escapeHTML(preview.name)}</h3>
      ${preview.description ? `<p class="project-description">${escapeHTML(preview.description)}</p>` : ''}
      <dl class="project-details"><div><dt>Người thực hiện</dt><dd>Chưa đăng nhập</dd></div><div><dt>Phạm vi dự kiến</dt><dd>${preview.scope === 'polygon' ? 'Vẽ đa giác trên bản đồ' : 'Phạm vi bản đồ hiện tại'}</dd></div></dl>
      <p class="project-hint">Chưa xác định ranh giới thực tế.</p>
      <h4>Nhiệm vụ</h4>
      <div class="project-preview-tasks">${preview.tasks.length ? preview.tasks.map(id => {
        const title = TASKS.find(task => task[0] === id)[1];
        return `<div class="project-task-row"><span>${title}</span><span class="project-task-status">Chưa thực hiện</span></div>`;
      }).join('') : '<p class="project-hint">Chưa chọn nhiệm vụ.</p>'}</div>
      <p id="project-save-hint" class="project-notice">Chưa hỗ trợ lưu dự án. Bản xem trước sẽ mất khi tải lại trang.</p>
      <div class="project-actions"><button type="button" class="secondary" id="project-edit-preview">Chỉnh khai báo</button><button type="button" disabled aria-describedby="project-save-hint">Lưu dự án</button></div>`;
    body.querySelector('#project-edit-preview').addEventListener('click', () => showNewDialog(true));
    panel.classList.add('shown');
    panel.querySelector('header button').focus();
  }

  newDialog.querySelector('form').addEventListener('submit', event => {
    event.preventDefault();
    const form = event.currentTarget;
    const name = form.elements.name;
    if (!name.value.trim()) {
      name.setCustomValidity('Vui lòng nhập tên dự án.');
      name.reportValidity();
      return;
    }
    const data = new FormData(form);
    preview = { name: name.value.trim(), description: data.get('description').trim(), scope: data.get('scope'), tasks: data.getAll('tasks') };
    newDialog.close();
    showPreview();
  });
  newDialog.querySelector('[name="name"]').addEventListener('input', event => event.target.setCustomValidity(''));
  openDialog.querySelector('#project-show-preview').addEventListener('click', () => {
    openDialog.close();
    if (preview) showPreview();
  });
  openDialog.querySelector('#project-open-new').addEventListener('click', () => {
    openDialog.close();
    showNewDialog();
  });
  exitDialog.querySelector('#project-confirm-exit').addEventListener('click', () => {
    preview = null;
    panel.classList.remove('shown');
    body.replaceChildren();
    newDialog.querySelector('form').reset();
    newDialog.querySelector('[name="name"]').setCustomValidity('');
    exitDialog.close();
  });

  document.querySelectorAll('[data-project-action]').forEach(button => {
    button.addEventListener('click', () => {
      if (button.dataset.projectAction === 'new') showNewDialog();
      if (button.dataset.projectAction === 'open') {
        openDialog.querySelector('#project-current-preview').hidden = !preview;
        openDialog.querySelector('#project-current-name').textContent = preview?.name || '';
        showDialog(openDialog);
      }
      if (button.dataset.projectAction === 'exit') {
        exitDialog.querySelector('#project-exit-message').textContent = preview
          ? `Đóng bản xem trước “${preview.name}”? Thông tin chưa được lưu và sẽ bị bỏ.`
          : 'Chưa có dự án đang mở. Bạn có thể tạo dự án mới từ menu Dự án.';
        exitDialog.querySelector('#project-confirm-exit').hidden = !preview;
        exitDialog.querySelector('footer [data-project-dismiss]').textContent = preview ? 'Hủy' : 'Đóng';
        showDialog(exitDialog);
      }
    });
  });
}
