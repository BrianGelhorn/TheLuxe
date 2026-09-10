import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { read, root, scripts } from './support/logic.mjs';

const html = read('index.html');
const source = scripts.map(read).join('\n');

test('HTML-001 - Todos los scripts compilan sin redeclaraciones globales', () => {
  for (const file of scripts) assert.doesNotThrow(() => new vm.Script(read(file), { filename: file }));
  assert.doesNotThrow(() => new vm.Script(source));
});

test('HTML-002 - Cada ID de HTML es unico y todos los IDs usados por JavaScript existen', () => {
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  const referenced = [...source.matchAll(/getElementById\(['"]([^'"]+)/g)].map((match) => match[1]);
  assert.deepEqual([...new Set(referenced.filter((id) => !ids.includes(id)))], []);
});

test('HTML-003 - Los campos referenciados tienen controles con nombre en el HTML', () => {
  const names = new Set([...html.matchAll(/\sname="([^"]+)"/g)].map((match) => match[1]));
  const referenced = [...source.matchAll(/\.elements(?:\.([A-Za-z_$][\w$]*)|\[['"]([^'"]+))/g)].map((match) => match[1] || match[2]);
  assert.deepEqual([...new Set(referenced.filter((name) => !names.has(name)))], []);
});

test('HTML-004 - Los recursos locales existen y los scripts cargan en orden', () => {
  const assets = [...html.matchAll(/(?:src|href)="([^"?]+)(?:\?[^" ]*)?"/g)].map((match) => match[1]).filter((path) => !path.includes('://'));
  assert.deepEqual(assets.filter((path) => !existsSync(new URL(path, root))), []);
  assert.deepEqual([...html.matchAll(/<script src="([^"?]+)/g)].map((match) => match[1]), scripts);
});

test('HTML-005 - El desglose presenta servicios y propinas antes de su subtotal', () => {
  assert.match(html, /<tr><th scope="row">Servicios<\/th>[^\n]*id="dailyServices"[^\n]*<\/tr>\s*<tr><th scope="row">Propinas<\/th>[^\n]*<\/tr>\s*<tr class="collection-subtotal">[^\n]*id="dailyServicesTotal"[^\n]*id="dailyServicesTotalCash"[^\n]*id="dailyServicesTotalMp"/);
});

test('HTML-006 - Facturado se integra al neto y ambos saldos comparten tarjeta', () => {
  assert.match(html, /accounting-note">Facturado<strong id="dailyInvoiced">/);
  assert.match(html, /saldos-metric[\s\S]*?id="cashTotal"[\s\S]*?id="mpTotal"/);
});

test('HTML-007 - Transferir conserva una direccion y queda al final de movimientos', () => {
  const cashView = html.match(/<section id="salesView"[\s\S]*?<\/section>/)[0];
  assert.ok(cashView.indexOf('transfer-card') > cashView.indexOf('inventory-card'));
  assert.doesNotMatch(cashView, /name="to"/);
  assert.equal([...cashView.matchAll(/class="movement-body" tabindex="0" role="region"/g)].length, [...cashView.matchAll(/<article\b/g)].length);
});

test('HTML-008 - Las tarjetas de movimientos tienen alto fijo y contenido desplazable', () => {
  const css = read('styles.css');
  assert.match(css, /#salesView > \.daily-sheet\s*\{[^}]*grid-column: auto;[^}]*height: 28rem;/);
  assert.match(css, /#salesView \.movement-body\s*\{[^}]*min-height: 0;[^}]*overflow: auto;/);
});
