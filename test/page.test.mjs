import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const html = read('index.html');
const scripts = ['logic.js', 'reports.js', 'dialogs.js', 'inventory.js', 'script.js'];
const source = scripts.map(read).join('\n');
const context = {};
vm.runInNewContext(read('logic.js'), context);
const logic = context.TheLuxeLogic;

test('la interfaz mantiene IDs, campos y archivos requeridos', () => {
  scripts.forEach((file) => assert.doesNotThrow(() => new vm.Script(read(file), { filename: file }), `${file} tiene un error de sintaxis`));
  assert.doesNotThrow(() => new vm.Script(source), 'los scripts no redeclaran variables globales');
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
  assert.match(html, /<tr><th scope="row">Servicios<\/th>[^\n]*id="dailyServices"[^\n]*<\/tr>\s*<tr><th scope="row">Propinas<\/th>[^\n]*<\/tr>\s*<tr class="collection-subtotal">[^\n]*id="dailyServicesTotal"[^\n]*id="dailyServicesTotalCash"[^\n]*id="dailyServicesTotalMp"[^\n]*<\/tr>/, 'Servicios y Propinas van arriba del subtotal de servicios + propinas');
  assert.match(html, /accounting-note">Facturado<strong id="dailyInvoiced">/, 'el facturado se integra al total final');
  assert.match(html, /saldos-metric[\s\S]*?id="cashTotal"[\s\S]*?id="mpTotal"/, 'los saldos se muestran juntos en una sola tarjeta');
  const cashView = html.match(/<section id="salesView"[\s\S]*?<\/section>/)[0];
  assert.ok(cashView.indexOf('transfer-card') > cashView.indexOf('inventory-card'), 'transferir queda al final de caja y movimientos');
  assert.doesNotMatch(cashView, /name="to"/, 'la transferencia usa una sola dirección');
  assert.equal([...cashView.matchAll(/class="movement-body" tabindex="0" role="region"/g)].length, [...cashView.matchAll(/<article\b/g)].length, 'cada cuadro de caja tiene contenido desplazable accesible por teclado');
  assert.match(read('styles.css'), /#salesView > \.daily-sheet\s*\{[^}]*grid-column: auto;[^}]*height: 28rem;/, 'todos los cuadros comparten dimensiones, incluido transferir');
  assert.match(read('styles.css'), /#salesView \.movement-body\s*\{[^}]*min-height: 0;[^}]*overflow: auto;/, 'el contenido no estira los cuadros al crecer');
  assert.match(read('script.js'), /key !== inventoryStorageKey/, 'el inicio no borra el stock guardado');
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
  assert.equal(logic.salePaymentTotal(sales, 'Efectivo'), 500);
  assert.equal(logic.salePaymentTotal(sales, 'Mercado Pago'), 700);
  assert.equal(logic.salePaymentTotal([], 'Efectivo'), 0);
  assert.equal(logic.salePaymentTotal([], 'Mercado Pago'), 0);
  assert.equal(logic.transferTotal(transfers, 'Efectivo'), -100);
  assert.equal(logic.transferTotal(transfers, 'Mercado Pago'), 100);
  assert.equal(logic.dominantPayment(cuts[2]), 'Efectivo');
  assert.equal(logic.mixedTipError(cuts[2]), '');
  assert.match(logic.mixedTipError({ payment: 'Ambos', tip: 700, cashAmount: 600, mpAmount: 400 }), /propina/);
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
  assert.equal(cash.services, 1500);
  assert.equal(cash.tips, 300);
  assert.equal(cash.commission, 750);
  assert.equal(cash.balance, 1250);
});

test('calcula correctamente semanas, meses y años', () => {
  assert.equal(logic.currentMonthWeek('2026-07-18'), 2);
  assert.equal(logic.periodBounds('week', '2026-07', 1).join(), '2026-07-06,2026-07-12');
  assert.equal(logic.periodBounds('week', '2026-07', 4).join(), '2026-07-27,2026-08-02');
  assert.equal(logic.periodBounds('month', '2026-02').join(), '2026-02-01,2026-02-28');
  assert.equal(logic.periodBounds('year', '2026').join(), '2026-01-01,2026-12-31');
});

test('desglosa la recaudación diaria y el neto sin propinas ni comisiones', () => {
  const revenue = logic.dailyRevenue(cuts, sales, () => 80);
  assert.equal(revenue.cashServices + revenue.cashTips, 1800, 'servicios + propinas en efectivo no incluye ventas');
  assert.equal(revenue.mpServices + revenue.mpTips, 2400, 'servicios + propinas en MP incluye la parte de cobros mixtos');
  assert.deepEqual(JSON.parse(JSON.stringify(revenue)), {
    collected: 5400, tips: 300, invoiced: 5100, commission: 1950, net: 3150,
    services: 4200, sales: 1200, cashInvoiced: 2000, mpInvoiced: 3100, cashNet: 1250, mpNet: 1900,
    cashServices: 1500, mpServices: 2400, cashTips: 300, mpTips: 0,
  });
  const historical = logic.dailyRevenue([
    { date: '2026-09-01', payment: 'Efectivo', amount: 1000, tip: 100, commissionAmount: 0, commissionRate: 50 },
    { date: '2026-09-01', payment: 'Efectivo', amount: 1000, commissionRate: 40 },
    { date: '2026-09-02', payment: 'Mercado Pago', amount: 1000 },
    { date: '2026-09-01', payment: 'Mercado Pago', amount: 1000, commissionRate: 0 },
  ], [], (date) => date === '2026-09-02' ? 60 : 50);
  assert.equal(historical.commission, 1000, 'usa las comisiones originales y respeta las tasas de cero');
  assert.equal(historical.cashNet, 1600);
  assert.equal(historical.mpNet, 1400);

  const scenarios = [
    logic.dailyRevenue([], []),
    logic.dailyRevenue([], [{ payment: 'Mercado Pago', total: '500' }], () => 100),
    logic.dailyRevenue([{ payment: 'Ambos', amount: 101, tip: 1, cashAmount: 51, mpAmount: 51, commissionRate: 50 }], []),
    logic.dailyRevenue([{ payment: 'Ambos', amount: 0, tip: 0, cashAmount: 0, mpAmount: 0 }], []),
    logic.dailyRevenue([{ payment: 'Efectivo', amount: 0, tip: 100 }], []),
    revenue, historical,
  ];
  for (const row of scenarios) {
    assert.ok(Object.values(row).every(Number.isFinite));
    assert.equal(row.collected, row.services + row.sales);
    assert.equal(row.collected - row.tips, row.invoiced);
    assert.equal(row.invoiced - row.commission, row.net);
    assert.equal(row.cashInvoiced + row.mpInvoiced, row.invoiced);
    assert.equal(row.cashServices + row.mpServices, row.services - row.tips);
    assert.equal(row.cashTips + row.mpTips, row.tips);
    assert.equal(row.cashNet + row.mpNet, row.net);
  }
  assert.equal(scenarios[0].collected, 0);
  assert.equal(scenarios[1].net, 500, 'las ventas de productos no generan comisión de cortes');
  assert.equal(scenarios[1].cashNet, 0);
  assert.equal(scenarios[2].commission, 51, 'redondea una sola vez al totalizar');
  assert.equal(scenarios[2].cashServices + scenarios[2].cashTips, 51, 'conserva lo cobrado en efectivo incluso al redondear');
  assert.equal(scenarios[2].mpServices + scenarios[2].mpTips, 51, 'conserva lo cobrado por MP incluso al redondear');
  assert.equal(scenarios[4].net, 0, 'las propinas no se cuentan como facturación neta');
  assert.equal(scenarios[4].cashTips, 100);
  assert.equal(scenarios[4].mpTips, 0);
});

test('en mixtos asigna toda la propina al medio que más aportó', () => {
  const revenue = (cashAmount, mpAmount) => logic.dailyRevenue([
    { payment: 'Ambos', amount: 15000, tip: 3000, cashAmount, mpAmount, commissionRate: 50 },
  ], []);

  const cashWins = revenue(10000, 8000);
  assert.equal(cashWins.cashTips, 3000);
  assert.equal(cashWins.mpTips, 0);
  assert.equal(cashWins.cashServices, 7000);
  assert.equal(cashWins.mpServices, 8000);
  assert.equal(cashWins.cashNet, 3500);
  assert.equal(cashWins.mpNet, 4000);

  const mpWins = revenue(8000, 10000);
  assert.equal(mpWins.cashTips, 0);
  assert.equal(mpWins.mpTips, 3000);
  assert.equal(mpWins.cashServices, 8000);
  assert.equal(mpWins.mpServices, 7000);

  const tie = revenue(9000, 9000);
  assert.equal(tie.cashTips, 3000, 'en empate la propina se considera en efectivo');
  assert.equal(tie.mpTips, 0);
});

const stockProduct = { id: 'navajas', name: 'Navajas', unit: 'unidades', initialStock: 10, startDate: '2026-09-01', active: true };
const stockMove = (id, date, type, quantity) => ({ id, productId: 'navajas', date, time: '10:00', type, quantity, notes: '', cancelled: false });

test('stock: suma ingresos, descuenta consumos y mantiene el historial por jornada', () => {
  const movements = [stockMove('a', '2026-09-01', 'consumo', 4), stockMove('b', '2026-09-02', 'entrada', 8), stockMove('c', '2026-09-02', 'consumo', 3)];
  const state = { version: 1, products: [stockProduct], movements };
  assert.equal(logic.inventoryError(state), '');
  assert.deepEqual(JSON.parse(JSON.stringify(logic.inventorySummary(stockProduct, movements, '2026-08-31'))), { stock: 0, incoming: 0, consumed: 0 });
  assert.deepEqual(JSON.parse(JSON.stringify(logic.inventorySummary(stockProduct, movements, '2026-09-01'))), { stock: 6, incoming: 0, consumed: 4 });
  assert.deepEqual(JSON.parse(JSON.stringify(logic.inventorySummary(stockProduct, movements, '2026-09-02'))), { stock: 11, incoming: 8, consumed: 3 });
  assert.equal(logic.inventorySummary(stockProduct, [...movements, { ...movements[0], id: 'cancelado', cancelled: true }], '2026-09-02').stock, 11);
  assert.equal(logic.inventorySummary({ ...stockProduct, id: 'otro' }, movements, '2026-09-02').stock, 10);
  assert.match(logic.inventoryError({ ...state, movements: [...movements, stockMove('d', '2026-09-01', 'consumo', 7)] }), /insuficiente/);
  const later = [stockMove('a', '2026-09-01', 'entrada', 10), stockMove('b', '2026-09-02', 'consumo', 20)];
  assert.equal(logic.inventoryError({ ...state, movements: later }), '');
  assert.match(logic.inventoryError({ ...state, movements: [{ ...later[0], cancelled: true }, later[1]] }), /insuficiente/);
  assert.match(logic.inventoryError({ ...state, movements: [...later, stockMove('c', '2026-09-01', 'consumo', 1)] }), /2026-09-02/, 'no permite consumos retroactivos que rompan jornadas posteriores');
});

test('stock: valida cantidades, fechas, productos y datos guardados', () => {
  const state = { version: 1, products: [stockProduct], movements: [] };
  for (const quantity of [0, -1, 1.5, NaN, Infinity, 1000000001, '2']) {
    assert.ok(logic.inventoryError({ ...state, movements: [stockMove('a', '2026-09-01', 'consumo', quantity)] }));
  }
  for (const date of ['2026-08-31', '2026-02-30', '', 'invalid']) assert.ok(logic.inventoryError({ ...state, movements: [stockMove('a', date, 'consumo', 1)] }));
  assert.ok(logic.inventoryError({ ...state, products: [stockProduct, { ...stockProduct, id: 'other', name: ' NÁVAJAS ' }] }));
  assert.ok(logic.inventoryError({ ...state, products: [{ ...stockProduct, initialStock: -1 }] }));
  assert.ok(logic.inventoryError({ ...state, movements: [{ ...stockMove('a', '2026-09-01', 'entrada', 1), productId: 'missing' }] }));
  assert.ok(logic.inventoryError({ ...state, movements: [stockMove('a', '2026-09-01', 'entrada', 1), stockMove('a', '2026-09-01', 'entrada', 1)] }));
  for (const invalid of [null, {}, { ...state, version: 2 }, { ...state, movements: [null] }, { ...state, products: [null] }]) assert.ok(logic.inventoryError(invalid));
});

function inventoryHarness(saved = new Map()) {
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, { value: '', textContent: '', innerHTML: '', hidden: false, disabled: false, listeners: {}, classList: { toggle() {} }, addEventListener(type, callback) { this.listeners[type] = callback; }, focus() {} });
    return elements.get(id);
  };
  for (const [id, defaults] of Object.entries({ stockProductForm: { stockId: '', stockName: '', stockUnit: 'unidades', initialStock: '0' }, stockMovementForm: { stockProduct: '', stockType: 'consumo', stockQuantity: '1', stockNotes: '' } })) {
    const form = element(id);
    form.elements = Object.fromEntries(Object.keys(defaults).map((name) => [name, element(`${id}.${name}`)]));
    form.reset = () => Object.entries(defaults).forEach(([name, value]) => { form.elements[name].value = value; });
    form.querySelector = () => element(`${id}.submit`);
    form.reportValidity = () => true;
    form.reset();
  }
  let sequence = 0;
  const storage = { failWrites: false, getItem: (key) => saved.get(key) ?? null, setItem(key, value) { if (this.failWrites) throw new Error('Storage full'); saved.set(key, value); } };
  const runtime = { document: { getElementById: element }, window: { addEventListener() {} }, localStorage: storage, crypto: { randomUUID: () => `generated-${++sequence}-${saved.size}` }, today: () => '2026-09-03', nowTime: () => '12:00', workday: { value: '2026-09-01' }, integer: new Intl.NumberFormat('es-AR'), escapeHtml: (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]) };
  vm.createContext(runtime);
  vm.runInContext(read('logic.js') + '\n' + read('inventory.js') + '\ninitInventory(); renderInventory();', runtime);
  return { runtime, element, storage, saved, state: () => JSON.parse(saved.get('theluxe-inventory-v1')), submit: (id) => element(id).listeners.submit({ preventDefault() {} }), click: (id, dataset) => element(id).listeners.click({ target: { closest: () => ({ dataset }) } }) };
}

test('stock: flujo local de alta, consumo, ingreso, anulación y edición sin ventanas', () => {
  const app = inventoryHarness();
  const fields = app.element('stockProductForm').elements;
  fields.stockName.value = 'Navajas <img>';
  fields.initialStock.value = '10';
  app.submit('stockProductForm');
  const id = app.state().products[0].id;
  assert.match(app.element('stockRows').innerHTML, /Navajas &lt;img&gt;/);
  const movement = app.element('stockMovementForm').elements;
  movement.stockProduct.value = id;
  movement.stockQuantity.value = '4';
  app.submit('stockMovementForm');
  assert.equal(app.state().movements.length, 1);
  assert.match(app.element('stockRows').innerHTML, /stock-available">6/);
  app.runtime.workday.value = '2026-09-02';
  movement.stockType.value = 'entrada';
  movement.stockQuantity.value = '5';
  app.submit('stockMovementForm');
  assert.match(app.element('stockRows').innerHTML, /stock-available">11/);
  movement.stockType.value = 'consumo';
  movement.stockQuantity.value = '99';
  app.submit('stockMovementForm');
  assert.equal(app.state().movements.length, 2);
  assert.match(app.element('stockMessage').textContent, /insuficiente/);
  const firstMovement = app.state().movements[0].id;
  app.click('stockMovementRows', { stockToggle: firstMovement });
  assert.equal(app.state().movements[0].cancelled, true);
  assert.match(app.element('stockRows').innerHTML, /stock-available">15/);
  app.click('stockMovementRows', { stockToggle: firstMovement });
  assert.match(app.element('stockRows').innerHTML, /stock-available">11/);
  app.click('stockConfigList', { stockEdit: id });
  fields.stockName.value = 'Hojas de afeitar';
  app.submit('stockProductForm');
  assert.equal(app.state().products[0].name, 'Hojas de afeitar');
  assert.equal(app.state().products[0].initialStock, 10);
  app.click('stockConfigList', { stockArchive: id });
  assert.equal(app.state().products[0].active, false);
  assert.equal(app.state().movements.length, 2);
  assert.doesNotMatch(movement.stockProduct.innerHTML, /Hojas/);
  const reloaded = inventoryHarness(app.saved);
  assert.deepEqual(reloaded.state(), app.state());
  reloaded.click('stockConfigList', { stockArchive: id });
  assert.match(reloaded.element('stockRows').innerHTML, /Hojas de afeitar/);
  assert.match(reloaded.element('stockRows').innerHTML, /stock-available">11/);
});

test('stock: no confirma ni sobrescribe cambios cuando falla el almacenamiento', () => {
  const app = inventoryHarness();
  app.element('stockProductForm').elements.stockName.value = 'Navajas';
  app.storage.failWrites = true;
  app.submit('stockProductForm');
  assert.equal(app.saved.size, 0);
  assert.match(app.element('stockMessage').textContent, /No se pudo guardar/);
  app.storage.failWrites = false;
  app.submit('stockProductForm');
  assert.equal(app.state().products.length, 1);
  app.saved.set('theluxe-inventory-v1', JSON.stringify({ version: 1, products: [], movements: [] }));
  app.element('stockProductForm').elements.stockName.value = 'Guantes';
  app.submit('stockProductForm');
  assert.equal(app.state().products.length, 0, 'no pisa cambios de otra pestaña');
  assert.match(app.element('stockMessage').textContent, /otra pestaña/);
  const corrupt = inventoryHarness(new Map([['theluxe-inventory-v1', '{broken']]));
  corrupt.element('stockProductForm').elements.stockName.value = 'Navajas';
  corrupt.submit('stockProductForm');
  assert.equal(corrupt.saved.get('theluxe-inventory-v1'), '{broken');
  assert.match(corrupt.element('stockMessage').textContent, /No se pudo leer/);
});

test('la transferencia simplificada mueve el saldo en ambas direcciones y valida el disponible', () => {
  const elements = Object.fromEntries(['from', 'amount', 'description'].map((name) => [name, { value: '', error: '', setCustomValidity(error) { this.error = error; } }]));
  let submit;
  let open = true;
  const transfers = [];
  const runtime = {
    transferForm: { elements, addEventListener(type, handler) { submit = handler; }, reportValidity: () => !elements.amount.error },
    FormData: class { constructor() { return Object.entries(elements).map(([key, value]) => [key, value.value]); } },
    transfers, parseAmount: logic.parseAmount, isDayOpen: () => open, workday: { value: '2026-09-02' },
    dayBalance: (type) => logic.balance(type, type === 'Efectivo' ? 1000 : 500, [], [], [], [], transfers),
    nowTime: () => '12:00', crypto: { randomUUID: () => `transfer-${transfers.length}` }, saveTransfers() {}, render() {},
  };
  const handler = read('script.js').match(/transferForm\.addEventListener\('submit',[\s\S]*?\n\}\);/)[0];
  vm.runInNewContext(handler, runtime);
  const send = (from, amount, note = '') => {
    elements.from.value = from; elements.amount.value = amount; elements.description.value = note;
    submit({ preventDefault() {} });
  };
  send('Efectivo', '200');
  assert.equal(transfers[0].to, 'Mercado Pago');
  assert.equal(transfers[0].description, 'Transferencia entre medios');
  assert.equal(runtime.dayBalance('Efectivo'), 800);
  assert.equal(runtime.dayBalance('Mercado Pago'), 700);
  send('Mercado Pago', '300', 'Retiro');
  assert.equal(transfers[1].to, 'Efectivo');
  assert.equal(runtime.dayBalance('Efectivo'), 1100);
  assert.equal(runtime.dayBalance('Mercado Pago'), 400);
  send('Mercado Pago', '401');
  assert.match(elements.amount.error, /insuficiente/);
  send('Efectivo', '0');
  assert.match(elements.amount.error, /mayor que cero/);
  send('Efectivo', '999999999999999999');
  assert.match(elements.amount.error, /válido/);
  open = false;
  send('Efectivo', '100');
  assert.equal(transfers.length, 2);
});
