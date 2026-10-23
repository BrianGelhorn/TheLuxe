import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApi } from '../../api.mjs';

export const pendingKey = 'theluxe-pending-state-v1:previous-window';
export function recoveryFixture() {
  const cut = (id, date, barber, amount, payment = 'Efectivo', tip = 0) => ({ id, date, time: '12:00', barber, service: 'Corte', amount, tip, payment, commissionRate: 50, commissionAmount: amount / 2 });
  const current = {
    config: { services: [{ id: 'c', name: 'Corte', price: 12000 }], barbers: [{ id: 'a', name: 'Ana', active: true }, { id: 'b', name: 'Beto', active: true }], expenseCategories: [], commission: 50, commissionHistory: [] },
    entries: [cut('history', '2026-10-21', 'Ana', 2000), cut('today', '2026-10-23', 'Ana', 1000)],
    sales: [], advances: [], expenses: [], transfers: [], openingAdjustments: [],
    cashRegisters: {
      '2026-10-21': { opened: true, initialCash: 0, initialMp: 0, realCash: 2000, realMp: 0 },
      '2026-10-22': { opened: true, initialCash: 2000, initialMp: 0, realCash: 8000, realMp: 8000, withdrawal: 0, withdrawalMp: 0 },
      '2026-10-23': { opened: true, initialCash: 8000, initialMp: 8000 },
    },
    barberPayments: {},
    inventory: { version: 2, products: [{ id: 'drink', name: 'Bebida', saleEnabled: true, stockEnabled: true, salePrice: 3500, active: true, unit: 'unidades', initialStock: 10, unitCost: 3200, initialUnitCost: 3200, startDate: '2026-10-01' }], movements: [] },
  };
  const state = structuredClone(current);
  state.entries = [structuredClone(current.entries[0]), cut('lost-a', '2026-10-22', 'Ana', 12000, 'Efectivo', 2000), cut('lost-b', '2026-10-22', 'Beto', 16000, 'Mercado Pago')];
  state.sales = [{ id: 'lost-sale', date: '2026-10-22', time: '14:00', productId: 'drink', product: 'Bebida', quantity: 1, unitPrice: 3500, total: 3500, payment: 'Mercado Pago' }];
  state.advances = [{ id: 'lost-advance', date: '2026-10-22', time: '10:00', barber: 'Ana', amount: 1000, payment: 'Efectivo', reason: 'Adelanto' }];
  state.inventory.movements = [{ id: 'lost-stock', productId: 'drink', date: '2026-10-22', time: '14:00', type: 'consumo', quantity: 1, notes: '', cancelled: false, source: 'sale', sourceId: 'lost-sale', cost: 3200 }];
  state.cashRegisters['2026-10-22'] = { opened: true, initialCash: 2000, initialMp: 0 };
  delete state.cashRegisters['2026-10-23'];
  state.barberPayments['2026-10-22'] = { Ana: { status: 'Efectivo', cashAmount: '', mpAmount: '', paidAmount: 7000 }, Beto: { status: 'Mercado Pago', cashAmount: '', mpAmount: '', paidAmount: 8000 } };
  return { current, pending: { revision: 0, state } };
}
export async function recoveryServer(t, state = recoveryFixture().current) {
  const dir = await mkdtemp(join(tmpdir(), 'theluxe-recovery-'));
  const databasePath = join(dir, 'state.sqlite');
  const server = createApi({ databasePath });
  await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); });
  t.after(async () => { await new Promise(done => { server.closeAllConnections(); server.close(done); }); await rm(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const fetchApi = (path, options = {}) => fetch(base + path, { ...options, headers: { ...options.headers, Origin: 'http://127.0.0.1:8000' } });
  const request = async (path, body, method = 'POST') => {
    const response = await fetchApi(path, body === undefined ? {} : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  if (state) {
    const initialized = await request('/api/state', { revision: 0, state }, 'PUT');
    if (initialized.status !== 200) throw new Error('Fixture inválido: ' + JSON.stringify(initialized));
  }
  return { fetch: fetchApi, request, base, databasePath };
}
export async function until(condition) {
  for (let i = 0; i < 100; i++) {
    if (await condition()) return;
    await new Promise(done => setTimeout(done, 10));
  }
  throw new Error('La condición no se confirmó a tiempo.');
}
