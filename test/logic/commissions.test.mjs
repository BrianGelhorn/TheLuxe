import assert from 'node:assert/strict';
import test from 'node:test';
import { financialFixture, loadLogic } from '../support/logic.mjs';

test('PAYOUT-001 - El pago fijo conserva comisiones guardadas y todas las propinas', () => {
  const { cuts } = financialFixture();
  assert.deepEqual({ ...loadLogic().barberPayout(cuts, () => 80) }, { tips: 300, commission: 1950, total: 2250 });
});

test('PAYOUT-002 - Sin cortes el pago es cero y no consulta la tasa', () => {
  const logic = loadLogic();
  assert.deepEqual({ ...logic.barberPayout([]) }, { tips: 0, commission: 0, total: 0 });
  assert.deepEqual({ ...logic.barberPayout([], () => assert.fail('No debe consultar tasas sin cortes')) }, { tips: 0, commission: 0, total: 0 });
});

for (const [id, description, snapshot, commission] of [
  ['PAYOUT-003', 'El importe guardado prevalece sobre tasa y callback', { commissionAmount: 175, commissionRate: 50 }, 175],
  ['PAYOUT-004', 'El importe guardado de cero es autoritativo', { commissionAmount: 0, commissionRate: 50 }, 0],
  ['PAYOUT-005', 'El importe guardado de cero escrito es autoritativo', { commissionAmount: '0', commissionRate: 50 }, 0],
  ['PAYOUT-006', 'Un importe nulo permite usar la tasa guardada', { commissionAmount: null, commissionRate: 40 }, 400],
  ['PAYOUT-007', 'Una tasa guardada de cero no usa el callback', { commissionRate: 0 }, 0],
  ['PAYOUT-008', 'Una tasa guardada de cero escrito no usa el callback', { commissionAmount: null, commissionRate: '0' }, 0],
  ['PAYOUT-009', 'Una tasa guardada escrita se convierte a numero', { commissionRate: '35' }, 350],
  ['PAYOUT-010', 'Un importe guardado funciona sin tasa', { commissionAmount: '250' }, 250],
]) {
  test(`${id} - ${description}`, () => {
    const cut = { date: '2026-09-01', amount: '1000', tip: '10', ...snapshot };
    const result = loadLogic().barberPayout([cut], () => assert.fail('El callback es solo un fallback'));
    assert.deepEqual({ ...result }, { tips: 10, commission, total: commission + 10 });
  });
}

test('PAYOUT-011 - Las comisiones sin snapshots usan el callback de cada fecha', () => {
  const dates = [];
  const cuts = [
    { date: '2026-09-01', amount: 1000, tip: null, commissionAmount: null, commissionRate: null },
    { date: '2026-09-02', amount: '500', tip: '' },
    { date: '2026-09-03', amount: 1000, tip: '0', commissionAmount: undefined, commissionRate: undefined },
  ];
  const payout = loadLogic().barberPayout(cuts, (date) => {
    dates.push(date);
    return { '2026-09-01': 40, '2026-09-02': '60', '2026-09-03': 0 }[date];
  });
  assert.deepEqual({ ...payout }, { tips: 0, commission: 700, total: 700 });
  assert.deepEqual(dates, ['2026-09-01', '2026-09-02', '2026-09-03']);
});

test('PAYOUT-012 - Sin callback ni snapshots la comision predeterminada es cero', () => {
  const cuts = [
    { amount: 1000, tip: 25 },
    { amount: '500', tip: '75', commissionAmount: null, commissionRate: null },
  ];
  assert.deepEqual({ ...loadLogic().barberPayout(cuts) }, { tips: 100, commission: 0, total: 100 });
});

test('PAYOUT-013 - Mezcla snapshots y fallback sin descontar comision de propinas', () => {
  const dates = [];
  const cuts = [
    { date: '2026-09-01', amount: 1000, tip: 100, commissionAmount: 0, commissionRate: 50 },
    { date: '2026-09-01', amount: 1000, tip: 200, commissionRate: 40 },
    { date: '2026-09-02', amount: 1000, tip: 300 },
    { date: '2026-09-01', amount: 1000, commissionRate: 0 },
  ];
  const payout = loadLogic().barberPayout(cuts, (date) => {
    dates.push(date);
    return date === '2026-09-02' ? 60 : 50;
  });
  assert.deepEqual({ ...payout }, { tips: 600, commission: 1000, total: 1600 });
  assert.deepEqual(dates, ['2026-09-02']);
});

for (const [id, description, cuts, commission, tips] of [
  ['PAYOUT-014', 'Redondea hacia arriba una comision de medio peso', [{ amount: 101, commissionRate: 50 }], 51, 0],
  ['PAYOUT-015', 'Suma fracciones antes de redondear el pago', [{ amount: 101, commissionRate: 50 }, { amount: 101, commissionRate: 50 }], 101, 0],
  ['PAYOUT-016', 'Redondea hacia abajo una comision menor a medio peso', [{ amount: 1, tip: 10, commissionRate: 25 }], 0, 10],
  ['PAYOUT-017', 'Acumula fracciones guardadas como numero y texto', [{ amount: 1, commissionAmount: 0.25 }, { amount: 1, commissionAmount: '0.25' }], 1, 0],
]) {
  test(`${id} - ${description}`, () => {
    assert.deepEqual({ ...loadLogic().barberPayout(cuts) }, { tips, commission, total: commission + tips });
  });
}

test('PAYOUT-018 - Una propina sin servicio se paga completa', () => {
  assert.deepEqual({ ...loadLogic().barberPayout([{ amount: 0, tip: 100 }], () => 100) }, { tips: 100, commission: 0, total: 100 });
});

test('PAYOUT-019 - Cambiar el fallback conserva cortes historicos con snapshots', () => {
  const logic = loadLogic();
  const cuts = [
    { date: '2026-09-01', amount: 1000, tip: 100, commissionAmount: 350, commissionRate: 35 },
    { date: '2026-09-02', amount: 2000, tip: 50, commissionRate: 50 },
    { date: '2026-09-03', amount: 500, commissionRate: 0 },
  ];
  const expected = { tips: 150, commission: 1350, total: 1500 };
  assert.deepEqual({ ...logic.barberPayout(cuts, () => 20) }, expected);
  assert.deepEqual({ ...logic.barberPayout(cuts, () => 80) }, expected);
});

// En estados simples solo se contratan los campos de UI, no el importe mixto retenido.
for (const [id, description, payment, isPaid, label] of [
  ['PAYOUT-030', 'Efectivo queda pagado con un clic sin importes mixtos', { status: 'Efectivo', cashAmount: '', mpAmount: '' }, true, 'Pagado \u00b7 Efectivo'],
  ['PAYOUT-031', 'MP queda pagado con un clic sin importes mixtos', { status: 'Mercado Pago', cashAmount: '', mpAmount: '' }, true, 'Pagado \u00b7 MP'],
  ['PAYOUT-032', 'No pago permanece pendiente sin importes', { status: 'No pago' }, false, 'No pago'],
  ['PAYOUT-033', 'Efectivo ignora importes mixtos parciales retenidos', { status: 'Efectivo', cashAmount: 100, mpAmount: 200 }, true, 'Pagado \u00b7 Efectivo'],
  ['PAYOUT-034', 'MP ignora importes mixtos retenidos en cero', { status: 'Mercado Pago', cashAmount: 0, mpAmount: 0 }, true, 'Pagado \u00b7 MP'],
  ['PAYOUT-035', 'No pago ignora importes mixtos que cubren la deuda', { status: 'No pago', cashAmount: 12000, mpAmount: 13500 }, false, 'No pago'],
]) {
  test(`${id} - ${description}`, () => {
    const state = loadLogic().barberPaymentState(payment, 25500);
    assert.deepEqual({ mixed: state.mixed, isPaid: state.isPaid, label: state.label }, { mixed: false, isPaid, label });
  });
}

for (const [id, description, amounts, due, paidAmount, isPaid, remaining, excess] of [
  ['PAYOUT-040', 'El mixto vacio mantiene toda la deuda', { cashAmount: '', mpAmount: '' }, 25500, 0, false, 25500, 0],
  ['PAYOUT-041', 'El mixto nulo trata ambos importes como cero', { cashAmount: null, mpAmount: null }, 25500, 0, false, 25500, 0],
  ['PAYOUT-042', 'El mixto parcial suma textos y calcula el faltante', { cashAmount: '12000', mpAmount: '13000' }, 25500, 25000, false, 500, 0],
  ['PAYOUT-043', 'El mixto exacto queda completo sin exceso', { cashAmount: 12000, mpAmount: 13500 }, 25500, 25500, true, 0, 0],
  ['PAYOUT-044', 'El mixto excedido conserva el sobrante', { cashAmount: 12000, mpAmount: 14000 }, 25500, 26000, true, 0, 500],
  ['PAYOUT-045', 'Una deuda mayor vuelve incompleto el mismo pago', { cashAmount: 12000, mpAmount: 13500 }, 26000, 25500, false, 500, 0],
  ['PAYOUT-046', 'Vaciar MP vuelve a calcular el faltante mixto', { cashAmount: 12000, mpAmount: '' }, 25500, 12000, false, 13500, 0],
  ['PAYOUT-047', 'Un mixto puede completarse solo con efectivo', { cashAmount: 25500, mpAmount: '0' }, 25500, 25500, true, 0, 0],
  ['PAYOUT-048', 'Un mixto puede completarse solo con MP', { cashAmount: 0, mpAmount: 25500 }, 25500, 25500, true, 0, 0],
  ['PAYOUT-049', 'Un mixto vacio sin deuda esta completo', { cashAmount: '', mpAmount: '' }, 0, 0, true, 0, 0],
  ['PAYOUT-050', 'Un mixto sin campos conserva la deuda', {}, 100, 0, false, 100, 0],
  ['PAYOUT-051', 'Un mixto pagado sin deuda muestra todo como exceso', { cashAmount: 50, mpAmount: 100 }, 0, 150, true, 0, 150],
]) {
  test(`${id} - ${description}`, () => {
    const state = loadLogic().barberPaymentState({ status: 'Mixto', ...amounts }, due);
    assert.deepEqual({ ...state }, {
      mixed: true, paidAmount, isPaid,
      label: `Mixto \u00b7 ${isPaid ? 'Completo' : 'Incompleto'}`,
      remaining, excess,
    });
  });
}

test('PAYOUT-052 - Un corte nuevo recalcula el pago mixto desde la comision redondeada', () => {
  const logic = loadLogic();
  const cuts = [{ amount: 101, tip: 1, commissionRate: 50 }];
  const payment = { status: 'Mixto', cashAmount: 25, mpAmount: 27 };
  assert.deepEqual({ ...logic.barberPaymentState(payment, logic.barberPayout(cuts).total) }, {
    mixed: true, paidAmount: 52, isPaid: true, label: 'Mixto \u00b7 Completo', remaining: 0, excess: 0,
  });
  cuts.push({ amount: 100, tip: 10, commissionRate: 50 });
  assert.deepEqual({ ...logic.barberPaymentState(payment, logic.barberPayout(cuts).total) }, {
    mixed: true, paidAmount: 52, isPaid: false, label: 'Mixto \u00b7 Incompleto', remaining: 60, excess: 0,
  });
});
