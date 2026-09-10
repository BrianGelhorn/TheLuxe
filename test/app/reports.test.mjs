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

function shopAmounts(app, values) {
  assert.equal(app.element('shopSummary').hidden, false);
  assert.equal(app.element('barbersSummary').hidden, true);
  for (const [name, amount] of Object.entries(values)) assert.equal(app.element(`shop${name}`).textContent, app.money(amount), name);
}

function shopReport(app, period = 'month', payment = 'Ambas') {
  report(app, period, payment);
  app.element('summaryBarberFilter').querySelector('[data-scope="shop"]').selected = true;
  app.emit('#summaryBarberFilter', 'change');
}

function shopRows(app, id, values) {
  const rows = [...app.element(id).rows];
  assert.equal(rows.length, values.length);
  rows.forEach((row, index) => assert.deepEqual([...row.cells].slice(1).map(cell => cell.textContent), values[index].map(value => app.money(value))));
}

for (const [id, medium, invoiced, tips, commission, expenses, balance, revenue, movements] of [
  ['RPT-020', 'Ambas', 5100, 300, 1950, 250, 2900, [[3900, 1500, 2400], [1200, 500, 700], [5100, 2000, 3100], [300, 300, 0], [5400, 2300, 3100]], [[250, 50, 200], [400, 300, 100], [500, 500, 0]]],
  ['RPT-021', 'Efectivo', 2000, 300, 750, 50, 1200, [[1500, 1500, 0], [500, 500, 0], [2000, 2000, 0], [300, 300, 0], [2300, 2300, 0]], [[50, 50, 0], [300, 300, 0], [500, 500, 0]]],
  ['RPT-022', 'Mercado Pago', 3100, 0, 1200, 200, 1700, [[2400, 0, 2400], [700, 0, 700], [3100, 0, 3100], [0, 0, 0], [3100, 0, 3100]], [[200, 0, 200], [100, 0, 100], [0, 0, 0]]],
]) {
  test(`${id} - Barberia separa facturado cobrado balance y movimientos en ${medium}`, (t) => {
    const app = createApp(t);
    app.financialFixture();
    app.run('cashRegisters[workday.value].withdrawal = 500');
    shopReport(app, 'month', medium);
    shopAmounts(app, { Invoiced: invoiced, Commission: commission, Expenses: expenses, Balance: invoiced - commission - expenses });
    assert.equal(balance, invoiced - commission - expenses);
    assert.equal(revenue[3][0], tips);
    assert.equal(revenue[4][0], invoiced + tips);
    shopRows(app, 'shopRevenueRows', revenue);
    shopRows(app, 'shopMovementRows', movements);
    assert.equal(app.element('shopSaleCount').textContent, medium === 'Ambas' ? '2' : '1');
    assert.equal(app.element('shopSaleQuantity').textContent, medium === 'Ambas' ? '2' : '1');
    const history = app.element('summaryRows').rows[0];
    assert.equal(history.cells[2].textContent, app.money(revenue[0][0]));
    assert.equal(history.cells[3].textContent, app.money(revenue[1][0]));
    assert.equal(history.cells[7].textContent, app.money(expenses));
    assert.equal(history.cells[8].textContent, app.money(movements[2][0]));
  });
}

test('RPT-023 - Cambio ida y vuelta conserva servicios y adapta el historico al modo', (t) => {
  const app = createApp(t);
  app.financialFixture();
  report(app);
  assert.equal(app.element('summaryBarberFilter').value, '');
  assert.equal(app.element('shopSummary').hidden, true);
  assert.equal(app.element('barbersSummary').hidden, false);
  app.element('summaryBarberFilter').value = 'Mateo';
  app.emit('#summaryBarberFilter', 'change');
  amounts(app, { Invoiced: 2200 });
  app.run('document.querySelectorAll("#summaryServiceOptions input").forEach(input => input.checked = false)');
  app.emit('#summaryServiceOptions', 'change');
  amounts(app, { Invoiced: 0, Commission: 0 });
  assert.equal(app.element('summaryRows').rows[0].cells[3].textContent, app.money(0));
  shopReport(app);
  assert.equal(app.element('summaryServiceField').hidden, true);
  shopAmounts(app, { Invoiced: 5100, Balance: 2900 });
  assert.equal(app.element('summaryRows').rows[0].cells[2].textContent, app.money(3900));
  assert.equal(app.element('summaryRows').rows[0].cells[3].textContent, app.money(1200));
  report(app, 'month', 'Ambas', 'Mateo');
  assert.equal(app.element('summaryServiceField').hidden, false);
  assert.equal(app.element('shopSummary').hidden, true);
  assert.equal(app.element('barbersSummary').hidden, false);
  assert.equal(app.element('summaryServiceOptions').querySelector('input:checked'), null);
  amounts(app, { Invoiced: 0, Commission: 0 });
  assert.equal(app.element('summaryRows').rows[0].cells[3].textContent, app.money(0));
  report(app);
  assert.equal(app.element('shopSummary').hidden, true);
  assert.equal(app.element('barbersSummary').hidden, false);
});

test('RPT-024 - Adelantos retiros pagos apertura y transferencias no reducen otra vez balance', (t) => {
  const app = createApp(t);
  app.financialFixture();
  shopReport(app);
  app.run('advances.push({date:"2026-09-03",payment:"Efectivo",amount:9000}); cashRegisters[workday.value] = {withdrawal:8000,initialCash:99999,initialMp:88888}; barberPayments[workday.value] = {Mateo:"Efectivo"}; transfers.push({date:"2026-09-03",from:"Efectivo",to:"Mercado Pago",amount:7000})');
  app.run('renderSummary()');
  shopAmounts(app, { Balance: 2900 });
  shopRows(app, 'shopMovementRows', [[250, 50, 200], [9400, 9300, 100], [8000, 8000, 0]]);
  app.run('expenses.push({date:"2026-09-03",payment:"Efectivo",amount:4000}); renderSummary()');
  shopAmounts(app, { Balance: -1100, Expenses: 4250 });
});

test('RPT-025 - Barberia mixto dominante MP y empate asignan propina una sola vez', (t) => {
  const app = createApp(t);
  app.financialFixture();
  app.run('entries = [entries[2]]; sales = []; entries[0].cashAmount = 400; entries[0].mpAmount = 600');
  shopReport(app, 'month', 'Mercado Pago');
  shopAmounts(app, { Invoiced: 500, Commission: 250, Balance: 50 });
  shopRows(app, 'shopRevenueRows', [[500, 0, 500], [0, 0, 0], [500, 0, 500], [100, 0, 100], [600, 0, 600]]);
  app.run('entries[0].cashAmount = 500; entries[0].mpAmount = 500');
  shopReport(app);
  shopRows(app, 'shopRevenueRows', [[900, 400, 500], [0, 0, 0], [900, 400, 500], [100, 100, 0], [1000, 500, 500]]);
});

test('RPT-026 - Barberia vacia limpia importes conteos y desgloses anteriores', (t) => {
  const app = createApp(t);
  app.financialFixture();
  shopReport(app);
  app.element('summaryDate').value = '2025-01';
  app.emit('#summaryDate', 'change');
  shopAmounts(app, { Invoiced: 0, Commission: 0, Expenses: 0, Balance: 0 });
  shopRows(app, 'shopRevenueRows', Array(5).fill([0, 0, 0]));
  shopRows(app, 'shopMovementRows', Array(3).fill([0, 0, 0]));
  assert.equal(app.element('shopSaleCount').textContent, '0');
  assert.equal(app.element('shopSaleQuantity').textContent, '0');
  assert.equal(app.element('summaryRows').rows.length, 0);
  assert.equal(app.element('summaryEmpty').hidden, false);
});

for (const [id, period, reference, dates] of [
  ['RPT-027', 'month', '2026-09', ['2026-08-31', '2026-09-01', '2026-09-30', '2026-10-01']],
  ['RPT-028', 'year', '2026', ['2025-12-31', '2026-01-01', '2026-12-31', '2027-01-01']],
  ['RPT-029', 'week', '2026-09', ['2026-09-06', '2026-09-07', '2026-09-13', '2026-09-14']],
]) {
  test(`${id} - Barberia incluye extremos y excluye externos de ${period} en todas las colecciones`, (t) => {
    const app = createApp(t);
    app.seed({
      entries: dates.map(date => ({ date, payment: 'Efectivo', amount: 1000, tip: 100, commissionAmount: 500 })),
      sales: dates.map(date => ({ date, payment: 'Efectivo', total: 200, quantity: 3 })),
      advances: dates.map(date => ({ date, payment: 'Efectivo', amount: 30 })),
      expenses: dates.map(date => ({ date, payment: 'Efectivo', amount: 50 })),
      cashRegisters: Object.fromEntries(dates.map(date => [date, { withdrawal: 70 }])),
    });
    shopReport(app, period);
    app.element('summaryDate').value = reference;
    app.emit('#summaryDate', 'change');
    if (period === 'week') { app.element('summaryWeek').value = '1'; app.emit('#summaryWeek', 'change'); }
    shopAmounts(app, { Invoiced: 2400, Commission: 1000, Expenses: 100, Balance: 1300 });
    assert.equal(app.element('shopRevenueRows').rows[3].cells[1].textContent, app.money(200));
    shopRows(app, 'shopMovementRows', [[100, 100, 0], [60, 60, 0], [140, 140, 0]]);
    assert.equal(app.element('shopSaleCount').textContent, '2');
    assert.equal(app.element('shopSaleQuantity').textContent, '6');
  });
}

test('RPT-030 - Barberia tiene IDs unicos regiones accesibles y alcance en ayuda', (t) => {
  const app = createApp(t);
  shopReport(app);
  const section = app.element('shopTitle').closest('section');
  assert.equal(section.getAttribute('aria-labelledby'), 'shopTitle');
  assert.equal(app.element('shopScope').dataset.tip, 'Local completo; período y medio.');
  assert.equal(app.element('summaryBarbersTitle').textContent, 'Barberos');
  assert.equal(section.querySelectorAll('.collection-table-wrap[tabindex="0"][role="region"]').length, 2);
  for (const element of section.querySelectorAll('[id]')) assert.equal(app.query('#summaryView').querySelectorAll(`#${element.id}`).length, 1);
  assert.ok(section.querySelector('.daily-totals.summary-highlights'));
});

test('RPT-032 - Explicaciones en ayudas enfocables conservan etiquetas y conteos', (t) => {
  const app = createApp(t);
  app.financialFixture();
  shopReport(app);
  const view = app.query('#summaryView');
  assert.doesNotMatch(view.innerHTML, /pasantes|RESULTADO DEL LOCAL COMPLETO|Total cobrado/i);
  assert.equal(view.querySelectorAll('.stock-hint').length, 0);
  assert.deepEqual([...view.querySelectorAll('.metric-sub')].map(node => node.textContent.trim()), [
    '3 servicios', 'Ventas registradas: 2 · Unidades: 2',
  ]);
  assert.deepEqual([...app.element('shopRevenueRows').rows].map(row => row.cells[0].textContent), [
    'Servicios sin propinas', 'Ventas de productos', 'Facturado sin propinas', 'Propinas', 'Total facturado con propinas',
  ]);
  const balance = app.element('shopBalance').closest('article');
  assert.deepEqual([...balance.querySelectorAll('.accounting-note')].map(node => node.firstChild.textContent), ['Comisiones', 'Gastos operativos']);
  assert.doesNotMatch(balance.textContent, /propinas|generadas/i);
  assert.equal(view.querySelector('#shopTips'), null);
  assert.deepEqual([...app.element('shopMovementRows').rows].map(row => row.cells[0].textContent), ['Gastos', 'Adelantos', 'Retiros']);
  const movements = app.element('shopMovementRows').closest('article');
  assert.equal(movements.querySelector('p, small, .metric-sub, .stock-hint'), null);
  assert.doesNotMatch(view.textContent, /no son gastos|no resta|respeta período|no es el balance/i);
  const tips = [...view.querySelectorAll('.info-tip')];
  assert.equal(tips.length, 9);
  for (const tip of tips) {
    assert.equal(tip.tagName, 'BUTTON');
    assert.equal(tip.type, 'button');
    assert.equal(tip.textContent, '?');
    assert.equal(tip.disabled, false);
    assert.equal(tip.tabIndex, 0);
    assert.ok(tip.getAttribute('aria-label'));
    assert.ok(tip.dataset.tip);
    assert.ok(tip.dataset.tip.length <= 80, tip.dataset.tip);
    assert.doesNotMatch(tip.dataset.tip, /\n|generadas|no es el|no resta|excluye/i);
    assert.ok(tip.closest('.metric-title'));
    assert.ok(tip.previousElementSibling);
    assert.ok(!view.textContent.includes(tip.dataset.tip));
  }
  app.element('shopScope').focus();
  assert.ok(app.element('shopScope').matches(':focus'));
  assert.equal(tips.find(tip => tip.previousElementSibling.textContent === 'Balance del local').dataset.tip, 'Facturado - comisiones - gastos.');
  assert.equal(tips.find(tip => tip.previousElementSibling.textContent === 'Total facturado').dataset.tip, 'Servicios + ventas.');
  assert.equal(tips.find(tip => tip.previousElementSibling.textContent === 'Facturado total').dataset.tip, 'Servicios + propinas.');
  assert.equal(tips.find(tip => tip.previousElementSibling.textContent === 'Comisión').dataset.tip, 'Comisión + propinas.');
  assert.equal(tips.find(tip => tip.previousElementSibling.textContent === 'Ticket promedio').dataset.tip, 'Bruto: facturado ÷ servicios. Neto: (comisión + propinas) ÷ servicios.');
  assert.equal(tips.find(tip => tip.previousElementSibling.textContent === 'Movimientos').dataset.tip, 'Por medio; retiros solo efectivo.');
});

test('RPT-034 - Jerarquia separa facturado resultado y movimientos sin duplicar importes', (t) => {
  const app = createApp(t);
  for (const [invoiced, result] of [['summaryInvoiced', 'summaryCommission'], ['shopInvoiced', 'shopBalance']]) {
    assert.ok(app.element(invoiced).closest('.featured.collection-metric'));
    assert.ok(app.element(result).closest('.featured.accounting-metric'));
    assert.ok(app.element(result).closest('.net-card'));
  }
  const movements = app.query('.summary-metrics[role="group"]');
  assert.equal(movements.getAttribute('aria-label'), 'Movimientos del período');
  assert.deepEqual([...movements.querySelectorAll('strong')].map(node => node.id), ['summaryAdvances', 'summaryExpenses', 'summaryWithdrawals']);
  const shopMovements = app.element('shopMovementRows').closest('.summary-movements');
  assert.ok(shopMovements);
  assert.equal(shopMovements.parentElement.lastElementChild, shopMovements);
  assert.equal(shopMovements.querySelector('.info-tip').closest('.collection-table-wrap'), null);
});

test('RPT-033 - Ayuda historica conserva formula breve y boton en ambos modos', (t) => {
  const app = createApp(t);
  for (const period of ['month', 'year', 'week']) {
    shopReport(app, period);
    const tip = app.element('summaryHistoryScope');
    assert.equal(tip.dataset.tip, 'Balance = servicios + ventas - comisiones.');
    assert.equal(tip.previousElementSibling.id, 'summaryBreakdownTitle');
    assert.equal(app.element('summaryBreakdownTitle').textContent, period === 'year' ? 'Resumen por mes' : 'Resumen por día');
    report(app, period, 'Ambas', 'Mateo');
    assert.equal(tip.dataset.tip, 'Balance = servicios + ventas - comisiones.');
    assert.equal(tip.textContent, '?');
    tip.focus();
    assert.ok(tip.matches(':focus'));
  }
});

test('RPT-031 - Render y configuracion conservan Barberia sin colision con nombres', (t) => {
  const app = createApp(t);
  app.financialFixture();
  shopReport(app);
  app.run('render(); config.barbers.push({id:"collision",name:"__shop__",active:true}, {id:"shop-name",name:"Barbería",active:true}); saveConfig()');
  assert.equal(app.element('summaryBarberFilter').selectedOptions[0].dataset.scope, 'shop');
  shopAmounts(app, { Invoiced: 5100, Balance: 2900 });
  for (const name of ['__shop__', 'Barbería']) {
    const option = [...app.element('summaryBarberFilter').options].find(option => !option.dataset.scope && option.value === name);
    option.selected = true;
    app.emit('#summaryBarberFilter', 'change');
    app.run('saveConfig()');
    assert.equal(app.element('summaryBarberFilter').value, name);
    assert.equal(app.element('summaryBarberFilter').selectedOptions[0].dataset.scope, undefined);
    assert.equal(app.element('shopSummary').hidden, true);
    assert.equal(app.element('barbersSummary').hidden, false);
    amounts(app, { Invoiced: 0 });
  }
});

for (const [id, medium, values, services, sales, balance] of [
  ['RPT-001', 'Ambas', { InvoicedCuts: 3900, InvoicedTips: 300, Invoiced: 4200, Commission: 2250, Advances: 400, Expenses: 250, AverageTicket: 1400, InvoicedCutsCash: 1500, InvoicedCutsMp: 2400, InvoicedTipsCash: 300, InvoicedTipsMp: 0, CommissionTips: 300, CommissionAmount: 1950, AverageTicketNeto: 750 }, '3 servicios', 1200, 3150],
  ['RPT-002', 'Efectivo', { InvoicedCuts: 1500, InvoicedTips: 300, Invoiced: 1800, Commission: 1050, Advances: 300, Expenses: 50, AverageTicket: 900, InvoicedCutsCash: 1500, InvoicedCutsMp: 0, InvoicedTipsCash: 300, InvoicedTipsMp: 0, CommissionTips: 300, CommissionAmount: 750, AverageTicketNeto: 525 }, '2 servicios', 500, 1250],
  ['RPT-003', 'Mercado Pago', { InvoicedCuts: 2400, InvoicedTips: 0, Invoiced: 2400, Commission: 1200, Advances: 100, Expenses: 200, AverageTicket: 2400, InvoicedCutsCash: 0, InvoicedCutsMp: 2400, InvoicedTipsCash: 0, InvoicedTipsMp: 0, CommissionTips: 0, CommissionAmount: 1200, AverageTicketNeto: 1200 }, '1 servicio', 700, 1900],
]) {
  test(`${id} - El reporte de ${medium} suma cada concepto y su ticket promedio`, (t) => {
    const app = createApp(t);
    app.financialFixture();
    report(app, 'month', medium);
    amounts(app, values);
    assert.equal(app.element('summaryOperationCount').textContent, services);
    assert.equal(app.element('summaryRows').rows.length, 1);
    assert.equal(app.element('summaryRows').rows[0].cells[3].textContent, app.money(sales));
    assert.equal(app.element('summaryRows').rows[0].cells[9].textContent, app.money(balance));
  });
}

test('RPT-004 - Filtrar barbero excluye ventas gastos y retiros sin borrar sus adelantos', (t) => {
  const app = createApp(t);
  app.financialFixture();
  app.run('cashRegisters[workday.value].withdrawal = 500');
  report(app, 'month', 'Ambas', 'Mateo');
  amounts(app, { Commission: 1250, Advances: 300, Expenses: 0, Withdrawals: 0 });
  assert.equal(app.element('summaryOperationCount').textContent, '2 servicios');
  amounts(app, { Invoiced: 2200, InvoicedCuts: 1900, InvoicedTips: 300, CommissionAmount: 950, CommissionTips: 300, AverageTicket: 1100, AverageTicketNeto: 625 });
  assert.equal(app.element('summaryRows').rows[0].cells[3].textContent, app.money(0));
  assert.equal(app.element('summaryRows').rows[0].cells[9].textContent, app.money(950));
});

test('RPT-005 - Quitar todos los servicios conserva ventas gastos y adelantos', (t) => {
  const app = createApp(t);
  app.financialFixture();
  report(app);
  app.run('document.querySelectorAll("#summaryServiceOptions input").forEach(input => input.checked = false)');
  app.emit('#summaryServiceOptions', 'change');
  amounts(app, { InvoicedCuts: 0, Invoiced: 0, InvoicedTips: 0, Commission: 0, Advances: 400, Expenses: 250, AverageTicket: 0, AverageTicketNeto: 0 });
  assert.equal(app.element('summaryOperationCount').textContent, '0 servicios');
  assert.equal(app.element('summaryRows').rows[0].cells[3].textContent, app.money(1200));
  assert.equal(app.element('summaryRows').rows[0].cells[9].textContent, app.money(1200));
  assert.match(app.query('#summaryServiceFilter summary').textContent, /^0 servicios/);
});

test('RPT-006 - Elegir un servicio actualiza etiqueta y no incluye otros servicios', (t) => {
  const app = createApp(t);
  app.financialFixture();
  report(app);
  app.run('document.querySelectorAll("#summaryServiceOptions input").forEach(input => input.checked = input.value === "Corte clásico")');
  app.emit('#summaryServiceOptions', 'change');
  assert.equal(app.query('#summaryServiceFilter summary').textContent, 'Corte clásico');
  amounts(app, { InvoicedCuts: 0, Invoiced: 0 });
  assert.equal(app.element('summaryRows').rows[0].cells[3].textContent, app.money(1200));
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
  amounts(app, { Invoiced: 0, AverageTicket: 0, AverageTicketNeto: 0 });
  assert.equal(app.element('summaryRows').rows.length, 2);
  assert.deepEqual([...app.element('summaryRows').rows].map(row => row.cells[3].textContent), [app.money(200), app.money(300)]);
  assert.deepEqual([...app.element('summaryRows').rows].map(row => row.cells[9].textContent), [app.money(200), app.money(300)]);
});

test('RPT-008 - Un retiro sin operaciones genera fila y se excluye al filtrar MP', (t) => {
  const app = createApp(t);
  app.run('cashRegisters["2026-09-02"] = {withdrawal:400}');
  report(app);
  amounts(app, { Withdrawals: 400, Invoiced: 0 });
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
  amounts(app, { Withdrawals: 300, Invoiced: 4200, AverageTicket: 1400, AverageTicketNeto: 750 });
  assert.equal(app.element('summaryRows').rows[1].cells[3].textContent, app.money(1200));
  assert.equal(app.element('summaryRows').rows[1].cells[9].textContent, app.money(3150));
});

test('RPT-010 - Cambiar semana actualiza rango y excluye ventas de la semana anterior', (t) => {
  const app = createApp(t);
  app.run('sales = [{date:"2026-09-07",payment:"Efectivo",total:100},{date:"2026-09-14",payment:"Efectivo",total:200}]');
  report(app, 'week');
  assert.equal(app.element('summaryWeekField').hidden, false);
  app.element('summaryWeek').value = '2';
  app.emit('#summaryWeek', 'change');
  amounts(app, { Invoiced: 0, AverageTicket: 0, AverageTicketNeto: 0 });
  assert.equal(app.element('summaryRows').rows.length, 1);
  assert.equal(app.element('summaryRows').rows[0].cells[3].textContent, app.money(200));
  assert.match(app.element('summaryRange').textContent, /14\/09\/2026/);
});

test('RPT-011 - Una referencia vacia se recupera sin romper los contadores', (t) => {
  const app = createApp(t);
  app.financialFixture();
  report(app);
  app.element('summaryDate').value = '';
  app.emit('#summaryDate', 'change');
  assert.equal(app.element('summaryDate').value, '2026-09');
  amounts(app, { Invoiced: 4200 });
  app.render();
});

test('RPT-012 - No hay divisiones por cero ni filas viejas en un reporte vacio', (t) => {
  const app = createApp(t);
  app.financialFixture();
  report(app);
  app.element('summaryDate').value = '2025-01';
  app.emit('#summaryDate', 'change');
  amounts(app, { Invoiced: 0, InvoicedCuts: 0, InvoicedTips: 0, InvoicedCutsCash: 0, InvoicedCutsMp: 0, InvoicedTipsCash: 0, InvoicedTipsMp: 0, AverageTicket: 0, AverageTicketNeto: 0, Commission: 0, CommissionAmount: 0, CommissionTips: 0 });
  assert.equal(app.element('summaryRows').innerHTML, '');
  assert.equal(app.element('summaryOperationCount').textContent, '0 servicios');
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
  amounts(app, { InvoicedCuts: 2000, Invoiced: 2000 });
  app.element('summaryPaymentFilter').value = 'Efectivo';
  app.emit('#summaryPaymentFilter', 'change');
  amounts(app, { InvoicedCuts: 0, Invoiced: 0 });
});

test('RPT-018 - Las tres tarjetas reutilizan el panel diario y etiquetan cada importe', (t) => {
  const app = createApp(t);
  const highlights = app.query('#summaryView .summary-highlights');
  assert.ok(highlights.classList.contains('daily-totals'));
  assert.equal(highlights.querySelectorAll('article').length, 3);
  assert.ok(app.element('summaryInvoiced').closest('.collection-metric'));
  assert.ok(app.element('summaryCommission').closest('.accounting-metric'));
  assert.deepEqual([...highlights.querySelectorAll('thead th')].map(cell => cell.textContent), ['Concepto', 'Total', 'Efectivo', 'MP']);
  assert.equal(highlights.querySelector('thead th:last-child').getAttribute('aria-label'), 'Mercado Pago');
  const ticket = app.element('summaryAverageTicket').closest('article');
  assert.equal(ticket.querySelectorAll('strong').length, 2);
  assert.match(app.element('summaryAverageTicket').parentElement.textContent, /^Bruto/);
  assert.match(app.element('summaryAverageTicketNeto').parentElement.textContent, /^Neto/);
  assert.deepEqual([...highlights.querySelectorAll('tbody th')].map(cell => cell.textContent), ['Servicios', 'Propinas']);
  assert.equal(highlights.querySelector('.collection-sales'), null);
  assert.deepEqual([...app.query('#summaryView .summary-metrics').querySelectorAll('article > span')].map(span => span.textContent), ['Adelantos', 'Salidas de caja', 'Retiros totales']);
  for (const id of ['Services', 'ServicesCash', 'ServicesMp', 'Cuts', 'CashCuts', 'MpCuts', 'Sales', 'SalesCash', 'SalesMp', 'SaleCount', 'Tips', 'Balance', 'InvoicedSales', 'InvoicedSalesCash', 'InvoicedSalesMp']) {
    assert.equal(app.query('#summaryView').querySelector(`#summary${id}`), null, `summary${id} eliminado`);
  }
});

test('RPT-019 - El mixto dominante MP desglosa propinas y conserva balance y comision por dia', (t) => {
  const app = createApp(t);
  app.financialFixture();
  app.run('entries = [entries[2]]; entries[0].cashAmount = 400; entries[0].mpAmount = 600');
  report(app, 'month', 'Mercado Pago', 'Mateo');
  amounts(app, { Invoiced: 600, InvoicedCuts: 500, InvoicedTips: 100, InvoicedCutsCash: 0, InvoicedCutsMp: 500, InvoicedTipsCash: 0, InvoicedTipsMp: 100, CommissionAmount: 250, CommissionTips: 100, Commission: 350, AverageTicket: 600, AverageTicketNeto: 350 });
  assert.equal(app.element('summaryRows').rows[0].cells[5].textContent, app.money(250));
  assert.equal(app.element('summaryRows').rows[0].cells[9].textContent, app.money(250));
  app.element('summaryPaymentFilter').value = 'Ambas';
  app.emit('#summaryPaymentFilter', 'change');
  amounts(app, { Invoiced: 1000, InvoicedCuts: 900, InvoicedCutsCash: 400, InvoicedCutsMp: 500, InvoicedTips: 100, Commission: 550, AverageTicket: 1000, AverageTicketNeto: 550 });
  assert.equal(app.element('summaryRows').rows[0].cells[9].textContent, app.money(450));
});
