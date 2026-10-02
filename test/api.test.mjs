import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { createApi } from '../api.mjs';

const state = () => ({
  config: { services: [], barbers: [], expenseCategories: [], commission: 50, commissionHistory: [] }, entries: [], sales: [], advances: [], expenses: [], transfers: [], openingAdjustments: [], cashRegisters: {}, barberPayments: {},
  inventory: { version: 2, products: [], movements: [] },
});
const appSnapshot = () => ({
  config: { services: [{ id: 'corte', name: 'Corte clásico', price: 15000 }], barbers: [{ id: 'Mateo', name: 'Mateo', active: true }], expenseCategories: [{ id: 'otros', name: 'Otros' }], commission: 50, commissionHistory: [{ date: '0000-01-01', rate: 50 }] },
  entries: [{ id: 'cut-1', date: '2026-09-03', time: '10:00', barber: 'Mateo', service: 'Corte clásico', amount: 15000, tip: 0, payment: 'Efectivo', cashAmount: 0, mpAmount: 0, notes: '', commissionRate: 50, commissionAmount: 7500 }],
  sales: [{ id: 'sale-1', date: '2026-09-03', time: '10:10', productId: 'pomada', product: 'Pomada', quantity: 1, unitPrice: 12000, total: 12000, payment: 'Mercado Pago' }],
  advances: [{ id: 'advance-1', date: '2026-09-03', time: '11:00', barber: 'Mateo', amount: 1000, payment: 'Efectivo', reason: '' }],
  expenses: [{ id: 'expense-1', date: '2026-09-03', time: '11:10', amount: 500, payment: 'Efectivo', reason: 'Limpieza', category: 'Otros' }],
  transfers: [{ id: 'transfer-1', date: '2026-09-03', time: '12:00', from: 'Efectivo', to: 'Mercado Pago', amount: 200, description: 'Transferencia entre medios' }],
  openingAdjustments: [{ id: 'opening-1', date: '2026-09-03', time: '09:00', medium: 'Efectivo', previous: 0, current: 50000, description: 'Apertura' }],
  cashRegisters: { '2026-09-03': { initialCash: 50000, initialMp: 80000, opened: true, realCash: 49000, realMp: 80000, withdrawal: 0, withdrawalMp: 0, openedAt: '2026-09-03T09:00:00.000Z', updatedAt: '2026-09-03T12:00:00.000Z' } },
  barberPayments: { '2026-09-03': { Mateo: { status: 'Mixto', cashAmount: '', mpAmount: '' }, Legacy: 'No pago' } },
  inventory: { version: 2, products: [{ id: 'pomada', name: 'Pomada', saleEnabled: true, stockEnabled: false, salePrice: 12000, active: true }], movements: [] },
});
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'theluxe-api-'));
  const databasePath = join(dir, 'state.sqlite');
  const start = () => new Promise((resolve) => {
    const server = createApi({ databasePath });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
  let server = await start();
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); await rm(dir, { recursive: true, force: true }); });
  return {
    url: () => `http://127.0.0.1:${server.address().port}`,
    restart: async () => { await new Promise((resolve) => server.close(resolve)); server = await start(); },
    seedLegacy: (state) => {
      const db = new DatabaseSync(databasePath);
      try { db.prepare('INSERT INTO api_state (id, revision, state) VALUES (1, 1, ?)').run(JSON.stringify(state)); }
      finally { db.close(); }
    },
  };
}
async function request(base, path, options) {
  const response = await fetch(base + path, options);
  return { status: response.status, body: await response.json() };
}

test('API CAS state and domain resources', async (t) => {
  const api = await fixture(t);
  assert.deepEqual((await request(api.url(), '/api/state')).body, { revision: 0, state: null });
  assert.equal((await request(api.url(), '/api/state', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: 0, state: state() }) })).body.revision, 1);
  const cut = { id: 'cut-1', date: '2026-09-03', time: '10:00', barber: 'Mateo', service: 'Corte', amount: 100, payment: 'Efectivo' };
  assert.equal((await request(api.url(), '/api/cuts', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: 1, data: [cut] }) })).body.revision, 2);
  assert.deepEqual((await request(api.url(), '/api/cuts')).body, { revision: 2, data: [cut] });
  assert.equal((await request(api.url(), '/api/sales', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: 1, data: [] }) })).status, 409);
});

test('API validates input and inventory without overwriting state', async (t) => {
  const api = await fixture(t);
  const headers = { 'Content-Type': 'application/json' };
  const malformed = await request(api.url(), '/api/state', { method: 'PUT', headers, body: '{' });
  assert.deepEqual(malformed, { status: 400, body: { error: 'Malformed JSON' } });
  const corrupt = { ...state(), inventory: { version: 2, products: [{}], movements: [] } };
  assert.equal((await request(api.url(), '/api/state', { method: 'PUT', headers, body: JSON.stringify({ revision: 0, state: corrupt }) })).status, 400);
  assert.equal((await request(api.url(), '/api/state', { method: 'PUT', headers, body: JSON.stringify({ revision: 0, state: state() }) })).status, 200);
  assert.equal((await request(api.url(), '/api/inventory', { method: 'PUT', headers, body: JSON.stringify({ revision: 1, data: { version: 2, products: [{}], movements: [] } }) })).status, 400);
  assert.equal((await request(api.url(), '/api/cuts', { method: 'PUT', headers, body: JSON.stringify({ revision: 1, data: [{}] }) })).status, 400);
  assert.equal((await request(api.url(), '/api/cuts', { method: 'PUT', headers, body: JSON.stringify({ revision: 1, data: [null] }) })).status, 400);
  assert.equal((await request(api.url(), '/api/cuts', { method: 'PUT', headers: { ...headers, Origin: 'https://evil.example' }, body: JSON.stringify({ revision: 1, data: [] }) })).status, 403);
  assert.equal((await request(api.url(), '/api/state')).body.revision, 1);
});

test('API accepts an app snapshot and payment drafts while rejecting malformed financial rows', async (t) => {
  const api = await fixture(t);
  const headers = { 'Content-Type': 'application/json' };
  const snapshot = appSnapshot();
  assert.equal((await request(api.url(), '/api/state', { method: 'PUT', headers, body: JSON.stringify({ revision: 0, state: snapshot }) })).status, 200);
  assert.deepEqual((await request(api.url(), '/api/barber-payments')).body, { revision: 1, data: snapshot.barberPayments });
  assert.equal((await request(api.url(), '/api/sales', { method: 'PUT', headers, body: JSON.stringify({ revision: 1, data: [{ id: 'bad', date: '2026-09-03', time: '10:00', productId: 'pomada', product: 'Pomada', quantity: 1, unitPrice: 12000, total: -1, payment: 'Efectivo' }] }) })).status, 400);
  assert.equal((await request(api.url(), '/api/sales', { method: 'PUT', headers, body: JSON.stringify({ revision: 1, data: [{ ...snapshot.sales[0], total: 1 }] }) })).status, 400);
  assert.equal((await request(api.url(), '/api/cuts', { method: 'PUT', headers, body: JSON.stringify({ revision: 1, data: [{ ...snapshot.entries[0], payment: 'Ambos', cashAmount: 1, mpAmount: 1 }] }) })).status, 400);
  const large = await request(api.url(), '/api/state', { method: 'PUT', headers, body: JSON.stringify({ revision: 1, state: 'x'.repeat(16 * 1024 * 1024) }) });
  assert.deepEqual(large, { status: 413, body: { error: 'Payload too large' } });
  assert.equal((await request(api.url(), '/api/state')).body.revision, 1);
});

test('API nested resources persist after restart', async (t) => {
  const api = await fixture(t);
  const headers = { 'Content-Type': 'application/json' };
  await request(api.url(), '/api/state', { method: 'PUT', headers, body: JSON.stringify({ revision: 0, state: state() }) });
  assert.equal((await request(api.url(), '/api/services', { method: 'PUT', headers, body: JSON.stringify({ revision: 1, data: [{ id: 'corte', name: 'Corte', price: 12000 }] }) })).status, 200);
  await api.restart();
  assert.deepEqual((await request(api.url(), '/api/services')).body, { revision: 2, data: [{ id: 'corte', name: 'Corte', price: 12000 }] });
});

test('API conserva ventas anteriores al inicio del control de stock', async (t) => {
  const api = await fixture(t);
  const headers = { 'Content-Type': 'application/json' };
  const old = appSnapshot();
  assert.equal((await request(api.url(), '/api/state', { method: 'PUT', headers, body: JSON.stringify({ revision: 0, state: old }) })).status, 200);
  const withStock = { ...old.inventory.products[0], stockEnabled: true, unit: 'unidades', initialStock: 10, unitCost: 100, initialUnitCost: 100, startDate: '2026-09-01' };
  assert.equal((await request(api.url(), '/api/products', { method: 'PUT', headers, body: JSON.stringify({ revision: 1, data: [withStock] }) })).status, 200);
  assert.equal((await request(api.url(), '/api/sales')).body.data[0].id, 'sale-1');
});

test('API permite comisión diaria antes de abrir la caja sin aceptar registros incompletos', async (t) => {
  const api = await fixture(t);
  const headers = { 'Content-Type': 'application/json' };
  const pending = state();
  pending.cashRegisters = { '2026-09-03': { commissionRate: 60 } };
  assert.equal((await request(api.url(), '/api/state', { method: 'PUT', headers, body: JSON.stringify({ revision: 0, state: pending }) })).status, 200);
  assert.deepEqual((await request(api.url(), '/api/cash-registers')).body, { revision: 1, data: pending.cashRegisters });
  for (const row of [{}, { opened: true }, { commissionRate: -1 }, { commissionRate: 101 }, { commissionRate: 60, withdrawal: 1 }]) {
    assert.equal((await request(api.url(), '/api/cash-registers', { method: 'PUT', headers, body: JSON.stringify({ revision: 1, data: { '2026-09-03': row } }) })).status, 400, JSON.stringify(row));
  }
  const opened = { '2026-09-03': { commissionRate: 60, initialCash: 0, initialMp: 0, opened: true } };
  assert.equal((await request(api.url(), '/api/cash-registers', { method: 'PUT', headers, body: JSON.stringify({ revision: 1, data: opened }) })).status, 200);
  assert.deepEqual((await request(api.url(), '/api/cash-registers')).body, { revision: 2, data: opened });
});

test('API persiste el pago simple entregado y rechaza importes inválidos', async (t) => {
  const api = await fixture(t);
  const headers = { 'Content-Type': 'application/json' };
  assert.equal((await request(api.url(), '/api/state', { method: 'PUT', headers, body: JSON.stringify({ revision: 0, state: state() }) })).status, 200);
  const paid = { '2026-09-03': { Mateo: { status: 'Efectivo', cashAmount: '', mpAmount: '', paidAmount: 500 } } };
  assert.equal((await request(api.url(), '/api/barber-payments', { method: 'PUT', headers, body: JSON.stringify({ revision: 1, data: paid }) })).status, 200);
  assert.deepEqual((await request(api.url(), '/api/barber-payments')).body, { revision: 2, data: paid });
  for (const paidAmount of [-1, 0.5, '500', 1_000_000_001]) {
    const invalid = { '2026-09-03': { Mateo: { ...paid['2026-09-03'].Mateo, paidAmount } } };
    assert.equal((await request(api.url(), '/api/barber-payments', { method: 'PUT', headers, body: JSON.stringify({ revision: 2, data: invalid }) })).status, 400, String(paidAmount));
  }
  assert.equal((await request(api.url(), '/api/barber-payments')).body.revision, 2);
});

test('API rechaza entradas vinculadas a ventas sin modificar el inventario', async (t) => {
  const api = await fixture(t);
  const headers = { 'Content-Type': 'application/json' };
  const snapshot = appSnapshot();
  snapshot.inventory.products[0] = { ...snapshot.inventory.products[0], stockEnabled: true, unit: 'unidades', startDate: '2026-09-01', initialStock: 5, unitCost: 100, initialUnitCost: 100 };
  const linked = { id: 'sale-stock-1', productId: 'pomada', date: '2026-09-03', time: '10:10', type: 'entrada', quantity: 1, notes: '', cancelled: false, source: 'sale', sourceId: 'sale-1' };
  snapshot.inventory.movements = [linked];
  assert.equal((await request(api.url(), '/api/state', { method: 'PUT', headers, body: JSON.stringify({ revision: 0, state: snapshot }) })).status, 400);
  linked.type = 'consumo';
  assert.equal((await request(api.url(), '/api/state', { method: 'PUT', headers, body: JSON.stringify({ revision: 0, state: snapshot }) })).status, 200);
  assert.equal((await request(api.url(), '/api/stock-movements', { method: 'PUT', headers, body: JSON.stringify({ revision: 1, data: [{ ...linked, type: 'entrada' }] }) })).status, 400);
  assert.deepEqual((await request(api.url(), '/api/stock-movements')).body, { revision: 1, data: [linked] });
});

test('API impide alterar la comisión o asignar una propina mixta imposible sin tocar legados', async (t) => {
  const api = await fixture(t);
  const headers = { 'Content-Type': 'application/json' };
  const snapshot = appSnapshot();
  snapshot.entries[0].commissionAmount = 1; // Imported legacy snapshot remains readable.
  assert.equal((await request(api.url(), '/api/state', { method: 'PUT', headers, body: JSON.stringify({ revision: 0, state: snapshot }) })).status, 400);
  api.seedLegacy(snapshot);
  const noteOnly = [{ ...snapshot.entries[0], notes: 'edit' }];
  assert.equal((await request(api.url(), '/api/cuts', { method: 'PUT', headers, body: JSON.stringify({ revision: 1, data: noteOnly }) })).body.revision, 2);
  for (const data of [
    [{ ...snapshot.entries[0], commissionAmount: 2 }],
    [{ ...snapshot.entries[0], commissionAmount: 7500, payment: 'Ambos', tip: 16000, cashAmount: 15500, mpAmount: 15500 }],
  ]) assert.equal((await request(api.url(), '/api/cuts', { method: 'PUT', headers, body: JSON.stringify({ revision: 2, data }) })).status, 400);
  assert.equal((await request(api.url(), '/api/state')).body.revision, 2);
  const valid = [{ ...snapshot.entries[0], commissionAmount: 7500, payment: 'Ambos', tip: 100, cashAmount: 15000, mpAmount: 100 }];
  assert.equal((await request(api.url(), '/api/cuts', { method: 'PUT', headers, body: JSON.stringify({ revision: 2, data: valid }) })).body.revision, 3);
});

test('API rechaza retiros mayores al cierre real y conserva la revisión', async (t) => {
  const api = await fixture(t);
  const headers = { 'Content-Type': 'application/json' };
  const snapshot = appSnapshot();
  assert.equal((await request(api.url(), '/api/state', { method: 'PUT', headers, body: JSON.stringify({ revision: 0, state: snapshot }) })).body.revision, 1);
  for (const [field, value] of [['withdrawal', 49001], ['withdrawalMp', 80001]]) {
    const bad = structuredClone(snapshot.cashRegisters);
    bad['2026-09-03'][field] = value;
    assert.equal((await request(api.url(), '/api/cash-registers', { method: 'PUT', headers, body: JSON.stringify({ revision: 1, data: bad }) })).status, 400);
  }
  assert.equal((await request(api.url(), '/api/state')).body.revision, 1);
});

test('API exige consumo para ventas nuevas después del inicio de stock, salvo el día de activación', async (t) => {
  const api = await fixture(t);
  const headers = { 'Content-Type': 'application/json' };
  const snapshot = appSnapshot();
  snapshot.inventory.products[0] = { ...snapshot.inventory.products[0], stockEnabled: true, unit: 'unidades', initialStock: 5, unitCost: 100, initialUnitCost: 100, startDate: '2026-09-03' };
  assert.equal((await request(api.url(), '/api/state', { method: 'PUT', headers, body: JSON.stringify({ revision: 0, state: snapshot }) })).body.revision, 1);
  const later = { ...snapshot.sales[0], id: 'sale-later', date: '2026-09-04' };
  assert.equal((await request(api.url(), '/api/sales', { method: 'PUT', headers, body: JSON.stringify({ revision: 1, data: [...snapshot.sales, later] }) })).status, 400);
  assert.equal((await request(api.url(), '/api/state')).body.revision, 1);
  const sameDay = { ...later, id: 'sale-start', date: '2026-09-03' };
  assert.equal((await request(api.url(), '/api/sales', { method: 'PUT', headers, body: JSON.stringify({ revision: 1, data: [...snapshot.sales, sameDay] }) })).body.revision, 2);
});

test('API rechaza transferencias nuevas sin saldo inicial suficiente, sin reinterpretar déficits legados', async (t) => {
  const api = await fixture(t);
  const headers = { 'Content-Type': 'application/json' };
  const snapshot = state();
  snapshot.cashRegisters = { '2026-09-03': { initialCash: 100, initialMp: 0, opened: true } };
  snapshot.transfers = [{ id: 'legacy-transfer', date: '2026-09-03', time: '10:00', from: 'Efectivo', to: 'Mercado Pago', amount: 200, description: '' }];
  assert.equal((await request(api.url(), '/api/state', { method: 'PUT', headers, body: JSON.stringify({ revision: 0, state: snapshot }) })).status, 400);
  api.seedLegacy(snapshot);
  const next = [...snapshot.transfers, { id: 'new-transfer', date: '2026-09-04', time: '10:00', from: 'Efectivo', to: 'Mercado Pago', amount: 1, description: '' }];
  assert.equal((await request(api.url(), '/api/transfers', { method: 'PUT', headers, body: JSON.stringify({ revision: 1, data: next }) })).body.revision, 2, 'unknown opening does not reject history');
  const unsafe = [...next, { id: 'unsafe-transfer', date: '2026-09-03', time: '11:00', from: 'Efectivo', to: 'Mercado Pago', amount: 1, description: '' }];
  assert.equal((await request(api.url(), '/api/transfers', { method: 'PUT', headers, body: JSON.stringify({ revision: 2, data: unsafe }) })).status, 400);
  assert.equal((await request(api.url(), '/api/state')).body.revision, 2);
});
