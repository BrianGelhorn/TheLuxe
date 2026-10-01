import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import test from 'node:test';
import { read, root, scripts } from './support/logic.mjs';
import { fileURLToPath } from 'node:url';

execFileSync(process.execPath, ['build.mjs'], { cwd: fileURLToPath(root) });
const worker = (await import(new URL('dist/server/index.js', root))).default;

test('HTTP-011 - Docker publica solo archivos web y escucha en la PC', () => {
  const outputDirectory = 'dist/client';
  assert.match(read('Dockerfile'), /COPY --from=build \/app\/dist\/client\/ \/usr\/share\/nginx\/html\//);
  assert.match(read('Dockerfile'), /FROM node:24-alpine AS api[\s\S]*?COPY api\.mjs logic\.js/);
  assert.match(read('compose.yaml'), /127\.0\.0\.1:8000:8000/);
  assert.match(read('compose.yaml'), /target: api[\s\S]*?data:\/data/);
  assert.match(read('nginx.conf'), /resolver 127\.0\.0\.11[\s\S]*?location \/api\/ \{[\s\S]*?proxy_pass http:\/\/\$api_upstream/);
  assert.match(read('nginx.conf'), /\$http_host != "127\.0\.0\.1:8000"/);
  const files = ['index.html', 'styles.css', 'version.json', ...scripts];
  assert.deepEqual(readdirSync(new URL(`${outputDirectory}/`, root)).sort(), files.sort());
  for (const file of files.filter((item) => !['index.html', 'version.json'].includes(item))) assert.equal(read(`${outputDirectory}/${file}`), read(file));
  const { version, commit } = JSON.parse(read(`${outputDirectory}/version.json`));
  assert.match(version, /^[a-f0-9]{64}$/);
  assert.equal(commit, process.env.SOURCE_COMMIT || null);
  assert.equal(read(`${outputDirectory}/index.html`), read('index.html')
    .replace(/((?:href|src)=")(styles\.css|logic\.js|inventory\.js|script\.js|reports\.js|dialogs\.js)(?:\?[^\"]*)?"/g, (_, prefix, file) => `${prefix}${file}?v=${version}"`)
    .replace('</head>', `  <meta name="theluxe-build" content="${version}">\n</head>`));
  assert.match(read('nginx.conf'), /location = \/version\.json \{[\s\S]*?Cache-Control "no-store, max-age=0"/);
});

test('HTTP-001 - El build sirve el HTML actual y no una copia vieja', async () => {
  const response = await worker.fetch(new Request('http://local/'));
  assert.equal(response.status, 200);
  assert.equal(await response.text(), read('dist/client/index.html'));
  assert.match(response.headers.get('Content-Type'), /text\/html/);
  assert.equal(response.headers.get('Cache-Control'), 'no-cache');
});

test('HTTP-012 - La versión desplegada no queda cacheada', async () => {
  const response = await worker.fetch(new Request('http://local/version.json?t=123'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(JSON.parse(await response.text()), JSON.parse(read('dist/client/version.json')));
  assert.equal((await worker.fetch(new Request('http://local/version.json', { method: 'HEAD' }))).headers.get('Cache-Control'), 'no-store');
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
