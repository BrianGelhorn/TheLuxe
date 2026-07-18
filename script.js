const storageKey = 'theluxe-rf001-003-cuts';
const salesStorageKey = 'theluxe-rf006-008-sales';
const advancesStorageKey = 'theluxe-rf009-011-advances';
const barbers = ['Mateo', 'Julián', 'Nicolás', 'Tomás', 'Franco', 'Agustín', 'Lucas', 'Bruno', 'Santino'];
const prices = { 'Corte clásico': 15000, 'Corte + barba': 22000, Barba: 10000, Diseño: 18000 };
const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const integer = new Intl.NumberFormat('es-AR');
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const nowTime = () => new Date().toTimeString().slice(0, 5);
const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
const parseAmount = (value) => Number(String(value || '').replace(/\D/g, ''));
const formatAmount = (value) => value === '' || value == null ? '' : integer.format(parseAmount(value));

const form = document.getElementById('cutForm');
const dialog = document.getElementById('cutDialog');
const detailDialog = document.getElementById('detailDialog');
const workday = document.getElementById('workday');
const barberInput = document.getElementById('barber');
const timeInput = document.getElementById('time');
const serviceInput = document.getElementById('service');
const amountInput = document.getElementById('amount');
const tipInput = form.elements.tip;
const paymentInput = form.elements.payment;
const splitPayment = document.getElementById('splitPayment');
const cashAmountInput = form.elements.cashAmount;
const mpAmountInput = form.elements.mpAmount;
const notesInput = form.elements.notes;
const saleForm = document.getElementById('saleForm');
const saleDialog = document.getElementById('saleDialog');
const saleDetailDialog = document.getElementById('saleDetailDialog');
const advanceForm = document.getElementById('advanceForm');
const advanceDialog = document.getElementById('advanceDialog');
const advanceDetailDialog = document.getElementById('advanceDetailDialog');
let entries = JSON.parse(localStorage.getItem(storageKey) || '[]');
let sales = JSON.parse(localStorage.getItem(salesStorageKey) || '[]');
let advances = JSON.parse(localStorage.getItem(advancesStorageKey) || '[]');
let editingId = null;
let selectedId = null;
let editingSaleId = null;
let selectedSaleId = null;
let editingAdvanceId = null;
let selectedAdvanceId = null;

workday.value = today();
document.getElementById('summaryDate').value = today().slice(0, 7);
updateWeekOptions();
advanceForm.elements.barber.innerHTML = '<option value="">Seleccionar barbero</option>'
  + barbers.map((barber) => `<option>${escapeHtml(barber)}</option>`).join('');
document.querySelectorAll('.money-input input').forEach((input) => input.addEventListener('input', () => {
  input.value = formatAmount(input.value);
  input.setCustomValidity('');
}));

function save() {
  localStorage.setItem(storageKey, JSON.stringify(entries));
}

function saveSales() {
  localStorage.setItem(salesStorageKey, JSON.stringify(sales));
}

function saveAdvances() {
  localStorage.setItem(advancesStorageKey, JSON.stringify(advances));
}

function selectedEntries() {
  return entries.filter((entry) => entry.date === workday.value);
}

function selectedSales() {
  return sales.filter((sale) => sale.date === workday.value);
}

function selectedAdvances() {
  return advances.filter((advance) => advance.date === workday.value);
}

function paymentTotal(list, type) {
  return list.reduce((sum, entry) => sum + (entry.payment === 'Ambos'
    ? Number(type === 'Efectivo' ? entry.cashAmount : entry.mpAmount)
    : entry.payment === type ? Number(entry.amount) + Number(entry.tip || 0) : 0), 0);
}

function toggleSplitPayment() {
  const split = paymentInput.value === 'Ambos';
  splitPayment.hidden = !split;
  cashAmountInput.required = split;
  mpAmountInput.required = split;
  cashAmountInput.setCustomValidity('');
}

function render() {
  const list = selectedEntries();
  const daySales = selectedSales();
  const dayAdvances = selectedAdvances();
  const total = list.reduce((sum, entry) => sum + Number(entry.amount) + Number(entry.tip || 0), 0)
    + daySales.reduce((sum, sale) => sum + sale.total, 0);
  document.getElementById('dailyTotal').textContent = money.format(total);
  document.getElementById('dailyCount').textContent = `${list.length} ${list.length === 1 ? 'corte' : 'cortes'} · ${daySales.length} ${daySales.length === 1 ? 'venta' : 'ventas'}`;
  document.getElementById('tipsTotal').textContent = money.format(list.reduce((sum, entry) => sum + Number(entry.tip || 0), 0));
  document.getElementById('cashTotal').textContent = money.format(paymentTotal(list, 'Efectivo') + salePaymentTotal(daySales, 'Efectivo') - advancePaymentTotal(dayAdvances, 'Efectivo'));
  document.getElementById('mpTotal').textContent = money.format(paymentTotal(list, 'Mercado Pago') + salePaymentTotal(daySales, 'Mercado Pago') - advancePaymentTotal(dayAdvances, 'Mercado Pago'));
  document.getElementById('barberColumns').innerHTML = barbers.map((barber) => barberColumn(barber, list)).join('');
  renderSales(daySales);
  renderAdvances(dayAdvances);
  renderSummary();
}

function salePaymentTotal(list, type) {
  return list.reduce((sum, sale) => sum + (sale.payment === type ? sale.total : 0), 0);
}

function advancePaymentTotal(list, type) {
  return list.reduce((sum, advance) => sum + (advance.payment === type ? advance.amount : 0), 0);
}

function renderSales(list) {
  document.getElementById('salesRows').innerHTML = list.sort((a, b) => a.time.localeCompare(b.time)).map((sale) => `
    <tr data-sale="${escapeHtml(sale.id)}" tabindex="0">
      <td>${escapeHtml(sale.time)}</td><td>${escapeHtml(sale.product)}</td><td>${sale.quantity}</td>
      <td>${money.format(sale.unitPrice)}</td><td>${money.format(sale.total)}</td>
      <td>${escapeHtml(sale.payment === 'Mercado Pago' ? 'MP' : sale.payment)}</td>
      <td>${escapeHtml(sale.notes || '—')}</td>
    </tr>`).join('');
  document.getElementById('salesEmpty').hidden = list.length > 0;
}

function renderAdvances(list) {
  document.getElementById('advanceRows').innerHTML = list.sort((a, b) => a.time.localeCompare(b.time)).map((advance) => `
    <tr data-advance="${escapeHtml(advance.id)}" tabindex="0">
      <td>${escapeHtml(advance.time)}</td><td>${escapeHtml(advance.barber)}</td>
      <td>${money.format(advance.amount)}</td><td>${escapeHtml(advance.payment === 'Mercado Pago' ? 'MP' : advance.payment)}</td>
      <td>${escapeHtml(advance.reason || '—')}</td>
    </tr>`).join('');
  document.getElementById('advancesEmpty').hidden = list.length > 0;
}

function isoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function monthWeeks(value) {
  const [year, month] = value.split('-').map(Number);
  const firstMonday = new Date(year, month - 1, 1);
  firstMonday.setDate(firstMonday.getDate() + ((8 - firstMonday.getDay()) % 7));
  const lastDay = new Date(year, month, 0);
  return Math.ceil((lastDay - firstMonday + 86400000) / 604800000);
}

function periodBounds(period, value, week = 1) {
  let start;
  let end;
  if (period === 'week') {
    const [year, month] = value.split('-').map(Number);
    start = new Date(year, month - 1, 1);
    start.setDate(start.getDate() + ((8 - start.getDay()) % 7) + (Number(week) - 1) * 7);
    end = new Date(start);
    end.setDate(start.getDate() + 6);
  } else if (period === 'month') {
    const [year, month] = value.split('-').map(Number);
    start = new Date(year, month - 1, 1);
    end = new Date(year, month, 0);
  } else {
    start = new Date(Number(value), 0, 1);
    end = new Date(Number(value), 11, 31);
  }
  return [isoDate(start), isoDate(end)];
}

function updateSummaryReference() {
  const period = document.getElementById('summaryPeriod').value;
  const input = document.getElementById('summaryDate');
  input.type = period === 'year' ? 'number' : 'month';
  input.min = period === 'year' ? '2000' : '';
  input.max = period === 'year' ? '2100' : '';
  input.value = period === 'year' ? today().slice(0, 4) : today().slice(0, 7);
  document.getElementById('summaryDateLabel').textContent = period === 'year' ? 'Año' : 'Mes';
  document.getElementById('summaryWeekField').hidden = period !== 'week';
  updateWeekOptions();
}

function updateWeekOptions() {
  const select = document.getElementById('summaryWeek');
  const count = monthWeeks(document.getElementById('summaryDate').value);
  select.innerHTML = Array.from({ length: count }, (_, index) => `<option value="${index + 1}">Semana ${index + 1}</option>`).join('');
}

function summarize(cuts, periodSales, periodAdvances) {
  const services = cuts.reduce((sum, cut) => sum + Number(cut.amount), 0);
  const tips = cuts.reduce((sum, cut) => sum + Number(cut.tip || 0), 0);
  const salesTotal = periodSales.reduce((sum, sale) => sum + sale.total, 0);
  const advancesTotal = periodAdvances.reduce((sum, advance) => sum + advance.amount, 0);
  return {
    cuts: cuts.length, services, sales: salesTotal, tips, advances: advancesTotal,
    balance: services + tips + salesTotal - advancesTotal,
    cash: paymentTotal(cuts, 'Efectivo') + salePaymentTotal(periodSales, 'Efectivo') - advancePaymentTotal(periodAdvances, 'Efectivo'),
    mp: paymentTotal(cuts, 'Mercado Pago') + salePaymentTotal(periodSales, 'Mercado Pago') - advancePaymentTotal(periodAdvances, 'Mercado Pago'),
  };
}

function renderSummary() {
  const period = document.getElementById('summaryPeriod').value;
  const [from, to] = periodBounds(period, document.getElementById('summaryDate').value, document.getElementById('summaryWeek').value);
  const inRange = (item) => item.date >= from && item.date <= to;
  const periodCuts = entries.filter(inRange);
  const periodSales = sales.filter(inRange);
  const periodAdvances = advances.filter(inRange);
  const total = summarize(periodCuts, periodSales, periodAdvances);
  const dateLabel = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  document.getElementById('summaryRange').textContent = `${dateLabel.format(new Date(`${from}T00:00:00`))} — ${dateLabel.format(new Date(`${to}T00:00:00`))}`;
  ['Cuts', 'Services', 'Sales', 'Tips', 'Advances', 'Balance', 'Cash', 'Mp'].forEach((name) => {
    document.getElementById(`summary${name}`).textContent = name === 'Cuts' ? total.cuts : money.format(total[name.toLowerCase()]);
  });

  const groupKey = (item) => period === 'year' ? item.date.slice(0, 7) : item.date;
  const keys = [...new Set([...periodCuts, ...periodSales, ...periodAdvances].map(groupKey))].sort();
  const monthLabel = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' });
  document.getElementById('summaryBreakdownTitle').textContent = period === 'year' ? 'Resumen por mes' : 'Resumen por día';
  document.getElementById('summaryRows').innerHTML = keys.map((key) => {
    const matches = (item) => groupKey(item) === key;
    const row = summarize(periodCuts.filter(matches), periodSales.filter(matches), periodAdvances.filter(matches));
    const label = period === 'year' ? monthLabel.format(new Date(`${key}-01T00:00:00`)) : dateLabel.format(new Date(`${key}T00:00:00`));
    return `<tr><td>${escapeHtml(label)}</td><td>${row.cuts}</td><td>${money.format(row.services)}</td><td>${money.format(row.sales)}</td><td>${money.format(row.tips)}</td><td>${money.format(row.advances)}</td><td>${money.format(row.balance)}</td></tr>`;
  }).join('');
  document.getElementById('summaryEmpty').hidden = keys.length > 0;

  const activeBarbers = barbers.filter((barber) => periodCuts.some((cut) => cut.barber === barber) || periodAdvances.some((advance) => advance.barber === barber));
  document.getElementById('barberSummaryRows').innerHTML = activeBarbers.map((barber) => {
    const row = summarize(periodCuts.filter((cut) => cut.barber === barber), [], periodAdvances.filter((advance) => advance.barber === barber));
    return `<tr><td>${escapeHtml(barber)}</td><td>${row.cuts}</td><td>${money.format(row.services)}</td><td>${money.format(row.tips)}</td><td>${money.format(row.advances)}</td><td>${money.format(row.balance)}</td></tr>`;
  }).join('');
  document.getElementById('barberSummaryEmpty').hidden = activeBarbers.length > 0;
}

function barberColumn(barber, list) {
  const cuts = list.filter((entry) => entry.barber === barber).sort((a, b) => a.time.localeCompare(b.time));
  const total = cuts.reduce((sum, entry) => sum + Number(entry.amount) + Number(entry.tip || 0), 0);
  const rows = cuts.length ? cuts.map((entry) => `
    <button class="barber-service" type="button" data-cut="${escapeHtml(entry.id)}">
      <strong class="service-name">${escapeHtml(entry.service)}</strong>
      <span class="service-prices">
        <b>${money.format(Number(entry.amount) + Number(entry.tip || 0))}</b>
        <span class="price-breakdown">
          ${entry.payment === 'Ambos' ? `
            <small class="cash-price">${money.format(Number(entry.cashAmount))}</small>
            <small class="mp-price">${money.format(Number(entry.mpAmount))}</small>` : ''}
          ${Number(entry.tip) ? `<small class="tip-price">${money.format(Number(entry.tip))}</small>` : ''}
        </span>
      </span>
      <small class="payment-detail">${entry.payment === 'Mercado Pago' ? 'MP' : escapeHtml(entry.payment)}</small>
      ${entry.notes ? `<small class="service-note">Nota: ${escapeHtml(entry.notes)}</small>` : ''}
      <small class="cut-time">${escapeHtml(entry.time)}</small>
    </button>`).join('') : '<div class="barber-empty">Sin cortes cargados</div>';
  return `
    <section class="barber-column">
      <header class="barber-column-header">
        <div><strong>${escapeHtml(barber)}</strong><span>${cuts.length} ${cuts.length === 1 ? 'corte' : 'cortes'}</span></div>
        <button class="add-cut" type="button" data-barber="${escapeHtml(barber)}" aria-label="Registrar corte para ${escapeHtml(barber)}" title="Agregar corte">+</button>
      </header>
      <div class="barber-services">${rows}</div>
      <footer class="barber-column-total"><span>Total</span><strong>${money.format(total)}</strong></footer>
    </section>`;
}

function openCutDialog(barber) {
  form.reset();
  toggleSplitPayment();
  editingId = null;
  barberInput.value = barber;
  timeInput.value = nowTime();
  document.getElementById('formMode').textContent = 'NUEVO CORTE';
  document.getElementById('dialogTitle').textContent = `Corte de ${barber}`;
  dialog.showModal();
}

function openDetail(id) {
  const entry = entries.find((cut) => cut.id === id);
  if (!entry) return;
  selectedId = id;
  document.getElementById('detailTitle').textContent = `Corte de ${entry.barber}`;
  document.getElementById('cutDetail').innerHTML = [
    ['Barbero', entry.barber],
    ['Hora', entry.time],
    ['Servicio', entry.service],
    ['Precio', money.format(Number(entry.amount))],
    ['Medio de pago', entry.payment],
    ...(entry.payment === 'Ambos' ? [
      ['En efectivo', money.format(Number(entry.cashAmount))],
      ['En Mercado Pago', money.format(Number(entry.mpAmount))],
    ] : []),
    ['Propina', money.format(Number(entry.tip || 0))],
    ['Notas', entry.notes || 'Sin notas'],
  ].map(([label, value]) => `<div><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`).join('');
  detailDialog.showModal();
}

function openEditDialog(id) {
  const entry = entries.find((cut) => cut.id === id);
  if (!entry) return;
  editingId = id;
  barberInput.value = entry.barber;
  timeInput.value = entry.time;
  serviceInput.value = entry.service;
  amountInput.value = formatAmount(entry.amount);
  tipInput.value = entry.tip ? formatAmount(entry.tip) : '';
  paymentInput.value = entry.payment;
  cashAmountInput.value = entry.cashAmount ? formatAmount(entry.cashAmount) : '';
  mpAmountInput.value = entry.mpAmount ? formatAmount(entry.mpAmount) : '';
  toggleSplitPayment();
  notesInput.value = entry.notes || '';
  document.getElementById('formMode').textContent = 'MODIFICAR CORTE';
  document.getElementById('dialogTitle').textContent = `Corte de ${entry.barber}`;
  detailDialog.close();
  dialog.showModal();
}

function updateSaleTotal() {
  const quantity = Number(saleForm.elements.quantity.value || 0);
  const unitPrice = parseAmount(saleForm.elements.unitPrice.value);
  document.getElementById('saleTotalPreview').textContent = money.format(quantity * unitPrice);
}

function openSaleDialog(id = null) {
  saleForm.reset();
  editingSaleId = id;
  const sale = sales.find((item) => item.id === id);
  saleForm.elements.time.value = sale?.time || nowTime();
  saleForm.elements.product.value = sale?.product || '';
  saleForm.elements.quantity.value = sale?.quantity || 1;
  saleForm.elements.unitPrice.value = sale ? formatAmount(sale.unitPrice) : '';
  saleForm.elements.payment.value = sale?.payment || 'Efectivo';
  saleForm.elements.notes.value = sale?.notes || '';
  document.getElementById('saleFormMode').textContent = sale ? 'MODIFICAR VENTA' : 'NUEVA VENTA';
  updateSaleTotal();
  saleDetailDialog.close();
  saleDialog.showModal();
}

function openSaleDetail(id) {
  const sale = sales.find((item) => item.id === id);
  if (!sale) return;
  selectedSaleId = id;
  document.getElementById('saleDetailTitle').textContent = sale.product;
  document.getElementById('saleDetail').innerHTML = [
    ['Hora', sale.time], ['Producto', sale.product], ['Cantidad', sale.quantity],
    ['Precio unitario', money.format(sale.unitPrice)], ['Importe total', money.format(sale.total)],
    ['Medio de pago', sale.payment], ['Notas', sale.notes || 'Sin notas'],
  ].map(([label, value]) => `<div><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`).join('');
  saleDetailDialog.showModal();
}

function openAdvanceDialog(id = null) {
  advanceForm.reset();
  editingAdvanceId = id;
  const advance = advances.find((item) => item.id === id);
  advanceForm.elements.time.value = advance?.time || nowTime();
  advanceForm.elements.barber.value = advance?.barber || '';
  advanceForm.elements.amount.value = advance ? formatAmount(advance.amount) : '';
  advanceForm.elements.payment.value = advance?.payment || 'Efectivo';
  advanceForm.elements.reason.value = advance?.reason || '';
  document.getElementById('advanceFormMode').textContent = advance ? 'MODIFICAR ADELANTO' : 'NUEVO ADELANTO';
  advanceDetailDialog.close();
  advanceDialog.showModal();
}

function openAdvanceDetail(id) {
  const advance = advances.find((item) => item.id === id);
  if (!advance) return;
  selectedAdvanceId = id;
  document.getElementById('advanceDetailTitle').textContent = `Adelanto de ${advance.barber}`;
  document.getElementById('advanceDetail').innerHTML = [
    ['Hora', advance.time], ['Barbero', advance.barber], ['Importe', money.format(advance.amount)],
    ['Medio de entrega', advance.payment], ['Motivo', advance.reason || 'Sin descripción'],
  ].map(([label, value]) => `<div><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`).join('');
  advanceDetailDialog.showModal();
}

document.getElementById('barberColumns').addEventListener('click', (event) => {
  const cut = event.target.closest('[data-cut]');
  if (cut) return openDetail(cut.dataset.cut);
  const button = event.target.closest('[data-barber]');
  if (button) openCutDialog(button.dataset.barber);
});

document.querySelector('.nav').addEventListener('click', (event) => {
  const button = event.target.closest('[data-view]');
  if (!button) return;
  document.querySelectorAll('.nav-item').forEach((item) => {
    item.classList.toggle('active', item === button);
    item.toggleAttribute('aria-current', item === button);
  });
  document.querySelectorAll('.view').forEach((view) => view.classList.toggle('active', view.id === button.dataset.view));
  document.querySelector('h1').textContent = button.dataset.view === 'salesView' ? 'Ventas y adelantos' : button.dataset.view === 'summaryView' ? 'Resúmenes' : 'Panel diario';
});

document.getElementById('summaryPeriod').addEventListener('change', () => {
  updateSummaryReference();
  renderSummary();
});
document.getElementById('summaryDate').addEventListener('change', () => {
  if (document.getElementById('summaryPeriod').value === 'week') updateWeekOptions();
  renderSummary();
});
document.getElementById('summaryWeek').addEventListener('change', renderSummary);

document.getElementById('addSale').addEventListener('click', () => openSaleDialog());
['click', 'keydown'].forEach((type) => document.getElementById('salesRows').addEventListener(type, (event) => {
  if (type === 'keydown' && event.key !== 'Enter') return;
  const row = event.target.closest('[data-sale]');
  if (row) openSaleDetail(row.dataset.sale);
}));
document.getElementById('addAdvance').addEventListener('click', () => openAdvanceDialog());
['click', 'keydown'].forEach((type) => document.getElementById('advanceRows').addEventListener(type, (event) => {
  if (type === 'keydown' && event.key !== 'Enter') return;
  const row = event.target.closest('[data-advance]');
  if (row) openAdvanceDetail(row.dataset.advance);
}));
[saleForm.elements.quantity, saleForm.elements.unitPrice].forEach((input) => input.addEventListener('input', updateSaleTotal));

saleForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(saleForm));
  const quantity = Number(values.quantity);
  const unitPrice = parseAmount(values.unitPrice);
  saleForm.elements.unitPrice.setCustomValidity(unitPrice > 0 ? '' : 'El precio debe ser mayor que cero.');
  if (!saleForm.reportValidity()) return;
  const sale = { ...values, quantity, unitPrice, total: quantity * unitPrice, date: workday.value, id: editingSaleId || crypto.randomUUID() };
  sales = editingSaleId ? sales.map((item) => item.id === editingSaleId ? sale : item) : [...sales, sale];
  saveSales();
  editingSaleId = null;
  saleDialog.close();
  render();
});

advanceForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(advanceForm));
  advanceForm.elements.amount.setCustomValidity(parseAmount(values.amount) > 0 ? '' : 'El importe debe ser mayor que cero.');
  if (!advanceForm.reportValidity()) return;
  const advance = { ...values, amount: parseAmount(values.amount), date: workday.value, id: editingAdvanceId || crypto.randomUUID() };
  advances = editingAdvanceId ? advances.map((item) => item.id === editingAdvanceId ? advance : item) : [...advances, advance];
  saveAdvances();
  editingAdvanceId = null;
  advanceDialog.close();
  render();
});

serviceInput.addEventListener('change', (event) => {
  amountInput.value = prices[event.target.value] ? formatAmount(prices[event.target.value]) : '';
});
paymentInput.addEventListener('change', toggleSplitPayment);
[amountInput, tipInput, cashAmountInput, mpAmountInput].forEach((input) => input.addEventListener('input', () => cashAmountInput.setCustomValidity('')));

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(form));
  amountInput.setCustomValidity(parseAmount(values.amount) > 0 ? '' : 'El precio debe ser mayor que cero.');
  if (!form.reportValidity()) return;
  if (values.payment === 'Ambos' && parseAmount(values.cashAmount) + parseAmount(values.mpAmount) !== parseAmount(values.amount) + parseAmount(values.tip)) {
    cashAmountInput.setCustomValidity('La suma debe coincidir con el precio del corte más la propina.');
    return form.reportValidity();
  }
  const entry = { ...values, date: workday.value, amount: parseAmount(values.amount), tip: parseAmount(values.tip), cashAmount: parseAmount(values.cashAmount), mpAmount: parseAmount(values.mpAmount), id: editingId || crypto.randomUUID() };
  entries = editingId ? entries.map((cut) => cut.id === editingId ? entry : cut) : [...entries, entry];
  save();
  editingId = null;
  dialog.close();
  render();
});

workday.addEventListener('change', render);
document.getElementById('closeDialog').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
document.getElementById('closeDetailDialog').addEventListener('click', () => detailDialog.close());
detailDialog.addEventListener('click', (event) => { if (event.target === detailDialog) detailDialog.close(); });
document.getElementById('editCut').addEventListener('click', () => openEditDialog(selectedId));
document.getElementById('deleteCut').addEventListener('click', () => {
  if (!selectedId || !confirm('¿Eliminar este corte?')) return;
  entries = entries.filter((cut) => cut.id !== selectedId);
  save();
  selectedId = null;
  detailDialog.close();
  render();
});
document.getElementById('closeSaleDialog').addEventListener('click', () => saleDialog.close());
saleDialog.addEventListener('click', (event) => { if (event.target === saleDialog) saleDialog.close(); });
document.getElementById('closeSaleDetail').addEventListener('click', () => saleDetailDialog.close());
saleDetailDialog.addEventListener('click', (event) => { if (event.target === saleDetailDialog) saleDetailDialog.close(); });
document.getElementById('editSale').addEventListener('click', () => openSaleDialog(selectedSaleId));
document.getElementById('deleteSale').addEventListener('click', () => {
  if (!selectedSaleId || !confirm('¿Eliminar esta venta?')) return;
  sales = sales.filter((sale) => sale.id !== selectedSaleId);
  saveSales();
  selectedSaleId = null;
  saleDetailDialog.close();
  render();
});
document.getElementById('closeAdvanceDialog').addEventListener('click', () => advanceDialog.close());
advanceDialog.addEventListener('click', (event) => { if (event.target === advanceDialog) advanceDialog.close(); });
document.getElementById('closeAdvanceDetail').addEventListener('click', () => advanceDetailDialog.close());
advanceDetailDialog.addEventListener('click', (event) => { if (event.target === advanceDetailDialog) advanceDetailDialog.close(); });
document.getElementById('editAdvance').addEventListener('click', () => openAdvanceDialog(selectedAdvanceId));
document.getElementById('deleteAdvance').addEventListener('click', () => {
  if (!selectedAdvanceId || !confirm('¿Eliminar este adelanto?')) return;
  advances = advances.filter((advance) => advance.id !== selectedAdvanceId);
  saveAdvances();
  selectedAdvanceId = null;
  advanceDetailDialog.close();
  render();
});

render();
console.assert(paymentTotal([{ payment: 'Efectivo', amount: 1000, tip: 200 }], 'Efectivo') === 1200);
console.assert(paymentTotal([{ payment: 'Ambos', cashAmount: 500, mpAmount: 700 }], 'Mercado Pago') === 700);
console.assert(salePaymentTotal([{ payment: 'Efectivo', total: 1500 }], 'Efectivo') === 1500);
console.assert(advancePaymentTotal([{ payment: 'Efectivo', amount: 500 }], 'Efectivo') === 500);
console.assert(parseAmount('15.000') === 15000);
console.assert(periodBounds('week', '2026-07', 1).join() === '2026-07-06,2026-07-12');
console.assert(periodBounds('week', '2026-07', 4).join() === '2026-07-27,2026-08-02');
