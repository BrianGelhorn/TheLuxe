import assert from 'node:assert/strict';
import test from 'node:test';
import { financialFixture, loadLogic } from '../support/logic.mjs';

const emptySummary = {
  cuts: 0, saleCount: 0, services: 0, sales: 0, tips: 0, commission: 0,
  advances: 0, expenses: 0, invoiced: 0, balance: 0, cash: 0, mp: 0,
};
const emptyRevenue = {
  collected: 0, tips: 0, invoiced: 0, commission: 0, net: 0, services: 0, sales: 0,
  cashServices: 0, mpServices: 0, cashTips: 0, mpTips: 0,
  cashInvoiced: 0, mpInvoiced: 0, cashNet: 0, mpNet: 0,
};

for (const [id, description, payment, expected] of [
  ['REV-001', 'El resumen completo coincide con el oraculo fijo', 'Ambas', {
    cuts: 3, saleCount: 2, services: 3900, sales: 1200, tips: 300, commission: 1950,
    advances: 400, expenses: 250, invoiced: 5100, balance: 3150, cash: 1950, mp: 2800,
  }],
  ['REV-002', 'El resumen de efectivo asigna mixtos y filtra otros movimientos', 'Efectivo', {
    cuts: 2, saleCount: 1, services: 1500, sales: 500, tips: 300, commission: 750,
    advances: 300, expenses: 50, invoiced: 2000, balance: 1250, cash: 1950, mp: 2400,
  }],
  ['REV-003', 'El resumen de MP asigna mixtos y filtra otros movimientos', 'Mercado Pago', {
    cuts: 1, saleCount: 1, services: 2400, sales: 700, tips: 0, commission: 1200,
    advances: 100, expenses: 200, invoiced: 3100, balance: 1900, cash: 1800, mp: 2800,
  }],
]) {
  test(`${id} - ${description}`, () => {
    const { cuts, sales, advances, expenses } = financialFixture();
    // cash/mp conservan cobros de todos los cortes recibidos; las otras listas se filtran.
    const result = loadLogic().summarize(cuts, sales, advances, expenses, payment, () => 80);
    assert.deepEqual({ ...result }, expected);
  });
}

for (const [id, description, payment] of [
  ['REV-004', 'El resumen vacio de ambos medios tiene todos sus campos en cero', 'Ambas'],
  ['REV-005', 'El resumen vacio de efectivo tiene todos sus campos en cero', 'Efectivo'],
  ['REV-006', 'El resumen vacio de MP tiene todos sus campos en cero', 'Mercado Pago'],
]) {
  test(`${id} - ${description}`, () => {
    assert.deepEqual({ ...loadLogic().summarize([], [], [], [], payment) }, emptySummary);
  });
}

test('REV-007 - El resumen sin argumentos opcionales conserva tasas y fracciones', () => {
  const cuts = [{ payment: 'Efectivo', amount: 101, tip: null, commissionRate: 50 }];
  assert.deepEqual({ ...loadLogic().summarize(cuts, [], []) }, {
    cuts: 1, saleCount: 0, services: 101, sales: 0, tips: 0, commission: 50.5,
    advances: 0, expenses: 0, invoiced: 101, balance: 50.5, cash: 101, mp: 0,
  });
});

test('REV-008 - El resumen sin callback ni snapshots usa comision cero', () => {
  const cuts = [
    { payment: 'Efectivo', amount: '1000', tip: '25' },
    { payment: 'Mercado Pago', amount: '500', tip: null, commissionAmount: null, commissionRate: null },
  ];
  assert.deepEqual({ ...loadLogic().summarize(cuts, [], []) }, {
    cuts: 2, saleCount: 0, services: 1500, sales: 0, tips: 25, commission: 0,
    advances: 0, expenses: 0, invoiced: 1500, balance: 1500, cash: 1025, mp: 500,
  });
});

test('REV-009 - El resumen prioriza importe luego tasa y solo entonces callback', () => {
  const dates = [];
  const cuts = [
    { date: '2026-09-01', payment: 'Efectivo', amount: 1000, tip: 100, commissionAmount: 175, commissionRate: 50 },
    { date: '2026-09-01', payment: 'Mercado Pago', amount: 1000, commissionAmount: '0', commissionRate: 80 },
    { date: '2026-09-01', payment: 'Efectivo', amount: 1000, commissionAmount: null, commissionRate: '40' },
    { date: '2026-09-01', payment: 'Mercado Pago', amount: 1000, commissionRate: '0' },
    { date: '2026-09-02', payment: 'Efectivo', amount: '1000', commissionAmount: null, commissionRate: null },
  ];
  const result = loadLogic().summarize(cuts, [], [], [], 'Ambas', (date) => {
    dates.push(date);
    return date === '2026-09-02' ? 60 : 90;
  });
  assert.deepEqual({ ...result }, {
    cuts: 5, saleCount: 0, services: 5000, sales: 0, tips: 100, commission: 1175,
    advances: 0, expenses: 0, invoiced: 5000, balance: 3825, cash: 3100, mp: 2000,
  });
  assert.deepEqual(dates, ['2026-09-02']);
});

test('REV-010 - El resumen consulta fechas solo para cortes sin snapshots', () => {
  const dates = [];
  const cuts = [
    { date: '2026-09-01', payment: 'Efectivo', amount: 1000 },
    { date: '2026-09-02', payment: 'Mercado Pago', amount: 500, commissionAmount: null, commissionRate: null },
    { date: '2026-09-03', payment: 'Efectivo', amount: 200, commissionAmount: undefined, commissionRate: undefined },
  ];
  const result = loadLogic().summarize(cuts, [], [], [], 'Ambas', (date) => {
    dates.push(date);
    return { '2026-09-01': 20, '2026-09-02': '60', '2026-09-03': 0 }[date];
  });
  assert.equal(result.commission, 500);
  assert.equal(result.balance, 1200);
  assert.deepEqual(dates, ['2026-09-01', '2026-09-02', '2026-09-03']);
});

test('REV-011 - Cambiar el callback predeterminado no reescribe el resumen historico', () => {
  const logic = loadLogic();
  const cuts = [
    { date: '2026-09-01', payment: 'Efectivo', amount: 1000, commissionAmount: 350, commissionRate: 35 },
    { date: '2026-09-02', payment: 'Mercado Pago', amount: 2000, commissionRate: 50 },
    { date: '2026-09-03', payment: 'Mercado Pago', amount: 500, commissionRate: 0 },
  ];
  const before = logic.summarize(cuts, [], [], [], 'Ambas', () => 20);
  const after = logic.summarize(cuts, [], [], [], 'Ambas', () => 80);
  assert.equal(before.commission, 1350);
  assert.equal(after.commission, 1350);
  assert.equal(after.balance, 2150);
  assert.deepEqual({ ...after }, { ...before });
});

test('REV-012 - Ventas y egresos no generan comision ni cambian el balance comercial', () => {
  const { sales, advances, expenses } = financialFixture();
  const result = loadLogic().summarize([], sales, advances, expenses, 'Ambas', () => assert.fail('No hay cortes para comisionar'));
  assert.deepEqual({ ...result }, {
    cuts: 0, saleCount: 2, services: 0, sales: 1200, tips: 0, commission: 0,
    advances: 400, expenses: 250, invoiced: 1200, balance: 1200, cash: 150, mp: 400,
  });
});

test('REV-013 - El resumen convierte ventas y egresos escritos sin concatenarlos', () => {
  const sales = [{ payment: 'Efectivo', total: '500' }, { payment: 'Mercado Pago', total: '700' }];
  const advances = [{ payment: 'Efectivo', amount: '300' }, { payment: 'Mercado Pago', amount: '100' }];
  const expenses = [{ payment: 'Efectivo', amount: '50' }, { payment: 'Mercado Pago', amount: '200' }];
  assert.deepEqual({ ...loadLogic().summarize([], sales, advances, expenses) }, {
    cuts: 0, saleCount: 2, services: 0, sales: 1200, tips: 0, commission: 0,
    advances: 400, expenses: 250, invoiced: 1200, balance: 1200, cash: 150, mp: 400,
  });
});

test('REV-014 - El conteo mixto usa predominio mientras los importes se reparten', () => {
  const logic = loadLogic();
  const cuts = [
    { payment: 'Ambos', amount: 15000, tip: 3000, cashAmount: 10000, mpAmount: 8000, commissionRate: 50 },
    { payment: 'Ambos', amount: 15000, tip: 3000, cashAmount: 8000, mpAmount: 10000, commissionRate: 50 },
    { payment: 'Ambos', amount: 15000, tip: 3000, cashAmount: 9000, mpAmount: 9000, commissionRate: 50 },
  ];
  const total = logic.summarize(cuts, [], []);
  const cash = logic.summarize(cuts, [], [], [], 'Efectivo');
  const mp = logic.summarize(cuts, [], [], [], 'Mercado Pago');
  assert.deepEqual([total.cuts, cash.cuts, mp.cuts], [3, 2, 1]);
  assert.deepEqual([cash.services, cash.tips, cash.commission], [21000, 6000, 10500]);
  assert.deepEqual([mp.services, mp.tips, mp.commission], [24000, 3000, 12000]);
  assert.equal(total.commission, 22500);
});

test('REV-020 - La recaudacion diaria completa coincide con el oraculo fijo', () => {
  const { cuts, sales } = financialFixture();
  const revenue = loadLogic().dailyRevenue(cuts, sales, () => 80);
  assert.deepEqual({ ...revenue }, {
    collected: 5400, tips: 300, invoiced: 5100, commission: 1950, net: 3150,
    services: 4200, sales: 1200, cashInvoiced: 2000, mpInvoiced: 3100, cashNet: 1250, mpNet: 1900,
    cashServices: 1500, mpServices: 2400, cashTips: 300, mpTips: 0,
  });
  assert.equal(revenue.cashServices + revenue.cashTips, 1800);
  assert.equal(revenue.mpServices + revenue.mpTips, 2400);
});

test('REV-021 - Una jornada vacia tiene todos los campos monetarios en cero', () => {
  assert.deepEqual({ ...loadLogic().dailyRevenue([], []) }, emptyRevenue);
});

test('REV-022 - Una venta escrita en MP no genera comision de cortes', () => {
  const revenue = loadLogic().dailyRevenue([], [{ payment: 'Mercado Pago', total: '500' }], () => assert.fail('Una venta no consulta comision'));
  assert.deepEqual({ ...revenue }, {
    ...emptyRevenue, collected: 500, invoiced: 500, net: 500, sales: 500, mpInvoiced: 500, mpNet: 500,
  });
});

test('REV-023 - La recaudacion historica conserva importes tasas cero y fallback', () => {
  const cuts = [
    { date: '2026-09-01', payment: 'Efectivo', amount: 1000, tip: 100, commissionAmount: 0, commissionRate: 50 },
    { date: '2026-09-01', payment: 'Efectivo', amount: 1000, commissionRate: 40 },
    { date: '2026-09-02', payment: 'Mercado Pago', amount: 1000 },
    { date: '2026-09-01', payment: 'Mercado Pago', amount: 1000, commissionRate: 0 },
  ];
  const revenue = loadLogic().dailyRevenue(cuts, [], (date) => date === '2026-09-02' ? 60 : 50);
  assert.deepEqual({ ...revenue }, {
    collected: 4100, tips: 100, invoiced: 4000, commission: 1000, net: 3000,
    services: 4100, sales: 0, cashServices: 2000, mpServices: 2000, cashTips: 100, mpTips: 0,
    cashInvoiced: 2000, mpInvoiced: 2000, cashNet: 1600, mpNet: 1400,
  });
});

test('REV-024 - Redondea comision sin perder los cobros de un mixto empatado', () => {
  const cuts = [{ payment: 'Ambos', amount: 101, tip: 1, cashAmount: 51, mpAmount: 51, commissionRate: 50 }];
  const revenue = loadLogic().dailyRevenue(cuts, []);
  assert.deepEqual({ ...revenue }, {
    collected: 102, tips: 1, invoiced: 101, commission: 51, net: 50,
    services: 102, sales: 0, cashServices: 50, mpServices: 51, cashTips: 1, mpTips: 0,
    cashInvoiced: 50, mpInvoiced: 51, cashNet: 25, mpNet: 25,
  });
  assert.equal(revenue.cashServices + revenue.cashTips, 51);
  assert.equal(revenue.mpServices + revenue.mpTips, 51);
});

test('REV-025 - MP recibe el remanente para no redondear dos veces el neto', () => {
  const cuts = [{ payment: 'Ambos', amount: 2, tip: 0, cashAmount: 1, mpAmount: 1, commissionRate: 50 }];
  assert.deepEqual({ ...loadLogic().dailyRevenue(cuts, []) }, {
    collected: 2, tips: 0, invoiced: 2, commission: 1, net: 1,
    services: 2, sales: 0, cashServices: 1, mpServices: 1, cashTips: 0, mpTips: 0,
    cashInvoiced: 1, mpInvoiced: 1, cashNet: 0, mpNet: 1,
  });
});

test('REV-026 - La comision diaria suma fracciones de distintos cortes antes de redondear', () => {
  const cuts = [
    { payment: 'Efectivo', amount: 101, commissionAmount: 50.5 },
    { payment: 'Mercado Pago', amount: 101, commissionRate: 50 },
  ];
  assert.deepEqual({ ...loadLogic().dailyRevenue(cuts, []) }, {
    collected: 202, tips: 0, invoiced: 202, commission: 101, net: 101,
    services: 202, sales: 0, cashServices: 101, mpServices: 101, cashTips: 0, mpTips: 0,
    cashInvoiced: 101, mpInvoiced: 101, cashNet: 50, mpNet: 51,
  });
});

test('REV-027 - Un mixto de ceros escritos produce una recaudacion finita de cero', () => {
  const cuts = [{ payment: 'Ambos', amount: '0', tip: '0', cashAmount: '0', mpAmount: '0', commissionAmount: '0', commissionRate: '0' }];
  assert.deepEqual({ ...loadLogic().dailyRevenue(cuts, []) }, emptyRevenue);
});

for (const [id, description, payment, cashTips, mpTips] of [
  ['REV-028', 'Una propina sola en efectivo no es facturacion ni neto', 'Efectivo', 100, 0],
  ['REV-029', 'Una propina sola en MP no es facturacion ni neto', 'Mercado Pago', 0, 100],
]) {
  test(`${id} - ${description}`, () => {
    const revenue = loadLogic().dailyRevenue([{ payment, amount: 0, tip: 100 }], [], () => 100);
    assert.deepEqual({ ...revenue }, { ...emptyRevenue, collected: 100, tips: 100, services: 100, cashTips, mpTips });
  });
}

for (const [id, description, cashAmount, mpAmount, cashServices, mpServices, cashTips, mpTips, cashNet, mpNet] of [
  ['REV-030', 'El neto mixto descuenta propina y comision del efectivo dominante', 10000, 8000, 7000, 8000, 3000, 0, 3500, 4000],
  ['REV-031', 'El neto mixto descuenta propina y comision de MP dominante', 8000, 10000, 8000, 7000, 0, 3000, 4000, 3500],
  ['REV-032', 'El neto mixto empatado asigna la propina al efectivo', 9000, 9000, 6000, 9000, 3000, 0, 3000, 4500],
]) {
  test(`${id} - ${description}`, () => {
    const cuts = [{ payment: 'Ambos', amount: 15000, tip: 3000, cashAmount, mpAmount, commissionRate: 50 }];
    assert.deepEqual({ ...loadLogic().dailyRevenue(cuts, []) }, {
      collected: 18000, tips: 3000, invoiced: 15000, commission: 7500, net: 7500,
      services: 18000, sales: 0, cashServices, mpServices, cashTips, mpTips,
      cashInvoiced: cashServices, mpInvoiced: mpServices, cashNet, mpNet,
    });
  });
}
