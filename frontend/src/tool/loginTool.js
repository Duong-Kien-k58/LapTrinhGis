// Interface only: authentication providers are not connected yet.
const icons = {
  user: '<circle cx="12" cy="8" r="3"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m3 7 9 6 9-6"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/><path class="login-eye-slash" d="m3 3 18 18"/>',
};
const svg = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]}</svg>`;
const google = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.5-.2-2.2H12v4.2h5.4a4.6 4.6 0 0 1-2 3v2.5h3.3c1.9-1.7 2.9-4.3 2.9-7.5Z"/><path fill="#34A853" d="M12 22c2.7 0 4.9-.9 6.6-2.4l-3.2-2.5a6 6 0 0 1-3.4 1c-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.4 14a6 6 0 0 1 0-4V7.4H3.1a10 10 0 0 0 0 9.2L6.4 14Z"/><path fill="#EA4335" d="M12 5.9c1.5 0 2.8.5 3.9 1.5l2.9-2.9A9.5 9.5 0 0 0 12 2a10 10 0 0 0-8.9 5.4L6.4 10A6 6 0 0 1 12 5.9Z"/></svg>';
const microsoft = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#f25022" d="M2 2h9v9H2z"/><path fill="#7fba00" d="M13 2h9v9h-9z"/><path fill="#00a4ef" d="M2 13h9v9H2z"/><path fill="#ffb900" d="M13 13h9v9h-9z"/></svg>';

function field(id, label, placeholder, type = 'text', autocomplete = '') {
  const password = type === 'password';
  return `<div class="auth-field"><label for="${id}">${label}</label><div class="auth-input-wrap">${svg(password ? 'lock' : type === 'email' ? 'mail' : 'user')}<input id="${id}" name="${id}" type="${type}" placeholder="${placeholder}" autocomplete="${autocomplete}" required aria-describedby="${id}-error" ${password ? 'data-password' : ''}>${password ? `<button class="auth-eye" type="button" data-password-for="${id}" aria-label="Hiện ${label.toLowerCase()}" aria-pressed="false" aria-controls="${id}">${svg('eye')}</button>` : ''}</div><small class="auth-field-error" id="${id}-error" hidden></small></div>`;
}

export function initLoginUI() {
  const openButton = document.getElementById('login-open');
  const dialog = document.getElementById('login-dialog');
  const content = document.getElementById('login-content');
  const rememberKey = 'webgis-remembered-identifier';
  let mode = 'login';
  function showFeedback(message) {
    const feedback = content.querySelector('#login-feedback');
    feedback.textContent = message;
    feedback.hidden = false;
  }
  function render(nextMode = 'login', focus = true) {
    mode = nextMode;
    const registering = mode === 'register';
    const recovering = mode === 'reset';
    const title = recovering ? 'Quên mật khẩu?' : registering ? 'Tạo tài khoản mới' : 'Chào mừng trở lại';
    const description = recovering ? 'Nhập email đã đăng ký để yêu cầu khôi phục tài khoản.' : registering ? 'Bắt đầu không gian làm việc với dữ liệu của bạn.' : 'Đăng nhập để tiếp tục không gian làm việc của bạn.';
    content.innerHTML = `
      ${recovering ? '<button class="auth-back" type="button" data-auth-mode="login">← Quay lại đăng nhập</button>' : `<nav class="auth-tabs" aria-label="Tùy chọn tài khoản"><button type="button" data-auth-mode="login" ${!registering ? 'aria-current="page"' : ''}>Đăng nhập</button><button type="button" data-auth-mode="register" ${registering ? 'aria-current="page"' : ''}>Đăng ký</button></nav>`}
      <div class="auth-heading"><h1 id="login-title">${title}</h1><p id="login-description">${description}</p></div>
      ${recovering ? '<div class="auth-recovery-icon" aria-hidden="true">' + svg('mail') + '</div>' : `<div class="auth-providers"><button type="button" data-auth-provider="Google">${google}<span>Google</span></button><button type="button" data-auth-provider="Microsoft">${microsoft}<span>Microsoft</span></button></div><div class="auth-divider"><span>hoặc ${registering ? 'đăng ký' : 'đăng nhập'} bằng tài khoản</span></div>`}
      <form id="login-form" novalidate>
        ${registering ? field('register-name', 'Họ và tên', 'Nguyễn Văn An', 'text', 'name') : ''}
        ${field('login-username', recovering || registering ? 'Địa chỉ email' : 'Email hoặc tên đăng nhập', recovering || registering ? 'ban@example.com' : 'Nhập email hoặc tên đăng nhập', recovering || registering ? 'email' : 'text', recovering || registering ? 'email' : 'username')}
        ${recovering ? '' : field('login-password', 'Mật khẩu', registering ? 'Tạo mật khẩu từ 8 ký tự' : 'Nhập mật khẩu của bạn', 'password', registering ? 'new-password' : 'current-password')}
        ${registering ? '<div class="auth-strength" hidden><div class="auth-strength-bars"><i></i><i></i><i></i><i></i></div><span></span></div>' + field('register-confirm', 'Xác nhận mật khẩu', 'Nhập lại mật khẩu', 'password', 'new-password') : ''}
        <p id="login-caps" class="auth-caps" hidden>Caps Lock đang bật.</p>
        ${recovering ? '' : registering ? '<label class="auth-check auth-consent"><input id="auth-consent" type="checkbox" required><span>Tôi đồng ý với <button type="button" data-auth-info="terms">Điều khoản sử dụng</button> và <button type="button" data-auth-info="privacy">Quyền riêng tư</button>.</span></label>' : '<div class="auth-options"><label class="auth-check"><input id="login-remember" type="checkbox"><span>Ghi nhớ tài khoản</span></label><button type="button" class="auth-text-button" data-auth-mode="reset">Quên mật khẩu?</button></div>'}
        <p id="login-feedback" class="login-feedback" role="status" hidden></p>
        <button class="login-submit" type="submit">${recovering ? 'Yêu cầu đặt lại mật khẩu' : registering ? 'Tạo tài khoản' : 'Đăng nhập'}<span aria-hidden="true">→</span></button>
      </form>
      <p class="auth-switch">${recovering ? 'Nhớ mật khẩu rồi?' : registering ? 'Đã có tài khoản?' : 'Chưa có tài khoản?'} <button type="button" data-auth-mode="${registering || recovering ? 'login' : 'register'}">${registering || recovering ? 'Đăng nhập' : 'Đăng ký ngay'}</button></p>
      <button class="auth-map-return" type="button" data-auth-return>← Tiếp tục xem bản đồ</button>`;
    if (mode === 'login') {
      try {
        const saved = localStorage.getItem(rememberKey);
        if (saved) { content.querySelector('#login-username').value = saved; content.querySelector('#login-remember').checked = true; }
      } catch { /* Biểu mẫu vẫn hoạt động khi trình duyệt chặn lưu trữ. */ }
    }
    dialog.scrollTop = 0;
    if (focus) content.querySelector('input')?.focus();
  }
  openButton.addEventListener('click', () => {
    render('login', false);
    if (!dialog.open) dialog.showModal();
    content.querySelector('#login-username').focus();
  });
  document.getElementById('login-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { content.replaceChildren(); openButton.focus(); });
  dialog.addEventListener('keydown', event => {
    event.stopPropagation();
    if (event.key === 'Tab') {
      const focusable = [...dialog.querySelectorAll('button:not(:disabled), input:not(:disabled)')]
        .filter(element => element.getClientRects().length);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    if (event.target.matches('[data-password]')) content.querySelector('#login-caps').hidden = !event.getModifierState('CapsLock');
  });
  dialog.addEventListener('keyup', event => {
    if (event.target.matches('[data-password]')) content.querySelector('#login-caps').hidden = !event.getModifierState('CapsLock');
  });
  dialog.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (button?.dataset.authMode) render(button.dataset.authMode);
    if (button?.hasAttribute('data-auth-return')) dialog.close();
    if (button?.dataset.passwordFor) {
      const input = content.querySelector(`#${button.dataset.passwordFor}`);
      const visible = input.type === 'password';
      input.type = visible ? 'text' : 'password';
      button.setAttribute('aria-pressed', String(visible));
      const label = content.querySelector(`label[for="${input.id}"]`).textContent.toLowerCase();
      button.setAttribute('aria-label', `${visible ? 'Ẩn' : 'Hiện'} ${label}`);
    }
    if (button?.dataset.authProvider) showFeedback(`Đăng nhập bằng ${button.dataset.authProvider} chưa được kích hoạt. Bạn có thể tiếp tục xem bản đồ.`);
    if (button?.dataset.authInfo) {
      const messages = {
        terms: 'Điều khoản sử dụng sẽ được quản trị viên cung cấp khi mở đăng ký tài khoản.',
        privacy: 'Biểu mẫu xem trước không gửi thông tin tài khoản. Chỉ tên đăng nhập được lưu trên máy nếu bạn chọn ghi nhớ; mật khẩu không được lưu.',
        support: 'Để được cấp tài khoản hoặc hỗ trợ truy cập, vui lòng liên hệ quản trị viên của hệ thống WebGIS.',
      };
      showFeedback(messages[button.dataset.authInfo]);
    }
    if (event.target === dialog) {
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    }
  });
  content.addEventListener('input', event => {
    const input = event.target;
    input.removeAttribute('aria-invalid');
    const error = document.getElementById(`${input.id}-error`);
    if (error) error.hidden = true;
    content.querySelector('#login-feedback').hidden = true;
    if (mode === 'register' && input.id === 'login-password') {
      const strength = content.querySelector('.auth-strength');
      const value = input.value;
      const score = Number(value.length >= 8) + Number(/[a-z]/.test(value) && /[A-Z]/.test(value)) + Number(/\d/.test(value)) + Number(/[^a-zA-Z0-9]/.test(value));
      strength.hidden = !value;
      strength.dataset.score = String(score);
      strength.querySelector('span').textContent = value.length < 8 ? 'Sử dụng ít nhất 8 ký tự' : ['Rất yếu', 'Yếu', 'Trung bình', 'Khá', 'Mạnh'][score];
      strength.querySelectorAll('i').forEach((bar, index) => bar.classList.toggle('filled', index < score));
    }
  });
  content.addEventListener('change', event => {
    if (event.target.id === 'login-remember' && !event.target.checked) {
      try { localStorage.removeItem(rememberKey); } catch { /* Lưu trữ có thể bị chặn. */ }
    }
  });
  content.addEventListener('submit', event => {
    event.preventDefault();
    const form = event.target;
    let firstInvalid;
    form.querySelectorAll('input').forEach(input => {
      let message = '';
      if (!input.validity.valid || (input.type !== 'password' && input.type !== 'checkbox' && !input.value.trim())) {
        message = input.type === 'email' && input.value ? 'Vui lòng nhập địa chỉ email hợp lệ.' : input.type === 'checkbox' ? 'Vui lòng đồng ý với điều khoản trước khi tiếp tục.' : 'Vui lòng điền thông tin này.';
      }
      if (mode === 'register' && input.id === 'login-password' && input.value && input.value.length < 8) message = 'Mật khẩu cần ít nhất 8 ký tự.';
      if (input.id === 'register-confirm' && input.value !== form.querySelector('#login-password').value) message = 'Mật khẩu xác nhận chưa khớp.';
      input.setAttribute('aria-invalid', String(Boolean(message)));
      const error = document.getElementById(`${input.id}-error`);
      if (error) { error.textContent = message; error.hidden = !message; }
      if (message && !firstInvalid) firstInvalid = input;
    });
    if (firstInvalid) {
      if (firstInvalid.type === 'checkbox') showFeedback('Vui lòng đồng ý với điều khoản trước khi tiếp tục.');
      firstInvalid.focus();
      return;
    }
    if (mode === 'login') {
      try {
        if (form.querySelector('#login-remember').checked) localStorage.setItem(rememberKey, form.querySelector('#login-username').value.trim());
        else localStorage.removeItem(rememberKey);
      } catch { /* Không chặn thao tác khi không có localStorage. */ }
    }
    const messages = {
      login: 'Đăng nhập chưa được kích hoạt. Chưa có thông tin nào được gửi đi.',
      register: 'Đăng ký chưa được kích hoạt. Tài khoản chưa được tạo; vui lòng liên hệ quản trị viên.',
      reset: 'Khôi phục tài khoản chưa được kích hoạt. Email chưa được gửi; vui lòng liên hệ quản trị viên.',
    };
    showFeedback(messages[mode]);
  });
  render('login', false);
}
