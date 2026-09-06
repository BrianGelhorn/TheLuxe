import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../support/app.mjs';

const change = (app, rate) => {
  app.click('#changeCommission');
  return app.submit('dailyCommissionForm', { commission: rate });
};

test('COM-001 - La tasa predeterminada respeta fechas e historial desordenado', (t) => {
  const app = createApp(t);
  app.run('config.commissionHistory = [{date:"2026-09-02",rate:70},{date:"0000-01-01",rate:50},{date:"2026-09-01",rate:60}]');
  assert.deepEqual(app.snapshot('[defaultCommission("2026-08-31"), defaultCommission("2026-09-01"), defaultCommission("2026-09-03")]'), [50, 60, 70]);
  app.run('delete config.commissionHistory');
  assert.equal(app.run('defaultCommission("2026-09-03")'), 50);
});

test('COM-002 - El cambio diario reemplaza comisiones de todos los barberos ya cargados', (t) => {
  const app = createApp(t);
  app.financialFixture();
  change(app, 80);
  assert.deepEqual(app.snapshot('entries.map(({ commissionRate, commissionAmount }) => [commissionRate, commissionAmount])'), [[80, 800], [80, 1600], [80, 720]]);
  assert.equal(app.element('dailyCommission').textContent, app.money(3120));
  assert.equal(app.element('dailyNet').textContent, app.money(1980));
  assert.equal(app.query('[data-barber-column="Mateo"]').dataset.paymentDue, '1820');
  assert.equal(app.query('[data-barber-column="Lucas"]').dataset.paymentDue, '1600');
  assert.deepEqual(app.snapshot('[dayBalance("Efectivo"), dayBalance("Mercado Pago")]'), [2850, 4900]);
});

test('COM-003 - Las propinas y ventas no se comisionan al cambiar la tasa diaria', (t) => {
  const app = createApp(t);
  app.financialFixture();
  change(app, 100);
  assert.equal(app.element('dailyCollected').textContent, app.money(5400));
  assert.equal(app.element('dailyTips').textContent, app.money(300));
  assert.equal(app.element('dailyCommission').textContent, app.money(3900));
  assert.equal(app.element('dailyNet').textContent, app.money(1200));
});

test('COM-004 - Un override de cero anula comisiones existentes sin anular propinas', (t) => {
  const app = createApp(t);
  app.financialFixture();
  change(app, 0);
  assert.equal(app.element('dailyCommission').textContent, app.money(0));
  assert.equal(app.element('dailyNet').textContent, app.money(5100));
  assert.equal(app.query('[data-barber-column="Mateo"]').dataset.paymentDue, '300');
  app.click('#changeCommission');
  assert.equal(app.element('dailyCommissionForm').elements.commission.value, '0');
});

test('COM-005 - Los cortes nuevos usan el override y las ediciones recalculan con esa tasa', (t) => {
  const app = createApp(t);
  app.financialFixture();
  change(app, 60);
  app.click('[data-barber="Mateo"]');
  app.submit('cutForm', { service: 'Barba', amount: '1000' });
  assert.equal(app.run('entries.at(-1).commissionAmount'), 600);
  app.click('[data-cut="a"]');
  app.click('#editCut');
  app.submit('cutForm', { amount: '2000' });
  assert.equal(app.run('entries[0].commissionRate'), 60);
  assert.equal(app.run('entries[0].commissionAmount'), 1200);
  assert.equal(app.element('dailyCommission').textContent, app.money(3540));
});

test('COM-006 - La jornada siguiente usa el default y la anterior conserva su override', (t) => {
  const app = createApp(t);
  app.financialFixture();
  change(app, 80);
  app.run('cashRegisters["2026-09-04"] = { opened:true, initialCash:0, initialMp:0 }');
  app.element('workday').value = '2026-09-04';
  app.emit('#workday', 'change');
  app.click('[data-barber="Mateo"]');
  app.submit('cutForm', { service: 'Barba', amount: '1000' });
  assert.equal(app.run('entries.at(-1).commissionRate'), 50);
  assert.equal(app.element('dailyCommission').textContent, app.money(500));
  app.element('workday').value = '2026-09-03';
  app.emit('#workday', 'change');
  assert.equal(app.element('dailyCommission').textContent, app.money(3120));
});

test('COM-007 - Modificar la tasa de un dia no reescribe cortes de otras fechas', (t) => {
  const app = createApp(t);
  const { cuts } = app.financialFixture();
  const old = { ...cuts[0], id: 'historical', date: '2026-09-01', commissionRate: 20, commissionAmount: 200 };
  app.seed({ entries: [...cuts, old] });
  change(app, 70);
  assert.deepEqual(app.snapshot('entries.at(-1)'), old);
  assert.equal(app.run('config.commission'), 50);
});

test('COM-008 - Repetir cambios de tasa reemplaza el calculo sin acumular diferencias', (t) => {
  const app = createApp(t);
  app.financialFixture();
  for (const [rate, commission] of [[60, 2340], [20, 780], [20, 780], [0, 0], [50, 1950]]) {
    change(app, rate);
    assert.equal(app.element('dailyCommission').textContent, app.money(commission));
    assert.equal(app.run('entries.length'), 3);
  }
});

test('COM-009 - El reporte mensual y el pago coinciden con la comision diaria modificada', (t) => {
  const app = createApp(t);
  app.financialFixture();
  change(app, 60);
  app.element('summaryPeriod').value = 'month';
  app.emit('#summaryPeriod', 'change');
  assert.equal(app.element('summaryCommission').textContent, app.money(2340));
  assert.equal(app.element('summaryBalance').textContent, app.money(2760));
  assert.equal(app.element('summaryRows').rows[0].cells[5].textContent, app.money(2340));
});

test('COM-010 - Cambiar el default no modifica snapshots ni override pero rige cortes futuros', (t) => {
  const app = createApp(t);
  app.financialFixture();
  change(app, 60);
  app.submit('commissionForm', { commission: 90 });
  assert.equal(app.run('effectiveCommission("2026-09-03")'), 60);
  assert.equal(app.run('effectiveCommission("2026-09-04")'), 90);
  assert.equal(app.element('dailyCommission').textContent, app.money(2340));
  app.submit('commissionForm', { commission: 70 });
  assert.deepEqual(app.snapshot('config.commissionHistory'), [{ date: '0000-01-01', rate: 50 }, { date: '2026-09-03', rate: 70 }]);
});

test('COM-011 - Cambiar default sin override preserva cortes previos incluso al editarlos', (t) => {
  const app = createApp(t);
  app.financialFixture();
  app.submit('commissionForm', { commission: 80 });
  assert.equal(app.element('dailyCommission').textContent, app.money(1950));
  app.click('[data-cut="a"]');
  app.click('#editCut');
  app.submit('cutForm', { amount: '2000' });
  assert.equal(app.run('entries[0].commissionAmount'), 1000);
  app.click('[data-barber="Mateo"]');
  app.submit('cutForm', { service: 'Barba', amount: '1000' });
  assert.equal(app.run('entries.at(-1).commissionAmount'), 800);
});

for (const [id, value, description] of [['COM-012', '', 'vacia'], ['COM-013', '-1', 'negativa'], ['COM-014', '101', 'mayor a cien'], ['COM-015', '50.5', 'fuera del paso entero del formulario']]) {
  test(`${id} - Rechaza comision ${description} sin tocar datos`, (t) => {
    const app = createApp(t);
    app.financialFixture();
    const before = app.snapshot('({entries,cashRegisters})');
    assert.equal(change(app, value), false);
    assert.deepEqual(app.snapshot('({entries,cashRegisters})'), before);
  });
}

test('COM-016 - Cerrar el dialogo descarta cambios y solo el mousedown externo lo cierra', (t) => {
  const app = createApp(t);
  app.click('#changeCommission');
  app.setForm('dailyCommissionForm', { commission: '80' });
  app.emit('#dailyCommissionForm', 'mousedown');
  assert.equal(app.element('commissionDialog').open, true);
  app.emit('#commissionDialog', 'mouseup');
  assert.equal(app.element('commissionDialog').open, true);
  app.emit('#commissionDialog', 'mousedown');
  assert.equal(app.element('commissionDialog').open, false);
  assert.equal(app.run('effectiveCommission(workday.value)'), 50);
  app.click('#changeCommission');
  app.click('#closeCommissionDialog');
  assert.equal(app.element('commissionDialog').open, false);
});

test('COM-017 - El cambio diario reemplaza tambien snapshots antiguos sin tasa', (t) => {
  const app = createApp(t);
  const { cuts } = app.financialFixture();
  delete cuts[0].commissionRate;
  cuts[0].commissionAmount = 0;
  app.seed({ entries: cuts });
  change(app, 80);
  assert.equal(app.run('entries[0].commissionAmount'), 800);
  assert.equal(app.run('entries[0].commissionRate'), 80);
});
