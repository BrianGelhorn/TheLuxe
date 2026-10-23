import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../support/app.mjs';
import { recoveryFixture, recoveryServer, pendingKey, until } from '../support/recovery.mjs';

async function setup(t, options = {}) {
  const fixture = recoveryFixture();
  const api = await recoveryServer(t, options.current || fixture.current);
  const raw = options.raw ?? JSON.stringify(fixture.pending);
  const app = createApp(t, { clean: false, now: '2026-10-23T12:00:00', storage: { [pendingKey]: raw }, fetch: options.wrap ? options.wrap(api.fetch) : api.fetch });
  await until(() => app.run('stateLoaded'));
  return { app, api, raw, ...fixture };
}
async function open(app) {
  app.click('#openPendingRecovery');
  await until(() => !app.element('applyRecovery').disabled || app.element('recoveryFeedback').classList.contains('error'));
}

test('RECUI-001 - detecta la copia de otra pestaña, permite comparar y recuperar preservando hoy y el cierre', async t => {
  const { app, api, raw, current } = await setup(t);
  assert.equal(app.element('pendingRecoveryNotice').hidden, false);
  assert.deepEqual(app.snapshot('entries'), current.entries);
  assert.equal((await api.request('/api/state')).body.revision, 1);
  await open(app);
  assert.equal(app.element('pendingRecoveryDialog').open, true);
  assert.match(app.element('recoverySummary').textContent, /33\.500/);
  assert.match(app.element('recoveryWarnings').textContent, /cierres/);
  assert.equal(app.element('recoveryItems').querySelectorAll('input:checked').length, 7);
  app.click('#recoveryItems details summary');
  assert.match(app.query('#recoveryItems details').textContent, /Guardado.*En la copia/s);
  app.click('#applyRecovery');
  await until(() => app.run('entries.length') === 4 && !app.element('closePendingRecovery').disabled);
  assert.equal(app.window.localStorage.getItem(pendingKey), raw);
  assert.deepEqual(app.snapshot('cashRegisters'), current.cashRegisters);
  assert.deepEqual(app.snapshot('entries.slice(0, 2)'), current.entries);
  app.element('workday').value = '2026-10-22'; app.emit('#workday', 'change');
  assert.equal(app.element('dailyCount').textContent, '2 cortes');
  assert.equal(app.element('closingStatus').textContent, 'Cierre guardado');
  assert.equal((await api.request('/api/recovery/history')).body.items.length, 1);
  assert.equal(app.element('applyRecovery').disabled, true);
  app.click('#archiveRecoveryCopy');
  await until(() => app.window.localStorage.getItem(pendingKey) === null && app.element('pendingRecoveryNotice').hidden);
  assert.equal(app.element('pendingRecoveryNotice').hidden, true);
  assert.match(app.element('recoveryFeedback').textContent, /archivada/);
  assert.equal((await api.request('/api/state')).body.revision, 2);
  app.click('#closePendingRecovery');
  assert.equal(app.element('pendingRecoveryDialog').open, false);
});

test('RECUI-002 - selección parcial mantiene ventas y stock juntos y conserva los pendientes no elegidos', async t => {
  const { app, api, raw } = await setup(t);
  await open(app);
  [...app.element('recoveryItems').querySelectorAll('.recovery-row')].find(row => row.textContent.includes('Venta · Bebida')).querySelector('input').click();
  assert.equal(app.element('recoveryItems').querySelectorAll('input:checked').length, 5);
  [...app.element('recoveryItems').querySelectorAll('.recovery-row')].find(row => row.textContent.includes('Venta · Bebida')).querySelector('input').click();
  assert.equal(app.element('recoveryItems').querySelectorAll('input:checked').length, 7);
  app.click('#selectAllRecovery');
  assert.equal(app.element('applyRecovery').disabled, true);
  app.click('#selectAllRecovery');
  const cut = [...app.element('recoveryItems').querySelectorAll('.recovery-row')].find(row => row.textContent.includes('Corte · Ana'));
  cut.querySelector('input').click();
  app.click('#applyRecovery');
  await until(() => app.run('entries.length') === 3 && !app.element('closePendingRecovery').disabled);
  const saved = (await api.request('/api/state')).body.state;
  assert.equal(saved.entries.some(row => row.id === 'lost-a'), false);
  assert.equal(saved.barberPayments['2026-10-22'].Ana, undefined);
  assert.equal(saved.sales.length, 1);
  assert.equal(saved.inventory.movements.length, 1);
  assert.equal(app.window.localStorage.getItem(pendingKey), raw);
});

test('RECUI-003 - un cambio de copia o de base exige volver a comparar y no sobrescribe', async t => {
  const { app, api, raw, current } = await setup(t);
  await open(app);
  const changedRaw = JSON.stringify({ ...JSON.parse(raw), revision: 12 });
  app.window.localStorage.setItem(pendingKey, changedRaw);
  app.click('#applyRecovery');
  await until(() => app.element('recoveryFeedback').classList.contains('error'));
  assert.match(app.element('recoveryFeedback').textContent, /copia cambió/);
  assert.equal((await api.request('/api/state')).body.revision, 1);
  app.click('#refreshPendingRecovery');
  await until(() => !app.element('closePendingRecovery').disabled && !app.element('recoveryFeedback').classList.contains('error'));
  const next = structuredClone(current);
  next.entries.push({ ...next.entries[1], id: 'today-2', time: '18:00' });
  await api.request('/api/state', { revision: 1, state: next }, 'PUT');
  app.click('#applyRecovery');
  await until(() => app.element('recoveryFeedback').classList.contains('error'));
  assert.match(app.element('recoveryFeedback').textContent, /base cambió/);
  assert.equal((await api.request('/api/state')).body.state.entries.length, 3);
  app.click('#refreshPendingRecovery');
  await until(() => !app.element('closePendingRecovery').disabled && !app.element('recoveryFeedback').classList.contains('error'));
  app.click('#applyRecovery');
  await until(() => app.run('entries.length') === 5 && !app.element('closePendingRecovery').disabled);
  assert.equal(app.run('entries.some(row => row.id === "today-2")'), true);
});

test('RECUI-004 - un acuse perdido se reintenta sin duplicar ni crear otro respaldo', async t => {
  let calls = 0;
  const ids = [];
  const { app, api, raw } = await setup(t, { wrap: fetch => async (path, options) => {
    const response = await fetch(path, options);
    if (path.endsWith('/apply')) {
      ids.push(JSON.parse(options.body).requestId);
      if (++calls === 1) throw new TypeError('lost acknowledgement');
    }
    return response;
  } });
  await open(app); app.click('#applyRecovery');
  await until(() => app.element('recoveryFeedback').classList.contains('error'));
  assert.equal(app.window.localStorage.getItem(pendingKey), raw);
  app.click('#applyRecovery');
  await until(() => app.run('entries.length') === 4 && !app.element('closePendingRecovery').disabled);
  assert.equal(ids.length, 2); assert.equal(ids[0], ids[1]);
  assert.equal((await api.request('/api/state')).body.revision, 2);
  assert.equal((await api.request('/api/recovery/history')).body.items.length, 1);
});

test('RECUI-005 - copia dañada permite descarga y archivo confirmado, con historial y sin cambiar datos', async t => {
  const { app, api, raw, current } = await setup(t, { raw: '{dañada' });
  await open(app);
  assert.match(app.element('recoveryFeedback').textContent, /no se puede leer/);
  assert.equal(app.element('applyRecovery').disabled, true);
  let downloaded;
  app.window.HTMLAnchorElement.prototype.click = function () { downloaded = this.href; };
  app.click('#downloadRecoveryCopy');
  assert.ok(downloaded.includes(encodeURIComponent(raw)));
  app.confirm(false); app.click('#archiveRecoveryCopy');
  assert.equal(app.window.localStorage.getItem(pendingKey), raw);
  app.confirm(true); app.click('#archiveRecoveryCopy');
  await until(() => app.window.localStorage.getItem(pendingKey) === null && !app.element('closePendingRecovery').disabled && app.element('recoveryFeedback').textContent.includes('archivada'));
  assert.deepEqual((await api.request('/api/state')).body.state, current);
  await until(() => app.element('recoveryHistoryItems').querySelector('[data-history-review]'));
  app.click('[data-history-review]');
  await until(() => app.element('recoveryFeedback').classList.contains('error'));
  assert.equal(app.element('archiveRecoveryCopy').disabled, true);
  app.click('[data-history-download]');
  await until(() => downloaded.includes('pendingRaw'));
});

test('RECUI-006 - la misma pestaña conserva su copia para revisión y los cambios nuevos usan otra clave', async t => {
  const { current, pending } = recoveryFixture();
  const api = await recoveryServer(t, current);
  const key = 'theluxe-pending-state-v1:test-tab';
  const raw = JSON.stringify({ ...pending, revision: 1 });
  const app = createApp(t, { clean: false, now: '2026-10-23T12:00:00', storage: { [key]: raw }, fetch: api.fetch });
  await until(() => app.run('stateLoaded'));
  assert.equal(app.run('stateConflict'), false);
  assert.notEqual(app.run('pendingStateKey'), key);
  assert.equal(app.window.localStorage.getItem(key), raw);
  assert.deepEqual(app.snapshot('entries'), current.entries);
  app.run('config.commission=40; saveConfig()');
  await until(() => !app.run('stateDirty || stateSaving'));
  assert.equal(app.window.localStorage.getItem(key), raw);
  assert.equal((await api.request('/api/state')).body.state.config.commission, 40);
});

test('RECUI-007 - una copia ajena no ejecuta HTML y puede revisarse desde Configuración', async t => {
  const fixture = recoveryFixture();
  fixture.pending.state.entries[1].notes = '<img src=x onerror="alert(1)">';
  const { app } = await setup(t, { raw: JSON.stringify(fixture.pending) });
  app.click('#reviewPendingFromConfig');
  await until(() => !app.element('applyRecovery').disabled);
  assert.equal(app.element('recoveryItems').querySelectorAll('img').length, 0);
  assert.match(app.element('recoveryItems').textContent, /<img src=x/);
});

test('RECUI-008 - un conflicto de la ventana se revisa sin perder su borrador y se puede recuperar desde el historial', async t => {
  const { app, api, pending } = await setup(t, { wrap: fetch => async (path, options) => options?.method === 'PUT'
    ? { ok: false, status: 409, json: async () => ({}) } : fetch(path, options) });
  app.window.localStorage.removeItem(pendingKey);
  app.window.__recoveryCut = structuredClone(pending.state.entries[1]);
  app.run('entries.push(__recoveryCut); save()');
  await until(() => app.run('stateConflict'));
  const key = app.run('pendingStateKey');
  app.click('#reviewConflictingPending');
  await until(() => !app.element('applyRecovery').disabled);
  app.click('#applyRecovery');
  await until(() => !app.run('stateConflict') && !app.element('closePendingRecovery').disabled);
  assert.equal(app.run('entries.some(row=>row.id==="today")'), true);
  assert.equal(app.run('entries.some(row=>row.id==="lost-a")'), true);
  assert.ok(app.window.localStorage.getItem(key));
  await until(() => app.element('recoveryHistoryItems').querySelector('[data-history-review]'));
  app.click('[data-history-review]');
  await until(() => app.element('pendingRecoverySelect').value.startsWith('history:') && app.element('recoveryItems').textContent.includes('ya coincide') && !app.element('closePendingRecovery').disabled);
  assert.equal(app.element('applyRecovery').disabled, true);
  assert.equal(app.element('archiveRecoveryCopy').disabled, true);
  assert.equal((await api.request('/api/recovery/history')).body.items.length, 1);
});

test('RECUI-009 - si otra ventana cambia la copia durante el archivo, conserva el nuevo contenido', async t => {
  let replace;
  const { app, api, raw } = await setup(t, { wrap: fetch => async (path, options) => {
    const response = await fetch(path, options);
    if (path.endsWith('/archive')) replace();
    return response;
  } });
  replace = () => app.window.localStorage.setItem(pendingKey, raw + ' ');
  await open(app); app.click('#archiveRecoveryCopy');
  await until(() => app.element('recoveryFeedback').classList.contains('error'));
  assert.equal(app.window.localStorage.getItem(pendingKey), raw + ' ');
  assert.match(app.element('recoveryFeedback').textContent, /copia cambió/);
  assert.equal((await api.request('/api/recovery/history')).body.items.length, 1);
});

test('RECUI-010 - no confirma una respuesta incompleta y protege la copia para reintentar', async t => {
  let first = true;
  const { app, api, raw } = await setup(t, { wrap: fetch => async (path, options) => {
    const response = await fetch(path, options);
    if (path.endsWith('/apply') && first) {
      first = false;
      return { ok: true, status: 200, json: async () => ({ revision: 1, state: {}, backupId: 'incorrecto' }) };
    }
    return response;
  } });
  await open(app); app.click('#applyRecovery');
  await until(() => app.element('recoveryFeedback').classList.contains('error'));
  assert.match(app.element('recoveryFeedback').textContent, /no confirmó/);
  assert.equal(app.window.localStorage.getItem(pendingKey), raw);
  app.click('#applyRecovery');
  await until(() => app.run('entries.length') === 4 && !app.element('closePendingRecovery').disabled);
  assert.equal((await api.request('/api/recovery/history')).body.items.length, 1);
});

test('RECUI-011 - descargar con ObjectURL conserva la copia y el aviso responde a almacenamiento y foco', async t => {
  const { app, raw } = await setup(t);
  await open(app);
  let revoked, download;
  app.window.URL.createObjectURL = () => 'blob:pending-copy';
  app.window.URL.revokeObjectURL = value => { revoked = value; };
  app.window.HTMLAnchorElement.prototype.click = function () { download = this.href; };
  app.click('#downloadRecoveryCopy'); await app.settle();
  assert.equal(download, 'blob:pending-copy'); assert.equal(revoked, download);
  assert.equal(app.window.localStorage.getItem(pendingKey), raw);
  app.window.localStorage.setItem('theluxe-pending-state-v1:other', raw);
  app.window.dispatchEvent(new app.window.StorageEvent('storage', { key: 'theluxe-pending-state-v1:other' }));
  assert.match(app.element('pendingRecoveryMessage').textContent, /2 copias/);
  app.window.localStorage.removeItem('theluxe-pending-state-v1:other');
  app.window.dispatchEvent(new app.window.Event('focus'));
  assert.match(app.element('pendingRecoveryMessage').textContent, /una copia/);
});

test('RECUI-012 - sin poder proteger el borrador no abre la recuperación ni modifica SQLite', async t => {
  const { app, api } = await setup(t);
  const before = (await api.request('/api/state')).body;
  t.mock.method(app.window.TheLuxePersistence, 'protect', () => false);
  app.click('#openPendingRecovery');
  await app.settle();
  assert.match(app.alerts.at(-1), /No se pudo proteger/);
  assert.equal(app.element('pendingRecoveryDialog').open, false);
  assert.deepEqual((await api.request('/api/state')).body, before);
});

test('RECUI-013 - si el navegador impide leer las copias muestra aviso y conserva la base', async t => {
  const { app, api } = await setup(t);
  const before = (await api.request('/api/state')).body;
  t.mock.method(app.window.Storage.prototype, 'key', () => { throw new Error('Almacenamiento bloqueado'); });
  app.window.dispatchEvent(new app.window.Event('focus'));
  assert.equal(app.element('pendingRecoveryNotice').hidden, false);
  assert.match(app.element('pendingRecoveryMessage').textContent, /No se pudo revisar/);
  app.click('#openPendingRecovery'); await app.settle();
  assert.match(app.alerts.at(-1), /Almacenamiento bloqueado/);
  assert.deepEqual((await api.request('/api/state')).body, before);
});

test('RECUI-014 - respuestas fallidas o ilegibles del host muestran un error claro sin perder la copia', async t => {
  let failure = 'server';
  const { app, api, raw } = await setup(t, { wrap: fetch => async (path, options) => {
    if (path.endsWith('/preview') && failure) return failure === 'server'
      ? { ok: false, status: 500, json: async () => ({ error: 'Request failed' }) }
      : { ok: false, status: 502, json: async () => { throw new SyntaxError('bad response'); } };
    return fetch(path, options);
  } });
  await open(app);
  assert.match(app.element('recoveryFeedback').textContent, /No se pudo completar/);
  failure = 'json'; app.click('#refreshPendingRecovery');
  await until(() => app.element('recoveryFeedback').textContent.includes('leer la respuesta'));
  failure = ''; app.click('#refreshPendingRecovery');
  await until(() => !app.element('applyRecovery').disabled);
  assert.equal(app.window.localStorage.getItem(pendingKey), raw);
  assert.equal((await api.request('/api/state')).body.revision, 1);
});

test('RECUI-015 - archivar otra copia conserva los cambios sin guardar de la ventana actual', async t => {
  const { app, api } = await setup(t, { wrap: fetch => async (path, options) => options?.method === 'PUT'
    ? { ok: false, status: 503, json: async () => ({}) } : fetch(path, options) });
  app.run('entries.push({ ...entries[1], id: "today-unsaved", time: "18:30" }); save()');
  await until(() => app.run('stateDirty && !stateSaving') && !app.element('retryPersistence').hidden);
  const ownKey = app.run('pendingStateKey');
  const ownRaw = app.window.localStorage.getItem(ownKey);
  await open(app);
  assert.equal(app.element('pendingRecoverySelect').value, pendingKey);
  app.click('#archiveRecoveryCopy');
  await until(() => app.window.localStorage.getItem(pendingKey) === null && !app.element('closePendingRecovery').disabled);
  assert.equal(app.run('entries.some(row => row.id === "today-unsaved")'), true);
  assert.equal(app.run('stateDirty'), true);
  assert.equal(app.window.localStorage.getItem(ownKey), ownRaw);
  assert.equal((await api.request('/api/state')).body.state.entries.length, 2);
});
