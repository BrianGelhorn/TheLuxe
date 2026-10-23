import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../support/app.mjs';

const key = 'theluxe-inventory-v1';
const product = { id: 'navajas', name: 'Navajas', saleEnabled: false, supplyEnabled: true, stockEnabled: true, unit: 'unidades', initialStock: 10, unitCost: 100, startDate: '2026-09-01', active: true };
const movement = { id: 'used', productId: 'navajas', date: '2026-09-02', time: '10:00', type: 'consumo', quantity: 4, notes: '', cancelled: false, cost: 400 };
const create = (t, changes = {}) => createApp(t, { storage: { [key]: JSON.stringify({ version: 2, products: [product], movements: [movement], ...changes }) } });
const saved = (app) => JSON.parse(app.window.localStorage.getItem(key));

test('PROD-001 - Editar permite cambiar nombre y costo sin reescribir stock ni movimientos', (t) => {
  const app = create(t);
  app.click('[data-stock-edit="navajas"]');
  assert.equal(app.element('stockInitialField').hidden, true);
  assert.equal(app.element('stockCurrentField').hidden, false);
  assert.equal(app.element('stockCurrentQuantity').value, '6');
  app.input('#stockProductForm [name="stockName"]', 'Hojas');
  app.input('#stockProductForm [name="unitCost"]', '200');
  assert.equal(app.submit('stockProductForm'), true);
  const state = saved(app);
  assert.equal(state.products[0].name, 'Hojas');
  assert.equal(state.products[0].unitCost, 200);
  assert.equal(state.products[0].initialStock, 10);
  assert.equal(state.products[0].initialUnitCost, 100);
  assert.deepEqual(state.movements, [movement]);
});

test('PROD-002 - Corregir costo o precio inválido desbloquea el guardado sin cancelar', (t) => {
  const app = create(t, { products: [{ ...product, saleEnabled: true, salePrice: 1000 }] });
  app.click('[data-stock-edit="navajas"]');
  app.input('#stockProductForm [name="unitCost"]', '0');
  app.submit('stockProductForm');
  assert.equal(app.element('stockProductForm').elements.unitCost.validity.customError, true);
  app.input('#stockProductForm [name="unitCost"]', '200');
  app.input('#stockProductForm [name="salePrice"]', '0');
  app.submit('stockProductForm');
  assert.equal(app.element('stockProductForm').elements.salePrice.validity.customError, true);
  app.input('#stockProductForm [name="salePrice"]', '1500');
  app.submit('stockProductForm');
  assert.equal(saved(app).products[0].unitCost, 200);
  assert.equal(saved(app).products[0].salePrice, 1500);
});

test('PROD-003 - Editar otro producto limpia los errores del formulario anterior', (t) => {
  const app = create(t, { products: [product, { ...product, id: 'otro', name: 'Otro' }] });
  app.click('[data-stock-edit="navajas"]');
  app.input('#stockProductForm [name="unitCost"]', '0');
  app.submit('stockProductForm');
  app.click('[data-stock-edit="otro"]');
  app.submit('stockProductForm', { stockName: 'Renombrado' });
  assert.equal(saved(app).products[1].name, 'Renombrado');
});

test('PROD-004 - Un producto antiguo de venta permite editar nombre y precio sin activar stock', (t) => {
  const app = createApp(t);
  app.click('[data-stock-edit="pomada"]');
  app.input('#stockProductForm [name="stockName"]', 'Pomada mate');
  app.input('#stockProductForm [name="salePrice"]', '15000');
  app.submit('stockProductForm');
  const state = saved(app);
  assert.deepEqual(state.products[0], { id: 'pomada', name: 'Pomada mate', saleEnabled: true, supplyEnabled: false, stockEnabled: false, active: true, salePrice: 15000 });
  assert.deepEqual(state.movements, []);
});

test('PROD-005 - Inventario antiguo sin costo permite corregir nombre y mantiene el aviso', (t) => {
  const app = create(t, { products: [{ ...product, unitCost: 0 }], movements: [] });
  app.click('[data-stock-edit="navajas"]');
  app.submit('stockProductForm', { stockName: 'Hojas' });
  assert.equal(saved(app).products[0].name, 'Hojas');
  assert.equal(saved(app).products[0].unitCost, 0);
  assert.equal(app.element('stockPriceWarning').hidden, false);
});

for (const [target, type, quantity, cost] of [[9, 'entrada', 3, 300], [2, 'consumo', 4, 400], [0, 'consumo', 6, 600]]) {
  test(`PROD-006 - Ajustar stock a ${target} conserva el historial y registra solo la diferencia`, (t) => {
    const app = create(t);
    app.click('[data-stock-edit="navajas"]');
    app.submit('stockProductForm', { currentStock: target });
    const state = saved(app);
    assert.deepEqual(state.products[0], product);
    assert.deepEqual(state.movements[0], movement);
    assert.equal(state.movements.length, 2);
    assert.deepEqual({ type: state.movements[1].type, quantity: state.movements[1].quantity, cost: state.movements[1].cost }, { type, quantity, cost });
    assert.match(state.movements[1].notes, /Ajuste desde Configuración/);
    assert.equal(app.run('inventorySummary(inventory.products[0], inventory.movements, workday.value).stock'), target);
  });
}

test('PROD-007 - Un fallo de almacenamiento no aplica parcialmente nombre ni cantidad', (t) => {
  const app = create(t);
  const before = app.snapshot('inventory');
  app.click('[data-stock-edit="navajas"]');
  const setItem = app.window.Storage.prototype.setItem;
  t.mock.method(app.window.Storage.prototype, 'setItem', function (name, value) {
    if (name === key) throw new Error('Sin espacio');
    return setItem.call(this, name, value);
  });
  app.submit('stockProductForm', { stockName: 'Hojas', currentStock: 2 });
  assert.deepEqual(saved(app), before);
  assert.deepEqual(app.snapshot('inventory'), before);
});

test('PROD-008 - Una reducción que dejaría stock negativo después no modifica la base', (t) => {
  const future = { ...movement, id: 'future', date: '2026-09-04', quantity: 5, cost: 500 };
  const app = create(t, { movements: [movement, future] });
  const before = app.snapshot('inventory');
  app.click('[data-stock-edit="navajas"]');
  app.submit('stockProductForm', { currentStock: 0 });
  assert.deepEqual(saved(app), before);
  assert.deepEqual(app.snapshot('inventory'), before);
  assert.match(app.element('stockConfigMessage').textContent, /Stock insuficiente/);
});

test('PROD-009 - Cambiar de jornada o recibir nuevos movimientos exige revisar la cantidad', (t) => {
  const app = create(t);
  const before = app.snapshot('inventory');
  app.click('[data-stock-edit="navajas"]');
  app.element('workday').value = '2026-09-02';
  app.emit('#workday', 'change');
  app.submit('stockProductForm', { currentStock: 2 });
  assert.deepEqual(saved(app), before);
  assert.match(app.element('stockConfigMessage').textContent, /jornada cambió/);
  app.click('#cancelStockProduct');
  app.click('[data-stock-edit="navajas"]');
  app.run('inventory.movements = []');
  app.submit('stockProductForm', { currentStock: 2 });
  assert.equal(app.run('inventory.movements.length'), 0);
  assert.match(app.element('stockConfigMessage').textContent, /stock cambió/);
});

test('PROD-010 - Ajustar cantidad con un nombre duplicado no deja movimientos parciales', (t) => {
  const app = create(t, { products: [product, { ...product, id: 'otro', name: 'Otro' }] });
  const before = app.snapshot('inventory');
  app.click('[data-stock-edit="navajas"]');
  app.submit('stockProductForm', { stockName: 'Otro', currentStock: 2 });
  assert.deepEqual(saved(app), before);
  assert.deepEqual(app.snapshot('inventory'), before);
});

test('PROD-011 - Cambiar entre Venta, Insumo y ambos conserva ventas, cantidades y movimientos', (t) => {
  const sale = { id: 'sale-1', productId: 'navajas', product: 'Navajas', date: movement.date, time: '10:00', quantity: 4, unitPrice: 1000, total: 4000, payment: 'Efectivo', notes: '' };
  const linked = { ...movement, source: 'sale', sourceId: sale.id };
  const app = create(t, { products: [{ ...product, saleEnabled: true, supplyEnabled: false, salePrice: 1000 }], movements: [linked] });
  app.seed({ sales: [sale] });
  app.render();
  for (const [saleEnabled, supplyEnabled] of [[true, true], [false, true], [true, false]]) {
    app.click('[data-stock-edit="navajas"]');
    const form = app.element('stockProductForm').elements;
    if (form.saleEnabled.checked !== saleEnabled) app.click('#stockProductForm [name="saleEnabled"]');
    if (form.supplyEnabled.checked !== supplyEnabled) app.click('#stockProductForm [name="supplyEnabled"]');
    if (saleEnabled) app.input('#stockProductForm [name="salePrice"]', '1000');
    app.submit('stockProductForm');
    const state = saved(app);
    assert.equal(state.products[0].saleEnabled, saleEnabled);
    assert.equal(state.products[0].supplyEnabled, supplyEnabled);
    assert.equal(state.products[0].initialStock, 10);
    assert.deepEqual(state.movements, [linked]);
    assert.deepEqual(app.snapshot('sales'), [sale]);
    assert.equal(app.run('inventorySummary(inventory.products[0], inventory.movements, workday.value).stock'), 6);
  }
});

test('PROD-012 - Un producto que pasó a Insumo permite corregir su venta anterior, pero no crear otra', (t) => {
  const sale = { id: 'sale-1', productId: 'navajas', product: 'Navajas', date: '2026-09-03', time: '10:00', quantity: 4, unitPrice: 1000, total: 4000, payment: 'Efectivo', notes: '' };
  const linked = { ...movement, date: sale.date, source: 'sale', sourceId: sale.id };
  const app = create(t, { movements: [linked] });
  app.seed({ sales: [sale] });
  app.render();
  app.click('[data-sale="sale-1"]');
  app.click('#editSale');
  assert.equal(app.element('saleProduct').value, 'navajas');
  app.emit('#saleProduct', 'change');
  assert.equal(app.element('saleForm').elements.unitPrice.value, '1.000');
  app.submit('saleForm', { notes: 'Corregida' });
  assert.deepEqual(app.snapshot('sales'), [{ ...sale, notes: 'Corregida' }]);
  assert.deepEqual(saved(app).movements, [linked]);
  app.click('#addSale');
  assert.equal([...app.element('saleProduct').options].some((option) => option.value === 'navajas'), false);
  app.element('saleProduct').add(new app.window.Option('Navajas', 'navajas'));
  app.submit('saleForm', { product: 'navajas', quantity: 1, unitPrice: 1000 });
  assert.equal(app.run('sales.length'), 1);
  assert.equal(app.element('saleProduct').validity.customError, true);
  assert.deepEqual(saved(app).movements, [linked]);
});
