import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../support/app.mjs';

const mateo = '[data-barber-column="Mateo"]';
const lucas = '[data-barber-column="Lucas"]';

function balances(app, cash, mp) {
  assert.deepEqual(app.snapshot('[dayBalance("Efectivo"), dayBalance("Mercado Pago")]'), [cash, mp]);
  for (const id of ['cashTotal', 'theoreticalCash', 'transferCashAvailable']) assert.equal(app.element(id).textContent, app.money(cash), id);
  for (const id of ['mpTotal', 'theoreticalMp', 'transferMpAvailable']) assert.equal(app.element(id).textContent, app.money(mp), id);
}

test('PAY-001 - El pago mostrado suma comision y propinas sin descontar adelantos', (t) => {
  const app = createApp(t);
  app.financialFixture();
  assert.equal(app.query(mateo).dataset.paymentDue, '1250');
  assert.deepEqual([...app.query(`${mateo} .payment-breakdown`).querySelectorAll('dd')].map((node) => node.textContent), [app.money(300), app.money(950), app.money(1250)]);
  assert.match(app.query(`${mateo} .payment-amount-due`).title, /no descuenta adelantos/);
  assert.equal(app.query(`${mateo} [data-payment-label]`).textContent, 'No pago');
  assert.equal(app.query(mateo).classList.contains('is-paid'), false);
  assert.equal(app.query(`${mateo} .payment-inline-split`).hidden, true);
  assert.equal(app.query(`${mateo} [data-payment-amount]`).disabled, true);
  assert.deepEqual(app.snapshot('barberPaymentRecord("Mateo")'), { status: 'No pago', cashAmount: '', mpAmount: '' });
  balances(app, 2850, 4900);
});

test('PAY-002 - Un clic en efectivo descuenta el pago completo con propinas', (t) => {
  const app = createApp(t);
  app.financialFixture();
  const movements = app.snapshot('({ advances, expenses, transfers })');
  app.click(`${mateo} .payment-disclosure`);
  app.click(`${mateo} [data-barber-payment-method="Efectivo"]`);
  assert.equal(app.query(mateo).classList.contains('is-paid'), true);
  assert.match(app.query(`${mateo} [data-payment-label]`).textContent, /Pagado.*Efectivo/);
  assert.equal(app.query(`${mateo} [data-barber-payment-method="Efectivo"]`).getAttribute('aria-pressed'), 'true');
  assert.equal(app.run('barberPaymentRecord("Mateo").status'), 'Efectivo');
  assert.deepEqual(app.snapshot('({ advances, expenses, transfers })'), movements);
  balances(app, 1600, 4900);
  assert.equal(app.element('dailyCollected').textContent, app.money(5400));
  assert.equal(app.element('dailyInvoiced').textContent, app.money(5100));
  assert.equal(app.element('dailyNet').textContent, app.money(3150));
});

test('PAY-003 - Un clic en MP descuenta el pago completo solo de MP', (t) => {
  const app = createApp(t);
  app.financialFixture();
  app.click(`${mateo} .payment-disclosure`);
  app.click(`${mateo} [data-barber-payment-method="Mercado Pago"]`);
  assert.equal(app.query(mateo).classList.contains('is-paid'), true);
  assert.match(app.query(`${mateo} [data-payment-label]`).textContent, /Pagado.*MP/);
  balances(app, 2850, 3650);
});

test('PAY-004 - Cambiar efectivo por MP libera el medio anterior sin doble descuento', (t) => {
  const app = createApp(t);
  app.financialFixture();
  app.click(`${mateo} [data-barber-payment-method="Efectivo"]`);
  app.click(`${mateo} [data-barber-payment-method="Mercado Pago"]`);
  balances(app, 2850, 3650);
  app.click(`${mateo} [data-barber-payment-method="Efectivo"]`);
  balances(app, 1600, 4900);
  assert.equal(app.query(`${mateo} [data-barber-payment-method="Mercado Pago"]`).getAttribute('aria-pressed'), 'false');
});

test('PAY-005 - No pago ignora importes mixtos retenidos y devuelve los fondos', (t) => {
  const app = createApp(t);
  app.financialFixture();
  app.seed({ barberPayments: { '2026-09-03': { Mateo: { status: 'No pago', cashAmount: 300, mpAmount: 600 } } } });
  app.render();
  balances(app, 2850, 4900);
  app.click(`${mateo} [data-barber-payment-method="Mixto"]`);
  balances(app, 2550, 4300);
  app.click(`${mateo} [data-barber-payment-method="No pago"]`);
  assert.deepEqual(app.snapshot('barberPaymentRecord("Mateo")'), { status: 'No pago', cashAmount: 300, mpAmount: 600 });
  assert.equal(app.query(mateo).classList.contains('is-paid'), false);
  assert.equal(app.query(mateo).classList.contains('is-payment-incomplete'), false);
  assert.equal(app.query(`${mateo} .payment-inline-split`).hidden, true);
  balances(app, 2850, 4900);
});

test('PAY-006 - Los pagos de dos barberos se descuentan de forma independiente', (t) => {
  const app = createApp(t);
  app.financialFixture();
  app.click(`${mateo} [data-barber-payment-method="Efectivo"]`);
  app.click(`${lucas} [data-barber-payment-method="Mercado Pago"]`);
  balances(app, 1600, 3900);
  app.click(`${lucas} [data-barber-payment-method="No pago"]`);
  balances(app, 1600, 4900);
  assert.equal(app.query(mateo).dataset.paymentStatus, 'Efectivo');
  assert.equal(app.query(lucas).dataset.paymentStatus, 'No pago');
});

test('PAY-007 - Un mixto parcial descuenta lo ingresado aunque falte pagar', (t) => {
  const app = createApp(t);
  app.financialFixture();
  app.click(`${mateo} [data-barber-payment-method="Mixto"]`);
  app.input(`${mateo} [data-payment-amount="cashAmount"]`, '200');
  app.input(`${mateo} [data-payment-amount="mpAmount"]`, '300');
  assert.deepEqual(app.snapshot('barberPaymentRecord("Mateo")'), { status: 'Mixto', cashAmount: 200, mpAmount: 300 });
  assert.equal(app.query(mateo).classList.contains('is-payment-incomplete'), true);
  assert.equal(app.query(mateo).classList.contains('is-paid'), false);
  assert.match(app.query(`${mateo} [data-payment-label]`).textContent, /Mixto.*Incompleto/);
  assert.equal(app.query(`${mateo} [data-payment-sum]`).textContent, app.money(500));
  assert.equal(app.query(`${mateo} [data-payment-balance-label]`).textContent, 'Falta pagar');
  assert.equal(app.query(`${mateo} [data-payment-balance]`).textContent, app.money(750));
  balances(app, 2650, 4600);
});

test('PAY-008 - Un mixto exacto marca completo y descuenta cada aporte', (t) => {
  const app = createApp(t);
  app.financialFixture();
  app.click(`${mateo} [data-barber-payment-method="Mixto"]`);
  app.input(`${mateo} [data-payment-amount="cashAmount"]`, '750');
  app.input(`${mateo} [data-payment-amount="mpAmount"]`, '500');
  assert.equal(app.query(mateo).classList.contains('is-paid'), true);
  assert.equal(app.query(mateo).classList.contains('is-payment-incomplete'), false);
  assert.match(app.query(`${mateo} [data-payment-label]`).textContent, /Mixto.*Completo/);
  assert.equal(app.query(`${mateo} [data-payment-balance]`).textContent, app.money(0));
  balances(app, 2100, 4400);
});

test('PAY-009 - Un mixto excesivo descuenta todo y muestra el excedente', (t) => {
  const app = createApp(t);
  app.financialFixture();
  app.click(`${mateo} [data-barber-payment-method="Mixto"]`);
  app.input(`${mateo} [data-payment-amount="cashAmount"]`, '1.300');
  app.input(`${mateo} [data-payment-amount="mpAmount"]`, '200');
  assert.equal(app.query(mateo).classList.contains('is-paid'), true);
  assert.equal(app.query(`${mateo} [data-payment-sum]`).textContent, app.money(1500));
  assert.match(app.query(`${mateo} [data-payment-balance-label]`).textContent, /De m.s/);
  assert.equal(app.query(`${mateo} [data-payment-balance]`).textContent, app.money(250));
  balances(app, 1550, 4700);
});

test('PAY-010 - Borrar importes mixtos o ingresar cero devuelve sus descuentos', (t) => {
  const app = createApp(t);
  app.financialFixture();
  app.seed({ barberPayments: { '2026-09-03': { Mateo: { status: 'Mixto', cashAmount: 300, mpAmount: 200 } } } });
  app.render();
  app.input(`${mateo} [data-payment-amount="cashAmount"]`, '');
  assert.equal(app.query(`${mateo} [data-payment-amount="cashAmount"]`).value, '');
  assert.equal(app.run('barberPaymentRecord("Mateo").cashAmount'), '');
  balances(app, 2850, 4700);
  app.input(`${mateo} [data-payment-amount="mpAmount"]`, '0');
  assert.equal(app.run('barberPaymentRecord("Mateo").mpAmount'), 0);
  assert.equal(app.query(`${mateo} [data-payment-balance]`).textContent, app.money(1250));
  balances(app, 2850, 4900);
});

test('PAY-011 - Los medios unicos ignoran importes retenidos y mixto los recupera', (t) => {
  const app = createApp(t);
  app.financialFixture();
  app.seed({ barberPayments: { '2026-09-03': { Mateo: { status: 'Mixto', cashAmount: 300, mpAmount: 200 } } } });
  app.render();
  app.click(`${mateo} [data-barber-payment-method="Efectivo"]`);
  balances(app, 1600, 4900);
  app.click(`${mateo} [data-barber-payment-method="Mercado Pago"]`);
  balances(app, 2850, 3650);
  app.click(`${mateo} [data-barber-payment-method="Mixto"]`);
  assert.equal(app.query(`${mateo} [data-payment-amount="cashAmount"]`).value, '300');
  assert.equal(app.query(`${mateo} [data-payment-amount="mpAmount"]`).value, '200');
  balances(app, 2550, 4700);
});

test('PAY-012 - Elegir mixto conserva el desplegable y enfoca el mismo input', (t) => {
  const app = createApp(t);
  app.financialFixture();
  const column = app.query(mateo);
  const control = app.query(`${mateo} .barber-payment-control`);
  const input = app.query(`${mateo} [data-payment-amount="cashAmount"]`);
  app.click(`${mateo} .payment-disclosure`);
  assert.equal(control.open, true);
  app.click(`${mateo} [data-barber-payment-method="Mixto"]`);
  assert.equal(app.query(mateo), column);
  assert.equal(app.query(`${mateo} [data-payment-amount="cashAmount"]`), input);
  assert.equal(app.window.document.activeElement, input);
  assert.equal(input.disabled, false);
  assert.equal(control.open, true);
  assert.equal(app.query(`${mateo} .payment-inline-split`).hidden, false);
});

test('PAY-013 - Formatear un pago conserva foco y caret entre los digitos', (t) => {
  const app = createApp(t);
  app.financialFixture();
  app.click(`${mateo} .payment-disclosure`);
  app.click(`${mateo} [data-barber-payment-method="Mixto"]`);
  const input = app.query(`${mateo} [data-payment-amount="cashAmount"]`);
  input.value = '12345';
  input.setSelectionRange(3, 3);
  app.emit(input, 'input');
  assert.equal(input.value, '12.345');
  assert.equal(input.selectionStart, 4);
  assert.equal(input.selectionEnd, 4);
  assert.equal(app.window.document.activeElement, input);
  assert.equal(app.query(`${mateo} [data-payment-amount="cashAmount"]`), input);
  assert.equal(app.query(`${mateo} .barber-payment-control`).open, true);
  assert.equal(app.run('barberPaymentRecord("Mateo").cashAmount'), 12345);
  balances(app, -9495, 4900);
});

test('PAY-014 - El input MP conserva caret al inicio y al borrar su importe', (t) => {
  const app = createApp(t);
  app.financialFixture();
  app.click(`${mateo} [data-barber-payment-method="Mixto"]`);
  const input = app.query(`${mateo} [data-payment-amount="mpAmount"]`);
  input.focus();
  input.value = '1234';
  input.setSelectionRange(0, 0);
  app.emit(input, 'input');
  assert.equal(input.value, '1.234');
  assert.equal(input.selectionStart, 0);
  assert.equal(app.window.document.activeElement, input);
  assert.equal(app.run('barberPaymentRecord("Mateo").mpAmount'), 1234);
  app.input(`${mateo} [data-payment-amount="mpAmount"]`, '');
  assert.equal(input.selectionStart, 0);
  assert.equal(input.selectionEnd, 0);
  assert.equal(app.window.document.activeElement, input);
  assert.equal(app.run('barberPaymentRecord("Mateo").mpAmount'), '');
  balances(app, 2850, 4900);
});

test('PAY-015 - Pagar actualiza diferencias sin borrar el borrador de cierre', (t) => {
  const app = createApp(t);
  app.financialFixture();
  app.input('#cashRegisterForm [name="realCash"]', '3000');
  app.input('#cashRegisterForm [name="realMp"]', '5000');
  app.input('#cashRegisterForm [name="withdrawal"]', '400');
  const fields = app.element('cashRegisterForm').elements;
  app.click(`${mateo} [data-barber-payment-method="Efectivo"]`);
  assert.deepEqual([fields.realCash.value, fields.realMp.value, fields.withdrawal.value], ['3.000', '5.000', '400']);
  assert.equal(app.element('cashDifference').textContent, app.money(1400));
  assert.equal(app.element('mpDifference').textContent, app.money(100));
  app.click(`${mateo} [data-barber-payment-method="Mixto"]`);
  app.input(`${mateo} [data-payment-amount="cashAmount"]`, '300');
  app.input(`${mateo} [data-payment-amount="mpAmount"]`, '200');
  assert.deepEqual([fields.realCash.value, fields.realMp.value, fields.withdrawal.value], ['3.000', '5.000', '400']);
  assert.equal(app.element('cashDifference').textContent, app.money(450));
  assert.equal(app.element('mpDifference').textContent, app.money(300));
  assert.equal(app.element('nextOpeningCash').textContent, `${app.money(2600)} efectivo`);
  assert.equal(app.element('nextOpeningMp').textContent, `${app.money(5000)} MP`);
  assert.equal(app.run('"realCash" in cashRegisters[workday.value]'), false);
  balances(app, 2550, 4700);
});

test('PAY-016 - Renderizar y repetir el mismo pago no duplica descuentos', (t) => {
  const app = createApp(t);
  app.financialFixture();
  app.click(`${mateo} [data-barber-payment-method="Efectivo"]`);
  for (let index = 0; index < 3; index++) {
    app.render();
    app.click(`${mateo} [data-barber-payment-method="Efectivo"]`);
    balances(app, 1600, 4900);
  }
  assert.deepEqual(app.snapshot('[entries.length, advances.length, expenses.length, transfers.length]'), [3, 2, 2, 1]);
  assert.deepEqual(app.snapshot('Object.keys(barberPayments[workday.value])'), ['Mateo']);
});

test('PAY-017 - Un corte posterior recalcula el pago unico con su nueva propina', (t) => {
  const app = createApp(t);
  app.financialFixture();
  app.click(`${mateo} [data-barber-payment-method="Efectivo"]`);
  app.click('[data-barber="Mateo"]');
  app.submit('cutForm', { service: 'Barba', amount: '2000', tip: '100', payment: 'Efectivo' });
  assert.equal(app.query(mateo).dataset.paymentDue, '2350');
  assert.equal(app.query(mateo).dataset.paymentStatus, 'Efectivo');
  assert.equal(app.query(mateo).classList.contains('is-paid'), true);
  balances(app, 2600, 4900);
});

test('PAY-018 - Editar un corte pagado recalcula cobro y descuento una sola vez', (t) => {
  const app = createApp(t);
  app.financialFixture();
  app.click(`${mateo} [data-barber-payment-method="Efectivo"]`);
  app.click('[data-cut="a"]');
  app.click('#editCut');
  app.submit('cutForm', { amount: '2000', tip: '100' });
  assert.equal(app.query(mateo).dataset.paymentDue, '1650');
  assert.equal(app.run('entries.length'), 3);
  balances(app, 2100, 4900);
  app.render();
  balances(app, 2100, 4900);
});

test('PAY-019 - Eliminar un corte pagado elimina tambien su parte del pago unico', (t) => {
  const app = createApp(t);
  app.financialFixture();
  app.click(`${mateo} [data-barber-payment-method="Efectivo"]`);
  app.click('[data-cut="a"]');
  app.click('#deleteCut');
  assert.equal(app.query(mateo).dataset.paymentDue, '550');
  assert.equal(app.query(mateo).classList.contains('is-paid'), true);
  balances(app, 1100, 4900);
});

test('PAY-020 - Un nuevo corte deja mixto incompleto sin cambiar importes entregados', (t) => {
  const app = createApp(t);
  app.financialFixture();
  app.seed({ barberPayments: { '2026-09-03': { Mateo: { status: 'Mixto', cashAmount: 750, mpAmount: 500 } } } });
  app.render();
  assert.equal(app.query(mateo).classList.contains('is-paid'), true);
  app.click('[data-barber="Mateo"]');
  app.submit('cutForm', { service: 'Barba', amount: '2000' });
  assert.equal(app.query(mateo).dataset.paymentDue, '2250');
  assert.equal(app.query(mateo).classList.contains('is-payment-incomplete'), true);
  assert.equal(app.query(`${mateo} [data-payment-balance]`).textContent, app.money(1000));
  assert.deepEqual(app.snapshot('barberPaymentRecord("Mateo")'), { status: 'Mixto', cashAmount: 750, mpAmount: 500 });
  balances(app, 4100, 4400);
});

test('PAY-021 - Eliminar corte mantiene el mixto entregado y muestra nuevo excedente', (t) => {
  const app = createApp(t);
  app.financialFixture();
  app.seed({ barberPayments: { '2026-09-03': { Mateo: { status: 'Mixto', cashAmount: 750, mpAmount: 500 } } } });
  app.render();
  app.click('[data-cut="a"]');
  app.click('#deleteCut');
  assert.equal(app.query(mateo).dataset.paymentDue, '550');
  assert.equal(app.query(`${mateo} [data-payment-sum]`).textContent, app.money(1250));
  assert.equal(app.query(`${mateo} [data-payment-balance]`).textContent, app.money(700));
  assert.match(app.query(`${mateo} [data-payment-balance-label]`).textContent, /De m.s/);
  balances(app, 900, 4400);
});

test('PAY-022 - Cambiar comision diaria recalcula el descuento del pago completo', (t) => {
  const app = createApp(t);
  app.financialFixture();
  app.click(`${mateo} [data-barber-payment-method="Efectivo"]`);
  app.click('#changeCommission');
  app.submit('dailyCommissionForm', { commission: '60' });
  assert.equal(app.query(mateo).dataset.paymentDue, '1440');
  assert.equal(app.query(lucas).dataset.paymentDue, '1200');
  balances(app, 1410, 4900);
});

test('PAY-023 - Los estados de pago y sus descuentos quedan aislados por jornada', (t) => {
  const app = createApp(t);
  const data = app.financialFixture();
  app.seed({
    entries: [...data.cuts, { id: 'next-cut', date: '2026-09-04', time: '10:00', barber: 'Mateo', service: 'Barba', amount: 200, tip: 20, payment: 'Efectivo', commissionRate: 50, commissionAmount: 100 }],
    cashRegisters: { '2026-09-03': { opened: true, initialCash: 1000, initialMp: 2000 }, '2026-09-04': { opened: true, initialCash: 50, initialMp: 200 } },
  });
  app.render();
  app.click(`${mateo} [data-barber-payment-method="Efectivo"]`);
  app.element('workday').value = '2026-09-04';
  app.emit('#workday', 'change');
  assert.equal(app.query(mateo).dataset.paymentStatus, 'No pago');
  assert.equal(app.query(mateo).dataset.paymentDue, '120');
  balances(app, 270, 200);
  app.click(`${mateo} [data-barber-payment-method="Mercado Pago"]`);
  balances(app, 270, 80);
  app.element('workday').value = '2026-09-03';
  app.emit('#workday', 'change');
  assert.equal(app.query(mateo).dataset.paymentStatus, 'Efectivo');
  assert.equal(app.run('barberPaymentRecord("Mateo", "2026-09-04").status'), 'Mercado Pago');
  balances(app, 1600, 4900);
});

test('PAY-024 - Pagar un barbero sin cortes no descuenta sus adelantos otra vez', (t) => {
  const app = createApp(t);
  app.financialFixture();
  app.seed({ entries: [] });
  app.render();
  assert.equal(app.query(mateo).dataset.paymentDue, '0');
  app.click(`${mateo} [data-barber-payment-method="Efectivo"]`);
  assert.equal(app.query(mateo).classList.contains('is-paid'), true);
  balances(app, 1050, 2500);
  assert.equal(app.element('advancesGrandTotal').textContent, app.money(400));
});

test('PAY-025 - Desactivar un barbero no devuelve el pago ya descontado', (t) => {
  const app = createApp(t);
  app.financialFixture();
  app.click(`${mateo} [data-barber-payment-method="Efectivo"]`);
  app.click('[data-config-active="barbers"][data-id="Mateo"]');
  assert.equal(app.window.document.querySelector(mateo), null);
  assert.equal(app.run('barberPaymentRecord("Mateo").status'), 'Efectivo');
  balances(app, 1600, 4900);
});

test('PAY-026 - Tras pagar en efectivo una transferencia no puede usar fondos entregados', (t) => {
  const app = createApp(t);
  app.financialFixture();
  app.click(`${mateo} [data-barber-payment-method="Efectivo"]`);
  const before = app.snapshot('transfers');
  app.submit('transferForm', { from: 'Efectivo', amount: '1601' });
  assert.deepEqual(app.snapshot('transfers'), before);
  assert.match(app.element('transferForm').elements.amount.validationMessage, /saldo disponible es insuficiente/);
  balances(app, 1600, 4900);
});

test('PAY-027 - Tras pagar en efectivo se puede transferir exactamente el remanente', (t) => {
  const app = createApp(t);
  app.financialFixture();
  app.click(`${mateo} [data-barber-payment-method="Efectivo"]`);
  app.submit('transferForm', { from: 'Efectivo', amount: '1600' });
  assert.equal(app.run('transfers.at(-1).amount'), 1600);
  balances(app, 0, 6500);
  app.render();
  balances(app, 0, 6500);
});

test('PAY-028 - Tras pagar por MP se rechaza un peso sobre el remanente', (t) => {
  const app = createApp(t);
  app.financialFixture();
  app.click(`${mateo} [data-barber-payment-method="Mercado Pago"]`);
  app.submit('transferForm', { from: 'Mercado Pago', amount: '3651' });
  assert.equal(app.run('transfers.length'), 1);
  assert.match(app.element('transferForm').elements.amount.validationMessage, /saldo disponible es insuficiente/);
  app.input('#transferForm [name="amount"]', '3650');
  app.submit('transferForm');
  balances(app, 6500, 0);
});

test('PAY-029 - El pago unico descuenta el redondeo mostrado de la suma de cortes', (t) => {
  const app = createApp(t);
  app.click('[data-barber="Mateo"]');
  app.submit('cutForm', { service: 'Barba', amount: '101', tip: '1' });
  app.click('[data-barber="Mateo"]');
  app.submit('cutForm', { service: 'Barba', amount: '101', tip: '1' });
  assert.deepEqual(app.snapshot('entries.map(({ commissionAmount }) => commissionAmount)'), [50.5, 50.5]);
  assert.equal(app.query(mateo).dataset.paymentDue, '103');
  assert.equal(app.query(`${mateo} .payment-amount-due dd`).textContent, app.money(103));
  app.click(`${mateo} [data-barber-payment-method="Efectivo"]`);
  balances(app, 101, 0);
  assert.equal(app.element('dailyCommission').textContent, app.money(101));
});

test('PAY-030 - Ordenar columnas bloquea cambios de pago y deja el estado intacto', (t) => {
  const app = createApp(t);
  app.financialFixture();
  app.seed({ barberPayments: { '2026-09-03': { Mateo: { status: 'Mixto', cashAmount: 300, mpAmount: 200 } } } });
  app.render();
  const before = app.snapshot('barberPayments');
  app.click('#reorderBarbers');
  assert.equal(app.query(`${mateo} [data-barber-payment-method="Efectivo"]`).disabled, true);
  assert.equal(app.query(`${mateo} [data-payment-amount="cashAmount"]`).disabled, true);
  app.click(`${mateo} [data-barber-payment-method="Efectivo"]`);
  app.input(`${mateo} [data-payment-amount="cashAmount"]`, '999');
  assert.deepEqual(app.snapshot('barberPayments'), before);
  app.click('#cancelBarberOrder');
  assert.equal(app.query(`${mateo} [data-payment-amount="cashAmount"]`).value, '300');
  assert.equal(app.query(`${mateo} [data-payment-amount="cashAmount"]`).disabled, false);
  balances(app, 2550, 4700);
});

test('PAY-031 - Guardar cierre tras pago conserva sus importes reales al volver', (t) => {
  const app = createApp(t);
  app.financialFixture();
  app.click(`${mateo} [data-barber-payment-method="Efectivo"]`);
  app.input('#cashRegisterForm [name="realCash"]', '1600');
  app.input('#cashRegisterForm [name="realMp"]', '4900');
  app.input('#cashRegisterForm [name="withdrawal"]', '100');
  assert.equal(app.element('cashDifference').textContent, app.money(0));
  assert.equal(app.element('mpDifference').textContent, app.money(0));
  app.submit('cashRegisterForm');
  app.element('workday').value = '2026-09-04';
  app.emit('#workday', 'change');
  balances(app, 1500, 4900);
  assert.equal(app.query(mateo).dataset.paymentStatus, 'No pago');
  app.element('workday').value = '2026-09-03';
  app.emit('#workday', 'change');
  assert.deepEqual(['realCash', 'realMp', 'withdrawal'].map((name) => app.element('cashRegisterForm').elements.namedItem(name).value), ['1.600', '4.900', '100']);
  assert.equal(app.element('cashDifference').textContent, app.money(0));
  balances(app, 1600, 4900);
});
