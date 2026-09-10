import assert from 'node:assert/strict';
import test from 'node:test';
import { financialFixture, loadLogic } from '../support/logic.mjs';

// parseAmount quita formato; la validacion pertenece a los formularios.
for (const [id, description, input, expected] of [
  ['FIN-001', 'Convierte pesos enteros numericos', 15000, 15000],
  ['FIN-002', 'Conserva el cero numerico', 0, 0],
  ['FIN-003', 'Convierte el cero escrito', '0', 0],
  ['FIN-004', 'Quita ceros iniciales', '00015000', 15000],
  ['FIN-005', 'Quita simbolo y separadores de miles', '$ 15.000', 15000],
  ['FIN-006', 'Quita moneda y varios grupos de miles', 'ARS 1.234.567', 1234567],
  ['FIN-007', 'Quita espacios de un importe entero', '  15 000  ', 15000],
  ['FIN-008', 'Interpreta un campo vacio como cero', '', 0],
  ['FIN-009', 'Interpreta espacios sin importe como cero', ' \t ', 0],
  ['FIN-010', 'Interpreta un importe nulo como cero', null, 0],
  ['FIN-011', 'Interpreta un importe ausente como cero', undefined, 0],
  ['FIN-012', 'Conserva el mayor entero seguro con formato', '$ 9.007.199.254.740.991', Number.MAX_SAFE_INTEGER],
]) {
  test(`${id} - ${description}`, () => {
    assert.equal(loadLogic().parseAmount(input), expected);
  });
}

for (const [id, description, method, key, cash, mp] of [
  ['FIN-020', 'Suma cortes simples y mixtos por medio', 'paymentTotal', 'cuts', 1800, 2400],
  ['FIN-021', 'Suma ventas por medio sin incluir otros movimientos', 'salePaymentTotal', 'sales', 500, 700],
  ['FIN-022', 'Suma adelantos por medio', 'advancePaymentTotal', 'advances', 300, 100],
  ['FIN-023', 'Suma gastos por medio', 'expensePaymentTotal', 'expenses', 50, 200],
]) {
  test(`${id} - ${description}`, () => {
    const logic = loadLogic();
    const rows = financialFixture()[key];
    assert.equal(logic[method](rows, 'Efectivo'), cash);
    assert.equal(logic[method](rows, 'Mercado Pago'), mp);
    assert.equal(logic[method]([], 'Efectivo'), 0);
    assert.equal(logic[method]([], 'Mercado Pago'), 0);
  });
}

test('FIN-024 - Los pagos simples suman propinas opcionales y textos numericos', () => {
  const logic = loadLogic();
  const cuts = [
    { payment: 'Efectivo', amount: '1000', tip: '200' },
    { payment: 'Mercado Pago', amount: '2000', tip: null },
    { payment: 'Efectivo', amount: 100 },
    { payment: 'Mercado Pago', amount: 50, tip: '' },
    { payment: 'Efectivo', amount: 0, tip: 0 },
    { payment: 'Mercado Pago', amount: '0', tip: '0' },
  ];
  assert.equal(logic.paymentTotal(cuts, 'Efectivo'), 1300);
  assert.equal(logic.paymentTotal(cuts, 'Mercado Pago'), 2050);
});

test('FIN-025 - Los pagos mixtos ya incluyen propina y admiten un medio en cero', () => {
  const logic = loadLogic();
  const cuts = [
    { payment: 'Ambos', amount: '900', tip: '100', cashAmount: '600', mpAmount: '400' },
    { payment: 'Ambos', amount: '500', tip: '50', cashAmount: '0', mpAmount: '550' },
    { payment: 'Ambos', amount: 0, tip: 25, cashAmount: 25, mpAmount: 0 },
  ];
  assert.equal(logic.paymentTotal(cuts, 'Efectivo'), 625);
  assert.equal(logic.paymentTotal(cuts, 'Mercado Pago'), 950);
});

test('FIN-026 - Las ventas usan el total guardado sin multiplicarlo por cantidad', () => {
  const logic = loadLogic();
  const sales = [
    { payment: 'Efectivo', quantity: 3, unitPrice: 200, total: '600' },
    { payment: 'Efectivo', quantity: 1, unitPrice: 50, total: '50' },
    { payment: 'Mercado Pago', quantity: 2, unitPrice: 350, total: '700' },
  ];
  assert.equal(logic.salePaymentTotal(sales, 'Efectivo'), 650);
  assert.equal(logic.salePaymentTotal(sales, 'Mercado Pago'), 700);
});

for (const [id, description, method] of [
  ['FIN-027', 'Los adelantos convierten importes escritos antes de sumar', 'advancePaymentTotal'],
  ['FIN-028', 'Los gastos convierten importes escritos antes de sumar', 'expensePaymentTotal'],
]) {
  test(`${id} - ${description}`, () => {
    const logic = loadLogic();
    const rows = [
      { payment: 'Efectivo', amount: '300' },
      { payment: 'Mercado Pago', amount: '100' },
      { payment: 'Efectivo', amount: '25' },
      { payment: 'Mercado Pago', amount: 50 },
    ];
    assert.equal(logic[method](rows, 'Efectivo'), 325);
    assert.equal(logic[method](rows, 'Mercado Pago'), 150);
  });
}

for (const [id, description, transfers, cash, mp] of [
  ['FIN-030', 'Una lista de transferencias vacia no mueve saldo', [], 0, 0],
  ['FIN-031', 'Transferir a MP resta efectivo y suma MP', [{ from: 'Efectivo', to: 'Mercado Pago', amount: 100 }], -100, 100],
  ['FIN-032', 'Transferir a efectivo convierte el importe escrito', [{ from: 'Mercado Pago', to: 'Efectivo', amount: '300' }], 300, -300],
  ['FIN-033', 'Compensa transferencias sucesivas en ambas direcciones', [
    { from: 'Efectivo', to: 'Mercado Pago', amount: 100 },
    { from: 'Mercado Pago', to: 'Efectivo', amount: 300 },
    { from: 'Efectivo', to: 'Mercado Pago', amount: 50 },
  ], 150, -150],
  ['FIN-034', 'Una transferencia de cero es neutra', [{ from: 'Efectivo', to: 'Mercado Pago', amount: '0' }], 0, 0],
  ['FIN-035', 'Transferir efectivo al mismo medio es neutro', [{ from: 'Efectivo', to: 'Efectivo', amount: 125 }], 0, 0],
  ['FIN-036', 'Transferir MP al mismo medio es neutro', [{ from: 'Mercado Pago', to: 'Mercado Pago', amount: '125' }], 0, 0],
]) {
  test(`${id} - ${description}`, () => {
    const logic = loadLogic();
    assert.equal(logic.transferTotal(transfers, 'Efectivo'), cash);
    assert.equal(logic.transferTotal(transfers, 'Mercado Pago'), mp);
  });
}

test('FIN-040 - El saldo sin apertura ni movimientos es cero', () => {
  const logic = loadLogic();
  assert.equal(logic.balance('Efectivo'), 0);
  assert.equal(logic.balance('Mercado Pago'), 0);
});

for (const [id, description, initial, expected] of [
  ['FIN-041', 'El saldo conserva una apertura numerica', 1000, 1000],
  ['FIN-042', 'El saldo convierte una apertura escrita', '2000', 2000],
  ['FIN-043', 'Una apertura nula equivale a cero', null, 0],
  ['FIN-044', 'Una apertura vacia equivale a cero', '', 0],
]) {
  test(`${id} - ${description}`, () => {
    assert.equal(loadLogic().balance('Efectivo', initial), expected);
  });
}

for (const [id, description, key, cash, mp] of [
  ['FIN-045', 'El saldo suma solamente los cortes con propina', 'cuts', 2800, 4400],
  ['FIN-046', 'El saldo suma solamente las ventas', 'sales', 1500, 2700],
  ['FIN-047', 'El saldo resta solamente los adelantos', 'advances', 700, 1900],
  ['FIN-048', 'El saldo resta solamente los gastos', 'expenses', 950, 1800],
  ['FIN-049', 'El saldo aplica solamente las transferencias', 'transfers', 900, 2100],
]) {
  test(`${id} - ${description}`, () => {
    const logic = loadLogic();
    const fixture = financialFixture();
    const lists = ['cuts', 'sales', 'advances', 'expenses', 'transfers'].map((name) => name === key ? fixture[name] : []);
    assert.equal(logic.balance('Efectivo', 1000, ...lists), cash);
    assert.equal(logic.balance('Mercado Pago', 2000, ...lists), mp);
  });
}

test('FIN-050 - El saldo completo coincide con el oraculo fijo de caja', () => {
  const logic = loadLogic();
  const { cuts, sales, advances, expenses, transfers } = financialFixture();
  assert.equal(logic.balance('Efectivo', 1000, cuts, sales, advances, expenses, transfers), 2850);
  assert.equal(logic.balance('Mercado Pago', 2000, cuts, sales, advances, expenses, transfers), 4900);
});

test('FIN-051 - El saldo permite deficit sin alterar egresos validos', () => {
  const logic = loadLogic();
  const advances = [{ payment: 'Efectivo', amount: 100 }];
  const expenses = [{ payment: 'Mercado Pago', amount: 50 }];
  assert.equal(logic.balance('Efectivo', 0, [], [], advances, expenses), -100);
  assert.equal(logic.balance('Mercado Pago', 0, [], [], advances, expenses), -50);
});

test('FIN-052 - Dos transferencias opuestas actualizan ambas aperturas', () => {
  const logic = loadLogic();
  const transfers = [{ from: 'Efectivo', to: 'Mercado Pago', amount: 200 }];
  assert.equal(logic.balance('Efectivo', 1000, [], [], [], [], transfers), 800);
  assert.equal(logic.balance('Mercado Pago', 500, [], [], [], [], transfers), 700);
  transfers.push({ from: 'Mercado Pago', to: 'Efectivo', amount: 300 });
  assert.equal(logic.balance('Efectivo', 1000, [], [], [], [], transfers), 1100);
  assert.equal(logic.balance('Mercado Pago', 500, [], [], [], [], transfers), 400);
});

for (const [id, description, cut, dominant, cash, mp] of [
  ['FIN-060', 'Asigna un corte simple al efectivo', { payment: 'Efectivo', amount: 1000, tip: 200, commission: 500 }, 'Efectivo', [1000, 200, 500], [0, 0, 0]],
  ['FIN-061', 'Asigna un corte simple escrito a MP', { payment: 'Mercado Pago', amount: '800', tip: '50', commission: '200' }, 'Mercado Pago', [0, 0, 0], [800, 50, 200]],
  ['FIN-062', 'El mixto mayor en efectivo le asigna toda la propina', { payment: 'Ambos', amount: 15000, tip: 3000, cashAmount: 10000, mpAmount: 8000, commission: 7500 }, 'Efectivo', [7000, 3000, 3500], [8000, 0, 4000]],
  ['FIN-063', 'El mixto mayor en MP le asigna toda la propina', { payment: 'Ambos', amount: 15000, tip: 3000, cashAmount: 8000, mpAmount: 10000, commission: 7500 }, 'Mercado Pago', [8000, 0, 4000], [7000, 3000, 3500]],
  ['FIN-064', 'El empate mixto asigna la propina al efectivo', { payment: 'Ambos', amount: 15000, tip: 3000, cashAmount: 9000, mpAmount: 9000, commission: 7500 }, 'Efectivo', [6000, 3000, 3000], [9000, 0, 4500]],
  ['FIN-065', 'El predominio mixto compara numeros y no textos', { payment: 'Ambos', amount: '170', tip: '20', cashAmount: '90', mpAmount: '100', commission: '85' }, 'Mercado Pago', [90, 0, 45], [80, 20, 40]],
  ['FIN-066', 'La propina puede agotar el medio dominante', { payment: 'Ambos', amount: 400, tip: 600, cashAmount: 600, mpAmount: 400, commission: 200 }, 'Efectivo', [0, 600, 0], [400, 0, 200]],
  ['FIN-067', 'Un mixto puede cobrarse solo en efectivo', { payment: 'Ambos', amount: 100, tip: 10, cashAmount: 110, mpAmount: 0, commission: 50 }, 'Efectivo', [100, 10, 50], [0, 0, 0]],
  ['FIN-068', 'Un mixto puede cobrarse solo en MP', { payment: 'Ambos', amount: 100, tip: 10, cashAmount: 0, mpAmount: 110, commission: 50 }, 'Mercado Pago', [0, 0, 0], [100, 10, 50]],
  ['FIN-069', 'El mixto de cero numerico no divide por cero', { payment: 'Ambos', amount: 0, tip: 0, cashAmount: 0, mpAmount: 0, commission: 0 }, 'Efectivo', [0, 0, 0], [0, 0, 0]],
  ['FIN-070', 'El mixto de cero escrito no produce NaN', { payment: 'Ambos', amount: '0', tip: '0', cashAmount: '0', mpAmount: '0', commission: '0' }, 'Efectivo', [0, 0, 0], [0, 0, 0]],
  ['FIN-071', 'El mixto de solo propina no genera comision', { payment: 'Ambos', amount: 0, tip: 100, cashAmount: 100, mpAmount: 0, commission: 0 }, 'Efectivo', [0, 100, 0], [0, 0, 0]],
  ['FIN-072', 'El mixto admite propina ausente y reparte comision', { payment: 'Ambos', amount: 100, cashAmount: 40, mpAmount: 60, commission: 25 }, 'Mercado Pago', [40, 0, 10], [60, 0, 15]],
  ['FIN-073', 'El corte simple admite propina y comision ausentes', { payment: 'Efectivo', amount: 100 }, 'Efectivo', [100, 0, 0], [0, 0, 0]],
]) {
  test(`${id} - ${description}`, () => {
    const logic = loadLogic();
    assert.equal(logic.dominantPayment(cut), dominant);
    assert.equal(logic.mixedTipError(cut), '');
    const fields = ['amount', 'tip', 'commission'];
    assert.deepEqual(fields.map((field) => logic.cutValueByPayment([cut], 'Efectivo', field)), cash);
    assert.deepEqual(fields.map((field) => logic.cutValueByPayment([cut], 'Mercado Pago', field)), mp);
    assert.equal(logic.paymentTotal([cut], 'Efectivo'), cash[0] + cash[1]);
    assert.equal(logic.paymentTotal([cut], 'Mercado Pago'), mp[0] + mp[1]);
  });
}

test('FIN-074 - Acumula asignaciones de varios cortes y de listas vacias', () => {
  const logic = loadLogic();
  const { cuts } = financialFixture();
  assert.deepEqual(['amount', 'tip', 'commissionAmount'].map((field) => logic.cutValueByPayment(cuts, 'Efectivo', field)), [1500, 300, 750]);
  assert.deepEqual(['amount', 'tip', 'commissionAmount'].map((field) => logic.cutValueByPayment(cuts, 'Mercado Pago', field)), [2400, 0, 1200]);
  assert.equal(logic.cutValueByPayment([], 'Efectivo', 'amount'), 0);
  assert.equal(logic.cutValueByPayment([], 'Mercado Pago', 'commission'), 0);
});

for (const [id, description, cut, invalid] of [
  ['FIN-080', 'Rechaza propina mayor que el efectivo dominante', { payment: 'Ambos', tip: 601, cashAmount: 600, mpAmount: 400 }, true],
  ['FIN-081', 'Rechaza propina mayor que MP dominante', { payment: 'Ambos', tip: '601', cashAmount: '400', mpAmount: '600' }, true],
  ['FIN-082', 'Rechaza propina mayor que ambos medios empatados', { payment: 'Ambos', tip: 501, cashAmount: 500, mpAmount: 500 }, true],
  ['FIN-083', 'Un mixto sin campos opcionales no tiene error de propina', { payment: 'Ambos', tip: null, cashAmount: null }, false],
  ['FIN-084', 'Una propina sin aportes mixtos produce error', { payment: 'Ambos', tip: 1 }, true],
  ['FIN-085', 'Los pagos simples no limitan la propina al precio', { payment: 'Efectivo', amount: 0, tip: 100 }, false],
]) {
  test(`${id} - ${description}`, () => {
    assert.equal(loadLogic().mixedTipError(cut), invalid ? 'La propina no puede superar el importe del medio que m\u00e1s aport\u00f3.' : '');
  });
}
