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
  assert.match(app.confirmations[0], /No se perderán las ventas/);
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
  assert.match(app.element('configUpdateStatus').textContent, /GitHub main/);
  app.confirm(false);
  app.click('#configApplyUpdate');
  assert.match(app.confirmations[0], /datos financieros confirmados permanecen guardados/);
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
    if (url.endsWith('/status')) return { ok: true, json: async () => ({ available: true }) };
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
  assert.match(app.element('configUpdateStatus').textContent, /No hubo cambios/);
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
  assert.match(app.element('configUpdateStatus').textContent, /Docker no está sirviendo la actualización/);
});
