import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { recoveryPlan, mergeRecovery } from '../recovery.mjs';
import { recoveryFixture, recoveryServer } from './support/recovery.mjs';

test('REC-001 - recupera solo faltantes y preserva todos los datos actuales, cierres y configuración', () => {
  const { current, pending } = recoveryFixture();
  const original = structuredClone(current);
  const plan = recoveryPlan(current, pending.state);
  assert.equal(plan.recoverable, 7);
  assert.equal(plan.conflicts, 1);
  const result = mergeRecovery(current, plan, plan.items.filter(row => row.status === 'missing').map(row => row.key));
  assert.deepEqual(current, original);
  assert.equal(result.state.entries.length, 4);
  assert.deepEqual(result.state.entries.slice(0, 2), current.entries);
  assert.deepEqual(result.state.cashRegisters, current.cashRegisters);
  assert.deepEqual(result.state.config, current.config);
  assert.equal(recoveryPlan(result.state, pending.state).recoverable, 0);
  assert.deepEqual(result.added, { Corte: 2, Venta: 1, Adelanto: 1, 'Movimiento de stock': 1, 'Pago a barbero': 2 });
});

test('REC-002 - registra diferencias, posibles duplicados y dependencias sin sobrescribir', () => {
  const { current, pending } = recoveryFixture();
  current.entries.push({ ...pending.state.entries[1], amount: 13000 });
  current.entries.push({ ...pending.state.entries[2], id: 'reentered' });
  current.sales.push({ ...pending.state.sales[0], id: 'reentered-sale' });
  current.inventory.movements.push({ ...pending.state.inventory.movements[0], id: 'reentered-stock', sourceId: 'reentered-sale' });
  pending.state.config.commission = 40;
  const plan = recoveryPlan(current, pending.state);
  assert.equal(plan.items.find(row => row.id === 'lost-a').status, 'conflict');
  assert.match(plan.items.find(row => row.id === 'lost-b').reason, /duplicado/);
  assert.equal(plan.items.find(row => row.id === 'lost-stock').status, 'conflict');
  assert.equal(plan.items.find(row => row.label === 'Pago a barbero').status, 'conflict');
  assert.match(plan.warnings.join(' '), /comisión general/);
});

test('REC-003 - exige datos relacionados y una selección válida', () => {
  const { current, pending } = recoveryFixture();
  const plan = recoveryPlan(current, pending.state);
  const sale = plan.items.find(row => row.id === 'lost-sale');
  assert.throws(() => mergeRecovery(current, plan, [sale.key]), /relacionados/);
  for (const selection of [[], ['missing'], [sale.key, sale.key], 'all']) assert.throws(() => mergeRecovery(current, plan, selection));
  assert.throws(() => mergeRecovery(current, plan, [plan.items.find(row => row.status === 'conflict').key]));
});

test('REC-004 - recupera catálogos, apertura y pagos sin aceptar referencias inexistentes', () => {
  const { current, pending } = recoveryFixture();
  delete current.cashRegisters['2026-10-22'];
  current.config.barbers = [];
  current.config.services = [];
  current.inventory.products = [];
  pending.state.config.expenseCategories.push({ id: 'other', name: 'Otros' });
  const plan = recoveryPlan(current, pending.state);
  const result = mergeRecovery(current, plan, plan.items.filter(row => row.status === 'missing').map(row => row.key));
  assert.equal(result.state.config.barbers.length, 2);
  assert.equal(result.state.config.services.length, 1);
  assert.equal(result.state.config.expenseCategories.length, 1);
  assert.deepEqual(result.state.cashRegisters['2026-10-22'], pending.state.cashRegisters['2026-10-22']);
  assert.equal(result.state.inventory.products.length, 1);
  pending.state.config.barbers = [];
  assert.equal(recoveryPlan(current, pending.state).items.find(row => row.id === 'lost-a').status, 'conflict');
});

test('REC-011 - un movimiento con producto inexistente bloquea también la venta relacionada', () => {
  const { current, pending } = recoveryFixture();
  pending.state.inventory.movements[0].productId = 'missing-product';
  const plan = recoveryPlan(current, pending.state);
  assert.equal(plan.items.find(row => row.id === 'lost-stock').status, 'conflict');
  assert.equal(plan.items.find(row => row.id === 'lost-sale').status, 'conflict');
});

test('REC-012 - dos cortes legítimos del mismo barbero y hora se pueden recuperar en pasos separados', () => {
  const { current, pending } = recoveryFixture();
  const second = { ...pending.state.entries[1], id: 'same-time-second-cut' };
  pending.state.entries.push(second);
  const plan = recoveryPlan(current, pending.state);
  const first = plan.items.find(row => row.id === 'lost-a');
  const partial = mergeRecovery(current, plan, [first.key]).state;
  const remaining = recoveryPlan(partial, pending.state);
  assert.equal(remaining.items.find(row => row.id === second.id).status, 'missing');
  const result = mergeRecovery(partial, remaining, [remaining.items.find(row => row.id === second.id).key]).state;
  assert.equal(result.entries.filter(row => row.barber === 'Ana' && row.date === '2026-10-22').length, 2);
});

test('REC-005 - API crea respaldo atómico, conserva operaciones nuevas y permite reintentar un acuse perdido', async t => {
  const { current, pending } = recoveryFixture();
  const api = await recoveryServer(t, current);
  const raw = JSON.stringify(pending);
  const preview = await api.request('/api/recovery/preview', { raw });
  assert.equal(preview.status, 200);
  const selected = preview.body.items.filter(row => row.status === 'missing').map(row => row.key);
  const payload = { raw, revision: 1, selected, requestId: 'recovery-request' };
  const result = await api.request('/api/recovery/apply', payload);
  assert.equal(result.status, 200);
  assert.equal(result.body.revision, 2);
  assert.deepEqual(result.body.state.entries.slice(0, 2), current.entries);
  assert.deepEqual(result.body.state.cashRegisters, current.cashRegisters);
  const backup = await api.request('/api/recovery/history/recovery-request');
  assert.deepEqual(backup.body.state, current);
  assert.equal(backup.body.pendingRaw, raw);
  assert.equal((await api.request('/api/recovery/apply', payload)).body.replayed, true);
  assert.equal((await api.request('/api/recovery/history')).body.items.length, 1);
  const latest = (await api.request('/api/state')).body;
  latest.state.entries.push({ ...current.entries[1], id: 'new-later-operation', time: '18:00' });
  assert.equal((await api.request('/api/state', latest, 'PUT')).status, 200);
  const replay = await api.request('/api/recovery/apply', payload);
  assert.equal(replay.body.revision, 3);
  assert.equal(replay.body.state.entries.at(-1).id, 'new-later-operation');
});

test('REC-006 - revisión adelantada, selección alterada y errores no crean cambios parciales', async t => {
  const { current, pending } = recoveryFixture();
  const api = await recoveryServer(t, current);
  const raw = JSON.stringify(pending);
  const plan = (await api.request('/api/recovery/preview', { raw })).body;
  const selected = plan.items.filter(row => row.status === 'missing').map(row => row.key);
  assert.equal((await api.request('/api/recovery/apply', { raw, revision: 0, selected, requestId: 'stale' })).status, 409);
  assert.equal((await api.request('/api/recovery/apply', { raw, revision: 1, selected: ['bad'], requestId: 'bad-selection' })).status, 400);
  assert.equal((await api.request('/api/recovery/apply', { raw, revision: 1, selected: [selected[0], selected[0]], requestId: 'dupes' })).status, 400);
  const sale = plan.items.find(row => row.id === 'lost-sale');
  assert.equal((await api.request('/api/recovery/apply', { raw, revision: 1, selected: [sale.key], requestId: 'partial' })).status, 400);
  assert.deepEqual((await api.request('/api/state')).body.state, current);
  assert.equal((await api.request('/api/recovery/history')).body.items.length, 0);
});

test('REC-007 - una copia dañada se puede archivar y descargar sin cambiar el estado ni perder el original', async t => {
  const api = await recoveryServer(t);
  const before = (await api.request('/api/state')).body;
  const raw = '{copia dañada';
  assert.equal((await api.request('/api/recovery/preview', { raw })).status, 400);
  assert.equal((await api.request('/api/recovery/archive', { raw, revision: before.revision, requestId: 'bad-archive' })).status, 200);
  assert.deepEqual((await api.request('/api/state')).body, before);
  assert.equal((await api.request('/api/recovery/history/bad-archive')).body.pendingRaw, raw);
  assert.equal((await api.request('/api/recovery/history/missing')).status, 404);
});

test('REC-008 - rechaza copias y solicitudes inválidas, orígenes ajenos y reutilización distinta de una solicitud', async t => {
  const api = await recoveryServer(t);
  const { pending } = recoveryFixture();
  for (const raw of ['', null, '{}', JSON.stringify({ ...pending, revision: -1 })]) assert.equal((await api.request('/api/recovery/preview', { raw })).status, 400);
  assert.equal((await api.request('/api/recovery/apply', { raw: JSON.stringify(pending) })).status, 400);
  const response = await fetch(api.base + '/api/recovery/archive', { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(response.status, 403);
  const payload = { raw: 'first', revision: 1, requestId: 'same' };
  assert.equal((await api.request('/api/recovery/archive', payload)).status, 200);
  assert.equal((await api.request('/api/recovery/archive', { ...payload, raw: 'other' })).status, 409);
  assert.equal((await api.request('/api/state', {}, 'POST')).status, 405);
});

test('REC-009 - un fallo al escribir revierte tanto la recuperación como su respaldo', async t => {
  const { current, pending } = recoveryFixture();
  const api = await recoveryServer(t, current);
  const raw = JSON.stringify(pending);
  const plan = (await api.request('/api/recovery/preview', { raw })).body;
  const db = new DatabaseSync(api.databasePath);
  db.exec("CREATE TRIGGER fail_recovery BEFORE UPDATE ON api_state BEGIN SELECT RAISE(ABORT, 'forced failure'); END");
  const failed = await api.request('/api/recovery/apply', { raw, revision: 1, selected: plan.items.filter(row => row.status === 'missing').map(row => row.key), requestId: 'rollback' });
  assert.equal(failed.status, 500);
  assert.deepEqual((await api.request('/api/state')).body, { revision: 1, state: current });
  assert.equal((await api.request('/api/recovery/history')).body.items.length, 0);
  db.exec('DROP TRIGGER fail_recovery'); db.close();
  assert.equal((await api.request('/api/recovery/archive', { raw, revision: 1, requestId: 'after-rollback' })).status, 200);
});

test('REC-010 - nuevas comisiones inconsistentes no se guardan y la base vacía no se usa como comparación', async t => {
  const { pending } = recoveryFixture();
  const api = await recoveryServer(t);
  pending.state.entries[1].commissionAmount++;
  const raw = JSON.stringify(pending);
  const plan = (await api.request('/api/recovery/preview', { raw })).body;
  assert.equal((await api.request('/api/recovery/apply', { raw, revision: 1, selected: plan.items.filter(row => row.status === 'missing').map(row => row.key), requestId: 'bad-commission' })).status, 400);
  assert.equal((await api.request('/api/recovery/history')).body.items.length, 0);
  const empty = await recoveryServer(t, null);
  assert.equal((await empty.request('/api/recovery/preview', { raw })).status, 409);
  assert.equal((await empty.request('/api/recovery/archive', { raw, revision: 0, requestId: 'empty' })).status, 409);
});
