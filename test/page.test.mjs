import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const html = read('index.html');
const scripts = ['logic.js', 'reports.js', 'dialogs.js', 'script.js'];
const source = scripts.map(read).join('\n');
const context = {};
vm.runInNewContext(read('logic.js'), context);
const logic = context.TheLuxeLogic;

test('la interfaz mantiene IDs, campos y archivos requeridos', () => {
  scripts.forEach((file) => assert.doesNotThrow(() => new vm.Script(read(file), { filename: file }), `${file} tiene un error de sintaxis`));
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'hay IDs HTML duplicados');

  const referencedIds = [...source.matchAll(/getElementById\(['"]([^'"]+)/g)].map((match) => match[1]);
  assert.deepEqual([...new Set(referencedIds.filter((id) => !ids.includes(id)))], [], 'JavaScript referencia IDs inexistentes');

  const names = new Set([...html.matchAll(/\sname="([^"]+)"/g)].map((match) => match[1]));
  const referencedNames = [...source.matchAll(/\.elements(?:\.([A-Za-z_$][\w$]*)|\[['"]([^'"]+))/g)].map((match) => match[1] || match[2]);
  assert.deepEqual([...new Set(referencedNames.filter((name) => !names.has(name)))], [], 'JavaScript referencia campos inexistentes');

  const localAssets = [...html.matchAll(/(?:src|href)="([^"?]+)(?:\?[^" ]*)?"/g)]
    .map((match) => match[1]).filter((path) => !path.includes('://'));
  assert.deepEqual(localAssets.filter((path) => !existsSync(new URL(`../${path}`, import.meta.url))), [], 'faltan recursos locales');
  assert.deepEqual([...html.matchAll(/<script src="([^"?]+)/g)].map((match) => match[1]), scripts, 'los scripts cargan fuera de orden');
});

const cuts = [
  { date: '2026-08-27', payment: 'Efectivo', amount: 1000, tip: 200, commissionAmount: 500 },
  { date: '2026-08-27', payment: 'Mercado Pago', amount: 2000, tip: 0, commissionAmount: 1000 },
  { date: '2026-08-27', payment: 'Ambos', amount: 900, tip: 100, cashAmount: 600, mpAmount: 400, commissionAmount: 450 },
];
const sales = [{ payment: 'Efectivo', total: 500 }, { payment: 'Mercado Pago', total: 700 }];
const advances = [{ payment: 'Efectivo', amount: 300 }, { payment: 'Mercado Pago', amount: 100 }];
const expenses = [{ payment: 'Efectivo', amount: 50 }, { payment: 'Mercado Pago', amount: 200 }];
const transfers = [{ from: 'Efectivo', to: 'Mercado Pago', amount: 100 }];

test('calcula pagos simples, mixtos y movimientos entre medios', () => {
  assert.equal(logic.parseAmount('$ 15.000'), 15000);
  assert.equal(logic.paymentTotal(cuts, 'Efectivo'), 1800);
  assert.equal(logic.paymentTotal(cuts, 'Mercado Pago'), 2400);
  assert.equal(logic.transferTotal(transfers, 'Efectivo'), -100);
  assert.equal(logic.transferTotal(transfers, 'Mercado Pago'), 100);
  assert.equal(logic.dominantPayment(cuts[2]), 'Efectivo');
});

test('calcula los saldos diarios completos', () => {
  assert.equal(logic.balance('Efectivo', 1000, cuts, sales, advances, expenses, transfers), 2850);
  assert.equal(logic.balance('Mercado Pago', 2000, cuts, sales, advances, expenses, transfers), 4900);
});

test('el pago del barbero suma comisión de cortes y todas las propinas', () => {
  const payout = logic.barberPayout(cuts, () => 80);
  assert.equal(payout.tips, 300);
  assert.equal(payout.commission, 1950, 'respeta la comisión guardada aunque cambie el porcentaje del día');
  assert.equal(payout.total, 2250);
  assert.equal(logic.barberPayout([], () => 50).total, 0);
});

test('la comisión respeta el valor guardado, luego el porcentaje del corte y finalmente el de la fecha', () => {
  const payout = logic.barberPayout([
    { date: '2026-09-01', amount: 1000, tip: 100, commissionAmount: 0, commissionRate: 50 },
    { date: '2026-09-01', amount: 1000, tip: 200, commissionRate: 40 },
    { date: '2026-09-02', amount: 1000, tip: 300 },
    { date: '2026-09-01', amount: 1000, commissionRate: 0 },
  ], (date) => date === '2026-09-02' ? 60 : 50);
  assert.equal(payout.commission, 1000);
  assert.equal(payout.tips, 600, 'las propinas no llevan descuento de comisión');
  assert.equal(payout.total, 1600);
  const fractional = logic.barberPayout([{ amount: 101, commissionRate: 50 }, { amount: 101, commissionRate: 50 }]);
  assert.equal(fractional.total, 101, 'redondea al final, no por cada corte');
  assert.equal(logic.barberPayout([{ amount: 101, commissionRate: 50 }]).total, 51);
});

test('mixto solo queda completo cuando cubre el total a pagar', () => {
  const state = (cashAmount, mpAmount, total = 25500) => logic.barberPaymentState({ status: 'Mixto', cashAmount, mpAmount }, total);
  const empty = state('', '');
  assert.equal(empty.isPaid, false);
  assert.equal(empty.label, 'Mixto · Incompleto');
  assert.equal(empty.remaining, 25500);
  const partial = state(12000, 13000);
  assert.equal(partial.paidAmount, 25000);
  assert.equal(partial.isPaid, false);
  assert.equal(partial.remaining, 500);
  const complete = state(12000, 13500);
  assert.equal(complete.isPaid, true);
  assert.equal(complete.label, 'Mixto · Completo');
  assert.equal(complete.remaining, 0);
  assert.equal(complete.excess, 0);
  const extra = state(12000, 14000);
  assert.equal(extra.isPaid, true);
  assert.equal(extra.excess, 500);
  assert.equal(extra.remaining, 0);
  assert.equal(state(12000, 13500, 26000).isPaid, false, 'un corte nuevo puede dejar el pago incompleto');
  assert.equal(state(12000, '', 25500).isPaid, false, 'vaciar un monto vuelve a calcular el estado');
  assert.equal(state(0, 25500).isPaid, true);
  assert.equal(state('', '', 0).isPaid, true, 'sin importe pendiente no falta pagar');
});

test('los pagos simples siguen siendo de un clic e ignoran los importes mixtos retenidos', () => {
  for (const status of ['Efectivo', 'Mercado Pago']) {
    const state = logic.barberPaymentState({ status, cashAmount: '', mpAmount: '' }, 25500);
    assert.equal(state.mixed, false);
    assert.equal(state.isPaid, true);
    assert.equal(state.label, status === 'Mercado Pago' ? 'Pagado · MP' : 'Pagado · Efectivo');
  }
  const unpaid = logic.barberPaymentState({ status: 'No pago', cashAmount: 12000, mpAmount: 13500 }, 25500);
  assert.equal(unpaid.isPaid, false);
  assert.equal(unpaid.label, 'No pago');
});

test('resume facturación, comisiones y filtros por medio de pago', () => {
  const total = logic.summarize(cuts, sales, advances, expenses, 'Ambas', () => 50);
  assert.deepEqual(JSON.parse(JSON.stringify(total)), {
    cuts: 3, saleCount: 2, services: 3900, sales: 1200, tips: 300, commission: 1950,
    advances: 400, expenses: 250, invoiced: 5100, balance: 3150, cash: 1950, mp: 2800,
  });

  const cash = logic.summarize(cuts, sales, advances, expenses, 'Efectivo', () => 50);
  assert.equal(cash.cuts, 2);
  assert.equal(cash.saleCount, 1);
  assert.equal(cash.services, 1540);
  assert.equal(cash.tips, 260);
  assert.equal(cash.commission, 770);
  assert.equal(cash.balance, 1270);
});

test('calcula correctamente semanas, meses y años', () => {
  assert.equal(logic.currentMonthWeek('2026-07-18'), 2);
  assert.equal(logic.periodBounds('week', '2026-07', 1).join(), '2026-07-06,2026-07-12');
  assert.equal(logic.periodBounds('week', '2026-07', 4).join(), '2026-07-27,2026-08-02');
  assert.equal(logic.periodBounds('month', '2026-02').join(), '2026-02-01,2026-02-28');
  assert.equal(logic.periodBounds('year', '2026').join(), '2026-01-01,2026-12-31');
});
