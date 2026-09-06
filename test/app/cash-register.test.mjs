import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../support/app.mjs';

function balances(app, cash, mp) {
  assert.deepEqual(app.snapshot('[dayBalance("Efectivo"), dayBalance("Mercado Pago")]'), [cash, mp]);
  for (const id of ['cashTotal', 'theoreticalCash', 'transferCashAvailable']) assert.equal(app.element(id).textContent, app.money(cash), id);
  for (const id of ['mpTotal', 'theoreticalMp', 'transferMpAvailable']) assert.equal(app.element(id).textContent, app.money(mp), id);
}

test('REG-001 - Sin apertura ni cierre anterior se bloquean las operaciones', (t) => {
  const app = createApp(t);
  app.seed({ cashRegisters: {} });
  app.render();
  assert.equal(app.element('openingStatus').textContent, 'Pendiente');
  assert.equal(app.element('openingCashForm').hidden, false);
  assert.equal(app.element('openingSaved').hidden, true);
  assert.equal(app.run('isDayOpen(workday.value)'), false);
  for (const selector of ['#addSale', '#addAdvance', '#addExpense', '[data-barber="Mateo"]', '#transferForm button', '#cashRegisterForm button']) {
    assert.equal(app.query(selector).disabled, true, selector);
    app.click(selector);
  }
  for (const id of ['cutDialog', 'saleDialog', 'advanceDialog', 'expenseDialog']) assert.equal(app.element(id).open, false, id);
  assert.deepEqual(app.snapshot('cashRegisters'), {});
  balances(app, 0, 0);
});

test('REG-002 - La apertura exige ambos importes por validacion nativa', (t) => {
  const app = createApp(t);
  app.seed({ cashRegisters: {} });
  app.render();
  for (const name of ['initialCash', 'initialMp']) {
    assert.equal(app.submit('openingCashForm', { initialCash: '0', initialMp: '0', [name]: '' }), false, name);
    assert.equal(app.element('openingCashForm').elements.namedItem(name).validity.valueMissing, true, name);
    assert.deepEqual(app.snapshot('cashRegisters'), {});
  }
});

test('REG-003 - Abrir con ceros habilita operaciones y conserva la comision diaria', (t) => {
  const app = createApp(t);
  app.seed({ cashRegisters: { '2026-09-03': { commissionRate: 0 } } });
  app.render();
  assert.equal(app.submit('openingCashForm', { initialCash: '0', initialMp: '0' }), true);
  assert.equal(app.run('isDayOpen(workday.value)'), true);
  assert.deepEqual(app.snapshot('(({ initialCash, initialMp, opened, commissionRate }) => ({ initialCash, initialMp, opened, commissionRate }))(cashRegisters[workday.value])'), {
    initialCash: 0, initialMp: 0, opened: true, commissionRate: 0,
  });
  assert.equal(app.element('openingCashForm').hidden, true);
  assert.equal(app.element('openingSaved').hidden, false);
  for (const selector of ['#addSale', '#addAdvance', '#addExpense', '[data-barber="Mateo"]', '#transferForm button', '#cashRegisterForm button']) assert.equal(app.query(selector).disabled, false, selector);
  assert.equal(app.run('openingAdjustments.length'), 0);
  balances(app, 0, 0);
});

test('REG-004 - La apertura formatea importes y guarda fecha y saldos iniciales', (t) => {
  const app = createApp(t);
  app.seed({ cashRegisters: {} });
  app.render();
  app.input('#openingCashForm [name="initialCash"]', '12500');
  app.input('#openingCashForm [name="initialMp"]', '8700');
  assert.equal(app.element('openingCashForm').elements.initialCash.value, '12.500');
  app.click('#openingCashForm button[type="submit"]');
  assert.equal(app.run('cashRegisters[workday.value].openedAt'), app.run('new Date().toISOString()'));
  assert.equal(app.run('cashRegisters[workday.value].updatedAt'), app.run('new Date().toISOString()'));
  assert.equal(app.element('openingCashValue').textContent, app.money(12500));
  assert.equal(app.element('openingMpValue').textContent, app.money(8700));
  assert.equal(app.element('openingStatus').textContent, 'Jornada iniciada');
  balances(app, 12500, 8700);
});

test('REG-005 - Editar apertura requiere motivo nativo y no guarda si falta', (t) => {
  const app = createApp(t);
  app.financialFixture();
  const before = app.snapshot('cashRegisters');
  app.click('#editOpeningCash');
  assert.equal(app.element('openingCashForm').hidden, false);
  assert.equal(app.element('openingEditDescription').hidden, false);
  assert.equal(app.element('openingCashForm').elements.editDescription.required, true);
  assert.equal(app.submit('openingCashForm', { initialCash: '1200', editDescription: '' }), false);
  assert.equal(app.element('openingCashForm').elements.editDescription.validity.valueMissing, true);
  assert.deepEqual(app.snapshot('cashRegisters'), before);
  assert.equal(app.run('openingAdjustments.length'), 0);
});

test('REG-006 - El motivo con espacios se rechaza y cancelar limpia su error', (t) => {
  const app = createApp(t);
  app.click('#editOpeningCash');
  app.submit('openingCashForm', { initialCash: '100', editDescription: '   ' });
  assert.equal(app.element('openingCashForm').elements.editDescription.validity.customError, true);
  assert.equal(app.run('cashRegisters[workday.value].initialCash'), 0);
  app.click('#cancelOpeningEdit');
  assert.equal(app.element('openingCashForm').elements.editDescription.validity.customError, false);
  assert.equal(app.element('openingCashForm').hidden, true);
  assert.equal(app.run('editingOpening'), false);
  assert.equal(app.run('openingAdjustments.length'), 0);
});

test('REG-007 - Editar ambos medios registra diferencias sin sumarlas dos veces', (t) => {
  const app = createApp(t);
  app.financialFixture();
  app.click('#editOpeningCash');
  app.submit('openingCashForm', { initialCash: '1.500', initialMp: '1.700', editDescription: '  Arqueo  ' });
  assert.deepEqual(app.snapshot('openingAdjustments.map(({ id, ...row }) => row)'), [
    { date: '2026-09-03', time: '12:00', medium: 'Efectivo', previous: 1000, current: 1500, description: 'Arqueo' },
    { date: '2026-09-03', time: '12:00', medium: 'Mercado Pago', previous: 2000, current: 1700, description: 'Arqueo' },
  ]);
  assert.equal(app.element('transferCount').textContent, '3');
  assert.equal(app.element('transferRows').querySelectorAll('[data-delete-transfer]').length, 1);
  assert.equal(app.run('cashRegisters[workday.value].autoOpened'), false);
  balances(app, 3350, 4600);
  app.render();
  balances(app, 3350, 4600);
  assert.equal(app.run('openingAdjustments.length'), 2);
});

test('REG-008 - Cambiar solo un medio genera un unico ajuste firmado', (t) => {
  const app = createApp(t);
  app.financialFixture();
  app.click('#editOpeningCash');
  app.submit('openingCashForm', { initialCash: '600', editDescription: 'Menos efectivo' });
  assert.deepEqual(app.snapshot('openingAdjustments.map(({ medium, previous, current }) => [medium, previous, current])'), [['Efectivo', 1000, 600]]);
  assert.deepEqual(app.snapshot('cashMovements([], openingAdjustments).map(({ amount }) => amount)'), [-400]);
  balances(app, 2450, 4900);
});

test('REG-009 - Guardar apertura sin diferencias no crea ajustes ni pierde cierre', (t) => {
  const app = createApp(t);
  app.seed({ cashRegisters: { '2026-09-03': { opened: true, initialCash: 1000, initialMp: 2000, autoOpened: true, inheritedFrom: '2026-09-01', commissionRate: 60, realCash: 900, realMp: 1900, withdrawal: 100 } } });
  app.render();
  app.click('#editOpeningCash');
  app.submit('openingCashForm', { editDescription: 'Sin diferencias' });
  assert.equal(app.run('openingAdjustments.length'), 0);
  assert.deepEqual(app.snapshot('(({ autoOpened, inheritedFrom, commissionRate, realCash, realMp, withdrawal }) => ({ autoOpened, inheritedFrom, commissionRate, realCash, realMp, withdrawal }))(cashRegisters[workday.value])'), {
    autoOpened: true, inheritedFrom: '2026-09-01', commissionRate: 60, realCash: 900, realMp: 1900, withdrawal: 100,
  });
  balances(app, 1000, 2000);
});

test('REG-010 - Cancelar edicion restaura apertura y no crea movimientos', (t) => {
  const app = createApp(t);
  app.financialFixture();
  const before = app.snapshot('cashRegisters');
  app.click('#editOpeningCash');
  app.input('#openingCashForm [name="initialCash"]', '999');
  app.setForm('openingCashForm', { editDescription: 'No guardar' });
  app.click('#cancelOpeningEdit');
  assert.deepEqual(app.snapshot('cashRegisters'), before);
  assert.equal(app.element('openingCashForm').elements.initialCash.value, '1.000');
  assert.equal(app.element('openingCashForm').elements.editDescription.value, '');
  assert.equal(app.run('openingAdjustments.length'), 0);
  balances(app, 2850, 4900);
});

test('REG-011 - Cambiar jornada sale de la edicion de apertura', (t) => {
  const app = createApp(t);
  app.click('#editOpeningCash');
  app.input('#openingCashForm [name="initialCash"]', '999');
  app.element('workday').value = '2026-09-02';
  app.emit('#workday', 'change');
  assert.equal(app.run('editingOpening'), false);
  assert.equal(app.element('openingCashForm').elements.initialCash.value, '');
  assert.equal(app.element('openingCashForm').elements.editDescription.required, false);
  assert.equal(app.run('cashRegisters["2026-09-03"].initialCash'), 0);
  assert.equal(app.run('openingAdjustments.length'), 0);
});

test('REG-012 - La apertura hereda el ultimo cierre anterior aunque haya dias vacios', (t) => {
  const app = createApp(t);
  app.seed({ cashRegisters: {
    '2026-09-04': { realCash: 99999, realMp: 99999, withdrawal: 0 },
    '2026-08-31': { realCash: 9000, realMp: 12000, withdrawal: 2000 },
    '2026-09-02': { opened: true, initialCash: 777, initialMp: 888 },
    '2026-08-27': { realCash: 100, realMp: 200, withdrawal: 0 },
  } });
  app.render();
  assert.equal(app.run('previousClosedRegister(workday.value).date'), '2026-08-31');
  assert.deepEqual(app.snapshot('(({ initialCash, initialMp, opened, autoOpened, inheritedFrom }) => ({ initialCash, initialMp, opened, autoOpened, inheritedFrom }))(cashRegisters[workday.value])'), {
    initialCash: 7000, initialMp: 12000, opened: true, autoOpened: true, inheritedFrom: '2026-08-31',
  });
  assert.equal(app.run('cashRegisters[workday.value].openedAt'), app.run('new Date().toISOString()'));
  balances(app, 7000, 12000);
  const before = app.snapshot('cashRegisters');
  app.render();
  assert.deepEqual(app.snapshot('cashRegisters'), before);
});

test('REG-013 - Inicializar desde cierre conserva un override diario de cero', (t) => {
  const app = createApp(t);
  app.seed({ cashRegisters: {
    '2026-09-01': { realCash: 900, realMp: 1200, withdrawal: 200, commissionRate: 80 },
    '2026-09-03': { commissionRate: 0 },
  } });
  app.render();
  assert.equal(app.run('cashRegisters[workday.value].commissionRate'), 0);
  assert.equal(app.run('effectiveCommission(workday.value)'), 0);
  balances(app, 700, 1200);
  app.click('[data-barber="Mateo"]');
  app.submit('cutForm', { service: 'Barba', amount: '1000' });
  assert.equal(app.run('entries[0].commissionAmount'), 0);
});

test('REG-014 - Una apertura manual existente no se reemplaza por herencia', (t) => {
  const app = createApp(t);
  app.seed({ cashRegisters: {
    '2026-09-02': { realCash: 9000, realMp: 12000, withdrawal: 2000 },
    '2026-09-03': { opened: true, initialCash: 300, initialMp: 400, commissionRate: 65 },
  } });
  const before = app.snapshot('cashRegisters');
  app.render();
  assert.equal(app.run('initializeOpening(workday.value)'), false);
  assert.deepEqual(app.snapshot('cashRegisters'), before);
  balances(app, 300, 400);
});

test('REG-015 - Los inputs del cierre muestran diferencias y proxima apertura sin guardar', (t) => {
  const app = createApp(t);
  app.financialFixture();
  app.input('#cashRegisterForm [name="realCash"]', '2900');
  app.input('#cashRegisterForm [name="realMp"]', '4800');
  app.input('#cashRegisterForm [name="withdrawal"]', '400');
  assert.equal(app.element('cashDifference').textContent, app.money(50));
  assert.equal(app.element('mpDifference').textContent, app.money(-100));
  assert.equal(app.element('nextOpeningCash').textContent, `${app.money(2500)} efectivo`);
  assert.equal(app.element('nextOpeningMp').textContent, `${app.money(4800)} MP`);
  assert.equal(app.element('closingStatus').textContent, 'Pendiente');
  assert.equal(app.run('"realCash" in cashRegisters[workday.value]'), false);
  balances(app, 2850, 4900);
});

test('REG-016 - El cierre exige efectivo MP y retiro por required', (t) => {
  const app = createApp(t);
  const before = app.snapshot('cashRegisters');
  for (const name of ['realCash', 'realMp', 'withdrawal']) {
    assert.equal(app.submit('cashRegisterForm', { realCash: '0', realMp: '0', withdrawal: '0', [name]: '' }), false, name);
    assert.equal(app.element('cashRegisterForm').elements.namedItem(name).validity.valueMissing, true, name);
    assert.deepEqual(app.snapshot('cashRegisters'), before);
  }
});

test('REG-017 - El retiro mayor al efectivo real se rechaza y permite correccion', (t) => {
  const app = createApp(t);
  app.submit('cashRegisterForm', { realCash: '100', realMp: '200', withdrawal: '101' });
  assert.equal(app.element('cashRegisterForm').elements.withdrawal.validity.customError, true);
  assert.match(app.element('cashRegisterForm').elements.withdrawal.validationMessage, /El retiro no puede superar/);
  assert.equal(app.run('"realCash" in cashRegisters[workday.value]'), false);
  assert.equal(app.run('cashRegisters["2026-09-04"]'), undefined);
  app.input('#cashRegisterForm [name="withdrawal"]', '40');
  app.submit('cashRegisterForm');
  assert.equal(app.run('cashRegisters["2026-09-04"].initialCash'), 60);
});

test('REG-018 - Retirar todo el efectivo deja apertura cero y conserva MP', (t) => {
  const app = createApp(t);
  assert.equal(app.submit('cashRegisterForm', { realCash: '1500', realMp: '2700', withdrawal: '1500' }), true);
  assert.deepEqual(app.snapshot('[cashRegisters["2026-09-04"].initialCash, cashRegisters["2026-09-04"].initialMp]'), [0, 2700]);
  assert.equal(app.element('closingStatus').textContent, 'Cierre guardado');
  assert.equal(app.element('closingStatus').classList.contains('closed'), true);
});

test('REG-019 - Guardar cierre conserva apertura y comision sin restar retiro al saldo diario', (t) => {
  const app = createApp(t);
  app.financialFixture();
  app.run('cashRegisters[workday.value].commissionRate = 60');
  app.submit('cashRegisterForm', { realCash: '3000', realMp: '5000', withdrawal: '400' });
  assert.deepEqual(app.snapshot('(({ initialCash, initialMp, commissionRate, realCash, realMp, withdrawal }) => ({ initialCash, initialMp, commissionRate, realCash, realMp, withdrawal }))(cashRegisters[workday.value])'), {
    initialCash: 1000, initialMp: 2000, commissionRate: 60, realCash: 3000, realMp: 5000, withdrawal: 400,
  });
  assert.equal(app.run('cashRegisters[workday.value].closedAt'), app.run('new Date().toISOString()'));
  assert.deepEqual(app.snapshot('[cashRegisters["2026-09-04"].initialCash, cashRegisters["2026-09-04"].initialMp]'), [2600, 5000]);
  assert.equal(app.run('cashRegisters["2026-09-04"].commissionRate'), undefined);
  assert.equal(app.run('effectiveCommission("2026-09-04")'), 50);
  balances(app, 2850, 4900);
});

test('REG-020 - Cerrar fin de anio inicializa la fecha siguiente correcta', (t) => {
  const app = createApp(t, { now: '2026-12-31T23:30:00' });
  app.seed({ cashRegisters: { '2026-12-31': { opened: true, initialCash: 100, initialMp: 200 } } });
  app.render();
  app.submit('cashRegisterForm', { realCash: '900', realMp: '1200', withdrawal: '200' });
  assert.equal(app.run('cashRegisters["2027-01-01"].inheritedFrom'), '2026-12-31');
  app.element('workday').value = '2027-01-01';
  app.emit('#workday', 'change');
  balances(app, 700, 1200);
  assert.equal(app.element('dailyCount').textContent, '0 cortes');
});

test('REG-021 - Corregir cierre actualiza la apertura automatica siguiente y su override', (t) => {
  const app = createApp(t);
  app.submit('cashRegisterForm', { realCash: '1000', realMp: '2000', withdrawal: '100' });
  app.run('cashRegisters["2026-09-04"].commissionRate = 0');
  app.submit('cashRegisterForm', { realCash: '1800', realMp: '2400', withdrawal: '300' });
  assert.deepEqual(app.snapshot('(({ initialCash, initialMp, commissionRate, autoOpened, inheritedFrom }) => ({ initialCash, initialMp, commissionRate, autoOpened, inheritedFrom }))(cashRegisters["2026-09-04"])'), {
    initialCash: 1500, initialMp: 2400, commissionRate: 0, autoOpened: true, inheritedFrom: '2026-09-03',
  });
  assert.equal(app.run('openingAdjustments.length'), 0);
});

test('REG-022 - Corregir cierre no pisa una apertura siguiente editada manualmente', (t) => {
  const app = createApp(t);
  app.submit('cashRegisterForm', { realCash: '1000', realMp: '2000', withdrawal: '100' });
  app.element('workday').value = '2026-09-04';
  app.emit('#workday', 'change');
  app.click('#editOpeningCash');
  app.submit('openingCashForm', { initialCash: '800', initialMp: '1900', editDescription: 'Arqueo manual' });
  const next = app.snapshot('cashRegisters["2026-09-04"]');
  app.element('workday').value = '2026-09-03';
  app.emit('#workday', 'change');
  app.submit('cashRegisterForm', { realCash: '1800', realMp: '2400', withdrawal: '300' });
  assert.deepEqual(app.snapshot('cashRegisters["2026-09-04"]'), next);
});

test('REG-023 - Corregir cierre actualiza la apertura heredada aunque haya salto de fechas', (t) => {
  const app = createApp(t);
  app.seed({ cashRegisters: {
    '2026-09-01': { opened: true, initialCash: 0, initialMp: 0, realCash: 1000, realMp: 2000, withdrawal: 100 },
  } });
  app.render();
  assert.equal(app.run('cashRegisters["2026-09-03"].inheritedFrom'), '2026-09-01');
  app.run('cashRegisters["2026-09-03"].commissionRate = 65');
  app.element('workday').value = '2026-09-01';
  app.emit('#workday', 'change');
  app.submit('cashRegisterForm', { realCash: '1800', realMp: '2400', withdrawal: '300' });
  assert.deepEqual(app.snapshot('[cashRegisters["2026-09-03"].initialCash, cashRegisters["2026-09-03"].initialMp, cashRegisters["2026-09-03"].commissionRate]'), [1500, 2400, 65]);
  app.element('workday').value = '2026-09-03';
  app.emit('#workday', 'change');
  balances(app, 1500, 2400);
});

test('REG-024 - Corregir un cierre no cambia herencias de otro cierre', (t) => {
  const app = createApp(t);
  app.seed({ cashRegisters: {
    '2026-09-01': { opened: true, initialCash: 0, initialMp: 0, realCash: 100, realMp: 200, withdrawal: 0 },
    '2026-09-02': { opened: true, initialCash: 100, initialMp: 200, realCash: 500, realMp: 600, withdrawal: 0 },
    '2026-09-03': { opened: true, initialCash: 500, initialMp: 600, autoOpened: true, inheritedFrom: '2026-09-02' },
  } });
  const next = app.snapshot('cashRegisters["2026-09-03"]');
  app.element('workday').value = '2026-09-01';
  app.emit('#workday', 'change');
  app.submit('cashRegisterForm', { realCash: '900', realMp: '1000', withdrawal: '100' });
  assert.deepEqual(app.snapshot('cashRegisters["2026-09-03"]'), next);
});

test('REG-025 - Los cierres guardados se restauran al volver a cada jornada', (t) => {
  const app = createApp(t);
  app.submit('cashRegisterForm', { realCash: '1000', realMp: '2000', withdrawal: '100' });
  app.element('workday').value = '2026-09-04';
  app.emit('#workday', 'change');
  assert.equal(app.element('cashRegisterForm').elements.realCash.value, '');
  app.submit('cashRegisterForm', { realCash: '800', realMp: '1800', withdrawal: '200' });
  app.element('workday').value = '2026-09-03';
  app.emit('#workday', 'change');
  assert.deepEqual(['realCash', 'realMp', 'withdrawal'].map((name) => app.element('cashRegisterForm').elements.namedItem(name).value), ['1.000', '2.000', '100']);
  app.element('summaryPeriod').value = 'month';
  app.emit('#summaryPeriod', 'change');
  assert.equal(app.element('summaryWithdrawals').textContent, app.money(300));
  assert.equal(app.element('summaryRows').children.length, 2);
  balances(app, 0, 0);
});

test('REG-026 - Transferir todo el efectivo resta origen y suma destino', (t) => {
  const app = createApp(t);
  app.financialFixture();
  app.submit('transferForm', { from: 'Efectivo', amount: '2.850', description: '  Deposito  ' });
  assert.deepEqual(app.snapshot('transfers.at(-1)'), {
    id: app.run('transfers.at(-1).id'), from: 'Efectivo', to: 'Mercado Pago', amount: 2850,
    description: 'Deposito', date: '2026-09-03', time: '12:00',
  });
  balances(app, 0, 7750);
  assert.equal(app.element('transferForm').elements.amount.value, '');
  assert.equal(app.element('transferForm').elements.description.value, '');
  assert.equal(app.element('transferCount').textContent, '2');
  assert.equal(app.element('dailyCollected').textContent, app.money(5400));
});

test('REG-027 - Transferir desde MP usa descripcion predeterminada si esta vacia', (t) => {
  const app = createApp(t);
  app.financialFixture();
  app.submit('transferForm', { from: 'Mercado Pago', amount: '1.200', description: '   ' });
  balances(app, 4050, 3700);
  assert.equal(app.run('transfers.at(-1).to'), 'Efectivo');
  assert.equal(app.run('transfers.at(-1).description'), 'Transferencia entre medios');
});

test('REG-028 - La transferencia exige origen e importe nativos', (t) => {
  const app = createApp(t);
  for (const name of ['from', 'amount']) {
    assert.equal(app.submit('transferForm', { from: 'Efectivo', amount: '1', [name]: '' }), false, name);
    assert.equal(app.element('transferForm').elements.namedItem(name).validity.valueMissing, true, name);
    assert.equal(app.run('transfers.length'), 0);
  }
});

test('REG-029 - La transferencia cero se rechaza y un peso es valido', (t) => {
  const app = createApp(t);
  app.financialFixture();
  app.submit('transferForm', { amount: '0' });
  assert.equal(app.run('transfers.length'), 1);
  assert.match(app.element('transferForm').elements.amount.validationMessage, /mayor que cero/);
  app.input('#transferForm [name="amount"]', '1');
  app.submit('transferForm');
  balances(app, 2849, 4901);
});

test('REG-030 - La transferencia rechaza importes fuera del entero seguro', (t) => {
  const app = createApp(t);
  app.submit('transferForm', { amount: '9007199254740992' });
  assert.equal(app.run('transfers.length'), 0);
  assert.match(app.element('transferForm').elements.amount.validationMessage, /mayor que cero/);
  balances(app, 0, 0);
});

test('REG-031 - La transferencia no permite superar el disponible del origen', (t) => {
  const app = createApp(t);
  app.financialFixture();
  const before = app.snapshot('transfers');
  app.submit('transferForm', { from: 'Efectivo', amount: '2851' });
  assert.match(app.element('transferForm').elements.amount.validationMessage, /saldo disponible es insuficiente/);
  assert.deepEqual(app.snapshot('transfers'), before);
  balances(app, 2850, 4900);
});

test('REG-032 - Cambiar el origen limpia el error y revalida sus fondos', (t) => {
  const app = createApp(t);
  app.financialFixture();
  app.submit('transferForm', { from: 'Efectivo', amount: '3000' });
  assert.equal(app.element('transferForm').elements.amount.validity.customError, true);
  app.setForm('transferForm', { from: 'Mercado Pago' });
  app.emit('#transferForm [name="from"]', 'change');
  assert.equal(app.element('transferForm').elements.amount.validity.customError, false);
  app.submit('transferForm');
  balances(app, 5850, 1900);
});

test('REG-033 - Cancelar eliminacion de transferencia conserva ambos saldos', (t) => {
  const app = createApp(t);
  app.financialFixture();
  const before = app.snapshot('transfers');
  app.confirm(false);
  app.click('[data-delete-transfer="t1"]');
  assert.deepEqual(app.snapshot('transfers'), before);
  assert.equal(app.confirmations.length, 1);
  balances(app, 2850, 4900);
});

test('REG-034 - Eliminar transferencia revierte origen y destino', (t) => {
  const app = createApp(t);
  app.financialFixture();
  app.click('[data-delete-transfer="t1"]');
  assert.equal(app.run('transfers.length'), 0);
  assert.equal(app.element('transferCount').textContent, '0');
  assert.equal(app.element('transfersEmpty').hidden, false);
  balances(app, 2950, 4800);
});

test('REG-035 - Transferir en una jornada anterior no toca la actual', (t) => {
  const app = createApp(t);
  app.financialFixture();
  app.element('workday').value = '2026-09-01';
  app.emit('#workday', 'change');
  app.submit('openingCashForm', { initialCash: '1000', initialMp: '2000' });
  app.submit('transferForm', { from: 'Mercado Pago', amount: '600' });
  assert.equal(app.run('transfers.at(-1).date'), '2026-09-01');
  balances(app, 1600, 1400);
  app.element('workday').value = '2026-09-03';
  app.emit('#workday', 'change');
  assert.equal(app.element('transferCount').textContent, '1');
  balances(app, 2850, 4900);
});
