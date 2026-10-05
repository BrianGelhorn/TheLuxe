import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { resolve, join, basename } from 'node:path';
import { homedir } from 'node:os';
import { mkdir, stat, rename, unlink, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const exec = promisify(execFile);
const repo = fileURLToPath(new URL('.', import.meta.url));
const appOrigin = 'http://127.0.0.1:8000';
const sha = /^[a-f0-9]{40}$/;
const expectedRemote = /^(?:https:\/\/github\.com\/BrianGelhorn\/TheLuxe(?:\.git)?|git@github\.com:BrianGelhorn\/TheLuxe\.git)$/;
const backupDirectory = join(process.env.LOCALAPPDATA || homedir(), 'TheLuxe', 'backups');
const localDay = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

async function pruneBackups(directory, date) {
  const cutoff = new Date(date.getFullYear(), date.getMonth(), date.getDate() - 13);
  const oldestDay = localDay(cutoff);
  for (const file of await readdir(directory, { withFileTypes: true })) {
    if (!file.isFile()) continue;
    const daily = /^theluxe-daily-(\d{4}-\d{2}-\d{2})\.sqlite$/.exec(file.name);
    const update = /^theluxe-(?:[a-f0-9]{40}|null)-(\d{13})-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\.sqlite$/.exec(file.name);
    if (daily ? daily[1] < oldestDay : update && Number(update[1]) < cutoff.getTime()) await unlink(join(directory, file.name));
  }
}

async function command(program, args, timeout = 120000) {
  const { stdout } = await exec(program, args, { cwd: repo, timeout, maxBuffer: 1024 * 1024, windowsHide: true });
  return stdout.trim();
}

async function installedVersion() {
  const response = await fetch(`${appOrigin}/version.json`, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error('El contenedor web no está disponible. Iniciá Docker primero.');
  const version = await response.json();
  if (!/^[a-f0-9]{64}$/.test(version.version) || version.commit !== null && !sha.test(version.commit)) throw new Error('La versión instalada no tiene un formato válido.');
  return version;
}

async function apiHealthy() {
  const response = await fetch(`${appOrigin}/api/health`, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
  return response.ok && (await response.json()).ok === true;
}

async function databaseRevision(run) {
  const script = "import {DatabaseSync} from 'node:sqlite'; const db=new DatabaseSync('/data/theluxe.sqlite',{readOnly:true}); try { console.log(db.prepare('SELECT revision FROM api_state WHERE id=1').get()?.revision ?? 0); } finally { db.close(); }";
  const value = await run('docker', ['compose', '-f', 'compose.yaml', 'run', '--rm', '--no-deps', 'api', 'node', '--input-type=module', '-e', script]);
  const revision = Number(value);
  if (!Number.isSafeInteger(revision) || revision < 0) throw new Error('No se pudo verificar la revisión de la base.');
  return revision;
}

export function verifiedRevision(path) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    if (db.prepare('PRAGMA quick_check').get().quick_check !== 'ok') throw new Error('La copia de seguridad de SQLite no pasó la verificación.');
    const revision = db.prepare('SELECT revision FROM api_state WHERE id=1').get()?.revision ?? 0;
    if (!Number.isSafeInteger(revision) || revision < 0) throw new Error('La copia de seguridad no tiene una revisión válida.');
    return revision;
  } finally { db.close(); }
}

async function databaseBackup(run, commit) {
  await mkdir(backupDirectory, { recursive: true });
  const filename = `theluxe-${commit}-${Date.now()}-${randomUUID()}.sqlite`;
  const path = join(backupDirectory, filename);
  const script = `import {DatabaseSync,backup} from 'node:sqlite'; const db=new DatabaseSync('/data/theluxe.sqlite',{readOnly:true}); try { await backup(db,'/data/${filename}'); } finally { db.close(); }`;
  try {
    await run('docker', ['compose', '-f', 'compose.yaml', 'exec', '-T', 'api', 'node', '--input-type=module', '-e', script], 180000);
    await run('docker', ['compose', '-f', 'compose.yaml', 'cp', `api:/data/${filename}`, path], 180000);
  } finally {
    try { await run('docker', ['compose', '-f', 'compose.yaml', 'exec', '-T', 'api', 'rm', '-f', `/data/${filename}`]); }
    catch { /* La copia externa queda disponible; el temporal se puede limpiar luego. */ }
  }
  return { path, revision: verifiedRevision(path) };
}

export function createUpdater({ run = command, installed = installedVersion, healthy = apiHealthy, backup = databaseBackup, revision = databaseRevision, directory = backupDirectory, now = () => new Date(), deploy } = {}) {
  let busy = false;
  let phase = '';
  let error = '';

  async function dailyBackup() {
    if (busy) return false;
    busy = true;
    phase = 'Respaldando base de datos';
    try {
      const date = now();
      const target = join(directory, `theluxe-daily-${localDay(date)}.sqlite`);
      let exists = false;
      try { exists = (await stat(target)).isFile(); }
      catch (failure) { if (failure.code !== 'ENOENT') throw failure; }
      if (exists && verifiedRevision(target) < 1) throw new Error('La copia diaria existente está vacía. Revisala antes de borrar copias anteriores.');
      if (!exists) {
        const snapshot = await backup(run, 'daily');
        if (snapshot.revision === 0) { await unlink(snapshot.path); return false; }
        await rename(snapshot.path, target);
      }
      try { await pruneBackups(directory, date); }
      catch (failure) { console.error('No se pudieron limpiar las copias antiguas:', failure); }
      return !exists;
    } finally {
      phase = '';
      busy = false;
    }
  }

  async function inspect() {
    const [branch, remote, dirty] = await Promise.all([
      run('git', ['branch', '--show-current']),
      run('git', ['remote', 'get-url', 'origin']),
      run('git', ['status', '--porcelain']),
    ]);
    if (branch !== 'main' || !expectedRemote.test(remote) || dirty) throw new Error('La instalación debe ser una copia limpia de main con origin en GitHub.');
    const [remoteLine, current] = await Promise.all([run('git', ['ls-remote', 'origin', 'refs/heads/main']), installed()]);
    const latestCommit = remoteLine.match(/^([a-f0-9]{40})\s+refs\/heads\/main$/)?.[1];
    if (!latestCommit) throw new Error('No se pudo consultar main en GitHub.');
    return { busy: false, available: current.commit !== latestCommit, latestCommit, installedCommit: current.commit, error };
  }

  async function status() {
    return busy ? { busy, phase } : inspect();
  }

  async function update() {
    if (busy) return { started: false, busy: true };
    busy = true;
    phase = 'Comprobando';
    let current;
    try {
      current = await inspect();
      if (!current.available) { busy = false; phase = ''; return { started: false, busy: false }; }
    } catch (failure) {
      busy = false;
      phase = '';
      throw failure;
    }
    error = '';
    void (async () => {
      let restartAttempted = false;
      let oldWebImage = false;
      let oldApiImage = false;
      let snapshot = null;
      try {
        phase = 'Descargando main';
        await run('git', ['fetch', 'origin', 'main']);
        const fetched = await run('git', ['rev-parse', 'FETCH_HEAD']);
        if (fetched !== current.latestCommit) throw new Error('main cambió durante la descarga. Buscá actualizaciones de nuevo.');
        if (await run('git', ['status', '--porcelain'])) throw new Error('La instalación cambió durante la descarga. No se modificó.');
        await run('git', ['merge-base', '--is-ancestor', 'HEAD', 'FETCH_HEAD']);
        await run('git', ['merge', '--ff-only', 'FETCH_HEAD']);
        if (await run('git', ['rev-parse', 'HEAD']) !== fetched) throw new Error('La copia local no coincide con main.');
        if (deploy) {
          await deploy({ commit: fetched, previousCommit: current.installedCommit, setPhase: (value) => { phase = value; } });
          return;
        }
        phase = 'Preparando contenedor';
        await run('docker', ['tag', 'theluxe-local', 'theluxe-rollback']);
        oldWebImage = true;
        try {
          await run('docker', ['image', 'inspect', 'theluxe-api-local']);
          oldApiImage = true;
        } catch { /* Primera instalación de la API; no hay imagen anterior. */ }
        if (oldApiImage) await run('docker', ['tag', 'theluxe-api-local', 'theluxe-api-rollback']);
        await run('docker', ['compose', '-f', 'compose.yaml', 'build', '--build-arg', `SOURCE_COMMIT=${fetched}`, 'api', 'web'], 900000);
        phase = 'Respaldando base de datos';
        if (oldApiImage) snapshot = await backup(run, current.installedCommit);
        restartAttempted = true;
        phase = 'Reiniciando API';
        await run('docker', ['compose', '-f', 'compose.yaml', 'stop', 'web'], 180000);
        if (snapshot && await revision(run) !== snapshot.revision) throw new Error('La base cambió durante el respaldo. No se aplicó la actualización.');
        await run('docker', ['compose', '-f', 'compose.yaml', 'up', '-d', '--no-deps', 'api'], 180000);
        phase = 'Reiniciando contenedor web';
        await run('docker', ['compose', '-f', 'compose.yaml', 'up', '-d', '--no-deps', 'web'], 180000);
        let ready = false;
        for (let attempt = 0; attempt < 20; attempt++) {
          try { if ((await installed()).commit === fetched && await healthy()) { ready = true; break; } } catch { /* Contenedores todavía iniciando. */ }
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        if (!ready) throw new Error('Docker no está sirviendo la versión nueva. Revisá el contenedor.');
      } catch (failure) {
        error = String(failure.message || failure).slice(0, 300);
        if (!restartAttempted && oldWebImage) {
          try {
            await run('docker', ['tag', 'theluxe-rollback', 'theluxe-local']);
            if (oldApiImage) await run('docker', ['tag', 'theluxe-api-rollback', 'theluxe-api-local']);
          } catch { error += ' No se pudieron recuperar las etiquetas anteriores de Docker.'; }
        }
        if (restartAttempted) {
          try {
            await run('docker', ['compose', '-f', 'compose.yaml', 'stop', 'web'], 180000);
            let restored = false;
            if (snapshot) await run('docker', ['compose', '-f', 'compose.yaml', 'stop', 'api'], 180000);
            if (snapshot && await revision(run) === snapshot.revision) {
              await run('docker', ['compose', '-f', 'compose.yaml', 'cp', snapshot.path, 'api:/data/theluxe.sqlite'], 180000);
              restored = true;
            }
            await run('docker', ['tag', 'theluxe-rollback', 'theluxe-local']);
            if (oldApiImage) await run('docker', ['tag', 'theluxe-api-rollback', 'theluxe-api-local']);
            await run('docker', ['compose', '-f', 'compose.yaml', 'up', '-d', 'api', 'web'], 180000);
            let ready = false;
            for (let attempt = 0; attempt < 20; attempt++) {
              try { if ((await installed()).commit === current.installedCommit && await healthy()) { ready = true; break; } } catch { /* Arranque en curso. */ }
              await new Promise((resolve) => setTimeout(resolve, 1000));
            }
            error += ready ? ' Se restauró la versión anterior.' : ' No se pudo confirmar la restauración. Revisá Docker.';
            if (snapshot) error += restored ? ` Base restaurada desde ${basename(snapshot.path)}.` : ` La base cambió: no se sobrescribió. Copia previa: ${snapshot.path}.`;
          } catch { error += ` No se pudo restaurar la versión anterior. Revisá Docker.${snapshot ? ` Copia previa: ${snapshot.path}.` : ''}`; }
        }
      } finally {
        phase = '';
        busy = false;
      }
    })();
    return { started: true };
  }

  return { status, update, dailyBackup };
}

export function createUpdateServer(updater = createUpdater()) {
  return http.createServer(async (request, response) => {
    const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', Vary: 'Origin' };
    const send = (code, value) => { response.writeHead(code, headers); response.end(JSON.stringify(value)); };
    if (request.headers.host !== `127.0.0.1:${request.socket.localPort}` || request.headers.origin !== appOrigin) return send(403, { error: 'Origen no permitido.' });
    headers['Access-Control-Allow-Origin'] = appOrigin;
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type';
    const path = new URL(request.url, 'http://127.0.0.1').pathname;
    if (request.method === 'OPTIONS' && ['/status', '/update'].includes(path)) return send(204, {});
    try {
      if (request.method === 'GET' && path === '/status') return send(200, await updater.status());
      if (request.method === 'POST' && path === '/update' && request.headers['content-type'] === 'application/json') {
        const result = await updater.update();
        return send(result.busy ? 409 : result.started ? 202 : 200, result);
      }
      return send(404, { error: 'Ruta no encontrada.' });
    } catch (failure) {
      return send(503, { error: String(failure.message || failure).slice(0, 300) });
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const updater = createUpdater();
  createUpdateServer(updater).listen(8001, '127.0.0.1', () => {
    console.log('Actualizador local: http://127.0.0.1:8001');
    const checkBackup = () => { void updater.dailyBackup().catch((failure) => console.error('No se pudo hacer el respaldo diario:', failure)); };
    checkBackup();
    setInterval(checkBackup, 60 * 60 * 1000);
  });
}
