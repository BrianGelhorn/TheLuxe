import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../support/app.mjs';

function balances(app, cash, mp) {
  assert.deepEqual(app.snapshot('[dayBalance("Efectivo"), dayBalance("Mercado Pago")]'), [cash, mp]);
  assert.equal(app.element('cashTotal').textContent, app.money(cash));
  assert.equal(app.element('mpTotal').textContent, app.money(mp));
}

test('TXN-001 - El servicio carga su precio y permite un importe manual', (t) => {
  const app = createApp(t);
  app.click('[data-barber="Mateo"]');
  assert.equal(app.element('cutDialog').open, true);
  assert.equal(app.element('time').value, '12:00');
  app.setForm('cutForm', { service: 'Barba' });
  app.emit('#service', 'change');
  assert.equal(app.element('amount').value, '10.000');
  app.input('#amount', '1.500');
  app.input('#cutForm [name="tip"]', '200');
  assert.equal(app.submit('cutForm', { notes: 'Precio acordado' }), true);
  assert.deepEqual(app.snapshot('entries.map(({ id, ...cut }) => cut)'), [{
    barber: 'Mateo', time: '12:00', service: 'Barba', amount: 1500, tip: 200,
    payment: 'Efectivo', cashAmount: 0, mpAmount: 0, notes: 'Precio acordado',
    date: '2026-09-03', commissionRate: 50, commissionAmount: 750,
  }]);
  assert.equal(app.element('cutDialog').open, false);
  assert.equal(app.run('editingId'), null);
  balances(app, 1700, 0);
  assert.equal(app.element('dailyServices').textContent, app.money(1500));
  assert.equal(app.element('dailyTips').textContent, app.money(200));
  assert.equal(app.element('dailyCount').textContent, '1 corte');
});

test('TXN-002 - Un corte de un peso admite propina vacia', (t) => {
  const app = createApp(t);
  app.click('[data-barber="Mateo"]');
  app.submit('cutForm', { service: 'Barba', amount: '1', tip: '' });
  assert.deepEqual(app.snapshot('entries.map(({ amount, tip, commissionAmount }) => [amount, tip, commissionAmount])'), [[1, 0, 0.5]]);
  balances(app, 1, 0);
});

test('TXN-003 - Un corte por MP suma precio y propina solo a MP', (t) => {
  const app = createApp(t);
  app.click('[data-barber="Lucas"]');
  app.submit('cutForm', { service: 'Barba', amount: '2.000', tip: '300', payment: 'Mercado Pago' });
  balances(app, 0, 2300);
  assert.equal(app.element('dailyCollected').textContent, app.money(2300));
  assert.equal(app.element('dailyInvoiced').textContent, app.money(2000));
  assert.equal(app.element('dailyCommission').textContent, app.money(1000));
  assert.equal(app.element('dailyNet').textContent, app.money(1000));
});

test('TXN-004 - El corte mixto asigna la propina al efectivo dominante', (t) => {
  const app = createApp(t);
  app.click('[data-barber="Mateo"]');
  app.setForm('cutForm', { service: 'Barba', amount: '900', tip: '100', payment: 'Ambos', cashAmount: '600', mpAmount: '400' });
  app.emit('#payment', 'change');
  assert.equal(app.submit('cutForm'), true);
  balances(app, 600, 400);
  for (const [id, amount] of Object.entries({ dailyServicesCash: 500, dailyServicesMp: 400, dailyTipsCash: 100, dailyTipsMp: 0, dailyCollected: 1000 })) {
    assert.equal(app.element(id).textContent, app.money(amount), id);
  }
  app.click('[data-cut]');
  assert.equal(app.element('detailDialog').open, true);
  assert.ok(app.element('cutDetail').textContent.includes(app.money(600)));
  assert.ok(app.element('cutDetail').textContent.includes(app.money(400)));
});

test('TXN-005 - El corte mixto asigna la propina al MP dominante', (t) => {
  const app = createApp(t);
  app.click('[data-barber="Mateo"]');
  app.setForm('cutForm', { service: 'Barba', amount: '900', tip: '100', payment: 'Ambos', cashAmount: '400', mpAmount: '600' });
  app.emit('#payment', 'change');
  app.submit('cutForm');
  balances(app, 400, 600);
  assert.equal(app.element('dailyServicesCash').textContent, app.money(400));
  assert.equal(app.element('dailyServicesMp').textContent, app.money(500));
  assert.equal(app.element('dailyTipsCash').textContent, app.money(0));
  assert.equal(app.element('dailyTipsMp').textContent, app.money(100));
});

test('TXN-006 - El empate mixto cuenta el corte y la propina una sola vez', (t) => {
  const app = createApp(t);
  app.click('[data-barber="Mateo"]');
  app.setForm('cutForm', { service: 'Barba', amount: '800', tip: '200', payment: 'Ambos', cashAmount: '500', mpAmount: '500' });
  app.emit('#payment', 'change');
  app.submit('cutForm');
  app.element('summaryPeriod').value = 'month';
  app.emit('#summaryPeriod', 'change');
  balances(app, 500, 500);
  assert.equal(app.element('dailyServicesCash').textContent, app.money(300));
  assert.equal(app.element('dailyServicesMp').textContent, app.money(500));
  assert.equal(app.element('summaryCashCuts').textContent, '1 corte');
  assert.equal(app.element('summaryMpCuts').textContent, '0 cortes');
  assert.equal(app.element('summaryTips').textContent, app.money(200));
});

test('TXN-007 - El corte mixto permite cero explicito en un medio', (t) => {
  const app = createApp(t);
  app.click('[data-barber="Mateo"]');
  app.setForm('cutForm', { service: 'Barba', amount: '1000', tip: '100', payment: 'Ambos', cashAmount: '0', mpAmount: '1100' });
  app.emit('#payment', 'change');
  assert.equal(app.submit('cutForm'), true);
  assert.equal(app.run('entries.length'), 1);
  balances(app, 0, 1100);
});

test('TXN-008 - Cambiar medio activa y desactiva los campos mixtos requeridos', (t) => {
  const app = createApp(t);
  app.click('[data-barber="Mateo"]');
  app.setForm('cutForm', { service: 'Barba', amount: '1000', payment: 'Ambos' });
  app.emit('#payment', 'change');
  assert.equal(app.element('splitPayment').hidden, false);
  assert.equal(app.element('cashAmount').required, true);
  assert.equal(app.element('mpAmount').required, true);
  assert.equal(app.submit('cutForm'), false);
  assert.equal(app.run('entries.length'), 0);
  app.setForm('cutForm', { payment: 'Efectivo' });
  app.emit('#payment', 'change');
  assert.equal(app.element('splitPayment').hidden, true);
  assert.equal(app.element('cashAmount').required, false);
  assert.equal(app.element('mpAmount').required, false);
  app.submit('cutForm');
  balances(app, 1000, 0);
});

test('TXN-009 - Una suma mixta insuficiente se rechaza y se puede corregir', (t) => {
  const app = createApp(t);
  app.click('[data-barber="Mateo"]');
  app.setForm('cutForm', { service: 'Barba', amount: '900', tip: '100', payment: 'Ambos', cashAmount: '500', mpAmount: '400' });
  app.emit('#payment', 'change');
  app.submit('cutForm');
  assert.equal(app.run('entries.length'), 0);
  assert.match(app.element('cashAmount').validationMessage, /La suma debe coincidir/);
  assert.equal(app.element('cutDialog').open, true);
  app.input('#cashAmount', '600');
  assert.equal(app.element('cashAmount').validity.customError, false);
  app.submit('cutForm');
  balances(app, 600, 400);
});

test('TXN-010 - Una suma mixta excesiva no registra el corte', (t) => {
  const app = createApp(t);
  app.click('[data-barber="Mateo"]');
  app.setForm('cutForm', { service: 'Barba', amount: '900', tip: '100', payment: 'Ambos', cashAmount: '700', mpAmount: '400' });
  app.emit('#payment', 'change');
  app.submit('cutForm');
  assert.equal(app.run('entries.length'), 0);
  assert.match(app.element('cashAmount').validationMessage, /La suma debe coincidir/);
  balances(app, 0, 0);
});

test('TXN-011 - La propina mixta no puede superar el aporte dominante', (t) => {
  const app = createApp(t);
  app.click('[data-barber="Mateo"]');
  app.setForm('cutForm', { service: 'Barba', amount: '100', tip: '900', payment: 'Ambos', cashAmount: '500', mpAmount: '500' });
  app.emit('#payment', 'change');
  app.submit('cutForm');
  assert.equal(app.run('entries.length'), 0);
  assert.match(app.element('cashAmount').validationMessage, /La propina no puede superar/);
  app.input('#cutForm [name="tip"]', '500');
  app.input('#amount', '500');
  app.submit('cutForm');
  assert.equal(app.run('entries.length'), 1);
  balances(app, 500, 500);
  assert.equal(app.element('dailyServicesCash').textContent, app.money(0));
});

test('TXN-012 - El formulario de corte respeta los campos nativos requeridos', (t) => {
  const app = createApp(t);
  app.click('[data-barber="Mateo"]');
  const valid = { time: '10:30', service: 'Barba', amount: '1000', payment: 'Efectivo' };
  for (const name of Object.keys(valid)) {
    app.setForm('cutForm', { ...valid, [name]: '' });
    assert.equal(app.submit('cutForm'), false, name);
    assert.equal(app.element('cutForm').elements.namedItem(name).validity.valueMissing, true, name);
    assert.equal(app.run('entries.length'), 0, name);
  }
});

test('TXN-013 - El precio cero del corte se rechaza y el input limpia el error', (t) => {
  const app = createApp(t);
  app.click('[data-barber="Mateo"]');
  app.submit('cutForm', { service: 'Barba', amount: '0' });
  assert.equal(app.run('entries.length'), 0);
  assert.equal(app.element('amount').validity.customError, true);
  app.input('#amount', '2.345');
  assert.equal(app.element('amount').validity.customError, false);
  app.submit('cutForm');
  balances(app, 2345, 0);
});

test('TXN-014 - Editar un corte reemplaza precio propina y medio sin duplicarlo', (t) => {
  const app = createApp(t);
  app.financialFixture();
  app.click('[data-cut="a"]');
  app.click('#editCut');
  assert.equal(app.element('detailDialog').open, false);
  assert.equal(app.element('amount').value, '1.000');
  app.submit('cutForm', { amount: '2.500', tip: '500', payment: 'Mercado Pago', time: '14:00', notes: 'Corregido' });
  assert.equal(app.run('entries.length'), 3);
  assert.deepEqual(app.snapshot('entries.find(({ id }) => id === "a")'), {
    id: 'a', date: '2026-09-03', time: '14:00', barber: 'Mateo', service: 'Barba',
    payment: 'Mercado Pago', amount: 2500, tip: 500, cashAmount: 0, mpAmount: 0,
    notes: 'Corregido', commissionRate: 50, commissionAmount: 1250,
  });
  balances(app, 1650, 7900);
  assert.equal(app.element('dailyCount').textContent, '3 cortes');
});

test('TXN-015 - Rechazar la eliminacion del corte conserva datos y saldos', (t) => {
  const app = createApp(t);
  app.financialFixture();
  const before = app.snapshot('entries');
  app.click('[data-cut="a"]');
  app.confirm(false);
  app.click('#deleteCut');
  assert.deepEqual(app.snapshot('entries'), before);
  assert.equal(app.confirmations.length, 1);
  assert.equal(app.element('detailDialog').open, true);
  balances(app, 2850, 4900);
});

test('TXN-016 - Eliminar un corte mixto resta ambos aportes y su contador', (t) => {
  const app = createApp(t);
  app.financialFixture();
  app.click('[data-cut="c"]');
  app.click('#deleteCut');
  assert.deepEqual(app.snapshot('entries.map(({ id }) => id)'), ['a', 'b']);
  assert.equal(app.run('selectedId'), null);
  assert.equal(app.element('detailDialog').open, false);
  balances(app, 2250, 4500);
  assert.equal(app.element('dailyCollected').textContent, app.money(4400));
  assert.equal(app.element('dailyCount').textContent, '2 cortes');
});

test('TXN-017 - Cerrar alta o edicion de corte descarta el borrador', (t) => {
  const app = createApp(t);
  app.financialFixture();
  const before = app.snapshot('entries');
  app.click('[data-barber="Lucas"]');
  app.setForm('cutForm', { service: 'Barba', amount: '999' });
  app.click('#closeDialog');
  assert.equal(app.element('cutDialog').open, false);
  app.click('[data-cut="a"]');
  app.click('#editCut');
  app.input('#amount', '999');
  app.click('#cutDialog');
  assert.equal(app.element('cutDialog').open, false);
  assert.deepEqual(app.snapshot('entries'), before);
  app.click('[data-barber="Lucas"]');
  assert.equal(app.run('editingId'), null);
  assert.equal(app.element('amount').value, '');
  balances(app, 2850, 4900);
});

test('TXN-018 - El producto y los inputs recalculan cantidad por precio', (t) => {
  const app = createApp(t);
  app.click('#addSale');
  assert.equal(app.element('saleForm').elements.quantity.value, '1');
  app.setForm('saleForm', { product: 'Pomada' });
  app.emit('#saleProduct', 'change');
  assert.equal(app.element('saleForm').elements.unitPrice.value, '12.000');
  assert.equal(app.element('saleTotalPreview').textContent, app.money(12000));
  app.input('#saleForm [name="quantity"]', '3');
  assert.equal(app.element('saleTotalPreview').textContent, app.money(36000));
  app.input('#saleForm [name="unitPrice"]', '1.250');
  assert.equal(app.element('saleTotalPreview').textContent, app.money(3750));
  app.setForm('saleForm', { product: '' });
  app.emit('#saleProduct', 'change');
  assert.equal(app.element('saleForm').elements.unitPrice.value, '');
  assert.equal(app.element('saleTotalPreview').textContent, app.money(0));
});

test('TXN-019 - La venta en efectivo suma el total y cuenta una operacion', (t) => {
  const app = createApp(t);
  app.click('#addSale');
  app.submit('saleForm', { product: 'Pomada', quantity: '3', unitPrice: '1.250', notes: 'Tres unidades' });
  assert.deepEqual(app.snapshot('sales.map(({ id, ...sale }) => sale)'), [{
    time: '12:00', product: 'Pomada', quantity: 3, unitPrice: 1250, payment: 'Efectivo',
    notes: 'Tres unidades', total: 3750, date: '2026-09-03',
  }]);
  assert.equal(app.element('saleDialog').open, false);
  balances(app, 3750, 0);
  assert.equal(app.element('dailySalesCount').textContent, '1 venta');
  assert.equal(app.element('dailyAverageTicket').textContent, app.money(3750));
  assert.equal(app.element('dailyCommission').textContent, app.money(0));
  assert.equal(app.element('salesGrandTotal').textContent, app.money(3750));
});

test('TXN-020 - La venta por MP suma cantidad por precio solo a MP', (t) => {
  const app = createApp(t);
  app.click('#addSale');
  app.submit('saleForm', { product: 'Shampoo', quantity: '2', unitPrice: '900', payment: 'Mercado Pago' });
  balances(app, 0, 1800);
  assert.equal(app.run('sales[0].total'), 1800);
  assert.equal(app.element('salesCashTotal').textContent, app.money(0));
  assert.equal(app.element('salesMpTotal').textContent, app.money(1800));
  assert.equal(app.element('dailyNet').textContent, app.money(1800));
});

test('TXN-021 - Editar venta revierte el total anterior y conserva su identidad', (t) => {
  const app = createApp(t);
  app.financialFixture();
  app.emit('[data-sale="s1"]', 'keydown', { key: 'Enter' });
  assert.equal(app.element('saleDetailDialog').open, true);
  assert.equal(app.element('saleDetailTitle').textContent, 'Pomada');
  app.click('#editSale');
  assert.equal(app.element('saleForm').elements.unitPrice.value, '500');
  app.input('#saleForm [name="quantity"]', '4');
  app.input('#saleForm [name="unitPrice"]', '750');
  assert.equal(app.element('saleTotalPreview').textContent, app.money(3000));
  app.submit('saleForm', { payment: 'Mercado Pago', notes: 'Cuatro' });
  assert.equal(app.run('sales.length'), 2);
  assert.deepEqual(app.snapshot('sales.find(({ id }) => id === "s1")'), {
    id: 's1', date: '2026-09-03', time: '10:00', product: 'Pomada', quantity: 4,
    unitPrice: 750, total: 3000, payment: 'Mercado Pago', notes: 'Cuatro',
  });
  balances(app, 2350, 7900);
  assert.equal(app.element('salesGrandTotal').textContent, app.money(3700));
});

test('TXN-022 - Cancelar la eliminacion de venta conserva su total', (t) => {
  const app = createApp(t);
  app.financialFixture();
  const before = app.snapshot('sales');
  app.click('[data-sale="s1"]');
  app.confirm(false);
  app.click('#deleteSale');
  assert.deepEqual(app.snapshot('sales'), before);
  assert.equal(app.confirmations.length, 1);
  assert.equal(app.element('saleDetailDialog').open, true);
  balances(app, 2850, 4900);
});

test('TXN-023 - Eliminar venta resta todas las unidades vendidas', (t) => {
  const app = createApp(t);
  app.click('#addSale');
  app.submit('saleForm', { product: 'Pomada', quantity: '3', unitPrice: '1250', payment: 'Mercado Pago' });
  balances(app, 0, 3750);
  app.click('[data-sale]');
  app.click('#deleteSale');
  assert.equal(app.run('sales.length'), 0);
  assert.equal(app.run('selectedSaleId'), null);
  assert.equal(app.element('saleDetailDialog').open, false);
  assert.equal(app.element('salesEmpty').hidden, false);
  assert.equal(app.element('dailySalesCount').textContent, '0 ventas');
  balances(app, 0, 0);
});

test('TXN-024 - Cerrar alta y edicion de venta no guarda el borrador', (t) => {
  const app = createApp(t);
  app.financialFixture();
  const before = app.snapshot('sales');
  app.click('#addSale');
  app.setForm('saleForm', { product: 'Pomada', unitPrice: '999', quantity: '9' });
  app.click('#closeSaleDialog');
  app.click('[data-sale="s1"]');
  app.click('#editSale');
  app.input('#saleForm [name="quantity"]', '9');
  app.click('#saleDialog');
  assert.equal(app.element('saleDialog').open, false);
  assert.deepEqual(app.snapshot('sales'), before);
  app.click('#addSale');
  assert.equal(app.run('editingSaleId'), null);
  assert.equal(app.element('saleForm').elements.quantity.value, '1');
  balances(app, 2850, 4900);
});

test('TXN-025 - La cantidad de venta vacia es invalida por required', (t) => {
  const app = createApp(t);
  app.click('#addSale');
  assert.equal(app.submit('saleForm', { product: 'Pomada', unitPrice: '100', quantity: '' }), false);
  assert.equal(app.element('saleForm').elements.quantity.validity.valueMissing, true);
  assert.equal(app.run('sales.length'), 0);
});

test('TXN-026 - La cantidad cero de venta es invalida por minimo', (t) => {
  const app = createApp(t);
  app.click('#addSale');
  assert.equal(app.submit('saleForm', { product: 'Pomada', unitPrice: '100', quantity: '0' }), false);
  assert.equal(app.element('saleForm').elements.quantity.validity.rangeUnderflow, true);
  assert.equal(app.run('sales.length'), 0);
});

test('TXN-027 - La cantidad negativa de venta no llega al handler', (t) => {
  const app = createApp(t);
  app.click('#addSale');
  assert.equal(app.submit('saleForm', { product: 'Pomada', unitPrice: '100', quantity: '-2' }), false);
  assert.equal(app.element('saleForm').elements.quantity.validity.rangeUnderflow, true);
  assert.equal(app.run('sales.length'), 0);
});

test('TXN-028 - La cantidad fraccionaria de venta es invalida por paso', (t) => {
  const app = createApp(t);
  app.click('#addSale');
  assert.equal(app.submit('saleForm', { product: 'Pomada', unitPrice: '100', quantity: '1.5' }), false);
  assert.equal(app.element('saleForm').elements.quantity.validity.stepMismatch, true);
  assert.equal(app.run('sales.length'), 0);
});

test('TXN-029 - La venta exige hora producto precio y medio nativos', (t) => {
  const app = createApp(t);
  app.click('#addSale');
  const valid = { time: '11:00', product: 'Pomada', unitPrice: '100', payment: 'Efectivo' };
  for (const name of Object.keys(valid)) {
    app.setForm('saleForm', { ...valid, [name]: '' });
    assert.equal(app.submit('saleForm'), false, name);
    assert.equal(app.element('saleForm').elements.namedItem(name).validity.valueMissing, true, name);
    assert.equal(app.run('sales.length'), 0, name);
  }
});

test('TXN-030 - El precio cero de venta se rechaza y un peso es valido', (t) => {
  const app = createApp(t);
  app.click('#addSale');
  app.submit('saleForm', { product: 'Pomada', unitPrice: '0', quantity: '2' });
  assert.equal(app.run('sales.length'), 0);
  assert.equal(app.element('saleForm').elements.unitPrice.validity.customError, true);
  app.input('#saleForm [name="unitPrice"]', '1');
  assert.equal(app.element('saleForm').elements.unitPrice.validity.customError, false);
  app.submit('saleForm');
  balances(app, 2, 0);
});

test('TXN-031 - El adelanto en efectivo resta sin modificar ingresos ni comision', (t) => {
  const app = createApp(t);
  app.financialFixture();
  app.click('#addAdvance');
  app.submit('advanceForm', { barber: 'Mateo', amount: '1.200', reason: 'Personal' });
  assert.equal(app.run('advances.length'), 3);
  assert.equal(app.run('advances.at(-1).amount'), 1200);
  assert.equal(app.element('advanceDialog').open, false);
  balances(app, 1650, 4900);
  assert.equal(app.element('advancesCashTotal').textContent, app.money(1500));
  assert.equal(app.element('dailyCollected').textContent, app.money(5400));
  assert.equal(app.element('dailyCommission').textContent, app.money(1950));
});

test('TXN-032 - El adelanto por MP resta solo del saldo MP', (t) => {
  const app = createApp(t);
  app.financialFixture();
  app.click('#addAdvance');
  app.submit('advanceForm', { barber: 'Lucas', amount: '700', payment: 'Mercado Pago' });
  balances(app, 2850, 4200);
  assert.equal(app.element('advancesMpTotal').textContent, app.money(800));
  assert.equal(app.run('advances.at(-1).reason'), '');
});

test('TXN-033 - Editar adelanto devuelve el medio anterior y resta el nuevo', (t) => {
  const app = createApp(t);
  app.financialFixture();
  app.emit('[data-advance="a1"]', 'keydown', { key: 'Enter' });
  assert.equal(app.element('advanceDetailDialog').open, true);
  app.click('#editAdvance');
  assert.equal(app.element('advanceForm').elements.amount.value, '300');
  app.submit('advanceForm', { barber: 'Lucas', amount: '600', payment: 'Mercado Pago', reason: 'Cambio' });
  assert.equal(app.run('advances.length'), 2);
  assert.deepEqual(app.snapshot('advances.find(({ id }) => id === "a1")'), {
    id: 'a1', date: '2026-09-03', time: '09:00', barber: 'Lucas', amount: 600, payment: 'Mercado Pago', reason: 'Cambio',
  });
  balances(app, 3150, 4300);
});

test('TXN-034 - Rechazar la eliminacion de adelanto conserva la salida', (t) => {
  const app = createApp(t);
  app.financialFixture();
  const before = app.snapshot('advances');
  app.click('[data-advance="a1"]');
  app.confirm(false);
  app.click('#deleteAdvance');
  assert.deepEqual(app.snapshot('advances'), before);
  assert.equal(app.element('advanceDetailDialog').open, true);
  balances(app, 2850, 4900);
});

test('TXN-035 - Eliminar adelanto devuelve su importe al medio original', (t) => {
  const app = createApp(t);
  app.financialFixture();
  app.click('[data-advance="a2"]');
  app.click('#deleteAdvance');
  assert.deepEqual(app.snapshot('advances.map(({ id }) => id)'), ['a1']);
  assert.equal(app.run('selectedAdvanceId'), null);
  assert.equal(app.element('advanceDetailDialog').open, false);
  balances(app, 2850, 5000);
  assert.equal(app.element('advancesGrandTotal').textContent, app.money(300));
});

test('TXN-036 - Cancelar alta y edicion de adelanto conserva los registros', (t) => {
  const app = createApp(t);
  app.financialFixture();
  const before = app.snapshot('advances');
  app.click('#addAdvance');
  app.setForm('advanceForm', { barber: 'Mateo', amount: '999' });
  app.click('#closeAdvanceDialog');
  app.click('[data-advance="a1"]');
  app.click('#editAdvance');
  app.input('#advanceForm [name="amount"]', '999');
  app.click('#advanceDialog');
  assert.equal(app.element('advanceDialog').open, false);
  assert.deepEqual(app.snapshot('advances'), before);
  app.click('#addAdvance');
  assert.equal(app.run('editingAdvanceId'), null);
  assert.equal(app.element('advanceForm').elements.amount.value, '');
  balances(app, 2850, 4900);
});

test('TXN-037 - El adelanto exige sus campos nativos obligatorios', (t) => {
  const app = createApp(t);
  app.click('#addAdvance');
  const valid = { time: '09:00', barber: 'Mateo', amount: '100', payment: 'Efectivo' };
  for (const name of Object.keys(valid)) {
    app.setForm('advanceForm', { ...valid, [name]: '' });
    assert.equal(app.submit('advanceForm'), false, name);
    assert.equal(app.element('advanceForm').elements.namedItem(name).validity.valueMissing, true, name);
    assert.equal(app.run('advances.length'), 0, name);
  }
});

test('TXN-038 - El adelanto cero se rechaza y un peso se descuenta', (t) => {
  const app = createApp(t);
  app.click('#addAdvance');
  app.submit('advanceForm', { barber: 'Mateo', amount: '0' });
  assert.equal(app.run('advances.length'), 0);
  assert.equal(app.element('advanceForm').elements.amount.validity.customError, true);
  app.input('#advanceForm [name="amount"]', '1');
  app.submit('advanceForm');
  balances(app, -1, 0);
});

test('TXN-039 - El gasto en efectivo resta sin alterar facturacion', (t) => {
  const app = createApp(t);
  app.financialFixture();
  app.click('#addExpense');
  app.submit('expenseForm', { amount: '1.250', reason: 'Insumos' });
  assert.equal(app.run('expenses.length'), 3);
  assert.equal(app.run('expenses.at(-1).amount'), 1250);
  assert.equal(app.element('expenseDialog').open, false);
  balances(app, 1600, 4900);
  assert.equal(app.element('expensesCashTotal').textContent, app.money(1300));
  assert.equal(app.element('dailyInvoiced').textContent, app.money(5100));
  assert.equal(app.element('dailyNet').textContent, app.money(3150));
});

test('TXN-040 - El gasto por MP resta solo del saldo MP', (t) => {
  const app = createApp(t);
  app.financialFixture();
  app.click('#addExpense');
  app.submit('expenseForm', { amount: '700', payment: 'Mercado Pago', reason: 'Internet' });
  balances(app, 2850, 4200);
  assert.equal(app.element('expensesMpTotal').textContent, app.money(900));
  assert.equal(app.element('expensesGrandTotal').textContent, app.money(950));
});

test('TXN-041 - Editar gasto devuelve el importe anterior y resta el nuevo', (t) => {
  const app = createApp(t);
  app.financialFixture();
  app.emit('[data-expense="e1"]', 'keydown', { key: 'Enter' });
  assert.equal(app.element('expenseDetailDialog').open, true);
  app.click('#editExpense');
  assert.equal(app.element('expenseForm').elements.amount.value, '50');
  app.submit('expenseForm', { amount: '800', payment: 'Mercado Pago', reason: 'Limpieza corregida' });
  assert.equal(app.run('expenses.length'), 2);
  assert.deepEqual(app.snapshot('expenses.find(({ id }) => id === "e1")'), {
    id: 'e1', date: '2026-09-03', time: '09:00', amount: 800, payment: 'Mercado Pago', reason: 'Limpieza corregida',
  });
  balances(app, 2900, 4100);
});

test('TXN-042 - Rechazar la eliminacion del gasto conserva saldos', (t) => {
  const app = createApp(t);
  app.financialFixture();
  const before = app.snapshot('expenses');
  app.click('[data-expense="e1"]');
  app.confirm(false);
  app.click('#deleteExpense');
  assert.deepEqual(app.snapshot('expenses'), before);
  assert.equal(app.element('expenseDetailDialog').open, true);
  balances(app, 2850, 4900);
});

test('TXN-043 - Eliminar gasto devuelve dinero y actualiza su total', (t) => {
  const app = createApp(t);
  app.financialFixture();
  app.click('[data-expense="e1"]');
  app.click('#deleteExpense');
  assert.deepEqual(app.snapshot('expenses.map(({ id }) => id)'), ['e2']);
  assert.equal(app.run('selectedExpenseId'), null);
  assert.equal(app.element('expenseDetailDialog').open, false);
  balances(app, 2900, 4900);
  assert.equal(app.element('expensesGrandTotal').textContent, app.money(200));
});

test('TXN-044 - Cancelar alta y edicion de gasto descarta el borrador', (t) => {
  const app = createApp(t);
  app.financialFixture();
  const before = app.snapshot('expenses');
  app.click('#addExpense');
  app.setForm('expenseForm', { amount: '999', reason: 'No guardar' });
  app.click('#closeExpenseDialog');
  app.click('[data-expense="e1"]');
  app.click('#editExpense');
  app.input('#expenseForm [name="amount"]', '999');
  app.click('#expenseDialog');
  assert.equal(app.element('expenseDialog').open, false);
  assert.deepEqual(app.snapshot('expenses'), before);
  app.click('#addExpense');
  assert.equal(app.run('editingExpenseId'), null);
  assert.equal(app.element('expenseForm').elements.amount.value, '');
  balances(app, 2850, 4900);
});

test('TXN-045 - El gasto exige hora importe medio y motivo nativos', (t) => {
  const app = createApp(t);
  app.click('#addExpense');
  const valid = { time: '09:00', amount: '100', payment: 'Efectivo', reason: 'Limpieza' };
  for (const name of Object.keys(valid)) {
    app.setForm('expenseForm', { ...valid, [name]: '' });
    assert.equal(app.submit('expenseForm'), false, name);
    assert.equal(app.element('expenseForm').elements.namedItem(name).validity.valueMissing, true, name);
    assert.equal(app.run('expenses.length'), 0, name);
  }
});

test('TXN-046 - El gasto cero se rechaza y un peso es valido', (t) => {
  const app = createApp(t);
  app.click('#addExpense');
  app.submit('expenseForm', { amount: '0', reason: 'Limpieza' });
  assert.equal(app.run('expenses.length'), 0);
  assert.equal(app.element('expenseForm').elements.amount.validity.customError, true);
  app.input('#expenseForm [name="amount"]', '1');
  app.submit('expenseForm');
  balances(app, -1, 0);
});

test('TXN-047 - La caja suma cobros y resta adelantos gastos y transferencias', (t) => {
  const app = createApp(t);
  app.financialFixture();
  // Efectivo: 1000 + 1200 + 600 + 500 - 300 - 50 - 100 = 2850.
  // MP: 2000 + 2000 + 400 + 700 - 100 - 200 + 100 = 4900.
  balances(app, 2850, 4900);
  for (const [id, amount] of Object.entries({
    dailyCollected: 5400, dailyServices: 3900, dailyTips: 300, dailySalesTotal: 1200,
    dailyInvoiced: 5100, dailyCommission: 1950, dailyNet: 3150, dailyAverageTicket: 1020,
    dailyServicesCash: 1500, dailyServicesMp: 2400, dailyTipsCash: 300, dailyTipsMp: 0,
  })) assert.equal(app.element(id).textContent, app.money(amount), id);
  assert.equal(app.element('dailyCount').textContent, '3 cortes');
  assert.equal(app.element('dailySalesCount').textContent, '2 ventas');
});

test('TXN-048 - Cambiar jornada aisla todos los movimientos y contadores', (t) => {
  const app = createApp(t);
  app.financialFixture();
  const before = app.snapshot('({ entries, sales, advances, expenses, transfers })');
  app.element('workday').value = '2026-09-02';
  app.emit('#workday', 'change');
  assert.deepEqual(app.snapshot('[selectedEntries(), selectedSales(), selectedAdvances(), selectedExpenses(), selectedTransfers()]'), [[], [], [], [], []]);
  balances(app, 0, 0);
  assert.equal(app.element('dailyCount').textContent, '0 cortes');
  assert.equal(app.element('dailySalesCount').textContent, '0 ventas');
  for (const id of ['salesRows', 'advanceRows', 'expenseRows', 'transferRows']) assert.equal(app.element(id).children.length, 0, id);
  app.element('workday').value = '2026-09-03';
  app.emit('#workday', 'change');
  assert.deepEqual(app.snapshot('({ entries, sales, advances, expenses, transfers })'), before);
  balances(app, 2850, 4900);
});

test('TXN-049 - Las altas usan la jornada seleccionada y no la fecha actual', (t) => {
  const app = createApp(t);
  app.element('workday').value = '2026-09-01';
  app.emit('#workday', 'change');
  app.submit('openingCashForm', { initialCash: '1000', initialMp: '2000' });
  app.click('[data-barber="Mateo"]');
  app.submit('cutForm', { service: 'Barba', amount: '100', tip: '10' });
  app.click('#addSale');
  app.submit('saleForm', { product: 'Pomada', quantity: '2', unitPrice: '50', payment: 'Mercado Pago' });
  app.click('#addAdvance');
  app.submit('advanceForm', { barber: 'Mateo', amount: '20' });
  app.click('#addExpense');
  app.submit('expenseForm', { amount: '30', reason: 'Limpieza', payment: 'Mercado Pago' });
  assert.deepEqual(app.snapshot('[...entries, ...sales, ...advances, ...expenses].map(({ date }) => date)'), Array(4).fill('2026-09-01'));
  balances(app, 1090, 2070);
  app.element('workday').value = '2026-09-03';
  app.emit('#workday', 'change');
  balances(app, 0, 0);
});
