import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { createApi } from '../api.mjs';
import { getActive, importDatabase, prepare, run, setActive } from '../native-deployment.mjs';
import { NativeHost } from '../native-host.mjs';
import { verifiedRevision } from '../host-updater.mjs';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('..', import.meta.url));
const appFiles = ['api.mjs', 'logic.js', 'native-app.mjs', 'native-host.mjs', 'native-deployment.mjs', 'host-updater.mjs', 'build.mjs', 'package.json', 'index.html', 'styles.css', 'inventory.js', 'script.js', 'reports.js', 'dialogs.js'];
const snapshot = () => ({
  config: { services: [], barbers: [], expenseCategories: [], commission: 50, commissionHistory: [] },
  entries: [{ id: 'native-cut', date: '2026-10-05', time: '10:00', barber: 'Prueba', service: 'Corte', amount: 100, tip: 0, payment: 'Efectivo', commissionRate: 50, commissionAmount: 50 }],
  sales: [], advances: [], expenses: [], transfers: [], openingAdjustments: [], cashRegisters: {}, barberPayments: {}, inventory: { version: 2, products: [], movements: [] },
});
async function freePort() {
  const server = createServer();
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const port = server.address().port;
  await new Promise((done) => server.close(done));
  return port;
}
async function idle(updater) {
  for (let i = 0; i < 200; i++) {
    const status = await updater.status();
    if (!status.busy) return status;
    await new Promise((done) => setTimeout(done, 25));
  }
  throw new Error('El actualizador no termino la prueba.');
}
async function nativeFixture(t, options = {}) {
  const directory = await mkdtemp(join(process.platform === 'win32' ? join(tmpdir(), 'opencode') : tmpdir(), 'theluxe-native-e2e-'));
  const repo = join(directory, 'repo');
  await mkdir(repo);
  for (const name of appFiles) await copyFile(join(root, name), join(repo, name));
  await writeFile(join(repo, '.gitignore'), 'dist/\n');
  const git = (...args) => exec('git', args, { cwd: repo }).then((result) => result.stdout.trim());
  await git('init', '--initial-branch=main');
  await git('remote', 'add', 'origin', repo);
  const commit = async () => {
    await git('add', '--', ...appFiles, '.gitignore');
    await git('-c', 'user.name=Native Test', '-c', 'user.email=native-test@localhost', 'commit', '-m', 'test snapshot');
    return git('rev-parse', 'HEAD');
  };
  const first = await commit();
  let latest = first;
  const command = async (program, args, timeout, cwd) => {
    if (program === 'git' && args.includes('get-url')) return 'https://github.com/BrianGelhorn/TheLuxe.git';
    if (program === 'git' && args.includes('ls-remote')) return `${latest}\trefs/heads/main`;
    return run(program, args, timeout, cwd);
  };
  await prepare(directory, repo, first);
  const fatal = [];
  const host = new NativeHost({ home: directory, repo, command, port: await freePort(), updaterPort: 0, onFatal: () => fatal.push('unexpected child exit'), ...options });
  t.after(async () => { await host.close(); await rm(directory, { recursive: true, force: true }); });
  if (!options.noStart) { await host.start(); await idle(host.updater); }
  const base = `http://127.0.0.1:${host.port}`;
  const json = async (path, options) => {
    const response = await fetch(base + path, { signal: AbortSignal.timeout(5000), ...options });
    return { status: response.status, body: await response.json() };
  };
  const save = async (revision, state) => json('/api/state', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision, state }) });
  const next = async (app = 'good') => {
    await writeFile(join(repo, 'index.html'), (await readFile(join(repo, 'index.html'), 'utf8')).replace('</body>', `<p>native test ${Date.now()}</p></body>`));
    if (app === 'bad') await writeFile(join(repo, 'native-app.mjs'), 'throw new Error("candidate intentionally broken");');
    if (app === 'bad-build') await writeFile(join(repo, 'build.mjs'), 'throw new Error("candidate build intentionally broken");');
    latest = await commit();
    return latest;
  };
  return { directory, repo, first, host, base, json, save, next, fatal };
}

test('native API serves only the generated worker on loopback and persists SQLite', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'theluxe-native-'));
  const db = join(dir, 'theluxe.sqlite');
  const worker = { fetch: async (request) => new Response(request.method === 'PUT' ? 'no' : new URL(request.url).pathname === '/' ? 'home' : 'missing', { status: request.method === 'PUT' ? 405 : new URL(request.url).pathname === '/' ? 200 : 404 }) };
  let server;
  server = createApi({ databasePath: db, host: () => `127.0.0.1:${server.address().port}`, webHandler: worker.fetch });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  server.unref();
  t.after(async () => { await new Promise((done) => { server.closeAllConnections(); server.close(done); }); await rm(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const status = async (path, options) => { const response = await fetch(base + path, options); await response.arrayBuffer(); return response.status; };
  const rawStatus = (path, headers) => new Promise((resolveStatus, reject) => {
    const request = httpRequest(base + path, { headers }, (response) => { response.resume(); response.once('end', () => resolveStatus(response.statusCode)); });
    request.once('error', reject); request.end();
  });
  assert.equal(await status('/'), 200);
  assert.equal(await status('/../api/health'), 200);
  assert.equal(await status('/', { method: 'PUT' }), 405);
  assert.equal(await rawStatus('/api/health', { Host: 'evil' }), 403);
  assert.equal(await status('/api/health'), 200);
});

test('native import preserves source and never overwrites a destination', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'theluxe-native-import-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const source = join(dir, 'source.sqlite');
  const db = new DatabaseSync(source); db.exec('CREATE TABLE api_state (id INTEGER PRIMARY KEY, revision INTEGER NOT NULL, state TEXT NOT NULL)'); db.prepare('INSERT INTO api_state VALUES(1, 7, ?)').run(JSON.stringify(snapshot())); db.close();
  const before = await readFile(source);
  assert.equal((await importDatabase(dir, source)).revision, 7);
  assert.deepEqual(await readFile(source), before);
  const imported = new DatabaseSync(join(dir, 'data', 'theluxe.sqlite'), { readOnly: true });
  try { assert.deepEqual(JSON.parse(imported.prepare('SELECT state FROM api_state').get().state), snapshot()); }
  finally { imported.close(); }
  await assert.rejects(importDatabase(dir, source), /ya existe/);
});

test('active pointer is SHA-only and persists atomically', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'theluxe-native-active-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const commit = 'a'.repeat(40); await setActive(dir, commit); assert.equal(await getActive(dir), commit);
  await writeFile(join(dir, 'data', 'active.json'), '{"commit":"bad"}'); await assert.rejects(getActive(dir), /inválido/);
});

test('NATIVE-E2E-001 - servidor real conserva operaciones, respalda y actualiza sin Docker', { timeout: 60000 }, async (t) => {
  const app = await nativeFixture(t);
  const state = snapshot();
  assert.deepEqual(await app.save(0, state), { status: 200, body: { revision: 1 } });
  const home = await fetch(app.base + '/');
  assert.equal(home.status, 200);
  assert.match(await home.text(), /theluxe-build/);
  for (const path of ['/native-host.mjs', '/api.mjs', '/.git/config', '/data/theluxe.sqlite', '/%2e%2e/General.xlsm']) {
    const response = await fetch(app.base + path); await response.arrayBuffer(); assert.equal(response.status, 404, path);
  }
  assert.equal((await fetch(app.base + '/version.json', { method: 'HEAD' })).headers.get('Cache-Control'), 'no-store');
  await app.host.stopChild();
  await app.host.startChild(app.first);
  assert.deepEqual((await app.json('/api/state')).body, { revision: 1, state });
  assert.equal(await app.host.updater.dailyBackup(), true);
  const files = await readdir(join(app.directory, 'data', 'backups'));
  const daily = files.find((name) => /^theluxe-daily-\d{4}-\d{2}-\d{2}\.sqlite$/.test(name));
  assert.ok(daily); assert.equal(verifiedRevision(join(app.directory, 'data', 'backups', daily)), 1);
  const second = await app.next();
  assert.equal((await app.host.updater.update()).started, true);
  const status = await idle(app.host.updater);
  assert.equal(status.error, ''); assert.equal(status.available, false);
  assert.equal(await getActive(app.directory), second);
  assert.equal((await app.json('/version.json')).body.commit, second);
  assert.deepEqual((await app.json('/api/state')).body, { revision: 1, state });
  assert.ok((await readdir(join(app.directory, 'data', 'backups'))).some((name) => /^theluxe-[a-f0-9]{40}-\d{13}-[a-f0-9-]{36}\.sqlite$/.test(name)), 'backup previo compatible con retencion');
  assert.deepEqual(app.fatal, []);
});

test('NATIVE-E2E-002 - candidato que no arranca revierte codigo y conserva SQLite', { timeout: 60000 }, async (t) => {
  const app = await nativeFixture(t);
  const state = snapshot(); await app.save(0, state);
  await app.next('bad');
  assert.equal((await app.host.updater.update()).started, true);
  const status = await idle(app.host.updater);
  assert.match(status.error, /restauró la versión anterior/);
  assert.equal(await getActive(app.directory), app.first);
  assert.equal((await app.json('/version.json')).body.commit, app.first);
  assert.deepEqual((await app.json('/api/state')).body, { revision: 1, state });
  assert.deepEqual(app.fatal, []);
});

test('NATIVE-E2E-003 - rollback nunca restaura una copia sobre operaciones nuevas', { timeout: 60000 }, async (t) => {
  const app = await nativeFixture(t);
  const original = snapshot(); await app.save(0, original);
  const second = await app.next();
  const start = app.host.startChild.bind(app.host);
  const newer = structuredClone(original); newer.expenses.push({ id: 'after-backup', date: '2026-10-05', time: '11:00', amount: 20, payment: 'Efectivo', reason: 'operacion posterior al respaldo' });
  app.host.startChild = async (commit) => {
    await start(commit);
    if (commit === second) { assert.equal((await app.save(1, newer)).status, 200); throw new Error('fallo despues de una escritura nueva'); }
  };
  await app.host.updater.update();
  assert.match((await idle(app.host.updater)).error, /restauró la versión anterior/);
  assert.equal(await getActive(app.directory), app.first);
  assert.deepEqual((await app.json('/api/state')).body, { revision: 2, state: newer });
  assert.deepEqual(app.fatal, []);
});

test('NATIVE-E2E-004 - fallo de build no detiene la app y el candidato fallido se puede reintentar', { timeout: 60000 }, async (t) => {
  const app = await nativeFixture(t);
  const state = snapshot(); await app.save(0, state);
  const pid = app.host.child.pid;
  const bad = await app.next('bad-build');
  await app.host.updater.update();
  assert.match((await idle(app.host.updater)).error, /Falló el build nativo/);
  assert.equal(app.host.child.pid, pid);
  assert.equal(await getActive(app.directory), app.first);
  await assert.rejects(prepare(app.directory, app.repo, bad), /Falló el build nativo/);
  await writeFile(join(app.repo, 'build.mjs'), await readFile(join(root, 'build.mjs')));
  const good = await app.next();
  await app.host.updater.update();
  assert.equal((await idle(app.host.updater)).error, '');
  assert.equal(await getActive(app.directory), good);
  assert.deepEqual((await app.json('/api/state')).body, { revision: 1, state });
  assert.deepEqual((await readdir(join(app.directory, 'releases'))).sort(), [app.first, good].sort(), 'solo conserva activa y anterior');
});

test('NATIVE-E2E-005 - conflicto de puerto del actualizador no deja un servidor o SQLite abiertos', { timeout: 60000 }, async (t) => {
  const occupied = createServer(); await new Promise((done) => occupied.listen(0, '127.0.0.1', done));
  t.after(() => new Promise((done) => occupied.close(done)));
  const app = await nativeFixture(t, { noStart: true, updaterPort: occupied.address().port });
  await assert.rejects(app.host.start(), /EADDRINUSE/);
  assert.equal(app.host.child, null);
  await assert.rejects(fetch(app.base + '/api/health', { signal: AbortSignal.timeout(1000) }));
});

test('NATIVE-E2E-006 - muerte inesperada de la app avisa al supervisor y no queda un proceso huérfano', { timeout: 60000 }, async (t) => {
  const app = await nativeFixture(t);
  app.host.child.kill('SIGKILL');
  for (let i = 0; i < 100 && !app.fatal.length; i++) await new Promise((done) => setTimeout(done, 10));
  assert.deepEqual(app.fatal, ['unexpected child exit']);
  await app.host.close();
  assert.equal(app.host.child, null);
});

test('NATIVE-E2E-007 - un cierre fallido no oculta el error que impidió iniciar la aplicación', { timeout: 60000 }, async (t) => {
  const app = await nativeFixture(t, { noStart: true });
  const file = join(app.directory, 'releases', app.first, 'native-app.mjs');
  await writeFile(file, "process.on('message', () => {}); process.send({ready:false,error:'FALLO_INICIAL_DE_PRUEBA'});");
  const stop = app.host.stopChild.bind(app.host);
  app.host.stopChild = async () => { throw new Error('FALLO_SECUNDARIO_DE_CIERRE'); };
  try {
    await assert.rejects(app.host.start(), (error) => {
      const causes = (value) => [value.message, ...(value.errors || []).flatMap(causes)].join('\n');
      assert.match(causes(error), /FALLO_INICIAL_DE_PRUEBA/);
      assert.match(causes(error), /FALLO_SECUNDARIO_DE_CIERRE/);
      return true;
    });
  } finally { app.host.stopChild = stop; await stop(); }
});
