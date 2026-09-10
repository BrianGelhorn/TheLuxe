import assert from 'node:assert/strict';
import test from 'node:test';
import { financialFixture, loadLogic } from '../support/logic.mjs';

function assertRevenueInvariants(logic, cuts, sales, commissionAt = () => 0) {
  const row = logic.dailyRevenue(cuts, sales, commissionAt);
  assert.ok(Object.values(row).every(Number.isFinite), 'Todos los campos deben ser finitos');
  assert.ok(Object.values(row).every(Number.isInteger), 'La recaudacion se muestra en pesos enteros');
  assert.equal(row.collected, row.services + row.sales, 'Servicios cobrados mas ventas');
  assert.equal(row.collected - row.tips, row.invoiced, 'Las propinas no son facturacion');
  assert.equal(row.invoiced - row.commission, row.net, 'El neto descuenta solo comision');
  assert.equal(row.cashInvoiced + row.mpInvoiced, row.invoiced, 'Conserva facturacion entre medios');
  assert.equal(row.cashServices + row.mpServices, row.services - row.tips, 'Conserva precio de servicios');
  assert.equal(row.cashTips + row.mpTips, row.tips, 'No duplica propinas');
  assert.equal(row.cashNet + row.mpNet, row.net, 'Conserva neto tras redondear');
  assert.equal(row.cashServices + row.cashTips, logic.paymentTotal(cuts, 'Efectivo'), 'Conserva cobros de cortes en efectivo');
  assert.equal(row.mpServices + row.mpTips, logic.paymentTotal(cuts, 'Mercado Pago'), 'Conserva cobros de cortes en MP');
  assert.equal(row.cashInvoiced, row.cashServices + logic.salePaymentTotal(sales, 'Efectivo'), 'Agrega ventas en efectivo sin propinas');
  assert.equal(row.mpInvoiced, row.mpServices + logic.salePaymentTotal(sales, 'Mercado Pago'), 'Agrega ventas en MP sin propinas');
  const payout = logic.barberPayout(cuts, commissionAt);
  assert.equal(row.commission, payout.commission, 'Recaudacion y pago respetan los mismos snapshots');
  assert.equal(row.collected, row.net + payout.total, 'Lo cobrado se reparte entre negocio y barbero');
  return row;
}

for (const [id, description, scenario] of [
  ['INV-CASH-001', 'La jornada vacia conserva todas las identidades', () => ({ cuts: [], sales: [] })],
  ['INV-CASH-002', 'Las ventas sin cortes conservan el neto y ambos medios', () => ({ cuts: [], sales: [{ payment: 'Mercado Pago', total: '500' }], commissionAt: () => 100 })],
  ['INV-CASH-003', 'Un mixto con fracciones conserva cobros y neto redondeado', () => ({ cuts: [{ payment: 'Ambos', amount: 101, tip: 1, cashAmount: 51, mpAmount: 51, commissionRate: 50 }], sales: [] })],
  ['INV-CASH-004', 'Un mixto de ceros numericos conserva importes finitos', () => ({ cuts: [{ payment: 'Ambos', amount: 0, tip: 0, cashAmount: 0, mpAmount: 0 }], sales: [] })],
  ['INV-CASH-005', 'Una propina sin servicio queda fuera del neto', () => ({ cuts: [{ payment: 'Efectivo', amount: 0, tip: 100 }], sales: [] })],
  ['INV-CASH-006', 'El caso financiero fijo conserva caja propinas y comisiones', () => ({ ...financialFixture(), commissionAt: () => 80 })],
  ['INV-CASH-007', 'El historial con tasas cero conserva el reparto', () => ({
    cuts: [
      { date: '2026-09-01', payment: 'Efectivo', amount: 1000, tip: 100, commissionAmount: 0, commissionRate: 50 },
      { date: '2026-09-01', payment: 'Efectivo', amount: 1000, commissionRate: 40 },
      { date: '2026-09-02', payment: 'Mercado Pago', amount: 1000 },
      { date: '2026-09-01', payment: 'Mercado Pago', amount: 1000, commissionRate: 0 },
    ], sales: [], commissionAt: (date) => date === '2026-09-02' ? 60 : 50,
  })],
  ['INV-CASH-008', 'Un mixto de ceros escritos conserva importes finitos', () => ({ cuts: [{ payment: 'Ambos', amount: '0', tip: '0', cashAmount: '0', mpAmount: '0', commissionRate: '0' }], sales: [] })],
]) {
  test(`${id} - ${description}`, () => {
    const { cuts, sales, commissionAt } = scenario();
    assertRevenueInvariants(loadLogic(), cuts, sales, commissionAt);
  });
}

test('INV-CASH-009 - Transferir y revertir conserva la caja conjunta en cada paso', () => {
  const logic = loadLogic();
  const { cuts, sales, advances, expenses } = financialFixture();
  const transfers = [
    { from: 'Efectivo', to: 'Mercado Pago', amount: '200' },
    { from: 'Mercado Pago', to: 'Efectivo', amount: 300 },
    { from: 'Efectivo', to: 'Mercado Pago', amount: 125 },
  ];
  for (let length = 0; length <= transfers.length; length += 1) {
    const prefix = transfers.slice(0, length);
    const cash = logic.balance('Efectivo', 1000, cuts, sales, advances, expenses, prefix);
    const mp = logic.balance('Mercado Pago', 2000, cuts, sales, advances, expenses, prefix);
    assert.equal(cash + mp, 7750, `Caja conjunta tras ${length} transferencias`);
    assert.equal(logic.transferTotal(prefix, 'Efectivo') + logic.transferTotal(prefix, 'Mercado Pago'), 0);
  }
  const reverted = [...transfers, ...transfers.toReversed().map((row) => ({ ...row, from: row.to, to: row.from }))];
  assert.equal(logic.balance('Efectivo', 1000, cuts, sales, advances, expenses, reverted), 2950);
  assert.equal(logic.balance('Mercado Pago', 2000, cuts, sales, advances, expenses, reverted), 4800);
});

test('INV-CASH-010 - Caja y neto comercial se reconcilian con pago y egresos', () => {
  const logic = loadLogic();
  const { cuts, sales, advances, expenses, transfers } = financialFixture();
  const cash = logic.balance('Efectivo', 1000, cuts, sales, advances, expenses, transfers);
  const mp = logic.balance('Mercado Pago', 2000, cuts, sales, advances, expenses, transfers);
  const revenue = logic.dailyRevenue(cuts, sales, () => 80);
  const payout = logic.barberPayout(cuts, () => 80);
  assert.equal(cash + mp, 7750);
  assert.equal(cash + mp, 3000 + revenue.net + payout.total - 400 - 250);
});

test('INV-CASH-011 - Particionar movimientos conserva el resumen sin redondear por grupo', () => {
  const logic = loadLogic();
  const { cuts, sales, advances, expenses } = financialFixture();
  const total = logic.summarize(cuts, sales, advances, expenses, 'Ambas', () => 80);
  const first = logic.summarize(cuts.slice(0, 1), sales.slice(0, 1), advances.slice(0, 1), expenses.slice(0, 1), 'Ambas', () => 80);
  const rest = logic.summarize(cuts.slice(1), sales.slice(1), advances.slice(1), expenses.slice(1), 'Ambas', () => 80);
  for (const field of Object.keys(total)) {
    assert.equal(first[field] + rest[field], total[field], `El campo ${field} es aditivo`);
  }
});

test('INV-CASH-012 - Las funciones financieras no modifican entradas congeladas', () => {
  const logic = loadLogic();
  const fixture = financialFixture();
  const before = structuredClone(fixture);
  for (const rows of Object.values(fixture)) {
    rows.forEach(Object.freeze);
    Object.freeze(rows);
  }
  Object.freeze(fixture);
  const { cuts, sales, advances, expenses, transfers } = fixture;
  for (const type of ['Efectivo', 'Mercado Pago']) {
    logic.paymentTotal(cuts, type);
    logic.salePaymentTotal(sales, type);
    logic.advancePaymentTotal(advances, type);
    logic.expensePaymentTotal(expenses, type);
    logic.transferTotal(transfers, type);
    logic.balance(type, 1000, cuts, sales, advances, expenses, transfers);
    logic.cutValueByPayment(cuts, type, 'commissionAmount');
    logic.summarize(cuts, sales, advances, expenses, type, () => 80);
  }
  for (const cut of cuts) {
    logic.dominantPayment(cut);
    logic.mixedTipError(cut);
  }
  logic.summarize(cuts, sales, advances, expenses, 'Ambas', () => 80);
  logic.barberPayout(cuts, () => 80);
  logic.dailyRevenue(cuts, sales, () => 80);
  const payment = Object.freeze({ status: 'Mixto', cashAmount: '1000', mpAmount: '1250' });
  logic.barberPaymentState(payment, 2250);
  assert.deepEqual(fixture, before);
  assert.deepEqual(payment, { status: 'Mixto', cashAmount: '1000', mpAmount: '1250' });
});

for (const [id, description, seed] of [
  ['INV-CASH-020', 'La semilla 1 concilia todas las operaciones y snapshots', 1],
  ['INV-CASH-021', 'La semilla 7 concilia todas las operaciones y snapshots', 7],
  ['INV-CASH-022', 'La semilla 42 concilia todas las operaciones y snapshots', 42],
  ['INV-CASH-023', 'La semilla 20260903 concilia todas las operaciones y snapshots', 20260903],
  ['INV-CASH-024', 'La semilla 305419896 concilia todas las operaciones y snapshots', 0x12345678],
  ['INV-CASH-025', 'La semilla 3735928559 concilia todas las operaciones y snapshots', 0xdeadbeef],
]) {
  test(`${id} - ${description}`, () => {
    const logic = loadLogic();
    let state = seed >>> 0;
    const next = (limit) => {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return (state >>> 0) % limit;
    };
    const monetary = (value, index) => index % 2 ? String(value) : value;
    const dates = ['2026-09-01', '2026-09-02', '2026-09-03'];
    const defaults = { '2026-09-01': 25, '2026-09-02': 50, '2026-09-03': 75 };
    const commissionAt = (date) => defaults[date];
    const ledger = {
      Efectivo: { services: 0, tips: 0, sales: 0, advances: 0, expenses: 0, commissionCents: 0, cuts: 0, saleCount: 0, transfers: 0, opening: 10000 },
      'Mercado Pago': { services: 0, tips: 0, sales: 0, advances: 0, expenses: 0, commissionCents: 0, cuts: 0, saleCount: 0, transfers: 0, opening: 20000 },
    };
    const cash = ledger.Efectivo;
    const mp = ledger['Mercado Pago'];
    const cuts = [];
    const sales = [];
    const advances = [];
    const expenses = [];
    const transfers = [];

    // El oraculo nace del servicio y propina por medio, antes de armar los cobros.
    // Siete repartos por seis tipos de snapshot cubren las 42 combinaciones.
    for (let index = 0; index < 42; index += 1) {
      let cashService = 0;
      let mpService = 0;
      let cashTip = 0;
      let mpTip = 0;
      let payment = 'Ambos';
      let dominant = 'Efectivo';
      switch (index % 7) {
        case 0:
          payment = 'Efectivo';
          cashService = 1 + next(5000);
          cashTip = next(300);
          break;
        case 1:
          payment = 'Mercado Pago';
          dominant = 'Mercado Pago';
          mpService = 1 + next(5000);
          mpTip = next(300);
          break;
        case 2:
          mpService = 1 + next(500);
          cashService = mpService + 1 + next(500);
          cashTip = next(300);
          break;
        case 3:
          dominant = 'Mercado Pago';
          cashService = 1 + next(500);
          mpService = cashService + 1 + next(500);
          mpTip = next(300);
          break;
        case 4: {
          const tiedPayment = 1 + next(500);
          cashTip = next(tiedPayment + 1);
          cashService = tiedPayment - cashTip;
          mpService = tiedPayment;
          break;
        }
        case 5:
          cashService = 1 + next(500);
          cashTip = next(300);
          break;
        case 6:
          dominant = 'Mercado Pago';
          mpService = 1 + next(500);
          mpTip = next(300);
          break;
      }
      const amount = cashService + mpService;
      const tip = cashTip + mpTip;
      const date = dates[(Math.floor(index / 6) + index) % dates.length];
      let rate = [0, 25, 50, 75, 100][next(5)];
      const snapshot = index % 6;
      if (snapshot === 1 || snapshot === 5) rate = 0;
      if (snapshot === 3 || snapshot === 4) rate = defaults[date];
      const cut = { date, payment, amount: monetary(amount, index), tip: monetary(tip, index + 1) };
      if (payment === 'Ambos') {
        cut.cashAmount = monetary(cashService + cashTip, index);
        cut.mpAmount = monetary(mpService + mpTip, index + 1);
      }
      if (snapshot === 0) {
        cut.commissionAmount = monetary(amount * rate / 100, Math.floor(index / 6));
        cut.commissionRate = (rate + 25) % 125;
      } else if (snapshot === 1) {
        cut.commissionAmount = monetary(0, Math.floor(index / 6));
        cut.commissionRate = 100;
      } else if (snapshot === 2) {
        cut.commissionAmount = null;
        cut.commissionRate = monetary(rate, Math.floor(index / 6));
      } else if (snapshot === 3) {
        cut.commissionAmount = null;
        cut.commissionRate = null;
      } else if (snapshot === 5) {
        cut.commissionRate = monetary(0, Math.floor(index / 6));
      }
      cuts.push(cut);
      cash.services += cashService;
      mp.services += mpService;
      cash.tips += cashTip;
      mp.tips += mpTip;
      cash.commissionCents += cashService * rate;
      mp.commissionCents += mpService * rate;
      ledger[dominant].cuts += 1;
      assert.equal(logic.dominantPayment(cut), dominant, `Predominio del corte ${index}`);
      assert.equal(logic.mixedTipError(cut), '', `Propina valida del corte ${index}`);
    }

    for (let index = 0; index < 12; index += 1) {
      const payment = index % 2 ? 'Mercado Pago' : 'Efectivo';
      const opposite = payment === 'Efectivo' ? 'Mercado Pago' : 'Efectivo';
      const quantity = 1 + next(4);
      const unitPrice = 1 + next(1500);
      const total = quantity * unitPrice;
      const advance = 1 + next(400);
      const expense = 1 + next(300);
      const transfer = 1 + next(1000);
      sales.push({ payment, quantity, unitPrice, total: monetary(total, index) });
      advances.push({ payment, amount: monetary(advance, index + 1) });
      expenses.push({ payment: opposite, amount: monetary(expense, index) });
      transfers.push({ from: payment, to: opposite, amount: monetary(transfer, index) });
      ledger[payment].sales += total;
      ledger[payment].saleCount += 1;
      ledger[payment].advances += advance;
      ledger[opposite].expenses += expense;
      ledger[payment].transfers -= transfer;
      ledger[opposite].transfers += transfer;
    }

    const services = cash.services + mp.services;
    const tips = cash.tips + mp.tips;
    const salesTotal = cash.sales + mp.sales;
    const commissionCents = cash.commissionCents + mp.commissionCents;
    const commission = Math.floor((commissionCents + 50) / 100);
    const cashCommission = Math.floor((cash.commissionCents + 50) / 100);
    const invoiced = services + salesTotal;
    const net = invoiced - commission;
    const expectedRevenue = {
      collected: invoiced + tips, tips, invoiced, commission, net, services: services + tips, sales: salesTotal,
      cashServices: cash.services, mpServices: mp.services, cashTips: cash.tips, mpTips: mp.tips,
      cashInvoiced: cash.services + cash.sales, mpInvoiced: mp.services + mp.sales,
      cashNet: cash.services + cash.sales - cashCommission,
      mpNet: mp.services + mp.sales - (commission - cashCommission),
    };
    const revenue = assertRevenueInvariants(logic, cuts, sales, commissionAt);
    assert.deepEqual({ ...revenue }, expectedRevenue);
    assert.deepEqual({ ...logic.dailyRevenue(cuts.toReversed(), sales.toReversed(), commissionAt) }, expectedRevenue);
    assert.deepEqual({ ...logic.barberPayout(cuts, commissionAt) }, { tips, commission, total: commission + tips });

    const summary = logic.summarize(cuts, sales, advances, expenses, 'Ambas', commissionAt);
    assert.deepEqual({ ...summary }, {
      cuts: 42, saleCount: 12, services, sales: salesTotal, tips, commission: commissionCents / 100,
      advances: cash.advances + mp.advances, expenses: cash.expenses + mp.expenses,
      invoiced, balance: invoiced - commissionCents / 100,
      cash: cash.services + cash.tips + cash.sales - cash.advances - cash.expenses,
      mp: mp.services + mp.tips + mp.sales - mp.advances - mp.expenses,
    });

    let combinedBalance = 0;
    for (const [payment, expected] of Object.entries(ledger)) {
      const filtered = logic.summarize(cuts, sales, advances, expenses, payment, commissionAt);
      assert.equal(filtered.cuts, expected.cuts, `${payment}: cuenta cada corte una vez`);
      assert.equal(filtered.saleCount, expected.saleCount, `${payment}: cuenta ventas`);
      assert.equal(filtered.services, expected.services, `${payment}: servicios`);
      assert.equal(filtered.sales, expected.sales, `${payment}: ventas`);
      assert.equal(filtered.tips, expected.tips, `${payment}: propinas`);
      assert.equal(filtered.commission, expected.commissionCents / 100, `${payment}: comision proporcional`);
      assert.equal(filtered.advances, expected.advances, `${payment}: adelantos`);
      assert.equal(filtered.expenses, expected.expenses, `${payment}: gastos`);
      assert.equal(filtered.invoiced, expected.services + expected.sales, `${payment}: facturado`);
      assert.equal(filtered.balance, expected.services + expected.sales - expected.commissionCents / 100, `${payment}: balance comercial`);
      assert.equal(logic.paymentTotal(cuts, payment), expected.services + expected.tips);
      assert.equal(logic.salePaymentTotal(sales, payment), expected.sales);
      assert.equal(logic.advancePaymentTotal(advances, payment), expected.advances);
      assert.equal(logic.expensePaymentTotal(expenses, payment), expected.expenses);
      assert.equal(logic.transferTotal(transfers, payment), expected.transfers);
      const balance = logic.balance(payment, String(expected.opening), cuts, sales, advances, expenses, transfers);
      assert.equal(balance, expected.opening + expected.services + expected.tips + expected.sales - expected.advances - expected.expenses + expected.transfers);
      combinedBalance += balance;
    }
    assert.equal(combinedBalance, 30000 + invoiced + tips - cash.advances - mp.advances - cash.expenses - mp.expenses);
  });
}
