import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../support/app.mjs';

test('NAV-011 - Reordenar bloquea el clic del control de pagos sin mutar registros', (t) => {
  const app = createApp(t);
  app.click('#reorderBarbers');
  assert.equal(app.emit('.barber-payment-control', 'click'), false);
  assert.deepEqual(app.snapshot('barberPayments'), {});
});

test('NAV-001 - El menu lateral alterna estado y accesibilidad', (t) => {
  const app = createApp(t);
  app.click('#sidebarToggle');
  assert.equal(app.query('.app-shell').classList.contains('sidebar-open'), true);
  assert.equal(app.element('sidebarToggle').getAttribute('aria-expanded'), 'true');
  app.click('#sidebarToggle');
  assert.equal(app.query('.app-shell').classList.contains('sidebar-open'), false);
  assert.equal(app.element('sidebarToggle').getAttribute('aria-expanded'), 'false');
});

test('NAV-002 - Cambiar vista deja una seccion activa y marca su pagina actual', (t) => {
  const app = createApp(t);
  for (const id of ['salesView', 'configView', 'summaryView', 'dailyView']) {
    app.click(`[data-view="${id}"]`);
    assert.equal(app.window.document.querySelectorAll('.view.active').length, 1);
    assert.equal(app.query('.view.active').id, id);
    assert.equal(app.query(`[data-view="${id}"]`).getAttribute('aria-current'), 'page');
  }
});

test('NAV-003 - Abrir resumen inicializa semana y cambiar mes actualiza opciones', (t) => {
  const app = createApp(t);
  app.click('[data-view="summaryView"]');
  assert.equal(app.element('summaryPeriod').value, 'week');
  assert.equal(app.element('summaryWeek').options.length, 4);
  app.element('summaryDate').value = '2026-06';
  app.emit('#summaryDate', 'change');
  assert.equal(app.element('summaryWeek').options.length, 5);
});

test('NAV-004 - Ordenar columnas y cancelar no altera el orden guardado', (t) => {
  const app = createApp(t);
  const original = app.snapshot('barbers');
  app.click('#reorderBarbers');
  const parent = app.element('barberColumns');
  parent.prepend(parent.lastElementChild);
  app.click('#cancelBarberOrder');
  assert.deepEqual(app.snapshot('barbers'), original);
  assert.equal(app.query('[data-barber-column]').dataset.barberColumn, original[0]);
});

test('NAV-005 - Aplicar orden guarda las columnas y conserva barberos inactivos', (t) => {
  const app = createApp(t);
  app.click('[data-config-active="barbers"][data-id="Mateo"]');
  app.click('#reorderBarbers');
  const parent = app.element('barberColumns');
  const last = parent.lastElementChild.dataset.barberColumn;
  parent.prepend(parent.lastElementChild);
  app.click('#reorderBarbers');
  assert.equal(app.run('barbers[0]'), last);
  assert.equal(app.run('config.barbers.at(-1).name'), 'Mateo');
  assert.equal(app.run('config.barbers.at(-1).active'), false);
  assert.equal(app.run('reorderingBarbers'), false);
});

test('NAV-006 - Los eventos de arrastre cambian orden pendiente sin guardar antes de aplicar', (t) => {
  const app = createApp(t);
  const original = app.snapshot('barbers');
  app.click('#reorderBarbers');
  const columns = app.element('barberColumns');
  const first = columns.firstElementChild;
  const last = columns.lastElementChild;
  const start = new app.window.Event('dragstart', { bubbles: true });
  Object.defineProperty(start, 'dataTransfer', { value: {} });
  first.dispatchEvent(start);
  assert.equal(first.classList.contains('dragging'), true);
  const over = new app.window.MouseEvent('dragover', { bubbles: true, cancelable: true, clientX: 10 });
  last.dispatchEvent(over);
  app.emit(first, 'dragend');
  assert.equal(first.classList.contains('dragging'), false);
  assert.equal(app.run('pendingBarberOrder.at(-1)'), original[0]);
  assert.deepEqual(app.snapshot('barbers'), original);
  app.click('#reorderBarbers');
  assert.equal(app.run('barbers.at(-1)'), original[0]);
});

test('NAV-007 - Detalles inexistentes o teclas distintas de Enter no abren dialogos', (t) => {
  const app = createApp(t);
  app.financialFixture();
  app.run('openDetail("missing"); openEditDialog("missing"); openSaleDetail("missing"); openAdvanceDetail("missing"); openExpenseDetail("missing")');
  for (const selector of ['[data-sale]', '[data-advance]', '[data-expense]']) app.emit(selector, 'keydown', { key: 'Escape' });
  for (const id of ['cutDialog', 'detailDialog', 'saleDetailDialog', 'advanceDetailDialog', 'expenseDetailDialog']) assert.equal(app.element(id).open, false);
});

test('NAV-008 - Los detalles escapan notas y cierran por boton o fondo', (t) => {
  const app = createApp(t);
  app.financialFixture();
  app.run('entries[0].notes = "<img src=x>"; sales[0].notes = "<img>"; advances[0].reason = "<img>"; expenses[0].reason = "<img>"');
  for (const [fn, id, dialog, detail, close] of [
    ['openDetail', 'a', 'detailDialog', 'cutDetail', 'closeDetailDialog'],
    ['openSaleDetail', 's1', 'saleDetailDialog', 'saleDetail', 'closeSaleDetail'],
    ['openAdvanceDetail', 'a1', 'advanceDetailDialog', 'advanceDetail', 'closeAdvanceDetail'],
    ['openExpenseDetail', 'e1', 'expenseDetailDialog', 'expenseDetail', 'closeExpenseDetail'],
  ]) {
    app.run(`${fn}("${id}")`);
    assert.equal(app.element(detail).querySelector('img'), null);
    app.click(`#${close}`);
    assert.equal(app.element(dialog).open, false);
    app.run(`${fn}("${id}")`);
    app.click(`#${dialog}`);
    assert.equal(app.element(dialog).open, false);
  }
});

test('NAV-009 - Editar un corte mixto conserva ceros explicitos y permite guardar notas', (t) => {
  const app = createApp(t);
  app.click('[data-barber="Mateo"]');
  app.setForm('cutForm', { service: 'Barba', amount: '1000', tip: '0', payment: 'Ambos', cashAmount: '0', mpAmount: '1000' });
  app.emit('#payment', 'change');
  app.submit('cutForm');
  app.click('[data-cut]');
  app.click('#editCut');
  assert.equal(app.element('cashAmount').value, '0');
  assert.equal(app.submit('cutForm', { notes: 'Solo nota' }), true);
  assert.equal(app.run('entries[0].notes'), 'Solo nota');
});

test('NAV-010 - Elegir un precio de catalogo limpia errores de cero al reabrir formularios', (t) => {
  const app = createApp(t);
  for (const [add, form, field, select, value, close] of [
    ['[data-barber="Mateo"]', 'cutForm', 'amount', '#service', 'Barba', 'closeDialog'],
    ['#addSale', 'saleForm', 'unitPrice', '#saleProduct', 'Pomada', 'closeSaleDialog'],
  ]) {
    app.click(add);
    app.query(select).value = value;
    app.submit(form, { [field]: '0' });
    assert.equal(app.element(form).elements.namedItem(field).validity.customError, true);
    app.click(`#${close}`);
    app.click(add);
    app.query(select).value = value;
    app.emit(select, 'change');
    assert.equal(app.submit(form), true);
  }
  assert.equal(app.run('entries.length'), 1);
  assert.equal(app.run('sales.length'), 1);
});
