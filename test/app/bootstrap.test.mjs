import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../support/app.mjs';

test('BOOT-001 - Carga todos los scripts y muestra los 24 cortes de ejemplo sin errores', (t) => {
  const app = createApp(t, { clean: false });
  assert.equal(app.run('entries.length'), 24);
  assert.equal(app.element('dailyCount').textContent, '24 cortes');
  assert.equal(app.element('dailyNet').textContent, app.money(app.run('dailyRevenue(entries, sales, effectiveCommission).net')));
});

test('BOOT-002 - Una jornada vacia muestra todos los importes en cero', (t) => {
  const app = createApp(t);
  for (const id of ['dailyCollected', 'dailyInvoiced', 'dailyCommission', 'dailyNet', 'cashTotal', 'mpTotal', 'dailyAverageTicket']) {
    assert.equal(app.element(id).textContent, app.money(0), id);
  }
});

test('BOOT-003 - El inicio conserva inventario y claves ajenas pero descarta finanzas de sesiones anteriores', (t) => {
  const inventory = JSON.stringify({ version: 1, products: [], movements: [] });
  const app = createApp(t, { storage: { 'theluxe-inventory-v1': inventory, 'theluxe-cuts': 'old', unrelated: 'keep' } });
  assert.equal(app.window.localStorage.getItem('theluxe-inventory-v1'), inventory);
  assert.equal(app.window.localStorage.getItem('theluxe-cuts'), null);
  assert.equal(app.window.localStorage.getItem('unrelated'), 'keep');
});
