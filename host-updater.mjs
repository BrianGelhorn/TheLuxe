import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const exec = promisify(execFile);
const repo = fileURLToPath(new URL('.', import.meta.url));
const appOrigin = 'http://127.0.0.1:8000';
const sha = /^[a-f0-9]{40}$/;
const expectedRemote = /^(?:https:\/\/github\.com\/BrianGelhorn\/TheLuxe(?:\.git)?|git@github\.com:BrianGelhorn\/TheLuxe\.git)$/;

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

export function createUpdater({ run = command, installed = installedVersion } = {}) {
  let busy = false;
  let phase = '';
  let error = '';

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
      try {
        phase = 'Descargando main';
        await run('git', ['fetch', 'origin', 'main']);
        const fetched = await run('git', ['rev-parse', 'FETCH_HEAD']);
        if (fetched !== current.latestCommit) throw new Error('main cambió durante la descarga. Buscá actualizaciones de nuevo.');
        if (await run('git', ['status', '--porcelain'])) throw new Error('La instalación cambió durante la descarga. No se modificó.');
        await run('git', ['merge-base', '--is-ancestor', 'HEAD', 'FETCH_HEAD']);
        await run('git', ['merge', '--ff-only', 'FETCH_HEAD']);
        if (await run('git', ['rev-parse', 'HEAD']) !== fetched) throw new Error('La copia local no coincide con main.');
        phase = 'Preparando contenedor';
        await run('docker', ['tag', 'theluxe-local', 'theluxe-rollback']);
        await run('docker', ['compose', '-f', 'compose.yaml', 'build', '--build-arg', `SOURCE_COMMIT=${fetched}`, 'web'], 900000);
        phase = 'Reiniciando contenedor';
        restartAttempted = true;
        await run('docker', ['compose', '-f', 'compose.yaml', 'up', '-d', '--no-deps', 'web'], 180000);
        let ready = false;
        for (let attempt = 0; attempt < 20; attempt++) {
          try { if ((await installed()).commit === fetched) { ready = true; break; } } catch { /* Contenedor todavía iniciando. */ }
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        if (!ready) throw new Error('Docker no está sirviendo la versión nueva. Revisá el contenedor.');
      } catch (failure) {
        error = String(failure.message || failure).slice(0, 300);
        if (restartAttempted) {
          try {
            await run('docker', ['tag', 'theluxe-rollback', 'theluxe-local']);
            await run('docker', ['compose', '-f', 'compose.yaml', 'up', '-d', '--no-deps', 'web'], 180000);
            error += ' Se restauró la versión anterior.';
          } catch { error += ' No se pudo restaurar la versión anterior. Revisá Docker.'; }
        }
      } finally {
        phase = '';
        busy = false;
      }
    })();
    return { started: true };
  }

  return { status, update };
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
  createUpdateServer().listen(8001, '127.0.0.1', () => console.log('Actualizador local: http://127.0.0.1:8001'));
}
