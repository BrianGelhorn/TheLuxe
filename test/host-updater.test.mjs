import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
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
