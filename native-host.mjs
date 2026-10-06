import { fork } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createUpdater, createUpdateServer, verifiedRevision } from './host-updater.mjs';
import { backupDatabase, getActive, prepare, pruneReleases, run, setActive } from './native-deployment.mjs';

const sha = /^[a-f0-9]{40}$/;

export class NativeHost {
  constructor({ home, repo, command = run, git = process.env.THELUXE_GIT || 'git', node = process.execPath, port = 8000, updaterPort = 8001, onFatal = () => process.exit(1) }) {
    if (!isAbsolute(home) || !isAbsolute(repo)) throw new Error('HOME y REPO deben ser absolutos.');
    if (!Number.isInteger(port) || port < 0 || port > 65535 || !Number.isInteger(updaterPort) || updaterPort < 0 || updaterPort > 65535) throw new Error('Puerto nativo inválido.');
    this.home = resolve(home); this.repo = resolve(repo); this.command = command; this.git = git; this.node = node;
    this.port = port; this.updaterPort = updaterPort; this.onFatal = onFatal; this.child = null;
    this.database = join(this.home, 'data', 'theluxe.sqlite'); this.backups = join(this.home, 'data', 'backups');
  }
  async gitRun(program, args, timeout, cwd) {
    const executable = program === 'git' ? this.git : program;
    return this.command(executable, executable === this.git ? ['-c', `safe.directory=${this.repo}`, '-C', this.repo, ...args] : args, timeout, cwd || this.repo);
  }
  async startChild(commit) {
    if (!sha.test(commit)) throw new Error('Commit activo inválido.');
    const app = join(this.home, 'releases', commit, 'native-app.mjs');
    if (this.child) throw new Error('Todavía hay un proceso de la aplicación.');
    const child = fork(app, [], { execPath: this.node, cwd: dirname(app), env: { ...process.env, DB_PATH: this.database, PORT: String(this.port), SOURCE_COMMIT: commit }, stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    child.expectedStop = false;
    child.readyVerified = false;
    child.on('exit', () => {
      if (!child.expectedStop && child.readyVerified && this.child === child) this.onFatal(new Error('La aplicación nativa terminó inesperadamente.'));
    });
    child.on('error', (error) => { console.error('Error del proceso nativo:', error); });
    this.child = child;
    try { await new Promise((resolveReady, reject) => {
      const finish = (error) => { clearTimeout(timer); child.off('message', message); child.off('exit', exit); child.off('error', fail); error ? reject(error) : resolveReady(); };
      const timer = setTimeout(() => finish(new Error('El hijo nativo no anunció ready.')), 20000);
      const message = (value) => {
        if (!value?.ready) return finish(new Error(value?.error || 'El hijo no inició.'));
        if (!this.port && Number.isInteger(value.port) && value.port > 0 && value.port <= 65535) this.port = value.port;
        finish();
      };
      const exit = (code) => finish(new Error(`La aplicación terminó al iniciar (código ${code}). Revisá el registro.`)); const fail = (error) => finish(error);
      child.once('message', message); child.once('exit', exit); child.once('error', fail);
    });
    const health = await fetch(`http://127.0.0.1:${this.port}/api/health`, { signal: AbortSignal.timeout(5000) });
    const versionResponse = await fetch(`http://127.0.0.1:${this.port}/version.json`, { signal: AbortSignal.timeout(5000) });
    const version = await versionResponse.json();
    if (!health.ok || !(await health.json()).ok || !versionResponse.ok || version.commit !== commit) throw new Error('El hijo anunció una versión incorrecta.');
    if (child.exitCode !== null || child.signalCode !== null) throw new Error('La aplicación terminó antes de completar la verificación.');
    child.readyVerified = true;
    } catch (error) {
      console.error('Error inicial de la aplicación nativa:', error);
      try { await this.stopChild(); }
      catch (cleanup) { throw new AggregateError([error, cleanup], 'Fallaron el arranque y el cierre de la aplicación nativa.', { cause: error }); }
      throw error;
    }
  }
  async stopChild() {
    const child = this.child;
    if (!child) return;
    child.expectedStop = true;
    if (!child.pid || child.exitCode !== null || child.signalCode !== null) { if (this.child === child) this.child = null; return; }
    await new Promise((resolveStop, reject) => {
      const finish = (error) => {
        clearTimeout(timer); clearTimeout(hard); child.off('exit', exited);
        if (!error && this.child === child) this.child = null;
        error ? reject(error) : resolveStop();
      };
      const exited = () => finish();
      const timer = setTimeout(() => { child.kill('SIGKILL'); }, 10000);
      const hard = setTimeout(() => finish(new Error('El proceso no terminó. No se puede iniciar otra versión.')), 15000);
      child.once('exit', exited);
      try {
        if (child.connected) child.send('stop', (error) => { if (error && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); });
        else child.kill('SIGKILL');
      } catch { child.kill('SIGKILL'); }
    });
  }
  async backup(_run, commit) {
    await mkdir(this.backups, { recursive: true });
    return backupDatabase(this.database, join(this.backups, `theluxe-${commit}-${Date.now()}-${randomUUID()}.sqlite`));
  }
  async deploy({ commit, previousCommit, setPhase }) {
    const previous = await getActive(this.home);
    if (previous !== previousCommit) throw new Error('El puntero activo cambió durante la actualización.');
    setPhase('Preparando versión nativa');
    await prepare(this.home, this.repo, commit, { command: this.gitRun.bind(this), git: this.git, node: this.node });
    setPhase('Respaldando base de datos');
    const snapshot = await this.backup(null, previous || 'null');
    try {
      setPhase('Deteniendo versión anterior'); await this.stopChild();
      if (verifiedRevision(this.database) !== snapshot.revision) throw new Error('La base cambió durante el respaldo.');
      setPhase('Iniciando versión nueva'); await this.startChild(commit);
      await setActive(this.home, commit);
    } catch (error) {
      await this.stopChild();
      try { if (previous) await this.startChild(previous); }
      catch (rollback) { console.error('Falló el rollback nativo:', rollback, 'Copia previa:', snapshot.path); throw new Error(`${error.message.slice(0, 80)} No se pudo restaurar la versión anterior. Copia previa: ${snapshot.path}`); }
      console.error('Actualización nativa revertida:', error, 'Copia previa:', snapshot.path);
      throw new Error(`${error.message.slice(0, 80)} Se restauró la versión anterior sin reemplazar la base. Copia previa: ${snapshot.path}`);
    }
    try { await pruneReleases(this.home, this.repo, [commit, previous], { command: this.gitRun.bind(this), git: this.git }); }
    catch (error) { console.error('No se pudieron limpiar versiones anteriores:', error); }
  }
  async start() {
    const commit = await getActive(this.home);
    if (!commit) throw new Error('No hay versión nativa activa.');
    try { await this.startChild(commit);
    const updater = createUpdater({ run: this.gitRun.bind(this), directory: this.backups, installed: async () => { const response = await fetch(`http://127.0.0.1:${this.port}/version.json`, { signal: AbortSignal.timeout(5000) }); if (!response.ok) throw new Error('Versión no disponible.'); return response.json(); }, healthy: async () => { const response = await fetch(`http://127.0.0.1:${this.port}/api/health`, { signal: AbortSignal.timeout(5000) }); return response.ok && (await response.json()).ok === true; }, backup: this.backup.bind(this), revision: async () => verifiedRevision(this.database), deploy: this.deploy.bind(this) });
    this.updater = updater; this.updateServer = createUpdateServer(updater);
    await new Promise((done, reject) => { this.updateServer.once('error', reject); this.updateServer.listen(this.updaterPort, '127.0.0.1', done); });
    const tick = () => void updater.dailyBackup().catch((error) => console.error('No se pudo hacer el respaldo diario:', error));
    tick(); this.timer = setInterval(tick, 60 * 60 * 1000); } catch (error) {
      console.error('No se pudo iniciar TheLuxe Native:', error);
      try { await this.close(); }
      catch (cleanup) { throw new AggregateError([error, cleanup], 'Fallaron el arranque y la limpieza del coordinador nativo.', { cause: error }); }
      throw error;
    }
  }
  async close() { clearInterval(this.timer); if (this.updateServer?.listening) await new Promise((done) => this.updateServer.close(done)); await this.stopChild(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2); const home = args[args.indexOf('--home') + 1]; const repo = args[args.indexOf('--repo') + 1];
  if (!process.env.THELUXE_GIT || !isAbsolute(process.env.THELUXE_GIT)) throw new Error('THELUXE_GIT debe apuntar al git.exe absoluto para LocalService.');
  const host = new NativeHost({ home, repo });
  await host.start();
  const stop = () => void host.close().then(() => process.exit(0)); process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
