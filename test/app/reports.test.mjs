import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../support/app.mjs';

function report(app, period = 'month', payment = 'Ambas', barber = '') {
  app.element('summaryPeriod').value = period;
  app.emit('#summaryPeriod', 'change');
  app.element('summaryPaymentFilter').value = payment;
  app.element('summaryBarberFilter').value = barber;
  app.run('renderSummary()');
}

function amounts(app, values) {
  for (const [name, amount] of Object.entries(values)) assert.equal(app.element(`summary${name}`).textContent, app.money(amount), name);
}

for (const [id, medium, values, cuts, sales] of [
  ['RPT-001', 'Ambas', { Services: 3900, Sales: 1200, Invoiced: 5100, Commission: 1950, Balance: 3150, Tips: 300, Advances: 400, Expenses: 250, ServicesCash: 1500, ServicesMp: 2400, SalesCash: 500, SalesMp: 700, AverageTicket: 1020 }, '3 cortes', '2 ventas'],
  ['RPT-002', 'Efectivo', { Services: 1500, Sales: 500, Invoiced: 2000, Commission: 750, Balance: 1250, Tips: 300, Advances: 300, Expenses: 50, ServicesCash: 1500, ServicesMp: 0, SalesCash: 500, SalesMp: 0, AverageTicket: 2000 / 3 }, '2 cortes', '1 venta'],
  ['RPT-003', 'Mercado Pago', { Services: 2400, Sales: 700, Invoiced: 3100, Commission: 1200, Balance: 1900, Tips: 0, Advances: 100, Expenses: 200, ServicesCash: 0, ServicesMp: 2400, SalesCash: 0, SalesMp: 700, AverageTicket: 1550 }, '1 corte', '1 venta'],
]) {
  test(`${id} - El reporte de ${medium} suma cada concepto y su ticket promedio`, (t) => {
    const app = createApp(t);
    app.financialFixture();
    report(app, 'month', medium);
    amounts(app, values);
    assert.equal(app.element('summaryCuts').textContent, cuts);
    assert.equal(app.element('summarySaleCount').textContent, sales);
    assert.equal(app.element('summaryRows').rows.length, 1);
    assert.equal(app.element('summaryRows').rows[0].cells[9].textContent, app.money(values.Balance));
  });
}

test('RPT-004 - Filtrar barbero excluye ventas gastos y retiros sin borrar sus adelantos', (t) => {
  const app = createApp(t);
  app.financialFixture();
  app.run('cashRegisters[workday.value].withdrawal = 500');
  report(app, 'month', 'Ambas', 'Mateo');
  amounts(app, { Services: 1900, Sales: 0, Tips: 300, Commission: 950, Advances: 300, Expenses: 0, Withdrawals: 0, Balance: 950 });
  assert.equal(app.element('summaryCuts').textContent, '2 cortes');
});

test('RPT-005 - Quitar todos los servicios conserva ventas gastos y adelantos', (t) => {
  const app = createApp(t);
  app.financialFixture();
  report(app);
  app.run('document.querySelectorAll("#summaryServiceOptions input").forEach(input => input.checked = false)');
  app.emit('#summaryServiceOptions', 'change');
  amounts(app, { Services: 0, Sales: 1200, Tips: 0, Commission: 0, Advances: 400, Expenses: 250, Balance: 1200 });
  assert.match(app.query('#summaryServiceFilter summary').textContent, /^0 servicios/);
});

test('RPT-006 - Elegir un servicio actualiza etiqueta y no incluye otros servicios', (t) => {
  const app = createApp(t);
  app.financialFixture();
  report(app);
  app.run('document.querySelectorAll("#summaryServiceOptions input").forEach(input => input.checked = input.value === "Corte clásico")');
  app.emit('#summaryServiceOptions', 'change');
  assert.equal(app.query('#summaryServiceFilter summary').textContent, 'Corte clásico');
  amounts(app, { Services: 0, Sales: 1200 });
});

test('RPT-007 - Los limites mensuales incluyen ambos extremos y excluyen fechas externas', (t) => {
  const app = createApp(t);
  app.seed({ sales: [
    { id: 'before', date: '2026-08-31', time: '12:00', product: 'Pomada', payment: 'Efectivo', total: 100 },
    { id: 'first', date: '2026-09-01', time: '12:00', product: 'Pomada', payment: 'Efectivo', total: 200 },
    { id: 'last', date: '2026-09-30', time: '12:00', product: 'Pomada', payment: 'Mercado Pago', total: 300 },
    { id: 'after', date: '2026-10-01', time: '12:00', product: 'Pomada', payment: 'Mercado Pago', total: 400 },
  ] });
  report(app);
  amounts(app, { Sales: 500, Balance: 500 });
  assert.equal(app.element('summaryRows').rows.length, 2);
});

test('RPT-008 - Un retiro sin operaciones genera fila y se excluye al filtrar MP', (t) => {
  const app = createApp(t);
  app.run('cashRegisters["2026-09-02"] = {withdrawal:400}');
  report(app);
  amounts(app, { Withdrawals: 400, Invoiced: 0, Balance: 0 });
  assert.equal(app.element('summaryRows').rows[0].cells[8].textContent, app.money(400));
  assert.equal(app.element('summaryEmpty').hidden, true);
  report(app, 'month', 'Mercado Pago');
  assert.equal(app.element('summaryRows').rows.length, 0);
  assert.equal(app.element('summaryEmpty').hidden, false);
});

test('RPT-009 - El reporte anual agrupa operaciones y retiros por mes', (t) => {
  const app = createApp(t);
  app.financialFixture();
  app.run('cashRegisters["2026-01-01"] = {withdrawal:100}; cashRegisters["2026-09-02"] = {withdrawal:200}; cashRegisters["2025-12-31"] = {withdrawal:999}');
  report(app, 'year');
  assert.equal(app.element('summaryDate').type, 'number');
  assert.equal(app.element('summaryRows').rows.length, 2);
  assert.equal(app.element('summaryRows').rows[0].cells[8].textContent, app.money(100));
  assert.equal(app.element('summaryRows').rows[1].cells[8].textContent, app.money(200));
  amounts(app, { Withdrawals: 300, Sales: 1200 });
});

test('RPT-010 - Cambiar semana actualiza rango y excluye ventas de la semana anterior', (t) => {
  const app = createApp(t);
  app.run('sales = [{date:"2026-09-07",payment:"Efectivo",total:100},{date:"2026-09-14",payment:"Efectivo",total:200}]');
  report(app, 'week');
  assert.equal(app.element('summaryWeekField').hidden, false);
  app.element('summaryWeek').value = '2';
  app.emit('#summaryWeek', 'change');
  amounts(app, { Sales: 200 });
  assert.match(app.element('summaryRange').textContent, /14\/09\/2026/);
});

test('RPT-011 - Una referencia vacia se recupera sin romper los contadores', (t) => {
  const app = createApp(t);
  app.financialFixture();
  report(app);
  app.element('summaryDate').value = '';
  app.emit('#summaryDate', 'change');
  assert.equal(app.element('summaryDate').value, '2026-09');
  amounts(app, { Invoiced: 5100 });
  app.render();
});

test('RPT-012 - No hay divisiones por cero ni filas viejas en un reporte vacio', (t) => {
  const app = createApp(t);
  app.financialFixture();
  report(app);
  app.element('summaryDate').value = '2025-01';
  app.emit('#summaryDate', 'change');
  amounts(app, { Invoiced: 0, AverageTicket: 0, Commission: 0, Balance: 0 });
  assert.equal(app.element('summaryRows').innerHTML, '');
  assert.equal(app.element('summaryOperationCount').textContent, '0 operaciones');
});

for (const [id, collection, renderer, rows, totals, field] of [
  ['RPT-013', 'sales', 'renderSales', 'salesRows', 'sales', 'total'],
  ['RPT-014', 'advances', 'renderAdvances', 'advanceRows', 'advances', 'amount'],
  ['RPT-015', 'expenses', 'renderExpenses', 'expenseRows', 'expenses', 'amount'],
]) {
  test(`${id} - La tabla de ${collection} ordena hora escapa texto y suma importes escritos`, (t) => {
    const app = createApp(t);
    const data = [{ id: 'late', date: '2026-09-03', time: '15:00', product: '<img>', barber: '<img>', reason: '<img>', notes: '<img>', quantity: 1, unitPrice: 100, payment: 'Efectivo', [field]: '100' }, { id: 'early', date: '2026-09-03', time: '10:00', product: 'P', barber: 'B', reason: 'R', quantity: 1, unitPrice: 200, payment: 'Mercado Pago', [field]: '200' }];
    app.seed({ [collection]: data });
    app.run(`${renderer}(${collection})`);
    assert.match(app.element(rows).rows[0].textContent, /10:00/);
    assert.equal(app.element(rows).querySelector('img'), null);
    assert.equal(app.element(`${totals}GrandTotal`).textContent, app.money(300));
    assert.equal(app.element(`${totals}CashTotal`).textContent, app.money(100));
    assert.equal(app.element(`${totals}MpTotal`).textContent, app.money(200));
  });
}

test('RPT-016 - Los ajustes de apertura se muestran firmados sin botones para borrarlos', (t) => {
  const app = createApp(t);
  app.run('renderTransfers([{id:"t",time:"12:00",from:"Efectivo",to:"Mercado Pago",amount:100,description:"<img>"}], [{id:"a",time:"10:00",medium:"Efectivo",previous:500,current:300,description:"Ajuste"}])');
  const rows = app.element('transferRows').rows;
  assert.equal(rows.length, 2);
  assert.equal(rows[0].cells[2].textContent, app.money(-200));
  assert.equal(rows[0].querySelector('button'), null);
  assert.equal(rows[1].querySelectorAll('button').length, 1);
  assert.equal(app.element('transferRows').querySelector('img'), null);
});

test('RPT-017 - Cambiar filtro de barbero y medio dispara el recuento inmediatamente', (t) => {
  const app = createApp(t);
  app.financialFixture();
  report(app);
  app.element('summaryBarberFilter').value = 'Lucas';
  app.emit('#summaryBarberFilter', 'change');
  amounts(app, { Services: 2000, Sales: 0 });
  app.element('summaryPaymentFilter').value = 'Efectivo';
  app.emit('#summaryPaymentFilter', 'change');
  amounts(app, { Services: 0, Invoiced: 0 });
});
