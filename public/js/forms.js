document.querySelectorAll('.demo-row').forEach((btn) => {
  btn.addEventListener('click', () => {
    const form = document.getElementById('login-form');
    if (!form) return;
    const email = form.querySelector('[name="email"]');
    const password = form.querySelector('[name="password"]');
    if (email) email.value = btn.dataset.email || '';
    if (password) password.value = btn.dataset.password || '';
    email?.focus();
  });
});

document.querySelectorAll('.pw-toggle').forEach((btn) => {
  btn.addEventListener('click', () => {
    const input = btn.closest('.pw-wrap').querySelector('input');
    const hidden = input.type === 'password';
    input.type = hidden ? 'text' : 'password';
    btn.setAttribute('aria-label', hidden ? 'Скрыть пароль' : 'Показать пароль');
  });
});

document.querySelectorAll('.form-group.has-error input, .form-group.has-error select').forEach((el) => {
  el.addEventListener('input', () => el.closest('.form-group')?.classList.remove('has-error'));
});
