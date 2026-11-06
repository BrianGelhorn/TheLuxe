(() => {
  const $ = id => document.getElementById(id);
  const dialog = $('accessDialog');
  const form = $('accessForm');
  let mode = '', target = null, replay = false, busy = false;
  async function request(path, payload) {
    const result = await fetch('/api/access/' + path, payload === undefined ? { cache: 'no-store' } : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    const data = await result.json();
    if (!result.ok) throw new Error(data.error || 'No se pudo verificar el acceso.');
    return data;
  }
  function configured(value) {
    $('accessSettings').hidden = value;
    $('accessSettingsIcon').hidden = !value;
  }
  function show(kind) {
    mode = kind;
    form.reset();
    $('accessFeedback').textContent = '';
    $('accessTitle').textContent = kind === 'verify' ? 'Ingresá tu contraseña' : kind === 'setup' ? 'Crear contraseña' : 'Cambiar contraseña';
    $('accessCredentialField').hidden = kind !== 'change';
    form.elements.credential.required = kind === 'change';
    $('accessConfirmField').hidden = kind === 'verify';
    form.elements.confirmation.required = kind !== 'verify';
    $('accessPasswordLabel').textContent = kind === 'verify' ? 'Contraseña' : 'Contraseña nueva (mínimo 8 caracteres)';
    $('accessForgot').hidden = kind !== 'verify';
    if (!dialog.open) dialog.showModal();
    (kind === 'change' ? form.elements.credential : form.elements.password).focus();
  }
  function enterTarget() {
    const next = target; target = null;
    dialog.close();
    if (next?.isConnected) { replay = true; next.click(); replay = false; }
  }
  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-view="summaryView"], [data-view="configView"]');
    if (!button || replay) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (busy) return;
    try {
      busy = true;
      const status = await request('status');
      configured(status.configured);
      if (status.configured) { target = button; show('verify'); }
      else { replay = true; button.click(); replay = false; }
    } catch { alert('No se pudo verificar la protección. Revisá que el host esté conectado.'); }
    finally { busy = false; }
  }, true);
  $('openAccessSettings').addEventListener('click', () => { target = null; show('setup'); });
  $('accessSettingsIcon').addEventListener('click', () => { target = null; show('change'); });
  $('closeAccessDialog').addEventListener('click', () => { target = null; dialog.close(); });
  $('accessForgot').addEventListener('click', () => show('change'));
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    const password = form.elements.password.value;
    if (mode !== 'verify' && (password.length < 8 || password !== form.elements.confirmation.value)) {
      $('accessFeedback').textContent = password.length < 8 ? 'Usá al menos 8 caracteres.' : 'Las contraseñas no coinciden.'; return;
    }
    try {
      busy = true; $('accessSubmit').disabled = true;
      await request(mode, mode === 'change' ? { password, credential: form.elements.credential.value } : { password });
      configured(true);
      if (target) enterTarget();
      else { dialog.close(); alert(mode === 'setup' ? 'Contraseña creada.' : 'Contraseña actualizada.'); }
      form.reset();
    } catch (error) { $('accessFeedback').textContent = error.message || 'No se pudo completar la operación.'; }
    finally { busy = false; $('accessSubmit').disabled = false; }
  });
  request('status').then(status => configured(status.configured)).catch(() => {});
})();
