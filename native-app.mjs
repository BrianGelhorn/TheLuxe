import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createApi } from './api.mjs';

const sha = /^[a-f0-9]{40}$/;

export async function startNativeApp({ databasePath = process.env.DB_PATH, port = Number(process.env.PORT || 8000), commit = process.env.SOURCE_COMMIT, workerPath = resolve('dist/server/index.js') } = {}) {
  if (!databasePath) throw new Error('DB_PATH es obligatorio.');
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Puerto inválido.');
  if (commit && !sha.test(commit)) throw new Error('SOURCE_COMMIT inválido.');
  const worker = (await import(`${pathToFileURL(workerPath).href}?${Date.now()}`)).default;
  if (!worker?.fetch) throw new Error('El build nativo no tiene worker.fetch.');
  let server;
  server = createApi({ databasePath, host: () => `127.0.0.1:${server.address()?.port || port}`, webHandler: (request) => worker.fetch(request) });
  try { await new Promise((resolveListen, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolveListen); }); }
  catch (error) { server.close(); throw error; }
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const [health, version] = await Promise.all([fetch(`${base}/api/health`, { signal: AbortSignal.timeout(5000) }), fetch(`${base}/version.json`, { signal: AbortSignal.timeout(5000) })]);
    const value = await version.json();
    if (!health.ok || !(await health.json()).ok || !version.ok || !/^[a-f0-9]{64}$/.test(value.version) || (commit && value.commit !== commit)) throw new Error('La versión nativa no pasó health/version.');
  } catch (error) {
    await new Promise((done) => server.close(done));
    throw error;
  }
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let server;
  const stop = async () => {
    if (!server) return;
    const closing = server;
    server = null;
    await new Promise((done) => closing.close(done));
  };
  process.on('message', (message) => { if (message === 'stop') void stop().then(() => process.exit(0)); });
  process.on('SIGINT', () => void stop().then(() => process.exit(0)));
  process.on('SIGTERM', () => void stop().then(() => process.exit(0)));
  process.on('disconnect', () => void stop().then(() => process.exit(0)));
  startNativeApp().then((value) => { server = value; process.send?.({ ready: true, port: value.address().port }); }).catch((error) => { process.send?.({ ready: false, error: error.message }, () => process.exit(1)); if (!process.send) process.exit(1); });
}
