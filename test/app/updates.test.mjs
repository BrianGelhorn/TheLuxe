import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../support/app.mjs';

test('UPD-001 - Avisa solo cuando el despliegue tiene una versión distinta', async (t) => {
  const app = createApp(t);
  assert.equal(app.element('configUpdateStatus').hidden, true);
  const meta = app.window.document.createElement('meta');
  meta.name = 'theluxe-build';
  meta.content = 'a'.repeat(64);
  app.window.document.head.append(meta);
  let requested;
  app.window.fetch = async (url, options) => {
    requested = { url, options };
    return { ok: true, json: async () => ({ version: 'a'.repeat(64) }) };
  };
  await app.run('checkForUpdates()');
  assert.equal(app.element('updateNotice').hidden, true);
  assert.equal(app.element('configApplyUpdate').hidden, true);
  assert.equal(app.element('configUpdateStatus').hidden, true);
  app.window.fetch = async () => ({ ok: true, json: async () => ({ version: 'b'.repeat(64) }) });
  await app.run('checkForUpdates()');
  assert.equal(app.element('updateNotice').hidden, false);
  assert.equal(app.element('configApplyUpdate').hidden, false);
  assert.match(requested.url, /^version\.json\?t=/);
  assert.equal(requested.options.cache, 'no-store');
  app.confirm(false);
  app.click('#reloadUpdate');
  assert.match(app.confirmations[0], /Guardá o cerrá antes los formularios/);
  assert.equal(app.element('updateNotice').hidden, false);
  app.window.fetch = async () => ({ ok: true, json: async () => ({ version: 'a'.repeat(64) }) });
  await app.run('checkForUpdates()');
  assert.equal(app.element('updateNotice').hidden, true);
  assert.equal(app.element('configApplyUpdate').hidden, true);
});

test('UPD-003 - Configuración permite buscar y actualizar solo cuando hay una versión nueva', async (t) => {
  const app = createApp(t);
  const meta = app.window.document.createElement('meta');
  meta.name = 'theluxe-build';
  meta.content = 'a'.repeat(64);
  app.window.document.head.append(meta);
  let available = true;
  app.window.fetch = async (url) => ({ ok: true, json: async () => url.startsWith('version.json') ? { version: 'a'.repeat(64) } : { available } });
  app.click('#checkUpdates');
  await new Promise((resolve) => app.window.setTimeout(resolve, 0));
  assert.equal(app.element('checkUpdates').disabled, false);
  assert.equal(app.element('configApplyUpdate').hidden, false);
  assert.match(app.element('configUpdateStatus').textContent, /nueva versión disponible/);
  app.confirm(false);
  app.click('#configApplyUpdate');
  await new Promise((resolve) => app.window.setTimeout(resolve, 0));
  assert.match(app.confirmations[0], /otras pestañas/);
  available = false;
  app.click('#checkUpdates');
  await new Promise((resolve) => app.window.setTimeout(resolve, 0));
  assert.equal(app.element('configApplyUpdate').hidden, true);
  assert.match(app.element('configUpdateStatus').textContent, /última versión/);
  app.window.fetch = async () => { throw new Error('Sin red'); };
  app.click('#checkUpdates');
  await new Promise((resolve) => app.window.setTimeout(resolve, 0));
  assert.match(app.element('configUpdateStatus').textContent, /actualizador local/);
  app.window.fetch = async (url) => ({ ok: !url.endsWith('/status'), json: async () => url.startsWith('version.json') ? { version: 'a'.repeat(64) } : { error: 'La instalación debe ser una copia limpia de main.' } });
  app.click('#checkUpdates');
  await new Promise((resolve) => app.window.setTimeout(resolve, 0));
  assert.match(app.element('configUpdateStatus').textContent, /copia limpia de main/);
});

test('UPD-006 - Instalar desde main espera Docker y ofrece recargar sin hacerlo automáticamente', async (t) => {
  const app = createApp(t);
  const meta = app.window.document.createElement('meta');
  meta.name = 'theluxe-build';
  meta.content = 'a'.repeat(64);
  app.window.document.head.append(meta);
  let deployed = 'a'.repeat(64);
  let requested;
  app.window.fetch = async (url, options) => {
    if (url.startsWith('version.json')) return { ok: true, json: async () => ({ version: deployed }) };
    if (url.endsWith('/status')) return { ok: true, json: async () => ({ available: deployed === 'a'.repeat(64) }) };
    requested = { url, options };
    deployed = 'b'.repeat(64);
    return { ok: true, json: async () => ({ started: true }) };
  };
  app.click('#checkUpdates');
  await new Promise((resolve) => app.window.setTimeout(resolve, 0));
  app.window.setTimeout = (callback) => { queueMicrotask(callback); return 1; };
  await app.run('applyUpdate()');
  assert.equal(requested.url, 'http://127.0.0.1:8001/update');
  assert.equal(requested.options.method, 'POST');
  assert.equal(app.element('configApplyUpdate').textContent, 'Recargar');
  assert.match(app.element('configUpdateStatus').textContent, /instalada/);
  assert.equal(app.confirmations.length, 1);
});

test('UPD - No anuncia la versión mientras el host todavía está verificando o revierte', async (t) => {
  const app = createApp(t, { buildVersion: 'a'.repeat(64) });
  let installed = false;
  let statusReads = 0;
  app.window.fetch = async (url) => {
    if (url.startsWith('version.json')) return { ok: true, json: async () => ({ version: installed ? 'b'.repeat(64) : 'a'.repeat(64) }) };
    if (url.endsWith('/update')) { installed = true; return { ok: true, json: async () => ({ started: true }) }; }
    return { ok: true, json: async () => !installed ? { available: true } : ++statusReads === 1 ? { busy: true, phase: 'Comprobando' } : { available: true, error: 'Se restauró la versión anterior' } };
  };
  app.click('#checkUpdates');
  await new Promise((resolve) => app.window.setTimeout(resolve, 0));
  app.window.setTimeout = (callback) => { queueMicrotask(callback); return 1; };
  await app.run('applyUpdate()');
  assert.match(app.element('configUpdateStatus').textContent, /Se restauró la versión anterior/);
  assert.equal(app.element('updateNotice').hidden, true);
});

test('UPD - Bloquea la actualización si hay un formulario abierto', async (t) => {
  const app = createApp(t);
  app.run('mainUpdateAvailable = true');
  app.element('commissionDialog').showModal();
  await app.run('applyUpdate()');
  assert.match(app.alerts.at(-1), /Cerrá los formularios/);
  assert.equal(app.confirmations.length, 0);
});

test('UPD - Muestra el resultado de la verificación del respaldo', async (t) => {
  const app = createApp(t);
  app.window.fetch = async () => ({ ok: true, json: async () => ({ found: true, valid: true, modified: Date.parse('2026-10-02T15:00:00Z') }) });
  app.click('#checkBackup');
  await app.settle();
  assert.match(app.element('configUpdateStatus').textContent, /Última copia automática verificada/);
  app.window.fetch = async () => ({ ok: true, json: async () => ({ found: true, valid: false, modified: 1 }) });
  app.click('#checkBackup');
  await app.settle();
  assert.match(app.element('configUpdateStatus').textContent, /no pasó la verificación/);
});

test('UPD - Detecta otra pestaña de la misma versión antes de actualizar', async (t) => {
  const channels = new Map();
  class FakeChannel {
    constructor(name) { this.name = name; if (!channels.has(name)) channels.set(name, new Set()); channels.get(name).add(this); }
    postMessage(data) { for (const peer of channels.get(this.name)) if (peer !== this) queueMicrotask(() => peer.onmessage?.({ data })); }
    close() { channels.get(this.name).delete(this); }
  }
  const app = createApp(t, { broadcastChannel: FakeChannel });
  createApp(t, { broadcastChannel: FakeChannel });
  app.run('mainUpdateAvailable = true');
  await app.run('applyUpdate()');
  assert.match(app.alerts.at(-1), /otra pestaña/);
  assert.equal(app.confirmations.length, 0);
});

test('UPD-002 - Sin conexión o respuesta inválida no interrumpe la jornada', async (t) => {
  const app = createApp(t);
  const meta = app.window.document.createElement('meta');
  meta.name = 'theluxe-build';
  meta.content = 'a'.repeat(64);
  app.window.document.head.append(meta);
  app.window.fetch = async () => { throw new Error('Sin red'); };
  await app.run('checkForUpdates()');
  assert.equal(app.element('updateNotice').hidden, true);
  app.window.fetch = async () => ({ ok: true, json: async () => ({ version: 'desconocida' }) });
  await app.run('checkForUpdates()');
  assert.equal(app.element('updateNotice').hidden, true);
});

test('UPD-008 - Muestra error del host y permite reintentar la instalación', async (t) => {
  const app = createApp(t);
  const meta = app.window.document.createElement('meta');
  meta.name = 'theluxe-build';
  meta.content = 'a'.repeat(64);
  app.window.document.head.append(meta);
  app.window.fetch = async (url) => ({ ok: true, json: async () => url.startsWith('version.json') ? { version: 'a'.repeat(64) } : { available: true, error: 'Docker no pudo reiniciar' } });
  app.click('#checkUpdates');
  await new Promise((resolve) => app.window.setTimeout(resolve, 0));
  assert.match(app.element('configUpdateStatus').textContent, /Docker no pudo reiniciar/);
  assert.equal(app.element('configApplyUpdate').hidden, false);
});

test('UPD-009 - Una actualización sin cambios web termina sin pedir recarga', async (t) => {
  const app = createApp(t);
  const meta = app.window.document.createElement('meta');
  meta.name = 'theluxe-build';
  meta.content = 'a'.repeat(64);
  app.window.document.head.append(meta);
  let started = false;
  let checks = 0;
  app.window.fetch = async (url) => {
    if (url.startsWith('version.json')) return { ok: true, json: async () => ({ version: 'a'.repeat(64) }) };
    if (url.endsWith('/update')) { started = true; return { ok: true, json: async () => ({ started: true }) }; }
    return { ok: true, json: async () => started ? ++checks === 1 ? { busy: true, phase: 'Preparando contenedor' } : { available: false } : { available: true } };
  };
  app.click('#checkUpdates');
  await new Promise((resolve) => app.window.setTimeout(resolve, 0));
  app.window.setTimeout = (callback) => { queueMicrotask(callback); return 1; };
  await app.run('applyUpdate()');
  assert.match(app.element('configUpdateStatus').textContent, /cerrá y volvé a abrir The Luxe/);
  assert.equal(app.element('configApplyUpdate').hidden, true);
});

test('UPD-010 - Fallo al instalar queda visible sin recargar la sesión', async (t) => {
  const app = createApp(t);
  const meta = app.window.document.createElement('meta');
  meta.name = 'theluxe-build';
  meta.content = 'a'.repeat(64);
  app.window.document.head.append(meta);
  app.window.fetch = async (url) => ({ ok: true, json: async () => url.startsWith('version.json') ? { version: 'a'.repeat(64) } : url.endsWith('/status') ? { available: true } : { started: false, error: 'Docker detenido' } });
  app.click('#checkUpdates');
  await new Promise((resolve) => app.window.setTimeout(resolve, 0));
  await app.run('applyUpdate()');
  assert.match(app.element('configUpdateStatus').textContent, /Docker detenido/);
  assert.equal(app.element('configApplyUpdate').disabled, false);
});

test('UPD-011 - Al volver a la pestaña busca la versión desplegada', async (t) => {
  const app = createApp(t, { buildVersion: 'a'.repeat(64) });
  app.window.fetch = async () => ({ ok: true, json: async () => ({ version: 'b'.repeat(64) }) });
  app.emit(app.window, 'focus');
  await new Promise((resolve) => app.window.setTimeout(resolve, 0));
  assert.equal(app.element('updateNotice').hidden, false);
});

test('UPD-013 - el host no anuncia éxito si Docker sigue sirviendo la versión anterior', async (t) => {
  const app = createApp(t);
  const meta = app.window.document.createElement('meta');
  meta.name = 'theluxe-build';
  meta.content = 'a'.repeat(64);
  app.window.document.head.append(meta);
  app.window.fetch = async (url) => ({ ok: true, json: async () => url.startsWith('version.json')
    ? { version: 'a'.repeat(64) } : url.endsWith('/status') ? { available: true } : { started: true } });
  app.click('#checkUpdates');
  await new Promise((resolve) => app.window.setTimeout(resolve, 0));
  app.window.setTimeout = (callback) => { queueMicrotask(callback); return 1; };
  await app.run('applyUpdate()');
  assert.match(app.element('configUpdateStatus').textContent, /No se pudo confirmar la nueva versión/);
});
