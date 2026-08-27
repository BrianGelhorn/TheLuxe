import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const types = {
  'index.html': 'text/html; charset=utf-8',
  'styles.css': 'text/css; charset=utf-8',
  'logic.js': 'text/javascript; charset=utf-8',
  'script.js': 'text/javascript; charset=utf-8',
  'reports.js': 'text/javascript; charset=utf-8',
  'dialogs.js': 'text/javascript; charset=utf-8',
};
const assets = Object.fromEntries(Object.entries(types).map(([file, type]) => [file, [readFileSync(file, 'utf8'), type]]));
const worker = `const assets = ${JSON.stringify(assets)};
export default {
  async fetch(request) {
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    const path = new URL(request.url).pathname;
    const asset = assets[path === '/' ? 'index.html' : path.slice(1)];
    if (!asset) return new Response('Not Found', { status: 404 });
    return new Response(request.method === 'HEAD' ? null : asset[0], { headers: { 'Content-Type': asset[1], 'Cache-Control': path === '/' ? 'no-cache' : 'public, max-age=3600' } });
  },
};
`;

mkdirSync('dist/server', { recursive: true });
writeFileSync('dist/server/index.js', worker);
const built = (await import(`./dist/server/index.js?${Date.now()}`)).default;
if ((await built.fetch(new Request('http://local/'))).status !== 200 || (await built.fetch(new Request('http://local/missing'))).status !== 404) throw new Error('Build check failed');
