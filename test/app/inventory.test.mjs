import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../support/app.mjs';

const key = 'theluxe-inventory-v1';
const product = (changes = {}) => ({ id: 'navajas', name: 'Navajas', unit: 'unidades', initialStock: 10, startDate: '2026-09-01', active: true, ...changes });
const movement = (changes = {}) => ({ id: 'mov-1', productId: 'navajas', date: '2026-09-03', time: '10:00', type: 'consumo', quantity: 4, notes: '', cancelled: false, ...changes });
const fixture = (changes = {}) => ({ version: 1, products: [product()], movements: [], ...changes });
const stockApp = (t, state = fixture()) => createApp(t, { storage: { [key]: JSON.stringify(state) } });
const raw = (app) => app.window.localStorage.getItem(key);
const saved = (app) => JSON.parse(raw(app));
const fields = (app, id) => app.element(id).elements;
const stockCells = (app) => [...app.query('#stockRows tr').cells].slice(1).map((cell) => cell.firstChild.textContent);
const productValues = (changes = {}) => ({ stockName: 'Guantes', stockUnit: 'unidades', initialStock: 0, ...changes });
const movementValues = (changes = {}) => ({ stockProduct: 'navajas', stockType: 'consumo', stockQuantity: 1, stockNotes: '', ...changes });

function workday(app, date) {
  app.element('workday').value = date;
  app.emit(app.element('workday'), 'change');
}

function message(app, pattern, error = false) {
  for (const id of ['stockMessage', 'stockConfigMessage']) {
    const node = app.element(id);
    assert.equal(node.hidden, false, id);
    assert.match(node.textContent, pattern, id);
    assert.equal(node.classList.contains('error'), error, id);
  }
}

function unchanged(app, before) {
  assert.equal(raw(app), before, 'no cambia el almacenamiento');
  assert.deepEqual(app.snapshot('inventory'), JSON.parse(before), 'no cambia el estado en memoria');
}

function invalidForm(app, id, values, field, reason) {
  const before = raw(app);
  const state = app.snapshot('inventory');
  app.setForm(id, values);
  assert.equal(fields(app, id)[field].validity[reason], true, `${field}.${reason}`);
  assert.equal(app.submit(id), false, 'checkValidity real impide enviar');
  app.emit(app.element(id), 'submit');
  assert.equal(raw(app), before, 'reportValidity del listener tambien impide guardar');
  assert.deepEqual(app.snapshot('inventory'), state);
}

function storageEvent(app, changedKey = key) {
  app.window.dispatchEvent(new app.window.StorageEvent('storage', { key: changedKey, storageArea: app.window.localStorage, url: app.window.location.href }));
  app.emit(app.window, 'test:check-errors');
}

function failStorage(t, app, method, name = 'QuotaExceededError') {
  const original = app.window.Storage.prototype[method];
  return t.mock.method(app.window.Storage.prototype, method, function (storageKey, ...args) {
    if (storageKey === key) throw new app.window.DOMException('Almacenamiento bloqueado', name);
    return original.call(this, storageKey, ...args);
  });
}

test('STO-001 - Inventario nuevo inicia vacio sin escribir almacenamiento', (t) => {
  const app = createApp(t);
  assert.equal(raw(app), null);
  assert.deepEqual(app.snapshot('inventory'), { version: 1, products: [], movements: [] });
  assert.equal(app.element('stockEmpty').hidden, false);
  assert.equal(app.element('stockMovementsEmpty').hidden, false);
  assert.equal(app.element('stockMovementCount').textContent, '0');
  assert.equal(app.query('#stockMovementForm button[type="submit"]').disabled, true);
  assert.equal(app.element('saveStockProduct').disabled, false);
});

test('STO-002 - Carga inventario guardado sin alterar bytes originales', (t) => {
  const state = fixture({ movements: [movement()] });
  const encoded = JSON.stringify(state, null, 2);
  const app = createApp(t, { storage: { [key]: encoded } });
  assert.equal(raw(app), encoded);
  assert.deepEqual(app.snapshot('inventory'), state);
  assert.equal(app.run('inventorySnapshot'), encoded);
  assert.deepEqual(stockCells(app), ['6', '0', '4']);
  assert.equal(app.element('stockMovementCount').textContent, '1');
});

test('STO-003 - Alta real recorta nombre y persiste fecha y stock', (t) => {
  const app = createApp(t);
  app.click('[data-view="configView"]');
  app.setForm('stockProductForm', productValues({ stockName: '  Guantes  ', initialStock: 10 }));
  app.click('#saveStockProduct');
  assert.deepEqual(saved(app), { version: 1, products: [product({ id: 'test-id-1', name: 'Guantes', startDate: '2026-09-03' })], movements: [] });
  assert.deepEqual(app.snapshot('inventory'), saved(app));
  assert.equal(app.run('inventorySnapshot'), raw(app));
  assert.deepEqual(stockCells(app), ['10', '0', '0']);
  assert.equal(fields(app, 'stockProductForm').stockName.value, '');
  assert.equal(fields(app, 'stockProductForm').initialStock.value, '0');
  assert.equal(app.element('cancelStockProduct').hidden, true);
  message(app, /Producto agregado/);
  assert.deepEqual(app.alerts, []);
  assert.deepEqual(app.confirmations, []);
});

test('STO-004 - Alta con stock cero muestra sin stock y permite ingresos', (t) => {
  const app = createApp(t);
  assert.equal(app.submit('stockProductForm', productValues()), true);
  assert.equal(saved(app).products[0].initialStock, 0);
  assert.equal(app.query('#stockRows .stock-empty-value small').textContent, 'Sin stock');
  assert.equal(app.query('#stockMovementForm button[type="submit"]').disabled, false);
});

test('STO-005 - Alta acepta stock inicial maximo', (t) => {
  const app = createApp(t);
  assert.equal(app.submit('stockProductForm', productValues({ initialStock: 1000000000 })), true);
  assert.equal(saved(app).products[0].initialStock, 1000000000);
});

test('STO-006 - Alta acepta nombre de ochenta caracteres', (t) => {
  const app = createApp(t);
  assert.equal(app.submit('stockProductForm', productValues({ stockName: 'N'.repeat(80) })), true);
  assert.equal(saved(app).products[0].name, 'N'.repeat(80));
});

test('STO-007 - Alta acepta unidad mililitros', (t) => {
  const app = createApp(t);
  assert.equal(app.submit('stockProductForm', productValues({ stockUnit: 'ml' })), true);
  assert.equal(saved(app).products[0].unit, 'ml');
  assert.equal(app.query('#stockRows small').textContent, 'ml');
});

test('STO-008 - Alta acepta unidad gramos', (t) => {
  const app = createApp(t);
  assert.equal(app.submit('stockProductForm', productValues({ stockUnit: 'g' })), true);
  assert.equal(saved(app).products[0].unit, 'g');
});

test('STO-009 - Nombre requerido bloquea submit nativo y listener', (t) => {
  invalidForm(createApp(t), 'stockProductForm', productValues({ stockName: '' }), 'stockName', 'valueMissing');
});

test('STO-010 - Stock inicial requerido bloquea formulario', (t) => {
  invalidForm(createApp(t), 'stockProductForm', productValues({ initialStock: '' }), 'initialStock', 'valueMissing');
});

test('STO-011 - Stock inicial negativo falla por minimo HTML', (t) => {
  invalidForm(createApp(t), 'stockProductForm', productValues({ initialStock: -1 }), 'initialStock', 'rangeUnderflow');
});

test('STO-012 - Stock inicial fraccionario falla por paso HTML', (t) => {
  invalidForm(createApp(t), 'stockProductForm', productValues({ initialStock: 0.5 }), 'initialStock', 'stepMismatch');
});

test('STO-013 - Stock inicial excesivo falla por maximo HTML', (t) => {
  invalidForm(createApp(t), 'stockProductForm', productValues({ initialStock: 1000000001 }), 'initialStock', 'rangeOverflow');
});

test('STO-014 - Stock inicial no numerico queda vacio e invalido', (t) => {
  invalidForm(createApp(t), 'stockProductForm', productValues({ initialStock: 'abc' }), 'initialStock', 'valueMissing');
});

test('STO-015 - Nombre de espacios pasa required pero no validador de negocio', (t) => {
  const app = stockApp(t);
  const before = raw(app);
  assert.equal(app.submit('stockProductForm', productValues({ stockName: '   ' })), true);
  unchanged(app, before);
  message(app, /stock inicial del producto/, true);
});

test('STO-016 - Nombre excesivo no se guarda aunque se asigne por script', (t) => {
  const app = stockApp(t);
  const before = raw(app);
  assert.equal(fields(app, 'stockProductForm').stockName.maxLength, 80);
  app.setForm('stockProductForm', productValues({ stockName: 'N'.repeat(81) }));
  app.emit(app.element('stockProductForm'), 'submit');
  unchanged(app, before);
  assert.equal(fields(app, 'stockProductForm').stockName.value, 'N'.repeat(81));
});

test('STO-017 - Unidad inexistente no se guarda aunque select no sea required', (t) => {
  const app = stockApp(t);
  const before = raw(app);
  app.submit('stockProductForm', productValues({ stockUnit: 'kg' }));
  unchanged(app, before);
  message(app, /stock inicial del producto/, true);
});

test('STO-018 - Alta duplicada normaliza acentos mayusculas y espacios', (t) => {
  const app = stockApp(t);
  const before = raw(app);
  app.submit('stockProductForm', productValues({ stockName: ' N\u00c1VAJAS ' }));
  unchanged(app, before);
  message(app, /Ya existe/, true);
  assert.equal(fields(app, 'stockProductForm').stockName.value, ' N\u00c1VAJAS ');
});

test('STO-019 - Alta no reutiliza nombre de producto archivado', (t) => {
  const app = stockApp(t, fixture({ products: [product({ active: false })] }));
  const before = raw(app);
  app.submit('stockProductForm', productValues({ stockName: 'Navajas' }));
  unchanged(app, before);
  message(app, /archivados/, true);
});

test('STO-020 - Alta retroactiva usa jornada seleccionada', (t) => {
  const app = createApp(t);
  workday(app, '2026-08-31');
  app.submit('stockProductForm', productValues({ initialStock: 5 }));
  assert.equal(saved(app).products[0].startDate, '2026-08-31');
  assert.match(app.element('stockInitialDate').textContent, /2026-08-31/);
});

test('STO-021 - Alta futura se rechaza sin escribir', (t) => {
  const app = createApp(t);
  workday(app, '2026-09-04');
  app.submit('stockProductForm', productValues());
  assert.equal(raw(app), null);
  assert.equal(app.run('inventory.products.length'), 0);
  message(app, /hoy o anterior/, true);
});

test('STO-022 - Alta sin jornada se rechaza sin escribir', (t) => {
  const app = createApp(t);
  workday(app, '');
  app.submit('stockProductForm', productValues());
  assert.equal(raw(app), null);
  message(app, /hoy o anterior/, true);
});

test('STO-023 - Editar carga producto y bloquea unidad y stock inicial', (t) => {
  const app = stockApp(t);
  const before = raw(app);
  app.click('[data-stock-edit="navajas"]');
  const form = fields(app, 'stockProductForm');
  assert.equal(form.stockId.value, 'navajas');
  assert.equal(form.stockName.value, 'Navajas');
  assert.equal(form.stockUnit.value, 'unidades');
  assert.equal(form.initialStock.value, '10');
  assert.equal(form.stockUnit.disabled, true);
  assert.equal(form.initialStock.disabled, true);
  assert.equal(app.element('saveStockProduct').textContent, 'Guardar nombre');
  assert.equal(app.element('cancelStockProduct').hidden, false);
  assert.equal(app.window.document.activeElement, form.stockName);
  assert.match(app.element('stockInitialDate').textContent, /2026-09-01/);
  unchanged(app, before);
});

test('STO-024 - Editar solo cambia nombre y conserva historial e identidad', (t) => {
  const state = fixture({ movements: [movement()] });
  const app = stockApp(t, state);
  app.click('[data-stock-edit="navajas"]');
  assert.equal(app.submit('stockProductForm', { stockName: ' Hojas de afeitar ', stockUnit: 'g', initialStock: 999 }), true);
  assert.deepEqual(saved(app), { ...state, products: [product({ name: 'Hojas de afeitar' })] });
  assert.equal(app.query('#stockMovementRows tr').cells[1].textContent, 'Hojas de afeitar');
  assert.deepEqual(stockCells(app), ['6', '0', '4']);
  assert.equal(fields(app, 'stockProductForm').stockId.value, '');
  assert.equal(fields(app, 'stockProductForm').initialStock.disabled, false);
  assert.equal(fields(app, 'stockProductForm').stockUnit.disabled, false);
  message(app, /Producto actualizado/);
});

test('STO-025 - Cancelar edicion descarta borrador sin escribir', (t) => {
  const app = stockApp(t);
  const before = raw(app);
  app.click('[data-stock-edit="navajas"]');
  app.setForm('stockProductForm', { stockName: 'Borrador' });
  app.click('#cancelStockProduct');
  unchanged(app, before);
  const form = fields(app, 'stockProductForm');
  assert.equal(form.stockId.value, '');
  assert.equal(form.stockName.value, '');
  assert.equal(form.stockUnit.disabled, false);
  assert.equal(form.initialStock.disabled, false);
  assert.equal(form.initialStock.value, '0');
  assert.equal(app.element('saveStockProduct').textContent, 'Agregar producto');
  assert.equal(app.element('cancelStockProduct').hidden, true);
});

test('STO-026 - Editar rechaza nombre duplicado sin perder borrador', (t) => {
  const state = fixture({ products: [product(), product({ id: 'guantes', name: 'Guantes' })] });
  const app = stockApp(t, state);
  const before = raw(app);
  app.click('[data-stock-edit="navajas"]');
  app.submit('stockProductForm', { stockName: 'GUANTES' });
  unchanged(app, before);
  assert.equal(fields(app, 'stockProductForm').stockId.value, 'navajas');
  assert.equal(fields(app, 'stockProductForm').stockName.value, 'GUANTES');
  message(app, /Ya existe/, true);
});

test('STO-027 - Editar archivado conserva estado inactivo', (t) => {
  const app = stockApp(t, fixture({ products: [product({ active: false })] }));
  app.click('[data-stock-edit="navajas"]');
  app.submit('stockProductForm', { stockName: 'Hojas' });
  assert.deepEqual(saved(app).products, [product({ name: 'Hojas', active: false })]);
  assert.equal(app.element('stockRows').children.length, 0);
});

test('STO-028 - Editar nombre no depende de jornada futura', (t) => {
  const app = stockApp(t);
  app.click('[data-stock-edit="navajas"]');
  workday(app, '2026-09-04');
  app.submit('stockProductForm', { stockName: 'Hojas' });
  assert.deepEqual(saved(app).products, [product({ name: 'Hojas' })]);
});

test('STO-029 - Archivar oculta producto activo pero conserva movimientos', (t) => {
  const state = fixture({ movements: [movement()] });
  const app = stockApp(t, state);
  app.setForm('stockMovementForm', movementValues());
  app.click('[data-stock-archive="navajas"]');
  assert.deepEqual(saved(app), { ...state, products: [product({ active: false })] });
  assert.equal(app.element('stockRows').children.length, 0);
  assert.equal(app.element('stockEmpty').hidden, false);
  assert.equal(fields(app, 'stockMovementForm').stockProduct.options.length, 1);
  assert.equal(app.query('#stockMovementForm button[type="submit"]').disabled, true);
  assert.equal(app.element('stockMovementRows').children.length, 1);
  assert.equal(app.element('stockMovementCount').textContent, '1');
  assert.equal(app.query('[data-stock-archive="navajas"]').textContent, 'Activar');
  assert.ok(app.query('#stockConfigList .stock-archived'));
  message(app, /Producto archivado/);
});

test('STO-030 - Activar devuelve producto y stock conservado', (t) => {
  const app = stockApp(t, fixture({ products: [product({ active: false })], movements: [movement()] }));
  app.click('[data-stock-archive="navajas"]');
  assert.equal(saved(app).products[0].active, true);
  assert.deepEqual(stockCells(app), ['6', '0', '4']);
  assert.equal(app.query('#stockMovementForm button[type="submit"]').disabled, false);
  assert.equal(app.query('[data-stock-archive="navajas"]').textContent, 'Archivar');
  message(app, /Producto activado/);
});

test('STO-031 - Archivar producto en edicion cancela ese borrador', (t) => {
  const app = stockApp(t);
  app.click('[data-stock-edit="navajas"]');
  app.setForm('stockProductForm', { stockName: 'Borrador' });
  app.click('[data-stock-archive="navajas"]');
  assert.equal(saved(app).products[0].name, 'Navajas');
  assert.equal(fields(app, 'stockProductForm').stockId.value, '');
  assert.equal(fields(app, 'stockProductForm').stockName.value, '');
  assert.equal(app.element('cancelStockProduct').hidden, true);
});

test('STO-032 - Archivar otro producto conserva edicion actual', (t) => {
  const app = stockApp(t, fixture({ products: [product(), product({ id: 'guantes', name: 'Guantes' })] }));
  app.click('[data-stock-edit="navajas"]');
  app.setForm('stockProductForm', { stockName: 'Borrador' });
  app.click('[data-stock-archive="guantes"]');
  assert.equal(fields(app, 'stockProductForm').stockId.value, 'navajas');
  assert.equal(fields(app, 'stockProductForm').stockName.value, 'Borrador');
  assert.equal(saved(app).products[0].active, true);
  assert.equal(saved(app).products[1].active, false);
});

test('STO-033 - Consumo por boton real descuenta y limpia campos transitorios', (t) => {
  const app = stockApp(t);
  app.click('[data-view="salesView"]');
  app.setForm('stockMovementForm', movementValues({ stockQuantity: 4, stockNotes: '  Uso diario  ' }));
  app.click('#stockMovementForm button[type="submit"]');
  assert.deepEqual(saved(app).movements, [movement({ id: 'test-id-1', time: '12:00', notes: 'Uso diario' })]);
  assert.deepEqual(stockCells(app), ['6', '0', '4']);
  assert.equal(app.element('stockMovementCount').textContent, '1');
  assert.equal(app.element('stockMovementsEmpty').hidden, true);
  const form = fields(app, 'stockMovementForm');
  assert.equal(form.stockProduct.value, 'navajas');
  assert.equal(form.stockType.value, 'consumo');
  assert.equal(form.stockQuantity.value, '1');
  assert.equal(form.stockNotes.value, '');
  message(app, /Consumo registrado: 4 unidades de Navajas/);
});

test('STO-034 - Ingreso real incrementa stock y contador diario', (t) => {
  const app = stockApp(t);
  app.submit('stockMovementForm', movementValues({ stockType: 'entrada', stockQuantity: 5 }));
  assert.deepEqual(saved(app).movements, [movement({ id: 'test-id-1', time: '12:00', type: 'entrada', quantity: 5 })]);
  assert.deepEqual(stockCells(app), ['15', '5', '0']);
  message(app, /Ingreso registrado/);
});

test('STO-035 - Consumo exacto muestra cero y sin stock', (t) => {
  const app = stockApp(t);
  app.submit('stockMovementForm', movementValues({ stockQuantity: 10 }));
  assert.deepEqual(stockCells(app), ['0', '0', '10']);
  assert.equal(app.query('#stockRows .stock-empty-value small').textContent, 'Sin stock');
});

test('STO-036 - Ingreso acepta cantidad maxima del formulario', (t) => {
  const app = stockApp(t);
  assert.equal(app.submit('stockMovementForm', movementValues({ stockType: 'entrada', stockQuantity: 1000000000 })), true);
  assert.equal(saved(app).movements[0].quantity, 1000000000);
  assert.equal(app.run('inventorySummary(inventory.products[0], inventory.movements, today()).stock'), 1000000010);
});

test('STO-037 - Consumo acepta cantidad minima del formulario', (t) => {
  const app = stockApp(t);
  assert.equal(app.submit('stockMovementForm', movementValues()), true);
  assert.equal(saved(app).movements[0].quantity, 1);
  assert.deepEqual(stockCells(app), ['9', '0', '1']);
});

test('STO-038 - Nota opcional acepta ciento veinte caracteres', (t) => {
  const app = stockApp(t);
  assert.equal(app.submit('stockMovementForm', movementValues({ stockNotes: 'n'.repeat(120) })), true);
  assert.equal(saved(app).movements[0].notes, 'n'.repeat(120));
});

test('STO-039 - Producto requerido impide registrar movimiento', (t) => {
  invalidForm(stockApp(t), 'stockMovementForm', movementValues({ stockProduct: '' }), 'stockProduct', 'valueMissing');
});

test('STO-040 - Cantidad requerida impide registrar movimiento', (t) => {
  invalidForm(stockApp(t), 'stockMovementForm', movementValues({ stockQuantity: '' }), 'stockQuantity', 'valueMissing');
});

test('STO-041 - Cantidad cero falla por minimo HTML', (t) => {
  invalidForm(stockApp(t), 'stockMovementForm', movementValues({ stockQuantity: 0 }), 'stockQuantity', 'rangeUnderflow');
});

test('STO-042 - Cantidad negativa falla por minimo HTML', (t) => {
  invalidForm(stockApp(t), 'stockMovementForm', movementValues({ stockQuantity: -1 }), 'stockQuantity', 'rangeUnderflow');
});

test('STO-043 - Cantidad fraccionaria falla por paso HTML', (t) => {
  invalidForm(stockApp(t), 'stockMovementForm', movementValues({ stockQuantity: 1.5 }), 'stockQuantity', 'stepMismatch');
});

test('STO-044 - Cantidad excesiva falla por maximo HTML', (t) => {
  invalidForm(stockApp(t), 'stockMovementForm', movementValues({ stockQuantity: 1000000001 }), 'stockQuantity', 'rangeOverflow');
});

test('STO-045 - Cantidad no numerica queda vacia e invalida', (t) => {
  invalidForm(stockApp(t), 'stockMovementForm', movementValues({ stockQuantity: 'abc' }), 'stockQuantity', 'valueMissing');
});

test('STO-046 - Tipo de movimiento invalido se rechaza en negocio', (t) => {
  const app = stockApp(t);
  const before = raw(app);
  app.submit('stockMovementForm', movementValues({ stockType: 'ajuste' }));
  unchanged(app, before);
  message(app, /cantidad del movimiento/, true);
});

test('STO-047 - Nota excesiva no se guarda aunque se asigne por script', (t) => {
  const app = stockApp(t);
  const before = raw(app);
  assert.equal(fields(app, 'stockMovementForm').stockNotes.maxLength, 120);
  app.setForm('stockMovementForm', movementValues({ stockNotes: 'n'.repeat(121) }));
  app.emit(app.element('stockMovementForm'), 'submit');
  unchanged(app, before);
  assert.equal(fields(app, 'stockMovementForm').stockNotes.value, 'n'.repeat(121));
});

test('STO-048 - Consumo insuficiente conserva borrador y estado', (t) => {
  const app = stockApp(t);
  const before = raw(app);
  assert.equal(app.submit('stockMovementForm', movementValues({ stockQuantity: 11, stockNotes: 'Revisar' })), true);
  unchanged(app, before);
  assert.deepEqual(stockCells(app), ['10', '0', '0']);
  assert.equal(fields(app, 'stockMovementForm').stockQuantity.value, '11');
  assert.equal(fields(app, 'stockMovementForm').stockNotes.value, 'Revisar');
  message(app, /Stock insuficiente.*2026-09-03/, true);
});

test('STO-049 - Corregir consumo limpia mensaje de error anterior', (t) => {
  const app = stockApp(t);
  app.submit('stockMovementForm', movementValues({ stockQuantity: 11 }));
  message(app, /insuficiente/, true);
  app.submit('stockMovementForm', { stockQuantity: 1 });
  assert.equal(saved(app).movements.length, 1);
  message(app, /Consumo registrado/);
});

test('STO-050 - Consumo retroactivo no puede romper jornada posterior', (t) => {
  const app = stockApp(t, fixture({ movements: [movement({ quantity: 10 })] }));
  const before = raw(app);
  workday(app, '2026-09-02');
  app.submit('stockMovementForm', movementValues());
  unchanged(app, before);
  message(app, /2026-09-03/, true);
});

test('STO-051 - Ingreso retroactivo aumenta stock actual y solo ingreso de ese dia', (t) => {
  const app = stockApp(t, fixture({ movements: [movement()] }));
  workday(app, '2026-09-02');
  app.submit('stockMovementForm', movementValues({ stockType: 'entrada', stockQuantity: 5 }));
  assert.equal(saved(app).movements[1].date, '2026-09-02');
  assert.deepEqual(stockCells(app), ['11', '5', '0']);
  workday(app, '2026-09-03');
  assert.deepEqual(stockCells(app), ['11', '0', '4']);
});

test('STO-052 - Jornada futura deshabilita boton y rechaza submit directo', (t) => {
  const app = stockApp(t);
  const before = raw(app);
  workday(app, '2026-09-04');
  assert.equal(app.query('#stockMovementForm button[type="submit"]').disabled, true);
  app.submit('stockMovementForm', movementValues());
  unchanged(app, before);
  message(app, /hoy o anterior/, true);
});

test('STO-053 - Jornada vacia deshabilita movimientos', (t) => {
  const app = stockApp(t);
  const before = raw(app);
  workday(app, '');
  assert.equal(app.query('#stockMovementForm button[type="submit"]').disabled, true);
  assert.equal(fields(app, 'stockMovementForm').stockProduct.options.length, 1);
  assert.equal(app.submit('stockMovementForm', movementValues()), false);
  unchanged(app, before);
});

test('STO-054 - Selector excluye productos anteriores a su fecha inicial', (t) => {
  const app = stockApp(t, fixture({ products: [product({ startDate: '2026-09-03' })] }));
  workday(app, '2026-09-02');
  assert.equal(fields(app, 'stockMovementForm').stockProduct.options.length, 1);
  assert.equal(app.query('#stockMovementForm button[type="submit"]').disabled, true);
  workday(app, '2026-09-03');
  assert.equal(fields(app, 'stockMovementForm').stockProduct.options.length, 2);
  assert.equal(app.query('#stockMovementForm button[type="submit"]').disabled, false);
});

test('STO-055 - Producto archivado no puede enviarse con opcion obsoleta', (t) => {
  const app = stockApp(t, fixture({ products: [product({ active: false })] }));
  const before = raw(app);
  fields(app, 'stockMovementForm').stockProduct.add(new app.window.Option('Navajas', 'navajas'));
  assert.equal(app.submit('stockMovementForm', movementValues()), true);
  unchanged(app, before);
  message(app, /producto activo/, true);
});

test('STO-056 - Producto inexistente no puede enviarse con opcion obsoleta', (t) => {
  const app = stockApp(t);
  const before = raw(app);
  fields(app, 'stockMovementForm').stockProduct.add(new app.window.Option('Otro', 'otro'));
  assert.equal(app.submit('stockMovementForm', movementValues({ stockProduct: 'otro' })), true);
  unchanged(app, before);
  message(app, /producto activo/, true);
});

test('STO-057 - Movimiento anterior al inicio falla aun con opcion obsoleta', (t) => {
  const app = stockApp(t, fixture({ products: [product({ startDate: '2026-09-03' })] }));
  const before = raw(app);
  workday(app, '2026-09-02');
  fields(app, 'stockMovementForm').stockProduct.add(new app.window.Option('Navajas', 'navajas'));
  assert.equal(app.submit('stockMovementForm', movementValues()), true);
  unchanged(app, before);
  message(app, /cantidad del movimiento/, true);
});

test('STO-058 - Cambio de jornada muestra historial diario y stock actual', (t) => {
  const state = fixture({ movements: [movement({ date: '2026-09-01' }), movement({ id: 'mov-2', date: '2026-09-02', type: 'entrada', quantity: 8 }), movement({ id: 'mov-3', date: '2026-09-02', quantity: 3 })] });
  const app = stockApp(t, state);
  assert.deepEqual(stockCells(app), ['11', '0', '0']);
  assert.equal(app.element('stockMovementCount').textContent, '0');
  workday(app, '2026-09-01');
  assert.deepEqual(stockCells(app), ['11', '0', '4']);
  assert.equal(app.element('stockMovementRows').children.length, 1);
  workday(app, '2026-09-02');
  assert.deepEqual(stockCells(app), ['11', '8', '3']);
  assert.equal(app.element('stockMovementCount').textContent, '2');
  assert.deepEqual([...app.element('stockMovementRows').querySelectorAll('[data-stock-toggle]')].map((node) => node.dataset.stockToggle), ['mov-3', 'mov-2']);
});

test('STO-059 - Historial conserva anulados pero no los cuenta como activos', (t) => {
  const app = stockApp(t, fixture({ movements: [movement({ cancelled: true })] }));
  assert.equal(app.element('stockMovementCount').textContent, '0');
  assert.equal(app.element('stockMovementsEmpty').hidden, true);
  assert.equal(app.query('#stockMovementRows tr').classList.contains('stock-cancelled'), true);
  assert.equal(app.query('[data-stock-toggle="mov-1"]').textContent, 'Restaurar');
  assert.deepEqual(stockCells(app), ['10', '0', '0']);
});

test('STO-060 - Anular consumo restaura stock sin eliminar fila', (t) => {
  const app = stockApp(t, fixture({ movements: [movement()] }));
  app.click('[data-stock-toggle="mov-1"]');
  assert.deepEqual(saved(app).movements, [movement({ cancelled: true })]);
  assert.deepEqual(stockCells(app), ['10', '0', '0']);
  assert.equal(app.element('stockMovementCount').textContent, '0');
  assert.equal(app.query('#stockMovementRows tr').classList.contains('stock-cancelled'), true);
  assert.equal(app.query('[data-stock-toggle="mov-1"]').textContent, 'Restaurar');
  message(app, /Movimiento anulado/);
});

test('STO-061 - Restaurar consumo descuenta una sola vez', (t) => {
  const app = stockApp(t, fixture({ movements: [movement({ cancelled: true })] }));
  app.click('[data-stock-toggle="mov-1"]');
  assert.deepEqual(saved(app).movements, [movement()]);
  assert.deepEqual(stockCells(app), ['6', '0', '4']);
  assert.equal(app.element('stockMovementCount').textContent, '1');
  assert.equal(app.query('#stockMovementRows tr').classList.contains('stock-cancelled'), false);
  message(app, /Movimiento restaurado/);
});

test('STO-062 - Anular ingreso descuenta stock e ingreso diario', (t) => {
  const app = stockApp(t, fixture({ movements: [movement({ type: 'entrada' })] }));
  app.click('[data-stock-toggle="mov-1"]');
  assert.equal(saved(app).movements[0].cancelled, true);
  assert.deepEqual(stockCells(app), ['10', '0', '0']);
});

test('STO-063 - Restaurar ingreso recupera stock e ingreso diario', (t) => {
  const app = stockApp(t, fixture({ movements: [movement({ type: 'entrada', cancelled: true })] }));
  app.click('[data-stock-toggle="mov-1"]');
  assert.equal(saved(app).movements[0].cancelled, false);
  assert.deepEqual(stockCells(app), ['14', '4', '0']);
});

test('STO-064 - Anular ingreso rechaza stock negativo de jornada posterior', (t) => {
  const app = stockApp(t, fixture({ movements: [movement({ date: '2026-09-02', type: 'entrada', quantity: 10 }), movement({ id: 'mov-2', quantity: 20 })] }));
  const before = raw(app);
  workday(app, '2026-09-02');
  app.click('[data-stock-toggle="mov-1"]');
  unchanged(app, before);
  assert.equal(app.query('[data-stock-toggle="mov-1"]').textContent, 'Anular');
  message(app, /2026-09-03/, true);
});

test('STO-065 - Restaurar consumo rechaza stock negativo posterior', (t) => {
  const app = stockApp(t, fixture({ movements: [movement({ date: '2026-09-02', quantity: 1, cancelled: true }), movement({ id: 'mov-2', quantity: 10 })] }));
  const before = raw(app);
  workday(app, '2026-09-02');
  app.click('[data-stock-toggle="mov-1"]');
  unchanged(app, before);
  assert.equal(app.query('[data-stock-toggle="mov-1"]').textContent, 'Restaurar');
  message(app, /2026-09-03/, true);
});

test('STO-066 - Historial de archivado permite anular sin reactivarlo', (t) => {
  const app = stockApp(t, fixture({ products: [product({ active: false })], movements: [movement()] }));
  app.click('[data-stock-toggle="mov-1"]');
  assert.equal(saved(app).products[0].active, false);
  assert.equal(saved(app).movements[0].cancelled, true);
  assert.equal(app.element('stockRows').children.length, 0);
});

test('STO-067 - Delegacion de editar reconoce descendiente del boton', (t) => {
  const app = stockApp(t);
  const child = app.window.document.createElement('span');
  child.textContent = 'Editar nombre';
  app.query('[data-stock-edit="navajas"]').append(child);
  app.emit(child, 'click');
  assert.equal(fields(app, 'stockProductForm').stockId.value, 'navajas');
});

test('STO-068 - Delegacion de archivar reconoce descendiente del boton', (t) => {
  const app = stockApp(t);
  const child = app.window.document.createElement('span');
  app.query('[data-stock-archive="navajas"]').append(child);
  app.emit(child, 'click');
  assert.equal(saved(app).products[0].active, false);
});

test('STO-069 - Delegacion de anular reconoce descendiente del boton', (t) => {
  const app = stockApp(t, fixture({ movements: [movement()] }));
  const child = app.window.document.createElement('span');
  app.query('[data-stock-toggle="mov-1"]').append(child);
  app.emit(child, 'click');
  assert.equal(saved(app).movements[0].cancelled, true);
});

test('STO-070 - Click sin accion en configuracion no modifica inventario', (t) => {
  const app = stockApp(t);
  const before = raw(app);
  app.emit(app.element('stockConfigList'), 'click');
  unchanged(app, before);
  assert.equal(fields(app, 'stockProductForm').stockId.value, '');
});

test('STO-071 - Click sin accion en historial no modifica inventario', (t) => {
  const app = stockApp(t, fixture({ movements: [movement()] }));
  const before = raw(app);
  app.emit(app.query('#stockMovementRows td'), 'click');
  unchanged(app, before);
});

test('STO-072 - Accion obsoleta de producto inexistente es inocua', (t) => {
  const app = stockApp(t);
  const before = raw(app);
  app.query('[data-stock-archive="navajas"]').dataset.stockArchive = 'inexistente';
  app.click('[data-stock-archive="inexistente"]');
  unchanged(app, before);
});

test('STO-073 - Accion obsoleta de movimiento inexistente es inocua', (t) => {
  const app = stockApp(t, fixture({ movements: [movement()] }));
  const before = raw(app);
  app.query('[data-stock-toggle="mov-1"]').dataset.stockToggle = 'inexistente';
  app.click('[data-stock-toggle="inexistente"]');
  unchanged(app, before);
});

test('STO-074 - Nombre con HTML se representa como texto en todas las vistas', (t) => {
  const name = 'Navajas <img src=x onerror="alert(1)"> & \'kit\'';
  const app = stockApp(t, fixture({ products: [product({ name })], movements: [movement()] }));
  assert.equal(app.query('#stockRows tr').cells[0].firstChild.textContent, name);
  assert.equal(app.query('#stockMovementRows tr').cells[1].textContent, name);
  assert.equal(app.query('#stockConfigList .config-item > span').firstChild.textContent, name);
  assert.equal(fields(app, 'stockMovementForm').stockProduct.options[1].textContent, `${name} (unidades)`);
  assert.equal(app.window.document.querySelector('#stockRows img, #stockMovementRows img, #stockConfigList img'), null);
  assert.deepEqual(app.alerts, []);
});

test('STO-075 - Nota con HTML se representa como texto sin crear nodos', (t) => {
  const notes = '<img src=x onerror="alert(1)"> & <b>nota</b>';
  const app = stockApp(t);
  app.submit('stockMovementForm', movementValues({ stockNotes: notes }));
  assert.equal(saved(app).movements[0].notes, notes);
  assert.equal(app.query('#stockMovementRows tr').cells[4].textContent, notes);
  assert.equal(app.window.document.querySelector('#stockMovementRows img, #stockMovementRows b'), null);
  assert.deepEqual(app.alerts, []);
});

test('STO-076 - ID persistido con comillas no inyecta atributos', (t) => {
  const id = 'navajas" data-injected="si';
  const app = stockApp(t, fixture({ products: [product({ id })] }));
  assert.equal(app.query('[data-stock-edit]').dataset.stockEdit, id);
  assert.equal(app.query('[data-stock-archive]').dataset.stockArchive, id);
  assert.equal(fields(app, 'stockMovementForm').stockProduct.options[1].value, id);
  assert.equal(app.window.document.querySelector('[data-injected]'), null);
  app.click('[data-stock-edit]');
  assert.equal(fields(app, 'stockProductForm').stockId.value, id);
});

test('STO-077 - Movimientos de stock no alteran ventas caja ni finanzas', (t) => {
  const app = stockApp(t);
  app.financialFixture();
  const before = app.snapshot('({ entries, sales, advances, expenses, transfers, cashRegisters, barberPayments })');
  const cash = app.element('cashTotal').textContent;
  const mp = app.element('mpTotal').textContent;
  app.submit('stockMovementForm', movementValues({ stockQuantity: 4 }));
  app.submit('stockMovementForm', movementValues({ stockType: 'entrada', stockQuantity: 2 }));
  assert.deepEqual(app.snapshot('({ entries, sales, advances, expenses, transfers, cashRegisters, barberPayments })'), before);
  assert.equal(app.element('cashTotal').textContent, cash);
  assert.equal(app.element('mpTotal').textContent, mp);
  assert.deepEqual(stockCells(app), ['8', '2', '4']);
});

test('STO-078 - Recarga completa conserva altas ediciones archivo y anulaciones', (t) => {
  const app = stockApp(t, fixture({ movements: [movement()] }));
  app.submit('stockProductForm', productValues({ stockUnit: 'g', initialStock: 3 }));
  app.click('[data-stock-edit="navajas"]');
  app.submit('stockProductForm', { stockName: 'Hojas' });
  app.click('[data-stock-toggle="mov-1"]');
  app.click('[data-stock-archive="navajas"]');
  const encoded = raw(app);
  const reloaded = createApp(t, { storage: { [key]: encoded } });
  assert.equal(raw(reloaded), encoded);
  assert.deepEqual(reloaded.snapshot('inventory'), saved(app));
  assert.equal(reloaded.element('stockRows').children.length, 1);
  assert.equal(reloaded.query('[data-stock-archive="navajas"]').textContent, 'Activar');
  assert.equal(reloaded.query('[data-stock-toggle="mov-1"]').textContent, 'Restaurar');
  reloaded.click('[data-stock-archive="navajas"]');
  assert.equal(reloaded.element('stockRows').children.length, 2);
  assert.equal(reloaded.query('#stockRows tr').cells[1].firstChild.textContent, '10');
});

test('STO-079 - JSON corrupto al iniciar bloquea escritura sin sobrescribir', (t) => {
  const app = createApp(t, { storage: { [key]: '{broken' } });
  assert.equal(raw(app), '{broken');
  assert.equal(app.run('inventoryReadError'), true);
  assert.equal(app.element('saveStockProduct').disabled, true);
  assert.equal(app.query('#stockMovementForm button[type="submit"]').disabled, true);
  app.submit('stockProductForm', productValues());
  assert.equal(raw(app), '{broken');
  assert.equal(app.run('inventory.products.length'), 0);
  message(app, /No se pudo leer/, true);
});

test('STO-080 - Version incompatible al iniciar se conserva sin sobrescribir', (t) => {
  const encoded = JSON.stringify({ ...fixture(), version: 2 });
  const app = createApp(t, { storage: { [key]: encoded } });
  assert.equal(raw(app), encoded);
  assert.equal(app.element('saveStockProduct').disabled, true);
  message(app, /No se pudo leer/, true);
});

test('STO-081 - Historial negativo guardado se rechaza al iniciar', (t) => {
  const encoded = JSON.stringify(fixture({ movements: [movement({ quantity: 11 })] }));
  const app = createApp(t, { storage: { [key]: encoded } });
  assert.equal(raw(app), encoded);
  assert.equal(app.run('inventoryReadError'), true);
  assert.equal(app.run('inventory.products.length'), 0);
  message(app, /No se pudo leer/, true);
});

test('STO-082 - Cuota agotada al crear no confirma ni aplica producto', (t) => {
  const app = stockApp(t);
  const before = raw(app);
  failStorage(t, app, 'setItem');
  app.submit('stockProductForm', productValues());
  unchanged(app, before);
  assert.equal(fields(app, 'stockProductForm').stockName.value, 'Guantes');
  assert.equal(app.run('inventorySnapshot'), before);
  message(app, /No se pudo guardar/, true);
});

test('STO-083 - Reintentar alta tras recuperar almacenamiento guarda una vez', (t) => {
  const app = stockApp(t);
  const failure = failStorage(t, app, 'setItem');
  app.submit('stockProductForm', productValues());
  failure.mock.restore();
  app.submit('stockProductForm');
  assert.deepEqual(saved(app).products.map((row) => row.name), ['Navajas', 'Guantes']);
  assert.equal(fields(app, 'stockProductForm').stockName.value, '');
  message(app, /Producto agregado/);
});

test('STO-084 - Fallo al editar conserva nombre anterior y borrador', (t) => {
  const app = stockApp(t);
  const before = raw(app);
  app.click('[data-stock-edit="navajas"]');
  failStorage(t, app, 'setItem', 'SecurityError');
  app.submit('stockProductForm', { stockName: 'Hojas' });
  unchanged(app, before);
  assert.equal(fields(app, 'stockProductForm').stockName.value, 'Hojas');
  assert.equal(fields(app, 'stockProductForm').stockId.value, 'navajas');
  message(app, /No se pudo guardar/, true);
});

test('STO-085 - Fallo al archivar no oculta ni cancela edicion', (t) => {
  const app = stockApp(t);
  const before = raw(app);
  app.click('[data-stock-edit="navajas"]');
  failStorage(t, app, 'setItem');
  app.click('[data-stock-archive="navajas"]');
  unchanged(app, before);
  assert.equal(app.element('stockRows').children.length, 1);
  assert.equal(fields(app, 'stockProductForm').stockId.value, 'navajas');
  message(app, /No se pudo guardar/, true);
});

test('STO-086 - Fallo al registrar consumo conserva cantidad y nota', (t) => {
  const app = stockApp(t);
  const before = raw(app);
  failStorage(t, app, 'setItem');
  app.submit('stockMovementForm', movementValues({ stockQuantity: 4, stockNotes: 'Pendiente' }));
  unchanged(app, before);
  assert.deepEqual(stockCells(app), ['10', '0', '0']);
  assert.equal(fields(app, 'stockMovementForm').stockQuantity.value, '4');
  assert.equal(fields(app, 'stockMovementForm').stockNotes.value, 'Pendiente');
  message(app, /No se pudo guardar/, true);
});

test('STO-087 - Fallo al anular mantiene movimiento activo y stock', (t) => {
  const app = stockApp(t, fixture({ movements: [movement()] }));
  const before = raw(app);
  failStorage(t, app, 'setItem');
  app.click('[data-stock-toggle="mov-1"]');
  unchanged(app, before);
  assert.deepEqual(stockCells(app), ['6', '0', '4']);
  assert.equal(app.query('[data-stock-toggle="mov-1"]').textContent, 'Anular');
  message(app, /No se pudo guardar/, true);
});

test('STO-088 - Fallo al restaurar mantiene movimiento anulado y stock', (t) => {
  const app = stockApp(t, fixture({ movements: [movement({ cancelled: true })] }));
  const before = raw(app);
  failStorage(t, app, 'setItem');
  app.click('[data-stock-toggle="mov-1"]');
  unchanged(app, before);
  assert.deepEqual(stockCells(app), ['10', '0', '0']);
  assert.equal(app.query('[data-stock-toggle="mov-1"]').textContent, 'Restaurar');
  message(app, /No se pudo guardar/, true);
});

test('STO-089 - Fallo de lectura durante guardado no aplica cambio', (t) => {
  const app = stockApp(t);
  const before = raw(app);
  const failure = failStorage(t, app, 'getItem', 'SecurityError');
  app.submit('stockProductForm', productValues());
  failure.mock.restore();
  unchanged(app, before);
  message(app, /No se pudo guardar/, true);
});

test('STO-090 - Fallo de lectura por evento conserva ultimo inventario y bloquea acciones', (t) => {
  const app = stockApp(t, fixture({ movements: [movement()] }));
  const before = raw(app);
  const failure = failStorage(t, app, 'getItem', 'SecurityError');
  storageEvent(app);
  failure.mock.restore();
  unchanged(app, before);
  assert.equal(app.run('inventoryReadError'), true);
  assert.equal(app.element('saveStockProduct').disabled, true);
  assert.equal(app.query('[data-stock-edit]').disabled, true);
  assert.equal(app.query('[data-stock-archive]').disabled, true);
  assert.equal(app.query('[data-stock-toggle]').disabled, true);
  assert.equal(app.query('#stockMovementForm button[type="submit"]').disabled, true);
  message(app, /No se pudo leer/, true);
});

test('STO-091 - Error de lectura bloquea incluso submit directo posterior', (t) => {
  const app = stockApp(t);
  const before = raw(app);
  const failure = failStorage(t, app, 'getItem', 'SecurityError');
  storageEvent(app);
  failure.mock.restore();
  app.submit('stockProductForm', productValues());
  app.submit('stockMovementForm', movementValues());
  unchanged(app, before);
  message(app, /No se pudo leer/, true);
});

test('STO-092 - Evento valido posterior recupera lectura y acciones', (t) => {
  const app = createApp(t, { storage: { [key]: '{broken' } });
  app.window.localStorage.setItem(key, JSON.stringify(fixture({ movements: [movement()] })));
  storageEvent(app);
  assert.equal(app.run('inventoryReadError'), false);
  assert.equal(app.element('saveStockProduct').disabled, false);
  assert.equal(app.query('[data-stock-edit]').disabled, false);
  assert.equal(app.query('[data-stock-archive]').disabled, false);
  assert.equal(app.query('[data-stock-toggle]').disabled, false);
  assert.deepEqual(stockCells(app), ['6', '0', '4']);
  message(app, /actualizado desde otra pesta/);
  app.submit('stockMovementForm', movementValues());
  assert.equal(saved(app).movements.length, 2);
});

test('STO-093 - Evento de otra clave no lee ni cambia inventario', (t) => {
  const app = stockApp(t);
  const before = app.snapshot('inventory');
  app.window.localStorage.setItem(key, JSON.stringify(fixture({ products: [] })));
  const spy = t.mock.method(app.window.Storage.prototype, 'getItem');
  storageEvent(app, 'unrelated');
  assert.equal(spy.mock.callCount(), 0);
  assert.deepEqual(app.snapshot('inventory'), before);
  assert.equal(app.element('stockRows').children.length, 1);
  assert.equal(app.element('stockMessage').hidden, true);
});

test('STO-094 - Evento de inventario carga vista sin escribir de vuelta', (t) => {
  const app = stockApp(t);
  const remote = fixture({ products: [product({ name: 'Hojas' })], movements: [movement()] });
  const encoded = JSON.stringify(remote);
  app.window.localStorage.setItem(key, encoded);
  const spy = t.mock.method(app.window.Storage.prototype, 'setItem');
  storageEvent(app);
  assert.equal(spy.mock.callCount(), 0);
  assert.deepEqual(app.snapshot('inventory'), remote);
  assert.equal(app.run('inventorySnapshot'), encoded);
  assert.equal(app.query('#stockRows tr').cells[0].firstChild.textContent, 'Hojas');
  assert.deepEqual(stockCells(app), ['6', '0', '4']);
  message(app, /actualizado desde otra pesta/);
});

test('STO-095 - Evento de clear con clave nula vacia inventario', (t) => {
  const app = stockApp(t, fixture({ movements: [movement()] }));
  app.window.localStorage.clear();
  storageEvent(app, null);
  assert.equal(raw(app), null);
  assert.deepEqual(app.snapshot('inventory'), { version: 1, products: [], movements: [] });
  assert.equal(app.run('inventorySnapshot'), null);
  assert.equal(app.element('stockRows').children.length, 0);
  assert.equal(app.element('stockMovementRows').children.length, 0);
  assert.equal(app.element('stockEmpty').hidden, false);
  message(app, /actualizado desde otra pesta/);
});

test('STO-096 - Evento de borrado de clave permite nueva alta', (t) => {
  const app = stockApp(t);
  app.window.localStorage.removeItem(key);
  storageEvent(app);
  assert.equal(app.element('stockRows').children.length, 0);
  app.submit('stockProductForm', productValues());
  assert.deepEqual(saved(app).products.map((row) => row.name), ['Guantes']);
});

test('STO-097 - Evento corrupto preserva ultimo estado pero no datos corruptos en memoria', (t) => {
  const app = stockApp(t, fixture({ movements: [movement()] }));
  const before = app.snapshot('inventory');
  const snapshot = app.run('inventorySnapshot');
  app.window.localStorage.setItem(key, '{broken');
  storageEvent(app);
  assert.equal(raw(app), '{broken');
  assert.deepEqual(app.snapshot('inventory'), before);
  assert.equal(app.run('inventorySnapshot'), snapshot);
  assert.equal(app.element('saveStockProduct').disabled, true);
  assert.deepEqual(stockCells(app), ['6', '0', '4']);
  message(app, /No se pudo leer/, true);
});

test('STO-098 - Evento de version invalida bloquea acciones sin borrar historial', (t) => {
  const app = stockApp(t, fixture({ movements: [movement()] }));
  const before = app.snapshot('inventory');
  const encoded = JSON.stringify({ ...fixture(), version: 2 });
  app.window.localStorage.setItem(key, encoded);
  storageEvent(app);
  assert.equal(raw(app), encoded);
  assert.deepEqual(app.snapshot('inventory'), before);
  assert.equal(app.query('[data-stock-toggle]').disabled, true);
  message(app, /No se pudo leer/, true);
});

test('STO-099 - Conflicto de alta sin evento carga remoto y no pisa sus datos', (t) => {
  const app = stockApp(t);
  const remote = fixture({ products: [product(), product({ id: 'alcohol', name: 'Alcohol', unit: 'ml' })] });
  const encoded = JSON.stringify(remote);
  app.window.localStorage.setItem(key, encoded);
  app.submit('stockProductForm', productValues());
  unchanged(app, encoded);
  assert.equal(fields(app, 'stockProductForm').stockName.value, 'Guantes');
  assert.equal(app.element('stockRows').children.length, 2);
  message(app, /cambi.*otra pesta/, true);
});

test('STO-100 - Reintento explicito tras conflicto agrega sobre estado actualizado', (t) => {
  const app = stockApp(t);
  const remote = fixture({ products: [product(), product({ id: 'alcohol', name: 'Alcohol' })] });
  app.window.localStorage.setItem(key, JSON.stringify(remote));
  app.submit('stockProductForm', productValues());
  app.submit('stockProductForm');
  assert.deepEqual(saved(app).products.map((row) => row.name), ['Navajas', 'Alcohol', 'Guantes']);
  assert.deepEqual(saved(app).products.slice(0, 2), remote.products);
  message(app, /Producto agregado/);
});

test('STO-101 - Conflicto de edicion no sobrescribe nombre remoto', (t) => {
  const app = stockApp(t);
  app.click('[data-stock-edit="navajas"]');
  app.setForm('stockProductForm', { stockName: 'Borrador local' });
  const encoded = JSON.stringify(fixture({ products: [product({ name: 'Nombre remoto' })] }));
  app.window.localStorage.setItem(key, encoded);
  app.submit('stockProductForm');
  unchanged(app, encoded);
  assert.equal(fields(app, 'stockProductForm').stockName.value, 'Borrador local');
  message(app, /cambi.*otra pesta/, true);
});

test('STO-102 - Conflicto de archivo no revierte cambios remotos', (t) => {
  const app = stockApp(t);
  const encoded = JSON.stringify(fixture({ products: [product({ name: 'Nombre remoto' })] }));
  app.window.localStorage.setItem(key, encoded);
  app.click('[data-stock-archive="navajas"]');
  unchanged(app, encoded);
  assert.equal(app.query('[data-stock-archive="navajas"]').textContent, 'Archivar');
  message(app, /cambi.*otra pesta/, true);
});

test('STO-103 - Conflicto de consumo no elimina movimiento remoto', (t) => {
  const app = stockApp(t);
  const encoded = JSON.stringify(fixture({ movements: [movement({ quantity: 9 })] }));
  app.window.localStorage.setItem(key, encoded);
  app.submit('stockMovementForm', movementValues({ stockQuantity: 4 }));
  unchanged(app, encoded);
  assert.deepEqual(stockCells(app), ['1', '0', '9']);
  assert.equal(fields(app, 'stockMovementForm').stockQuantity.value, '4');
  message(app, /cambi.*otra pesta/, true);
  app.submit('stockMovementForm');
  unchanged(app, encoded);
  message(app, /insuficiente/, true);
});

test('STO-104 - Conflicto de anulacion conserva movimientos remotos', (t) => {
  const app = stockApp(t, fixture({ movements: [movement()] }));
  const encoded = JSON.stringify(fixture({ movements: [movement(), movement({ id: 'mov-2', type: 'entrada', quantity: 2 })] }));
  app.window.localStorage.setItem(key, encoded);
  app.click('[data-stock-toggle="mov-1"]');
  unchanged(app, encoded);
  assert.equal(app.query('[data-stock-toggle="mov-1"]').textContent, 'Anular');
  message(app, /cambi.*otra pesta/, true);
});

test('STO-105 - Conflicto de restauracion conserva anulacion remota', (t) => {
  const app = stockApp(t, fixture({ movements: [movement({ cancelled: true })] }));
  const encoded = JSON.stringify(fixture({ movements: [movement({ cancelled: true }), movement({ id: 'mov-2', quantity: 10 })] }));
  app.window.localStorage.setItem(key, encoded);
  app.click('[data-stock-toggle="mov-1"]');
  unchanged(app, encoded);
  assert.equal(app.query('[data-stock-toggle="mov-1"]').textContent, 'Restaurar');
  message(app, /cambi.*otra pesta/, true);
});

test('STO-106 - Conflicto con borrado remoto no resucita productos', (t) => {
  const app = stockApp(t);
  app.window.localStorage.removeItem(key);
  app.submit('stockProductForm', productValues());
  assert.equal(raw(app), null);
  assert.deepEqual(app.snapshot('inventory'), { version: 1, products: [], movements: [] });
  assert.equal(app.element('stockRows').children.length, 0);
  message(app, /cambi.*otra pesta/, true);
});

test('STO-107 - Conflicto con JSON corrupto no sobrescribe ni confirma', (t) => {
  const app = stockApp(t);
  const before = app.snapshot('inventory');
  app.window.localStorage.setItem(key, '{broken');
  app.submit('stockProductForm', productValues());
  assert.equal(raw(app), '{broken');
  assert.deepEqual(app.snapshot('inventory'), before);
  assert.equal(app.element('saveStockProduct').disabled, true);
  message(app, /No se pudo leer/, true);
});

test('STO-108 - Edicion de producto eliminado por evento no crea reemplazo', (t) => {
  const app = stockApp(t);
  app.click('[data-stock-edit="navajas"]');
  const encoded = JSON.stringify(fixture({ products: [] }));
  app.window.localStorage.setItem(key, encoded);
  storageEvent(app);
  app.submit('stockProductForm', { stockName: 'Borrador local' });
  unchanged(app, encoded);
  message(app, /ya no est.*disponible/, true);
});

test('STO-109 - Evento durante edicion no permite pisar nombre remoto con borrador viejo', (t) => {
  const app = stockApp(t);
  app.click('[data-stock-edit="navajas"]');
  app.setForm('stockProductForm', { stockName: 'Borrador local' });
  const encoded = JSON.stringify(fixture({ products: [product({ name: 'Nombre remoto' })] }));
  app.window.localStorage.setItem(key, encoded);
  storageEvent(app);
  app.submit('stockProductForm');
  unchanged(app, encoded);
});

test('STO-110 - Evento de stock conserva seleccion de producto aun disponible', (t) => {
  const app = stockApp(t);
  app.setForm('stockMovementForm', movementValues({ stockQuantity: 2, stockNotes: 'Borrador' }));
  app.window.localStorage.setItem(key, JSON.stringify(fixture({ movements: [movement()] })));
  storageEvent(app);
  assert.equal(fields(app, 'stockMovementForm').stockProduct.value, 'navajas');
  assert.equal(fields(app, 'stockMovementForm').stockQuantity.value, '2');
  assert.equal(fields(app, 'stockMovementForm').stockNotes.value, 'Borrador');
  app.submit('stockMovementForm');
  assert.deepEqual(saved(app).movements.map((row) => row.quantity), [4, 2]);
  assert.deepEqual(stockCells(app), ['4', '0', '6']);
});

test('STO-111 - Evento de archivo elimina seleccion y evita consumo obsoleto', (t) => {
  const app = stockApp(t);
  app.setForm('stockMovementForm', movementValues());
  const encoded = JSON.stringify(fixture({ products: [product({ active: false })] }));
  app.window.localStorage.setItem(key, encoded);
  storageEvent(app);
  assert.equal(fields(app, 'stockMovementForm').stockProduct.value, '');
  assert.equal(app.query('#stockMovementForm button[type="submit"]').disabled, true);
  assert.equal(app.submit('stockMovementForm'), false);
  unchanged(app, encoded);
});

test('STO-112 - Guardado no modifica claves ajenas al inventario', (t) => {
  const app = createApp(t, { storage: { unrelated: 'conservar' } });
  app.submit('stockProductForm', productValues());
  assert.equal(app.window.localStorage.getItem('unrelated'), 'conservar');
  assert.deepEqual(Object.keys(app.window.localStorage).sort(), [key, 'unrelated']);
});
