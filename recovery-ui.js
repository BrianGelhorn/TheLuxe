(() => {
  const get = id => document.getElementById(id);
  const adapter = window.TheLuxePersistence;
  const dialog = get('pendingRecoveryDialog');
  const prefix = 'theluxe-pending-state-v1';
  let copies = [], copy = null, plan = null, selected = new Set(), busy = false, attempt = null, generation = 0;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const currency = value => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value);
  const dateLabel = date => /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.split('-').reverse().join('/') : 'Configuración e inventario';
  function feedback(message, error = false) { get('recoveryFeedback').textContent = message; get('recoveryFeedback').classList.toggle('error', error); }
  function scan() {
    const rows = [];
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (key === prefix || key.startsWith(prefix + ':')) {
        if (key === adapter.key && adapter.saving) continue;
        const raw = localStorage.getItem(key);
        if (raw) rows.push({ id: key, key, raw });
      }
    }
    return rows;
  }
  function refreshNotice() {
    try {
      const rows = scan();
      get('pendingRecoveryNotice').hidden = rows.length === 0;
      get('pendingRecoveryMessage').textContent = rows.length === 1 ? 'Encontramos una copia pendiente en este navegador. Revisala antes de continuar.' : `Encontramos ${rows.length} copias pendientes en este navegador. Podés revisarlas una por una.`;
    } catch {
      get('pendingRecoveryNotice').hidden = false;
      get('pendingRecoveryMessage').textContent = 'No se pudo revisar el almacenamiento de este navegador. Conservá esta ventana abierta.';
    }
  }
  async function request(path, body) {
    const response = await window.fetch(`/api/recovery/${path}`, body === undefined ? { cache: 'no-store' } : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    let data;
    try { data = await response.json(); } catch { throw new Error('No se pudo leer la respuesta del host. La copia sigue protegida; volvé a intentar.'); }
    if (!response.ok) throw new Error(response.status >= 500 ? 'No se pudo completar la revisión. La copia sigue protegida; volvé a intentar.' : data.error || 'No se pudo completar la revisión.');
    return data;
  }
  function failure(error) {
    feedback(error instanceof TypeError ? 'No se pudo conectar con el host. La copia sigue protegida; reintentá cuando vuelva la conexión.' : error.message, true);
  }
  function protect() {
    if (adapter.saving) throw new Error('Esperá a que termine el guardado de esta ventana.');
    if (!adapter.protect()) throw new Error('No se pudo proteger la copia de esta ventana. No cierres ni recargues la página.');
  }
  function freshCopy() {
    if (copy?.key && localStorage.getItem(copy.key) !== copy.raw) throw new Error('La copia cambió en otra ventana. Volvé a seleccionarla para comparar los datos actuales.');
  }
  function lock(value) {
    busy = value;
    get('closePendingRecovery').disabled = value;
    get('pendingRecoverySelect').disabled = value;
    get('refreshPendingRecovery').disabled = value;
    get('selectAllRecovery').disabled = value;
    get('archiveRecoveryCopy').disabled = value || !copy?.key;
    get('archiveRecoveryCopy').textContent = plan?.recoverable === 0 ? 'Finalizar revisión' : 'Archivar copia';
    get('downloadRecoveryCopy').disabled = value || !copy;
    get('applyRecovery').disabled = value || !plan || selected.size === 0;
    get('recoveryItems').querySelectorAll('input').forEach(input => { input.disabled = value; });
  }
  const fields = {
    date: 'Fecha', time: 'Hora', barber: 'Barbero', service: 'Servicio', product: 'Producto', name: 'Nombre',
    amount: 'Importe', total: 'Total', quantity: 'Cantidad', unitPrice: 'Precio unitario', tip: 'Propina', payment: 'Medio',
    cashAmount: 'Efectivo', mpAmount: 'Mercado Pago', commissionRate: 'Comisión (%)', commissionAmount: 'Comisión',
    initialCash: 'Efectivo inicial', initialMp: 'MP inicial', realCash: 'Efectivo real', realMp: 'MP real',
    withdrawal: 'Retiro efectivo', withdrawalMp: 'Retiro MP', paidAmount: 'Pago registrado', status: 'Estado del pago',
    reason: 'Motivo', notes: 'Notas', description: 'Descripción', type: 'Movimiento', cost: 'Costo', active: 'Activo', price: 'Precio', salePrice: 'Precio de venta',
    initialStock: 'Stock inicial', unitCost: 'Costo por unidad', initialUnitCost: 'Costo inicial', saleEnabled: 'Venta habilitada', stockEnabled: 'Control de stock', unit: 'Unidad', startDate: 'Inicio de stock', opened: 'Jornada iniciada', from: 'Origen', to: 'Destino', previous: 'Saldo anterior', current: 'Saldo ajustado', cancelled: 'Anulado',
  };
  function values(row) {
    if (!row) return '<p class="recovery-empty-value">No figura en los datos guardados.</p>';
    return `<dl>${Object.entries(fields).filter(([key]) => row[key] !== undefined && row[key] !== '').map(([key, label]) => {
      const moneyFields = ['amount', 'total', 'unitPrice', 'tip', 'cashAmount', 'mpAmount', 'commissionAmount', 'initialCash', 'initialMp', 'realCash', 'realMp', 'withdrawal', 'withdrawalMp', 'paidAmount', 'cost', 'price', 'salePrice', 'unitCost', 'initialUnitCost', 'previous', 'current'];
      const value = typeof row[key] === 'boolean' ? row[key] ? 'Sí' : 'No' : ['date', 'startDate'].includes(key) ? dateLabel(row[key]) : moneyFields.includes(key) ? currency(row[key]) : row[key];
      return `<div><dt>${label}</dt><dd>${escape(value)}</dd></div>`;
    }).join('')}</dl>`;
  }
  function selectionSummary() {
    const rows = plan ? plan.items.filter(row => selected.has(row.key)) : [];
    const count = path => rows.filter(row => row.path === path).length;
    const collected = rows.filter(row => ['entries', 'sales'].includes(row.path)).reduce((sum, row) => sum + (row.incoming.total ?? row.incoming.amount + (row.incoming.tip || 0)), 0);
    get('recoverySummary').innerHTML = rows.length ? [
      [count('entries'), 'Cortes'], [count('sales'), 'Ventas'], [count('advances'), 'Adelantos'], [currency(collected), 'Cobrado a incorporar'],
    ].map(([value, label]) => `<div><span>${label}</span><strong>${escape(value)}</strong></div>`).join('') : '';
    get('recoverySelectedCount').textContent = `${selected.size} datos seleccionados`;
    const eligible = plan?.items.filter(row => row.status === 'missing') || [];
    get('selectAllRecovery').checked = Boolean(eligible.length && selected.size === eligible.length);
    get('selectAllRecovery').indeterminate = selected.size > 0 && selected.size < eligible.length;
    get('applyRecovery').disabled = busy || !selected.size;
    get('applyRecovery').textContent = selected.size ? `Recuperar ${selected.size} datos` : 'Recuperar seleccionados';
  }
  function render() {
    get('recoveryWarnings').innerHTML = plan.warnings.map(warning => `<p>${escape(warning)}</p>`).join('');
    get('recoverySelectionBar').hidden = !plan.recoverable;
    const groups = new Map();
    for (const row of plan.items) {
      const group = row.date || '';
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push(row);
    }
    get('recoveryItems').innerHTML = groups.size ? [...groups].sort(([a], [b]) => b.localeCompare(a)).map(([date, rows]) => `<section class="recovery-group"><h3>${escape(dateLabel(date))}</h3>${rows.map(row => {
      const index = plan.items.indexOf(row);
      const missing = row.status === 'missing';
      return `<article class="recovery-row ${missing ? '' : 'recovery-row-conflict'}"><div class="recovery-row-heading">${missing ? `<input type="checkbox" data-recovery-index="${index}" aria-label="Recuperar ${escape(row.label)} ${escape(row.detail)} ${escape(row.incoming.time || '')}" ${selected.has(row.key) ? 'checked' : ''}>` : '<span class="recovery-preserved-icon" aria-hidden="true">✓</span>'}<div><strong>${escape(row.label)}${row.detail ? ` · ${escape(row.detail)}` : ''}</strong><small>${escape(row.incoming.time || '')}${row.amount !== null ? ` · ${escape(currency(row.amount))}` : ''}</small></div><span class="recovery-badge">${escape(row.reason)}</span></div><details><summary>Ver datos y comparar</summary><div class="recovery-comparison"><div><h4>Guardado</h4>${values(row.current)}</div><div><h4>En la copia</h4>${values(row.incoming)}</div></div></details></article>`;
    }).join('')}</section>`).join('') : '<p class="recovery-empty">Esta copia ya coincide con los datos guardados. Podés archivarla para retirar el aviso.</p>';
    selectionSummary();
  }
  function copyLabel(value, index) {
    try {
      const state = JSON.parse(value.raw).state;
      const latest = [...Object.keys(state.cashRegisters || {}), ...(state.entries || []).map(row => row.date)].filter(Boolean).sort().at(-1);
      return `${value.historyId ? 'Copia revisada' : `Copia ${index + 1}`} · datos hasta ${dateLabel(latest || '')}`;
    } catch { return `Copia ${index + 1} · necesita revisión`; }
  }
  function populateCopies(preferred) {
    copies = scan();
    get('pendingRecoverySelect').innerHTML = copies.map((value, index) => `<option value="${escape(value.id)}">${escape(copyLabel(value, index))}</option>`).join('') || '<option value="">Sin copias pendientes</option>';
    if (copies.some(value => value.id === preferred)) get('pendingRecoverySelect').value = preferred;
  }
  async function history() {
    try {
      const data = await request('history');
      get('recoveryHistoryItems').innerHTML = data.items.length ? data.items.map(row => `<article><span>${escape(new Date(row.createdAt).toLocaleString('es-AR'))} · ${row.summary.action === 'recovered' ? 'Recuperación' : 'Copia archivada'}</span><div><button class="secondary-btn compact-btn" type="button" data-history-review="${escape(row.id)}">Revisar copia</button><button class="secondary-btn compact-btn" type="button" data-history-download="${escape(row.id)}">Descargar respaldo</button></div></article>`).join('') : '<p>Todavía no hay copias revisadas.</p>';
    } catch { get('recoveryHistoryItems').textContent = 'No se pudo cargar el historial. Las copias locales siguen disponibles.'; }
  }
  async function preview(message = '') {
    const token = ++generation;
    plan = null; selected = new Set(); attempt = null;
    copy = copies.find(value => value.id === get('pendingRecoverySelect').value) || null;
    get('recoveryItems').innerHTML = ''; get('recoverySummary').innerHTML = ''; get('recoveryWarnings').innerHTML = ''; get('recoverySelectionBar').hidden = true;
    if (!copy) { feedback(message || 'No hay copias pendientes en este navegador. Podés revisar los respaldos del historial.'); lock(false); return; }
    lock(true); feedback('Comparando con los datos guardados…');
    try {
      const data = await request('preview', { raw: copy.raw });
      if (token !== generation) return;
      freshCopy(); plan = data;
      selected = new Set(data.items.filter(row => row.status === 'missing').map(row => row.key));
      render();
      feedback(message || (data.recoverable ? 'Revisá los datos que faltan. Al recuperar se creará un respaldo y se conservarán los registros actuales.' : 'No hay datos nuevos para agregar. Las diferencias se muestran abajo y se mantiene lo guardado.'));
    } catch (error) { if (token === generation) failure(error); }
    finally { if (token === generation) lock(false); }
  }
  async function open(preferred) {
    try {
      protect(); populateCopies(preferred); dialog.showModal();
      await Promise.all([preview(), history()]);
    } catch (error) { window.alert(error.message); }
  }
  function download(raw, name) {
    const blob = new Blob([raw], { type: 'application/json' });
    const url = URL.createObjectURL ? URL.createObjectURL(blob) : `data:application/json;charset=utf-8,${encodeURIComponent(raw)}`;
    const link = document.createElement('a'); link.href = url; link.download = name;
    document.body.append(link); link.click(); link.remove();
    if (URL.createObjectURL && URL.revokeObjectURL) window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  async function apply(archive = false) {
    if (busy || !copy || !archive && (!plan || !selected.size)) return;
    if (archive && !confirm('Esta copia se guardará en el historial y se retirará el aviso. Los datos que no recuperaste no se agregarán a la jornada. ¿Archivar copia?')) return;
    try {
      freshCopy(); protect();
      lock(true); feedback(archive ? 'Guardando la copia en el historial…' : 'Creando respaldo y recuperando los datos seleccionados…');
      if (archive && !plan) {
        const response = await window.fetch('/api/state', { cache: 'no-store' });
        if (!response.ok) throw new Error('No se pudo leer la base. La copia local sigue protegida.');
        const stored = await response.json(); plan = { revision: stored.revision };
      }
      const fingerprint = JSON.stringify([archive, copy.raw, plan.revision, [...selected].sort()]);
      if (attempt?.fingerprint !== fingerprint) attempt = { fingerprint, requestId: crypto.randomUUID() };
      const stored = await request(archive ? 'archive' : 'apply', { raw: copy.raw, revision: plan.revision, selected: archive ? [] : [...selected], requestId: attempt.requestId });
      if (stored.backupId !== attempt.requestId || !Number.isSafeInteger(stored.revision) || stored.revision < plan.revision + Number(!archive) || !stored.state) throw new Error('La respuesta no confirmó la recuperación. Conservá la copia y volvé a revisar.');
      // Archiving an unrelated copy must not replace this window's unsaved
      // working state (or reset unsubmitted closing fields).
      if (!archive || copy.key === adapter.key) adapter.accept(stored);
      let message = 'Datos recuperados. Se creó un respaldo antes del cambio. Podés archivar la copia cuando termines de revisarla.';
      if (archive) {
        freshCopy();
        localStorage.removeItem(copy.key);
        message = 'Copia archivada con respaldo. Los datos guardados se conservaron.';
        populateCopies();
      }
      await Promise.all([preview(message), history()]); refreshNotice();
    } catch (error) { failure(error); }
    finally { lock(false); }
  }
  get('recoveryItems').addEventListener('change', event => {
    const input = event.target.closest('[data-recovery-index]');
    if (!input || busy || !plan) return;
    const row = plan.items[Number(input.dataset.recoveryIndex)];
    const byKey = new Map(plan.items.map(item => [item.key, item]));
    if (input.checked) {
      const add = key => { if (selected.has(key)) return; selected.add(key); byKey.get(key).requires.forEach(add); };
      add(row.key);
    } else {
      selected.delete(row.key);
      let changed;
      do {
        changed = false;
        for (const key of [...selected]) if (byKey.get(key).requires.some(required => !selected.has(required))) { selected.delete(key); changed = true; }
      } while (changed);
    }
    attempt = null; render();
  });
  get('selectAllRecovery').addEventListener('change', event => {
    if (!plan || busy) return;
    selected = new Set(event.target.checked ? plan.items.filter(row => row.status === 'missing').map(row => row.key) : []);
    attempt = null; render();
  });
  get('recoveryHistoryItems').addEventListener('click', async event => {
    const button = event.target.closest('[data-history-review], [data-history-download]');
    if (!button || busy) return;
    try {
      const id = button.dataset.historyReview || button.dataset.historyDownload;
      const data = await request(`history/${encodeURIComponent(id)}`);
      if (button.dataset.historyDownload) download(JSON.stringify(data, null, 2), 'theluxe-respaldo-recuperacion.json');
      else {
        const value = { id: `history:${id}`, key: null, raw: data.pendingRaw, historyId: id };
        copies = copies.filter(row => row.id !== value.id); copies.push(value);
        const option = document.createElement('option'); option.value = value.id; option.textContent = copyLabel(value, copies.length - 1);
        const previous = [...get('pendingRecoverySelect').options].find(option => option.value === value.id); previous?.remove();
        get('pendingRecoverySelect').append(option); get('pendingRecoverySelect').value = value.id;
        await preview();
      }
    } catch (error) { failure(error); }
  });
  get('pendingRecoverySelect').addEventListener('change', () => { void preview(); });
  get('refreshPendingRecovery').addEventListener('click', () => {
    if (busy) return;
    try { const preferred = copy?.id; populateCopies(preferred); void preview(); } catch (error) { failure(error); }
  });
  get('openPendingRecovery').addEventListener('click', () => { void open(); });
  get('reviewConflictingPending').addEventListener('click', () => { void open(adapter.key); });
  get('reviewPendingFromConfig').addEventListener('click', () => { void open(); });
  get('closePendingRecovery').addEventListener('click', () => { if (!busy) dialog.close(); });
  dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  get('downloadRecoveryCopy').addEventListener('click', () => { if (copy) download(copy.raw, 'theluxe-copia-pendiente.json'); });
  get('archiveRecoveryCopy').addEventListener('click', () => { void apply(true); });
  get('applyRecovery').addEventListener('click', () => { void apply(); });
  window.addEventListener('storage', refreshNotice);
  window.addEventListener('focus', refreshNotice);
  window.addEventListener('theluxe-persistence', () => queueMicrotask(refreshNotice));
  refreshNotice();
})();
