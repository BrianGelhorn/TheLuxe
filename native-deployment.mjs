import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { link, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { DatabaseSync, backup as sqliteBackup } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { verifiedRevision } from './host-updater.mjs';

const exec = promisify(execFile);
const sha = /^[a-f0-9]{40}$/;
const activeFile = (home) => join(resolve(home), 'data', 'active.json');
const releasePath = (home, commit) => join(resolve(home), 'releases', commit);
const assertSha = (commit) => { if (!sha.test(commit)) throw new Error('Commit inválido.'); return commit; };
const assertAbsolute = (path, name) => { if (!isAbsolute(path)) throw new Error(`${name} debe ser absoluto.`); return resolve(path); };

export async function run(program, args, timeout = 120000, cwd) {
  const { stdout } = await exec(program, args, { cwd, timeout, windowsHide: true, maxBuffer: 1024 * 1024 });
  return stdout.trim();
}

export async function getActive(home) {
  try {
    const value = JSON.parse(await readFile(activeFile(home), 'utf8'));
    return assertSha(value.commit);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new Error('active.json inválido.');
  }
}

export async function setActive(home, commit) {
  assertSha(commit);
  const target = activeFile(home);
  await mkdir(dirname(target), { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  try { await writeFile(temporary, JSON.stringify({ commit }), { mode: 0o600, flag: 'wx' }); await rename(temporary, target); }
  catch (error) { await rm(temporary, { force: true }); throw error; }
}

export async function prepare(home, repo, commit, { command = run, node = process.execPath, git = process.env.THELUXE_GIT || 'git', rejectDifferentActive = false } = {}) {
  home = assertAbsolute(home, 'HOME');
  repo = assertAbsolute(repo, 'REPO');
  assertSha(commit);
  const active = await getActive(home);
  if (rejectDifferentActive && active && active !== commit) throw new Error('Ya existe un puntero activo distinto.');
  const release = releasePath(home, commit);
  let created = false;
  try { await stat(release); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await mkdir(dirname(release), { recursive: true });
    await command(git, ['-c', `safe.directory=${repo}`, '-C', repo, 'worktree', 'add', '--detach', release, commit], 180000, repo);
    created = true;
  }
  try {
    if (await command(git, ['-c', `safe.directory=${release}`, '-C', release, 'rev-parse', 'HEAD'], 120000, release) !== commit) throw new Error('El release existente no coincide con el commit.');
    if (await command(git, ['-c', `safe.directory=${release}`, '-C', release, 'status', '--porcelain'], 120000, release)) throw new Error('El release tiene cambios locales. No se reemplazó.');
    try { await command(node, ['--input-type=module', '-e', `process.env.SOURCE_COMMIT=${JSON.stringify(commit)}; await import('./build.mjs');`], 900000, release); }
    catch (error) { console.error('Falló la construcción nativa:', error); throw new Error('Falló el build nativo. La versión anterior sigue disponible; revisá el registro.'); }
    const version = JSON.parse(await readFile(join(release, 'dist/client/version.json'), 'utf8'));
    if (version.commit !== commit || !/^[a-f0-9]{64}$/.test(version.version)) throw new Error('El build no conservó una versión válida.');
  } catch (failure) {
    if (created) { try { await command(git, ['-c', `safe.directory=${repo}`, '-C', repo, 'worktree', 'remove', '--force', release], 180000, repo); await command(git, ['-c', `safe.directory=${repo}`, '-C', repo, 'worktree', 'prune'], 120000, repo); } catch { /* El worktree queda visible para reparación manual. */ } }
    throw failure;
  }
  if (!active) await setActive(home, commit);
  return release;
}

export async function pruneReleases(home, repo, keep, { command = run, git = process.env.THELUXE_GIT || 'git' } = {}) {
  home = assertAbsolute(home, 'HOME'); repo = assertAbsolute(repo, 'REPO');
  const retained = new Set(keep.map(assertSha));
  for (const entry of await readdir(join(home, 'releases'), { withFileTypes: true })) {
    if (!entry.isDirectory() || !sha.test(entry.name) || retained.has(entry.name)) continue;
    const release = releasePath(home, entry.name);
    const common = await command(git, ['-c', `safe.directory=${release}`, '-C', release, 'rev-parse', '--git-common-dir'], 120000, release);
    if (resolve(release, common).toLowerCase() !== join(repo, '.git').toLowerCase()) continue;
    if (await command(git, ['-c', `safe.directory=${release}`, '-C', release, 'rev-parse', 'HEAD'], 120000, release) !== entry.name) continue;
    await command(git, ['-c', `safe.directory=${repo}`, '-C', repo, 'worktree', 'remove', '--force', release], 180000, repo);
  }
}

export async function backupDatabase(source, destination) {
  const input = new DatabaseSync(source, { readOnly: true });
  try { await sqliteBackup(input, destination); } finally { input.close(); }
  return { path: destination, revision: verifiedRevision(destination) };
}

export async function importDatabase(home, source) {
  home = assertAbsolute(home, 'HOME');
  source = assertAbsolute(source, 'SOURCE_BACKUP');
  const destination = join(home, 'data', 'theluxe.sqlite');
  try { await stat(destination); throw new Error('La base destino ya existe.'); }
  catch (error) { if (error.code !== 'ENOENT') { if (error.message.includes('ya existe')) throw error; throw error; } }
  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.${randomUUID()}.tmp`;
  try {
    const result = await backupDatabase(source, temporary);
    await link(temporary, destination); // publicación exclusiva: jamás reemplaza una base creada en paralelo.
    await rm(temporary);
    return { path: destination, revision: result.revision };
  } catch (error) { await rm(temporary, { force: true }); throw error; }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [action, home, first, second] = process.argv.slice(2);
  if (action === 'prepare' && home && first && second) await prepare(home, first, second, { rejectDifferentActive: true });
  else if (action === 'import' && home && first) await importDatabase(home, first);
  else throw new Error('Uso: native-deployment.mjs prepare HOME REPO COMMIT | import HOME SOURCE_BACKUP');
}
