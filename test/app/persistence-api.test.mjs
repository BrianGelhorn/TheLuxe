import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createApi } from '../../api.mjs';
import { createApp } from '../support/app.mjs';

test('PERSIST-006 - venta y stock se guardan juntos y sobreviven a otra sesión', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'theluxe-ui-api-'));
  const server = createApi({ databasePath: join(dir, 'state.sqlite') });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); await rm(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const apiFetch = (url, options = {}) => fetch(base + url, { ...options, headers: { ...options.headers, Origin: 'http://127.0.0.1:8000' } });
  const state = () => fetch(base + '/api/state').then((res) => res.json());
  const until = async (condition) => {
    for (let attempt = 0; attempt < 50; attempt++) {
      if (await condition()) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error('No se confirmó la persistencia a tiempo.');
  };

  const app = createApp(t, { clean: false, fetch: apiFetch });
  await until(() => app.run('stateLoaded && !stateSaving && !stateDirty'));
  assert.equal(app.run('entries.length'), 0);
  app.run("cashRegisters[workday.value] = { opened: true, initialCash: 0, initialMp: 0 }; saveCashRegisters();");
  await until(() => app.run('!stateSaving && !stateDirty'));
  app.render();
  assert.equal(app.run("saveInventory({ ...inventory, products: inventory.products.map(p => p.id === 'pomada' ? { ...p, stockEnabled: true, unit: 'unidades', initialStock: 5, unitCost: 100, startDate: workday.value } : p) })"), true);
  await until(() => app.run('!stateSaving && !stateDirty'));

  app.click('#addSale');
  app.setForm('saleForm', { product: 'pomada', quantity: '2' });
  app.emit('#saleProduct', 'change');
  assert.equal(app.submit('saleForm'), true, [...app.element('saleForm').elements].filter((field) => !field.checkValidity()).map((field) => `${field.name}: ${field.validationMessage}`).join(', '));
  await until(async () => (await state()).state?.sales.length === 1);
  const persisted = (await state()).state;
  assert.equal(persisted.sales[0].quantity, 2);
  assert.equal(persisted.inventory.movements[0].sourceId, persisted.sales[0].id);
  assert.equal(persisted.inventory.movements[0].quantity, 2);

  app.click('[data-stock-edit="pomada"]');
  app.submit('stockProductForm', { stockName: 'Pomada mate', currentStock: 4, unitCost: '200' });
  await until(async () => (await state()).state?.inventory.products.find((item) => item.id === 'pomada').name === 'Pomada mate');
  await until(() => app.run('!stateSaving && !stateDirty'));
  const edited = (await state()).state;
  assert.deepEqual(edited.sales, persisted.sales);
  assert.deepEqual(edited.inventory.movements[0], persisted.inventory.movements[0]);
  assert.equal(edited.inventory.products.find((item) => item.id === 'pomada').initialStock, 5);
  assert.equal(edited.inventory.movements[1].quantity, 1);

  app.click('[data-stock-edit="pomada"]');
  app.click('#stockProductForm [name="saleEnabled"]');
  app.submit('stockProductForm');
  await until(async () => (await state()).state?.inventory.products.find((item) => item.id === 'pomada').saleEnabled === false);
  await until(() => app.run('!stateSaving && !stateDirty'));
  const reclassified = (await state()).state;
  assert.deepEqual(reclassified.sales, edited.sales);
  assert.deepEqual(reclassified.inventory.movements, edited.inventory.movements);

  const reloaded = createApp(t, { clean: false, fetch: apiFetch });
  await until(() => reloaded.run('stateLoaded'));
  assert.equal(reloaded.run('sales.length'), 1);
  assert.equal(reloaded.run("inventorySummary(inventory.products.find(p => p.id === 'pomada'), inventory.movements, workday.value).stock"), 4);
  assert.equal(reloaded.run("inventory.products.find(p => p.id === 'pomada').name"), 'Pomada mate');
  assert.equal(reloaded.run("inventory.products.find(p => p.id === 'pomada').saleEnabled"), false);
  assert.equal(reloaded.run("inventory.products.find(p => p.id === 'pomada').supplyEnabled"), true);
  assert.equal(reloaded.run("cashRegisters[workday.value].opened"), true);
});
