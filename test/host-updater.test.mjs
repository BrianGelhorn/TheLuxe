import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync, backup as sqliteBackup } from 'node:sqlite';
import { createUpdater, createUpdateServer } from '../host-updater.mjs';

const backup = async () => ({ path: 'C:/theluxe-backup.sqlite', revision: 1 });
const revision = async () => 1;

test('UPD-004 - Descarga solo main limpio, reconstruye Docker y espera versión servida', async () => {
  const old = 'a'.repeat(40);
  const latest = 'b'.repeat(40);
  let deployed = old;
  let head = old;
  let dirty = '';
  const calls = [];
  const run = async (program, args) => {
    calls.push([program, ...args].join(' '));
    if (args[0] === 'branch') return 'main';
    if (args[0] === 'remote') return 'https://github.com/BrianGelhorn/TheLuxe';
    if (args[0] === 'status') return dirty;
    if (args[0] === 'ls-remote') return `${latest}\trefs/heads/main`;
    if (args[0] === 'fetch' || args[0] === 'merge-base') return '';
    if (args[0] === 'rev-parse') return args[1] === 'FETCH_HEAD' ? latest : head;
    if (args[0] === 'merge') { head = latest; return ''; }
    if (program === 'docker' && args.includes('up')) deployed = latest;
    return '';
  };
  const updater = createUpdater({ run, installed: async () => ({ version: 'c'.repeat(64), commit: deployed }), healthy: async () => true, backup, revision });
  dirty = ' M script.js';
  await assert.rejects(updater.status(), /copia limpia/);
  dirty = '';
  assert.equal((await updater.status()).available, true);
  assert.deepEqual(await updater.update(), { started: true });
  for (let attempt = 0; attempt < 30 && (await updater.status()).busy; attempt++) await new Promise((resolve) => setTimeout(resolve, 1));
  assert.equal((await updater.status()).available, false);
  assert.ok(calls.includes(`docker compose -f compose.yaml build --build-arg SOURCE_COMMIT=${latest} api web`));
  assert.ok(calls.includes('docker compose -f compose.yaml stop web'));
  assert.ok(calls.includes('docker compose -f compose.yaml up -d --no-deps api'));
  assert.ok(calls.includes('docker compose -f compose.yaml up -d --no-deps web'));
});

test('UPD-005 - Solo la app local puede solicitar una actualización al servicio', async (t) => {
  const server = createUpdateServer({ status: async () => ({ available: true }), update: async () => ({ started: true }) });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}`;
  const origin = 'http://127.0.0.1:8000';
  const status = await fetch(`${url}/status`, { headers: { Origin: origin } });
  assert.equal(status.status, 200);
  assert.equal(status.headers.get('Access-Control-Allow-Origin'), origin);
  assert.equal((await fetch(`${url}/update`, { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
  assert.equal((await fetch(`${url}/update`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{}' })).status, 202);
});

test('UPD-007 - Si falla el reinicio intenta restaurar la imagen anterior', async () => {
  const old = 'a'.repeat(40);
  const latest = 'b'.repeat(40);
  let head = old;
  let restarted = false;
  const calls = [];
  const run = async (program, args) => {
    calls.push([program, ...args].join(' '));
    if (args[0] === 'branch') return 'main';
    if (args[0] === 'remote') return 'https://github.com/BrianGelhorn/TheLuxe';
    if (args[0] === 'status') return '';
    if (args[0] === 'ls-remote') return `${latest}\trefs/heads/main`;
    if (args[0] === 'rev-parse') return args[1] === 'FETCH_HEAD' ? latest : head;
    if (args[0] === 'merge') head = latest;
    if (program === 'docker' && args.includes('up') && !restarted) { restarted = true; throw new Error('Docker no pudo reiniciar'); }
    return '';
  };
  const updater = createUpdater({ run, installed: async () => ({ version: 'c'.repeat(64), commit: old }), healthy: async () => true, backup, revision });
  assert.equal((await updater.update()).started, true);
  for (let attempt = 0; attempt < 30 && (await updater.status()).busy; attempt++) await new Promise((resolve) => setTimeout(resolve, 1));
  const state = await updater.status();
  assert.equal(state.available, true);
  assert.match(state.error, /Se restauró la versión anterior/);
  assert.ok(calls.includes('docker tag theluxe-rollback theluxe-local'));
  assert.ok(calls.includes('docker tag theluxe-api-rollback theluxe-api-local'));
  assert.ok(calls.indexOf('docker compose -f compose.yaml stop api') < calls.indexOf('docker compose -f compose.yaml cp C:/theluxe-backup.sqlite api:/data/theluxe.sqlite'));
  assert.ok(calls.includes('docker compose -f compose.yaml cp C:/theluxe-backup.sqlite api:/data/theluxe.sqlite'));
});

test('UPD-012 - No da por instalada la actualización hasta que la API esté sana', async () => {
  const old = 'a'.repeat(40), latest = 'b'.repeat(40);
  let head = old, deployed = old, checked = 0;
  const run = async (program, args) => {
    if (args[0] === 'branch') return 'main';
    if (args[0] === 'remote') return 'https://github.com/BrianGelhorn/TheLuxe';
    if (args[0] === 'status') return '';
    if (args[0] === 'ls-remote') return `${latest}\trefs/heads/main`;
    if (args[0] === 'rev-parse') return args[1] === 'FETCH_HEAD' ? latest : head;
    if (args[0] === 'merge') head = latest;
    if (program === 'docker' && args.includes('up')) deployed = latest;
    return '';
  };
  const updater = createUpdater({ run, installed: async () => ({ version: 'c'.repeat(64), commit: deployed }), healthy: async () => ++checked > 1, backup, revision });
  assert.equal((await updater.update()).started, true);
  for (let attempt = 0; attempt < 50 && (await updater.status()).busy; attempt++) await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal((await updater.status()).available, false);
  assert.ok(checked >= 2);
});

test('UPD-013 - Si la base cambió tras el respaldo no pisa operaciones nuevas', async () => {
  const old = 'a'.repeat(40), latest = 'b'.repeat(40);
  let head = old, deployed = old, restarted = false, reads = 0;
  const calls = [];
  const run = async (program, args) => {
    calls.push([program, ...args].join(' '));
    if (args[0] === 'branch') return 'main';
    if (args[0] === 'remote') return 'https://github.com/BrianGelhorn/TheLuxe';
    if (args[0] === 'status') return '';
    if (args[0] === 'ls-remote') return `${latest}\trefs/heads/main`;
    if (args[0] === 'rev-parse') return args[1] === 'FETCH_HEAD' ? latest : head;
    if (args[0] === 'merge') head = latest;
    if (program === 'docker' && args.includes('up') && args.includes('web') && !restarted) { restarted = true; throw new Error('No se pudo iniciar web'); }
    if (program === 'docker' && args.includes('up') && args.includes('web')) deployed = old;
    return '';
  };
  const updater = createUpdater({ run, installed: async () => ({ version: 'c'.repeat(64), commit: deployed }), healthy: async () => true, backup, revision: async () => { reads++; if (reads === 2) assert.ok(calls.includes('docker compose -f compose.yaml stop api')); return reads === 1 ? 1 : 2; } });
  assert.equal((await updater.update()).started, true);
  for (let attempt = 0; attempt < 30 && (await updater.status()).busy; attempt++) await new Promise((resolve) => setTimeout(resolve, 1));
  const state = await updater.status();
  assert.match(state.error, /La base cambió: no se sobrescribió/);
  assert.equal(calls.some((call) => call.includes('cp C:/theluxe-backup.sqlite api:/data/theluxe.sqlite')), false);
  assert.equal(state.available, true);
});

test('UPD-014 - Sin respaldo no detiene la web ni intenta instalar', async () => {
  const old = 'a'.repeat(40), latest = 'b'.repeat(40);
  let head = old;
  const calls = [];
  const run = async (program, args) => {
    calls.push([program, ...args].join(' '));
    if (args[0] === 'branch') return 'main';
    if (args[0] === 'remote') return 'https://github.com/BrianGelhorn/TheLuxe';
    if (args[0] === 'status') return '';
    if (args[0] === 'ls-remote') return `${latest}\trefs/heads/main`;
    if (args[0] === 'rev-parse') return args[1] === 'FETCH_HEAD' ? latest : head;
    if (args[0] === 'merge') head = latest;
    return '';
  };
  const updater = createUpdater({ run, installed: async () => ({ version: 'c'.repeat(64), commit: old }), healthy: async () => true, backup: async () => { throw new Error('Sin espacio para respaldo'); }, revision });
  assert.equal((await updater.update()).started, true);
  for (let attempt = 0; attempt < 30 && (await updater.status()).busy; attempt++) await new Promise((resolve) => setTimeout(resolve, 1));
  assert.match((await updater.status()).error, /Sin espacio para respaldo/);
  assert.equal(calls.some((call) => call.includes('stop web') || call.includes('up -d')), false);
  assert.ok(calls.includes('docker tag theluxe-rollback theluxe-local'));
  assert.ok(calls.includes('docker tag theluxe-api-rollback theluxe-api-local'));
});

test('UPD-015 - La copia caliente de SQLite conserva la revisión previa a cambios posteriores', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'theluxe-backup-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const source = new DatabaseSync(join(directory, 'live.sqlite'));
  source.exec('CREATE TABLE api_state (id INTEGER PRIMARY KEY, revision INTEGER NOT NULL, state TEXT NOT NULL)');
  source.prepare('INSERT INTO api_state VALUES (1, 1, ?)').run('{"entries":[]}');
  const copy = join(directory, 'previous.sqlite');
  const reader = new DatabaseSync(join(directory, 'live.sqlite'), { readOnly: true });
  try { await sqliteBackup(reader, copy); } finally { reader.close(); }
  source.prepare('UPDATE api_state SET revision=2 WHERE id=1').run();
  source.close();
  const previous = new DatabaseSync(copy, { readOnly: true });
  try {
    assert.equal(previous.prepare('PRAGMA quick_check').get().quick_check, 'ok');
    assert.equal(previous.prepare('SELECT revision FROM api_state WHERE id=1').get().revision, 1);
  } finally { previous.close(); }
});

test('UPD-016 - Una copia diaria persiste tras reiniciar, no se repite y permite actualizar al terminar', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'theluxe-daily-'));
  const source = new DatabaseSync(join(directory, 'live.sqlite'));
  t.after(async () => { source.close(); await rm(directory, { recursive: true, force: true }); });
  source.exec('CREATE TABLE api_state (id INTEGER PRIMARY KEY, revision INTEGER NOT NULL)');
  source.exec('INSERT INTO api_state VALUES (1, 1)');
  let date = new Date(2026, 9, 2), copies = 0;
  let entered, resume;
  const started = new Promise((resolve) => { entered = resolve; });
  const paused = new Promise((resolve) => { resume = resolve; });
  const copy = async () => {
    const path = join(directory, `temporary-${++copies}.sqlite`);
    if (copies === 2) { entered(); await paused; }
    await sqliteBackup(source, path);
    return { path, revision: source.prepare('SELECT revision FROM api_state').get().revision };
  };
  const options = { directory, now: () => date, backup: copy };
  const updater = createUpdater(options);
  assert.equal(await updater.dailyBackup(), true);
  const first = join(directory, 'theluxe-daily-2026-10-02.sqlite');
  const db = new DatabaseSync(first, { readOnly: true });
  try { assert.equal(db.prepare('SELECT revision FROM api_state').get().revision, 1); }
  finally { db.close(); }
  assert.equal(await createUpdater(options).dailyBackup(), false, 'una instancia nueva detecta la copia existente');
  assert.equal(copies, 1);
  source.exec('UPDATE api_state SET revision=2');
  date = new Date(2026, 9, 3);
  const pending = updater.dailyBackup();
  await started;
  assert.deepEqual(await updater.update(), { started: false, busy: true });
  assert.equal(await updater.dailyBackup(), false);
  resume();
  assert.equal(await pending, true);
  assert.equal(await updater.dailyBackup(), false);
  assert.equal(copies, 2);
  const second = new DatabaseSync(join(directory, 'theluxe-daily-2026-10-03.sqlite'), { readOnly: true });
  try { assert.equal(second.prepare('SELECT revision FROM api_state').get().revision, 2); }
  finally { second.close(); }
  assert.ok((await stat(first)).size > 0);
});

test('UPD-017 - Una falla o una base vacía permiten reintentar el respaldo diario', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'theluxe-daily-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const old = join(directory, 'theluxe-daily-2026-09-18.sqlite');
  await writeFile(old, 'copia anterior');
  let attempts = 0;
  const updater = createUpdater({ directory, now: () => new Date(2026, 9, 2), backup: async () => {
    attempts++;
    if (attempts === 1) throw new Error('Docker apagado');
    const path = join(directory, `temporary-${attempts}.sqlite`);
    const db = new DatabaseSync(path);
    if (attempts === 3) db.exec('CREATE TABLE api_state (id INTEGER PRIMARY KEY, revision INTEGER NOT NULL); INSERT INTO api_state VALUES (1, 1)');
    db.close();
    return { path, revision: attempts === 2 ? 0 : 1 };
  } });
  await assert.rejects(updater.dailyBackup(), /Docker apagado/);
  assert.ok((await stat(old)).isFile(), 'un error no borra respaldos anteriores');
  assert.equal(await updater.dailyBackup(), false);
  await assert.rejects(stat(join(directory, 'temporary-2.sqlite')), { code: 'ENOENT' });
  assert.ok((await stat(old)).isFile(), 'una base vacía tampoco inicia la limpieza');
  assert.equal(await updater.dailyBackup(), true);
  await assert.rejects(stat(old), { code: 'ENOENT' });
  assert.equal(attempts, 3);
});

test('UPD-018 - Conserva 14 días de copias automáticas y nunca elimina archivos manuales', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'theluxe-retention-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const commit = 'a'.repeat(40), id = '00000000-0000-4000-8000-000000000000';
  const update = (date) => `theluxe-${commit}-${date.getTime()}-${id}.sqlite`;
  const oldUpdate = update(new Date(2026, 8, 18, 23, 59));
  const borderUpdate = update(new Date(2026, 8, 19));
  const old = ['theluxe-daily-2026-09-18.sqlite', oldUpdate];
  const retained = ['theluxe-daily-2026-09-19.sqlite', 'theluxe-daily-2026-10-01.sqlite', borderUpdate, 'theluxe-manual.sqlite', 'theluxe-daily-not-a-date.sqlite'];
  for (const name of [...old, ...retained]) await writeFile(join(directory, name), 'manual');
  let copies = 0;
  const options = { directory, now: () => new Date(2026, 9, 2, 12), backup: async () => {
    const path = join(directory, `temporary-${++copies}.sqlite`);
    const db = new DatabaseSync(path);
    db.exec('CREATE TABLE api_state (id INTEGER PRIMARY KEY, revision INTEGER NOT NULL); INSERT INTO api_state VALUES (1, 1)');
    db.close();
    return { path, revision: 1 };
  } };
  assert.equal(await createUpdater(options).dailyBackup(), true);
  for (const name of old) await assert.rejects(stat(join(directory, name)), { code: 'ENOENT' });
  for (const name of retained) assert.ok((await stat(join(directory, name))).isFile());
  const current = join(directory, 'theluxe-daily-2026-10-02.sqlite');
  assert.ok((await stat(current)).size > 0);
  await writeFile(join(directory, oldUpdate), 'manual');
  assert.equal(await createUpdater(options).dailyBackup(), false, 'también limpia al reiniciar si ya existe la copia del día');
  await assert.rejects(stat(join(directory, oldUpdate)), { code: 'ENOENT' });
  assert.equal(copies, 1);
  await writeFile(current, 'copia dañada');
  await writeFile(join(directory, oldUpdate), 'copia antigua');
  await assert.rejects(createUpdater(options).dailyBackup());
  assert.ok((await stat(join(directory, oldUpdate))).isFile(), 'una copia diaria dañada no habilita borrar las anteriores');
});
