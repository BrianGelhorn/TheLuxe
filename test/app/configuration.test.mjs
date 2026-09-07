import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../support/app.mjs';

for (const [id, type, add, form] of [['CFG-001', 'services', 'addServiceConfig', 'serviceConfigForm'], ['CFG-002', 'products', 'addProductConfig', 'productConfigForm'], ['CFG-003', 'barbers', 'addBarberConfig', 'barberConfigForm']]) {
  test(`${id} - Crea edita y elimina un elemento de ${type} sin operaciones`, (t) => {
    const app = createApp(t);
    const initial = app.run(`config.${type}.length`);
    app.click(`#${add}`);
    app.submit(form, { name: 'Nuevo <img>', ...(type === 'barbers' ? {} : { price: '1.500' }) });
    const itemId = app.run(`config.${type}.at(-1).id`);
    assert.equal(app.run(`config.${type}.length`), initial + 1);
    assert.equal(app.window.document.querySelector('#configView img'), null);
    app.click(`[data-config-edit="${type}"][data-id="${itemId}"]`);
    app.submit(form, { name: 'Renombrado' });
    assert.equal(app.run(`config.${type}.at(-1).name`), 'Renombrado');
    app.confirm(false);
    app.click(`[data-config-delete="${type}"][data-id="${itemId}"]`);
    assert.equal(app.run(`config.${type}.length`), initial + 1);
    app.confirm(true);
    app.click(`[data-config-delete="${type}"][data-id="${itemId}"]`);
    assert.equal(app.run(`config.${type}.length`), initial);
  });
}

test('CFG-004 - Un nombre duplicado se rechaza y puede corregirse sin reabrir el dialogo', (t) => {
  const app = createApp(t);
  app.click('#addBarberConfig');
  app.submit('barberConfigForm', { name: 'mateo' });
  assert.equal(app.element('barberConfigForm').elements.name.validity.customError, true);
  app.input('#barberConfigForm [name="name"]', 'Nuevo');
  assert.equal(app.submit('barberConfigForm'), true);
  assert.equal(app.run('config.barbers.at(-1).name'), 'Nuevo');
});

test('CFG-005 - Precio cero en catalogo no guarda y corregirlo permite continuar', (t) => {
  const app = createApp(t);
  app.click('#addServiceConfig');
  app.submit('serviceConfigForm', { name: 'Nuevo', price: '0' });
  assert.equal(app.element('serviceConfigForm').elements.price.validity.customError, true);
  app.input('#serviceConfigForm [name="price"]', '100');
  app.submit('serviceConfigForm');
  assert.equal(app.run('config.services.at(-1).price'), 100);
});

for (const [id, type, item, expected] of [['CFG-006', 'services', 'barba', 'Barba'], ['CFG-007', 'products', 'pomada', 'Pomada'], ['CFG-008', 'barbers', 'Mateo', 'Mateo']]) {
  test(`${id} - No elimina ${type} con operaciones asociadas`, (t) => {
    const app = createApp(t);
    app.financialFixture();
    app.click(`[data-config-delete="${type}"][data-id="${item}"]`);
    assert.equal(app.alerts.length, 1);
    assert.equal(app.run(`config.${type}.find(item => item.id === ${JSON.stringify(item)}).name`), expected);
  });
}

test('CFG-009 - Renombrar barbero conserva cortes adelantos y pagos de todas sus fechas', (t) => {
  const app = createApp(t);
  app.financialFixture();
  app.seed({ barberPayments: { '2026-09-03': { Mateo: { status: 'Mixto', cashAmount: 200, mpAmount: 100 } }, '2026-09-02': { Mateo: 'Efectivo' } } });
  app.click('[data-config-edit="barbers"][data-id="Mateo"]');
  app.submit('barberConfigForm', { name: 'Mateo nuevo' });
  assert.equal(app.run('entries.filter(cut => cut.barber === "Mateo nuevo").length'), 2);
  assert.equal(app.run('advances[0].barber'), 'Mateo nuevo');
  assert.equal(app.run('barberPayments["2026-09-02"]["Mateo nuevo"]'), 'Efectivo');
  assert.equal(app.run('dayBalance("Efectivo")'), 2650);
});

test('CFG-010 - Renombrar servicio y producto actualiza referencias sin tocar precios vendidos', (t) => {
  const app = createApp(t);
  app.financialFixture();
  app.click('[data-config-edit="services"][data-id="barba"]');
  app.submit('serviceConfigForm', { name: 'Barba nueva', price: '99999' });
  assert.equal(app.run('entries[0].service'), 'Barba nueva');
  assert.equal(app.run('entries[0].amount'), 1000);
  app.click('[data-config-edit="products"][data-id="pomada"]');
  app.submit('productConfigForm', { name: 'Pomada nueva', price: '99999' });
  assert.equal(app.run('sales[0].product'), 'Pomada nueva');
  assert.equal(app.run('sales[0].total'), 500);
});

test('CFG-011 - No elimina un barbero sin cortes que tenga dinero pagado', (t) => {
  const app = createApp(t);
  app.seed({ barberPayments: { '2026-09-03': { Mateo: { status: 'Mixto', cashAmount: 100, mpAmount: 0 } } } });
  app.click('[data-config-delete="barbers"][data-id="Mateo"]');
  assert.equal(app.alerts.length, 1);
  assert.ok(app.query('[data-barber-column="Mateo"]'));
});

test('CFG-012 - Desactivar y reactivar barbero conserva historial y permite buscar sin tildes', (t) => {
  const app = createApp(t);
  app.financialFixture();
  app.click('[data-config-active="barbers"][data-id="Mateo"]');
  assert.equal(app.window.document.querySelector('[data-barber-column="Mateo"]'), null);
  app.click('[data-config-active="barbers"][data-id="Mateo"]');
  assert.equal(app.query('[data-barber-column="Mateo"]').querySelectorAll('[data-cut]').length, 2);
  app.input('#barberConfigSearch', 'jul');
  assert.equal(app.query('#barberConfigList [data-name="Julián"]').style.display, '');
  assert.equal(app.query('#barberConfigList [data-name="Mateo"]').style.display, 'none');
});

test('CFG-013 - Guardar configuracion no cambia silenciosamente los filtros del reporte', (t) => {
  const app = createApp(t);
  app.financialFixture();
  app.element('summaryBarberFilter').value = 'Mateo';
  app.run('document.querySelectorAll("#summaryServiceOptions input").forEach(input => input.checked = input.value === "Barba")');
  app.emit('#summaryServiceOptions', 'change');
  app.submit('commissionForm', { commission: '60' });
  assert.equal(app.element('summaryBarberFilter').value, 'Mateo');
  assert.equal(app.query('#summaryServiceFilter summary').textContent, 'Barba');
  assert.deepEqual(app.snapshot('[...document.querySelectorAll("#summaryServiceOptions input:checked")].map(input => input.value)'), ['Barba']);
});

test('CFG-014 - Cerrar catalogos cancela borradores sin crear elementos', (t) => {
  const app = createApp(t);
  const before = app.snapshot('config');
  for (const [add, dialog] of [['addBarberConfig', 'barberConfigDialog'], ['addProductConfig', 'productConfigDialog'], ['addServiceConfig', 'serviceConfigDialog']]) {
    app.click(`#${add}`);
    app.click(`#${dialog} .config-close`);
    assert.equal(app.element(dialog).open, false);
    app.click(`#${add}`);
    app.click(`#${dialog}`);
    assert.equal(app.element(dialog).open, false);
  }
  assert.deepEqual(app.snapshot('config'), before);
});
