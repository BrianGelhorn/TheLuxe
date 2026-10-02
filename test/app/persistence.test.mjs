import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../support/app.mjs';

const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const wait = async (app) => { await app.settle(); await app.settle(); };
const emptyState = () => ({
  config: { services: [], barbers: [], expenseCategories: [], commission: 50, commissionHistory: [] },
  entries: [], sales: [], advances: [], expenses: [], transfers: [], openingAdjustments: [], cashRegisters: {}, barberPayments: {},
  inventory: { version: 2, products: [], movements: [] },
});

test('PERSIST-001 - una DB vacía inicia sin demos e importa un único estado completo', async (t) => {
  const calls = [];
  const app = createApp(t, { clean: false, fetch: async (url, options = {}) => {
    calls.push({ url, options });
    return options.method === 'PUT' ? response({ revision: 1 }) : response({ revision: 0, state: null });
  } });
  await wait(app);
  assert.equal(app.run('entries.length'), 0);
  assert.deepEqual(app.snapshot('cashRegisters'), {});
  const put = calls.find((call) => call.options.method === 'PUT');
  assert.ok(put);
  const saved = JSON.parse(put.options.body).state;
  assert.equal(saved.entries.length, 0);
  assert.ok(saved.config.services.length);
  assert.ok(saved.inventory.products.length);
});

test('PERSIST-002 - hidrata todo y coalesce pago e inventario en un snapshot CAS', async (t) => {
  const puts = [];
  const state = {
    config: { services: [{ id: 'c', name: 'Corte', price: 1 }], barbers: [{ id: 'm', name: 'Mateo', active: true }], expenseCategories: [], commission: 50, commissionHistory: [] },
    entries: [{ id: 'cut', date: '2026-09-03', barber: 'Mateo', time: '10:00', service: 'Corte', amount: 1, tip: 0, payment: 'Efectivo' }],
    sales: [], advances: [], expenses: [], transfers: [], openingAdjustments: [],
    cashRegisters: { '2026-09-03': { opened: true, initialCash: 0, initialMp: 0 } }, barberPayments: {},
    inventory: { version: 2, products: [{ id: 'p', name: 'Pomada', saleEnabled: true, stockEnabled: true, salePrice: 1, active: true, unit: 'unidades', initialStock: 1, unitCost: 1, initialUnitCost: 1, startDate: '2026-09-03' }], movements: [] },
  };
  const app = createApp(t, { fetch: async (url, options = {}) => {
    if (options.method === 'PUT') { puts.push(JSON.parse(options.body)); return response({ revision: 8 + puts.length }); }
    return response({ revision: 8, state });
  } });
  await wait(app);
  assert.equal(app.run('entries[0].id'), 'cut');
  app.run("barberPayments['2026-09-03'] = { Mateo: { status: 'Efectivo', cashAmount: 1, mpAmount: 0 } }; saveBarberPayments(); saveInventory({ ...inventory, movements: [{ id: 'stock', productId: 'p', date: '2026-09-03', time: '10:01', type: 'consumo', quantity: 1, notes: '', cancelled: false, cost: 1 }] });");
  await wait(app);
  assert.equal(puts.length, 1);
  assert.equal(puts[0].revision, 8);
  assert.equal(puts[0].state.barberPayments['2026-09-03'].Mateo.status, 'Efectivo');
  assert.equal(puts[0].state.inventory.movements[0].id, 'stock');
});

test('PERSIST-003 - conflicto o fallo mantiene cambios pendientes sin sobrescribir', async (t) => {
  const app = createApp(t, { fetch: async (url, options = {}) => options.method === 'PUT' ? response({}, 409) : response({ revision: 4, state: { config: { services: [], barbers: [], expenseCategories: [], commission: 50, commissionHistory: [] }, entries: [], sales: [], advances: [], expenses: [], transfers: [], openingAdjustments: [], cashRegisters: {}, barberPayments: {}, inventory: { version: 2, products: [], movements: [] } } }) });
  await wait(app);
  app.run("entries.push({ id: 'local' }); save();");
  await wait(app);
  assert.equal(app.run('stateDirty'), true);
  assert.match(app.element('persistenceMessage').textContent, /No se sobrescribió la base/);
  assert.equal(app.element('retryPersistence').hidden, true);
});

test('PERSIST-030 - un 409 permite exportar el borrador y usar explícitamente la base sin sobrescribirla', async (t) => {
  const remote = emptyState();
  remote.entries = [{ id: 'remoto' }];
  remote.inventory.products = [{ id: 'p', name: 'Pomada', saleEnabled: true, stockEnabled: false, salePrice: 100, active: true }];
  let gets = 0, puts = 0, download, revoked;
  const app = createApp(t, { clean: false, fetch: async (url, options = {}) => {
    if (options.method === 'PUT') { puts++; return response({}, 409); }
    return response({ revision: gets++ ? 5 : 4, state: remote });
  } });
  await wait(app);
  app.run("entries.push({ id: 'local' }); save();");
  await wait(app);
  app.window.URL.createObjectURL = () => 'blob:pending';
  app.window.URL.revokeObjectURL = (url) => { revoked = url; };
  const click = app.window.HTMLAnchorElement.prototype.click;
  app.window.HTMLAnchorElement.prototype.click = function () { download = { href: this.href, name: this.download }; };
  app.click('#exportPendingState');
  app.window.HTMLAnchorElement.prototype.click = click;
  assert.equal(download.href, 'blob:pending');
  assert.match(download.name, /copia-sin-guardar/);
  await wait(app);
  assert.equal(revoked, 'blob:pending');
  assert.equal(app.query('.app-shell').inert, true);
  app.confirm(false);
  app.click('#useDatabaseState');
  assert.equal(gets, 1);
  assert.equal(app.run('stateConflict'), true);
  app.confirm(true);
  app.click('#useDatabaseState');
  await wait(app);
  assert.equal(puts, 1);
  assert.equal(app.run('stateConflict'), false);
  assert.equal(app.run('stateDirty'), false);
  assert.equal(app.run('entries[0].id'), 'remoto');
  assert.equal(app.query('.app-shell').inert, false);
  assert.equal(app.window.localStorage.getItem(app.run('pendingStateKey')), null);
  app.click('[data-stock-archive="p"]');
  assert.equal(app.run('inventory.products[0].active'), false, 'un solo manejador de inventario debe aplicar el cambio una vez');
});

test('PERSIST-027 - sin conexión el conflicto mantiene su respaldo y se puede descargar sin ObjectURL', async (t) => {
  const remote = emptyState();
  let reads = 0, download;
  const app = createApp(t, { clean: false, fetch: async (url, options = {}) => {
    if (options.method === 'PUT') return response({}, 409);
    if (reads++ === 0) return response({ revision: 1, state: remote });
    throw new Error('Sin conexión');
  } });
  await wait(app);
  app.run("entries.push({ id: 'local' }); save();");
  await wait(app);
  const click = app.window.HTMLAnchorElement.prototype.click;
  app.window.HTMLAnchorElement.prototype.click = function () { download = this.href; };
  app.click('#exportPendingState');
  app.window.HTMLAnchorElement.prototype.click = click;
  assert.match(download, /^data:application\/json/);
  app.click('#useDatabaseState');
  await wait(app);
  assert.equal(app.run('stateConflict'), true);
  assert.equal(app.query('.app-shell').inert, true);
  assert.ok(app.window.localStorage.getItem(app.run('pendingStateKey')));
  assert.match(app.element('persistenceMessage').textContent, /No se pudo cargar la versión de la base/);
});

test('PERSIST-028 - resolver conflicto no borra un respaldo que otra pestaña reemplazó mientras cargaba', async (t) => {
  const remote = emptyState();
  let reads = 0, finish;
  const app = createApp(t, { clean: false, fetch: async (url, options = {}) => {
    if (options.method === 'PUT') return response({}, 409);
    if (reads++ === 0) return response({ revision: 1, state: remote });
    return new Promise((resolve) => { finish = resolve; });
  } });
  await wait(app);
  app.run("entries.push({ id: 'local' }); save();");
  await wait(app);
  const key = app.run('pendingStateKey');
  app.click('#useDatabaseState');
  const newerBackup = JSON.stringify({ revision: 2, state: { ...remote, entries: [{ id: 'otra-pestaña' }] } });
  app.window.localStorage.setItem(key, newerBackup);
  finish(response({ revision: 2, state: remote }));
  await wait(app);
  assert.equal(app.run('stateConflict'), false);
  assert.equal(app.window.localStorage.getItem(key), newerBackup);
  assert.match(app.element('persistenceMessage').textContent, /no se pudo borrar la copia local/);
});

test('PERSIST-029 - una respuesta remota vacía no descarta el borrador en conflicto', async (t) => {
  let reads = 0;
  const app = createApp(t, { clean: false, fetch: async (url, options = {}) => {
    if (options.method === 'PUT') return response({}, 409);
    return reads++ === 0 ? response({ revision: 1, state: emptyState() }) : response({ revision: 2, state: null });
  } });
  await wait(app);
  app.run("entries.push({ id: 'local' }); save();");
  await wait(app);
  const backup = app.window.localStorage.getItem(app.run('pendingStateKey'));
  app.click('#useDatabaseState');
  await wait(app);
  assert.equal(app.run('stateConflict'), true);
  assert.equal(app.window.localStorage.getItem(app.run('pendingStateKey')), backup);
  assert.match(app.element('persistenceMessage').textContent, /No se pudo cargar la versión de la base/);
});

test('PERSIST-004 - un inventario local corrupto no inicializa una base vacía', async (t) => {
  let writes = 0;
  const app = createApp(t, { clean: false, storage: { 'theluxe-inventory-v1': '{invalid' }, fetch: async (url, options = {}) => {
    if (options.method === 'PUT') writes++;
    return response({ revision: 0, state: null });
  } });
  await wait(app);
  assert.equal(writes, 0);
  assert.equal(app.run('stateLoaded'), false);
  assert.equal(app.query('#persistenceNotice').closest('.app-shell'), null);
  assert.equal(app.element('retryPersistence').hidden, false);
  assert.match(app.element('persistenceMessage').textContent, /inventario local no es válido/i);
  assert.equal(app.window.localStorage.getItem('theluxe-inventory-v1'), '{invalid');
});

test('PERSIST-005 - un respaldo local corrupto no impide escribir en la base ya poblada', async (t) => {
  const saved = {
    config: { services: [], barbers: [], expenseCategories: [], commission: 50, commissionHistory: [] },
    entries: [], sales: [], advances: [], expenses: [], transfers: [], openingAdjustments: [], cashRegisters: {}, barberPayments: {},
    inventory: { version: 2, products: [], movements: [] },
  };
  const writes = [];
  const app = createApp(t, { clean: false, storage: { 'theluxe-inventory-v1': '{invalid' }, fetch: async (url, options = {}) => {
    if (options.method === 'PUT') { writes.push(JSON.parse(options.body)); return response({ revision: 2 }); }
    return response({ revision: 1, state: saved });
  } });
  await wait(app);
  assert.equal(app.run('stateLoaded'), true);
  assert.equal(app.run('inventoryReadError'), false);
  assert.equal(app.run("saveInventory({ ...inventory, products: [{ id: 'p', name: 'Pomada', saleEnabled: true, stockEnabled: false, salePrice: 100, active: true }] })"), true);
  await wait(app);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].state.inventory.products[0].id, 'p');
  assert.equal(app.window.localStorage.getItem('theluxe-inventory-v1'), '{invalid');
});

test('PERSIST-007 - un error de lectura bloquea y Reintentar carga sin pisar la base', async (t) => {
  let calls = 0;
  const app = createApp(t, { clean: false, fetch: async (url, options = {}) => {
    if (options.method === 'PUT') return response({ revision: 1 });
    if (++calls === 1) throw new Error('Sin red');
    return response({ revision: 0, state: null });
  } });
  await wait(app);
  assert.equal(app.run('stateLoaded'), false);
  assert.equal(app.element('retryPersistence').hidden, false);
  assert.equal(app.query('.app-shell').inert, true);
  app.click('#retryPersistence');
  await wait(app);
  assert.equal(app.run('stateLoaded'), true);
  assert.equal(app.run('stateRevision'), 1);
  assert.equal(app.query('.app-shell').inert, false);
});

test('PERSIST-008 - falla de escritura conserva borrador, bloquea actualización y permite reintentar', async (t) => {
  let writes = 0;
  const app = createApp(t, { clean: false, fetch: async (url, options = {}) => {
    if (options.method === 'PUT') return ++writes === 2 ? response({}, 503) : response({ revision: writes === 1 ? 1 : 2 });
    return response({ revision: 0, state: null });
  } });
  await wait(app);
  app.run("entries.push({ id: 'borrador' }); save();");
  await wait(app);
  assert.equal(app.run('stateDirty'), true);
  assert.equal(app.element('retryPersistence').hidden, false);
  await app.run('applyUpdate()');
  assert.match(app.alerts.at(-1), /cambios pendientes/);
  assert.equal(app.confirmations.length, 0);
  const unload = new app.window.Event('beforeunload', { cancelable: true });
  app.window.dispatchEvent(unload);
  assert.equal(unload.defaultPrevented, true);
  app.click('#retryPersistence');
  await wait(app);
  assert.equal(writes, 3);
  assert.equal(app.run('stateDirty'), false);
  assert.equal(app.run('stateRevision'), 2);
});

test('PERSIST-009 - cambios durante una escritura se guardan después con revisión nueva', async (t) => {
  const writes = [];
  let finish;
  const app = createApp(t, { clean: false, fetch: async (url, options = {}) => {
    if (options.method !== 'PUT') return response({ revision: 0, state: null });
    const body = JSON.parse(options.body);
    writes.push(body);
    if (writes.length === 2) return new Promise((resolve) => { finish = resolve; });
    return response({ revision: writes.length });
  } });
  await wait(app);
  app.run("entries.push({ id: 'primero' }); save();");
  await wait(app);
  assert.equal(app.run('stateSaving'), true);
  app.run("entries.push({ id: 'segundo' }); save();");
  finish(response({ revision: 2 }));
  await wait(app);
  assert.equal(writes.length, 3);
  assert.equal(writes[2].revision, 2);
  assert.deepEqual(writes[2].state.entries.map((row) => row.id), ['primero', 'segundo']);
});

test('PERSIST-010 - conflicto impide cambiar inventario sin reemplazar la versión remota', async (t) => {
  const app = createApp(t, { clean: false, fetch: async (url, options = {}) => options.method === 'PUT'
    ? response({}, 409) : response({ revision: 1, state: {
      config: { services: [], barbers: [], expenseCategories: [], commission: 50, commissionHistory: [] },
      entries: [], sales: [], advances: [], expenses: [], transfers: [], openingAdjustments: [], cashRegisters: {}, barberPayments: {},
      inventory: { version: 2, products: [], movements: [] },
    } }) });
  await wait(app);
  app.run("entries.push({ id: 'local' }); save();");
  await wait(app);
  assert.equal(app.run('stateConflict'), true);
  assert.equal(app.run("saveInventory({ ...inventory, products: [{ id: 'p', name: 'Pomada', saleEnabled: true, stockEnabled: false, salePrice: 100, active: true }] })"), false);
  assert.deepEqual(app.snapshot('inventory.products'), []);
});

test('PERSIST-011 - una respuesta de base malformada no se trata como datos vacíos', async (t) => {
  const app = createApp(t, { clean: false, fetch: async () => response({ revision: 1, state: { inventory: { version: 2, products: [], movements: [] } } }) });
  await wait(app);
  assert.equal(app.run('stateLoaded'), false);
  assert.equal(app.element('retryPersistence').hidden, false);
  assert.equal(app.query('.app-shell').inert, true);
});

test('PERSIST-012 - un acuse de escritura con revisión incorrecta no confirma el guardado', async (t) => {
  const app = createApp(t, { clean: false, fetch: async (url, options = {}) => options.method === 'PUT'
    ? response({ revision: 99 }) : response({ revision: 0, state: null }) });
  await wait(app);
  assert.equal(app.run('stateDirty'), true);
  assert.equal(app.element('retryPersistence').hidden, false);
  assert.match(app.element('persistenceMessage').textContent, /No se pudieron guardar/);
});

test('PERSIST-013 - inventario legado en una base existente se migra sin borrar las ventas', async (t) => {
  const app = createApp(t, { clean: false, fetch: async () => response({ revision: 2, state: {
    config: { services: [], barbers: [], expenseCategories: [], commission: 50, commissionHistory: [] },
    entries: [], sales: [], advances: [], expenses: [], transfers: [], openingAdjustments: [], cashRegisters: {}, barberPayments: {},
    inventory: { version: 1, products: [], movements: [] },
  } }) });
  await wait(app);
  assert.equal(app.run('stateLoaded'), true);
  assert.equal(app.run('inventory.version'), 2);
  assert.deepEqual(app.snapshot('inventory.products.map((product) => product.name)'), ['Pomada', 'Shampoo']);
});

test('PERSIST-014 - un borrador pendiente se recupera tras recargar y se elimina al confirmarlo', async (t) => {
  const cut = { id: 'c1', date: '2026-09-03', time: '12:00', barber: 'Mateo', service: 'Corte clásico', amount: 15000, tip: 0, payment: 'Efectivo' };
  let base;
  let writes = 0;
  const app = createApp(t, { clean: false, fetch: async (url, options = {}) => {
    if (options.method === 'PUT') {
      const state = JSON.parse(options.body).state;
      if (++writes === 1) { base = state; return response({ revision: 1 }); }
      return response({}, 503);
    }
    return response({ revision: 0, state: null });
  } });
  await wait(app);
  app.run(`entries.push(${JSON.stringify(cut)}); save()`);
  await wait(app);
  const key = app.run('pendingStateKey');
  const backup = app.window.localStorage.getItem(key);
  assert.ok(backup);
  assert.equal(JSON.parse(backup).state.entries[0].id, 'c1');

  const restored = createApp(t, { clean: false, storage: { [key]: backup }, session: { 'theluxe-tab-v1': app.window.sessionStorage.getItem('theluxe-tab-v1') }, fetch: async (url, options = {}) => options.method === 'PUT'
    ? response({ revision: 2 }) : response({ revision: 1, state: base }) });
  await wait(restored);
  assert.equal(restored.run('entries[0].id'), 'c1');
  assert.equal(restored.run('stateDirty'), false);
  assert.equal(restored.window.localStorage.getItem(key), null);
});

test('PERSIST-015 - una base avanzada no es reemplazada por el respaldo pendiente de otra sesión', async (t) => {
  const remote = {
    config: { services: [], barbers: [], expenseCategories: [], commission: 50, commissionHistory: [] },
    entries: [], sales: [], advances: [], expenses: [], transfers: [], openingAdjustments: [], cashRegisters: {}, barberPayments: {},
    inventory: { version: 2, products: [], movements: [] },
  };
  const pending = JSON.stringify({ revision: 1, state: { ...remote, entries: [{ id: 'local', date: '2026-09-03', time: '12:00', barber: 'Mateo', service: 'Corte', amount: 1000, payment: 'Efectivo' }] } });
  const key = 'theluxe-pending-state-v1:conflict-tab';
  let writes = 0;
  const app = createApp(t, { clean: false, storage: { [key]: pending }, session: { 'theluxe-tab-v1': 'conflict-tab' }, fetch: async (url, options = {}) => {
    if (options.method === 'PUT') writes++;
    return response({ revision: 2, state: remote });
  } });
  await wait(app);
  assert.equal(writes, 0);
  assert.equal(app.run('stateConflict'), true);
  assert.equal(app.query('.app-shell').inert, true);
  assert.equal(app.window.localStorage.getItem(key), pending);
});

test('PERSIST-016 - confirma un guardado previo cuyo acuse se perdió, sin repetir la escritura', async (t) => {
  const state = emptyState();
  const key = 'theluxe-pending-state-v1:acuse-perdido';
  let writes = 0;
  const app = createApp(t, { clean: false, storage: { [key]: JSON.stringify({ revision: 1, state }) }, session: { 'theluxe-tab-v1': 'acuse-perdido' }, fetch: async (url, options = {}) => {
    if (options.method === 'PUT') writes++;
    return response({ revision: 2, state });
  } });
  await wait(app);
  assert.equal(writes, 0);
  assert.equal(app.run('stateLoaded'), true);
  assert.equal(app.window.localStorage.getItem(key), null);
});

test('PERSIST-017 - si SQLite aún está vacío recupera un respaldo aunque el inventario local esté roto', async (t) => {
  const key = 'theluxe-pending-state-v1:semilla';
  let writes = 0;
  const app = createApp(t, { clean: false, storage: { [key]: JSON.stringify({ revision: 0, state: emptyState() }), 'theluxe-inventory-v1': '{broken' }, session: { 'theluxe-tab-v1': 'semilla' }, fetch: async (url, options = {}) => {
    if (options.method === 'PUT') { writes++; return response({ revision: 1 }); }
    return response({ revision: 0, state: null });
  } });
  await wait(app);
  assert.equal(writes, 1);
  assert.equal(app.run('stateLoaded'), true);
  assert.equal(app.window.localStorage.getItem(key), null);
  assert.equal(app.window.localStorage.getItem('theluxe-inventory-v1'), '{broken');
});

test('PERSIST-018 - un respaldo incompleto queda intacto y bloquea el inicio', async (t) => {
  const key = 'theluxe-pending-state-v1:incompleto';
  let writes = 0;
  const app = createApp(t, { clean: false, storage: { [key]: JSON.stringify({ revision: -1, state: emptyState() }) }, session: { 'theluxe-tab-v1': 'incompleto' }, fetch: async (url, options = {}) => {
    if (options.method === 'PUT') writes++;
    return response({ revision: 1, state: emptyState() });
  } });
  await wait(app);
  assert.equal(writes, 0);
  assert.equal(app.run('stateLoaded'), false);
  assert.equal(app.element('retryPersistence').hidden, false);
  assert.ok(app.window.localStorage.getItem(key));
});

test('PERSIST-019 - sin espacio para copia local muestra aviso antes de enviar a SQLite', async (t) => {
  const app = createApp(t, { clean: false, fetch: async (url, options = {}) => options.method === 'PUT'
    ? response({ revision: 1 }) : response({ revision: 0, state: null }) });
  await wait(app);
  const key = app.run('pendingStateKey');
  const original = app.window.Storage.prototype.setItem;
  t.mock.method(app.window.Storage.prototype, 'setItem', function (name, value) {
    if (name === key) throw new app.window.DOMException('Sin espacio', 'QuotaExceededError');
    return original.call(this, name, value);
  });
  app.run('queueStateSave()');
  assert.match(app.element('persistenceMessage').textContent, /No se pudo crear una copia/);
  await wait(app);
});

test('PERSIST-020 - JSON pendiente ilegible no se borra ni permite abrir una base nueva', async (t) => {
  const key = 'theluxe-pending-state-v1:json-roto';
  let writes = 0;
  const app = createApp(t, { clean: false, session: { 'theluxe-tab-v1': 'json-roto' }, storage: { [key]: '{roto' }, fetch: async (url, options = {}) => {
    if (options.method === 'PUT') writes++;
    return response({ revision: 0, state: null });
  } });
  await wait(app);
  assert.equal(writes, 0);
  assert.equal(app.run('stateLoaded'), false);
  assert.equal(app.window.localStorage.getItem(key), '{roto');
});

test('PERSIST-021 - si sessionStorage no se puede leer, el respaldo usa una clave de reserva', async (t) => {
  const app = createApp(t, { clean: false, sessionReadError: true, fetch: async (url, options = {}) => options.method === 'PUT'
    ? response({ revision: 1 }) : response({ revision: 0, state: null }) });
  await wait(app);
  assert.equal(app.run('pendingStateKey'), 'theluxe-pending-state-v1');
  assert.equal(app.run('stateLoaded'), true);
});

test('PERSIST-022 - un fallo al limpiar el respaldo no invalida una escritura ya confirmada', async (t) => {
  let finishRead;
  const app = createApp(t, { clean: false, fetch: async (url, options = {}) => options.method === 'PUT'
    ? response({ revision: 1 }) : new Promise((resolve) => { finishRead = resolve; }) });
  await app.settle();
  const key = app.run('pendingStateKey');
  const removeItem = app.window.Storage.prototype.removeItem;
  t.mock.method(app.window.Storage.prototype, 'removeItem', function (name) {
    if (name === key) throw new app.window.DOMException('Almacenamiento bloqueado', 'SecurityError');
    return removeItem.call(this, name);
  });
  finishRead(response({ revision: 0, state: null }));
  await wait(app);
  assert.equal(app.run('stateRevision'), 1);
  assert.equal(app.run('stateDirty'), false);
  assert.ok(app.window.localStorage.getItem(key));
});

test('PERSIST-023 - un evento del inventario local viejo no reemplaza el estado de SQLite', async (t) => {
  let writes = 0;
  const app = createApp(t, { clean: false, fetch: async (url, options = {}) => {
    if (options.method === 'PUT') writes++;
    return response({ revision: 1, state: emptyState() });
  } });
  await wait(app);
  app.window.localStorage.setItem('theluxe-inventory-v1', JSON.stringify({ version: 2, products: [{ id: 'otro', name: 'Otro', saleEnabled: true, stockEnabled: false, salePrice: 100, active: true }], movements: [] }));
  app.window.dispatchEvent(new app.window.StorageEvent('storage', { key: 'theluxe-inventory-v1', storageArea: app.window.localStorage, url: app.window.location.href }));
  assert.deepEqual(app.snapshot('inventory.products'), []);
  assert.equal(writes, 0);
});

test('PERSIST-024 - una pestaña duplicada cambia su clave antes de leer el respaldo de la original', async (t) => {
  const listeners = [];
  class Channel {
    constructor() { listeners.push(this); }
    postMessage(data) { for (const peer of listeners) if (peer !== this && !peer.closed) queueMicrotask(() => peer.onmessage?.({ data })); }
    close() { this.closed = true; }
  }
  let state = null, revision = 0;
  const fetch = async (url, options = {}) => {
    if (options.method === 'PUT') { state = JSON.parse(options.body).state; return response({ revision: ++revision }); }
    return response({ revision, state });
  };
  const original = createApp(t, { clean: false, session: { 'theluxe-tab-v1': 'compartida' }, broadcastChannel: Channel, uuidPrefix: 'original', fetch });
  await new Promise((resolve) => setTimeout(resolve, 80));
  await wait(original);
  const previousKey = original.run('pendingStateKey');
  const duplicated = createApp(t, { clean: false, session: { 'theluxe-tab-v1': 'compartida' }, storage: { [previousKey]: '{respaldo-de-otra-pestaña' }, broadcastChannel: Channel, uuidPrefix: 'duplicada', fetch });
  await new Promise((resolve) => setTimeout(resolve, 80));
  await wait(duplicated);
  assert.notEqual(duplicated.run('pendingStateKey'), previousKey);
  assert.equal(duplicated.run('stateLoaded'), true);
  assert.equal(duplicated.window.localStorage.getItem(previousKey), '{respaldo-de-otra-pestaña');
});

test('PERSIST-025 - la versión instalada no opera en modo temporal sin fetch', (t) => {
  const app = createApp(t, { clean: false, buildVersion: 'a'.repeat(64) });
  assert.equal(app.query('.app-shell').inert, true);
  assert.match(app.element('persistenceMessage').textContent, /no puede conectarse a la base/);
});

test('PERSIST-026 - un pago simple antiguo congela su importe al hidratar y no cambia con la comisión', async (t) => {
  const legacy = emptyState();
  legacy.entries = [{ id: 'c', date: '2026-09-03', time: '12:00', barber: 'Mateo', service: 'Corte', amount: 1000, tip: 0, payment: 'Efectivo', commissionRate: 50, commissionAmount: 500 }];
  legacy.advances = [{ id: 'a', date: '2026-09-03', time: '11:00', barber: 'Mateo', payment: 'Efectivo', amount: 100, reason: 'Adelanto' }];
  legacy.barberPayments = { '2026-09-03': { Mateo: 'Efectivo' } };
  const writes = [];
  const app = createApp(t, { clean: false, fetch: async (url, options = {}) => {
    if (options.method === 'PUT') { writes.push(JSON.parse(options.body)); return response({ revision: 3 + writes.length }); }
    return response({ revision: 3, state: legacy });
  } });
  await wait(app);
  assert.equal(app.run('barberPaymentRecord("Mateo").paidAmount'), 400);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].state.barberPayments['2026-09-03'].Mateo.paidAmount, 400);
  app.run('entries[0].commissionAmount = 800; save()');
  await wait(app);
  assert.equal(writes[1].state.barberPayments['2026-09-03'].Mateo.paidAmount, 400);
  assert.equal(app.run('barberSettlement(entries, advances, barberPaymentRecord("Mateo")).paidCash'), 400);
});
