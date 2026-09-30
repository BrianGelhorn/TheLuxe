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
  assert.deepEqual([...new Set(referenced.filter((name) => name !== 'namedItem' && !names.has(name)))], []);
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
  assert.ok(cashView.indexOf('transfer-card') > -1);
  assert.doesNotMatch(cashView, /inventory-card/);
  assert.doesNotMatch(cashView, /name="to"/);
  assert.equal([...cashView.matchAll(/class="movement-body" tabindex="0" role="region"/g)].length, [...cashView.matchAll(/<article\b/g)].length);
});

test('HTML-011 - El cierre separa los retiros de efectivo y MP', () => {
  assert.match(html, /name="withdrawal"[\s\S]*?name="withdrawalMp"/);
  assert.match(html, /Retiro efectivo[\s\S]*?Retiro MP/);
});

test('HTML-009 - El control de stock vive en una vista operativa propia', () => {
  const stockView = html.match(/<section id="stockView"[\s\S]*?<\/section>/)[0];
  assert.match(stockView, /id="stockMovementForm"/);
  assert.match(stockView, /data-view="configView"/);
  assert.match(html, /data-view="stockView"/);
});

test('HTML-010 - El resumen de stock queda al final y distingue venta de inventario', () => {
  assert.ok(html.indexOf('id="stockReport"') > html.indexOf('id="summaryRows"'));
  assert.ok(html.indexOf('id="stockReport"') < html.indexOf('id="configView"'));
  assert.match(html, /<h2>Ventas y stock<\/h2>/);
  assert.doesNotMatch(html, /<h2>Productos de venta<\/h2>/);
  assert.match(html, /class="movement-history stock-report-details"><summary>Ver detalle por producto<\/summary>/);
});

test('HTML-012 - El control de actualizaciones está dentro de Configuración', () => {
  assert.ok(html.indexOf('id="checkUpdates"') > html.indexOf('id="configView"'));
  assert.ok(html.indexOf('id="configApplyUpdate"') < html.indexOf('id="cutDialog"'));
});

test('HTML-008 - El scroll horizontal queda limitado al kanban de barberos', () => {
  const css = read('styles.css');
  assert.match(css, /#salesView > \.daily-sheet\s*\{[^}]*grid-column: auto;[^}]*height: 28rem;/);
  assert.match(css, /#salesView \.movement-body\s*\{[^}]*min-height: 0;[^}]*overflow-x: clip;[^}]*overflow-y: auto;/);
  assert.match(css, /\.barber-columns\s*\{[^}]*overflow-x:\s*auto/);
  assert.doesNotMatch(css, /\.sales-table-wrap\s*\{[^}]*overflow-x:\s*auto/);
  assert.doesNotMatch(css, /\.collection-table-wrap\s*\{[^}]*overflow-x:\s*auto/);
});
