import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { read, root, scripts } from './support/logic.mjs';
import { fileURLToPath } from 'node:url';

execFileSync(process.execPath, ['build.mjs'], { cwd: fileURLToPath(root) });
const worker = (await import(new URL('dist/server/index.js', root))).default;

test('HTTP-001 - El build sirve el HTML actual y no una copia vieja', async () => {
  const response = await worker.fetch(new Request('http://local/'));
  assert.equal(response.status, 200);
  assert.equal(await response.text(), read('index.html'));
  assert.match(response.headers.get('Content-Type'), /text\/html/);
  assert.equal(response.headers.get('Cache-Control'), 'no-cache');
});

for (const [index, file] of ['styles.css', ...scripts].entries()) {
  test(`HTTP-${String(index + 2).padStart(3, '0')} - El build sirve ${file} completo con version de cache`, async () => {
    const response = await worker.fetch(new Request(`http://local/${file}?v=test`));
    assert.equal(response.status, 200);
    assert.equal(await response.text(), read(file));
    assert.match(response.headers.get('Content-Type'), /text\//);
  });
}

test('HTTP-008 - HEAD responde sin cuerpo conservando los encabezados', async () => {
  const response = await worker.fetch(new Request('http://local/', { method: 'HEAD' }));
  assert.equal(response.status, 200);
  assert.equal(await response.text(), '');
  assert.match(response.headers.get('Content-Type'), /text\/html/);
});

test('HTTP-009 - POST se rechaza sin modificar recursos', async () => {
  const response = await worker.fetch(new Request('http://local/', { method: 'POST' }));
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('Allow'), 'GET, HEAD');
});

test('HTTP-010 - Las rutas inexistentes e heredadas del prototipo devuelven 404', async () => {
  for (const path of ['missing', '__proto__', 'constructor', 'toString']) {
    assert.equal((await worker.fetch(new Request(`http://local/${path}`))).status, 404, path);
  }
});
