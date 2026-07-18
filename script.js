const defaultConfig = {
  services: [{ id: 'corte', name: 'Corte clásico', price: 15000 }, { id: 'corte-barba', name: 'Corte + barba', price: 22000 }, { id: 'barba', name: 'Barba', price: 10000 }, { id: 'diseno', name: 'Diseño', price: 18000 }],
  products: [{ id: 'pomada', name: 'Pomada', price: 12000 }, { id: 'shampoo', name: 'Shampoo', price: 9000 }],
  barbers: ['Mateo', 'Julián', 'Nicolás', 'Tomás', 'Franco', 'Agustín', 'Lucas', 'Bruno', 'Santino'].map((name) => ({ id: name, name })),
  commission: 50,
};
try { Object.keys(localStorage).filter((key) => key.startsWith('theluxe-')).forEach((key) => localStorage.removeItem(key)); } catch {}
let config = structuredClone(defaultConfig);
let barbers = config.barbers.map(({ name }) => name);
let prices = Object.fromEntries(config.services.map(({ name, price }) => [name, price]));
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
const expenseForm = document.getElementById('expenseForm');
const expenseDialog = document.getElementById('expenseDialog');
const expenseDetailDialog = document.getElementById('expenseDetailDialog');
const openingCashForm = document.getElementById('openingCashForm');
const cashRegisterForm = document.getElementById('cashRegisterForm');
const commissionDialog = document.getElementById('commissionDialog');
const dailyCommissionForm = document.getElementById('dailyCommissionForm');
const serviceConfigForm = document.getElementById('serviceConfigForm');
const productConfigForm = document.getElementById('productConfigForm');
const barberConfigForm = document.getElementById('barberConfigForm');
const commissionForm = document.getElementById('commissionForm');
const configDialogs = { services: document.getElementById('serviceConfigDialog'), products: document.getElementById('productConfigDialog'), barbers: document.getElementById('barberConfigDialog') };
let entries = [];
let sales = [];
let advances = [];
let expenses = [];
let cashRegisters = {};
let editingId = null;
let selectedId = null;
let editingSaleId = null;
let selectedSaleId = null;
let editingAdvanceId = null;
let selectedAdvanceId = null;
let editingExpenseId = null;
let selectedExpenseId = null;
let editingOpening = false;

workday.value = today();
document.getElementById('summaryDate').value = today().slice(0, 7);
updateWeekOptions();
document.getElementById('summaryWeek').value = currentMonthWeek(today());
populateSelectors();
document.querySelectorAll('.money-input input').forEach((input) => input.addEventListener('input', () => {
  input.value = formatAmount(input.value);
  input.setCustomValidity('');
}));

function save() {
}

function saveSales() {
}

function saveAdvances() {
}

function saveExpenses() {
}

function saveCashRegisters() {
}

function saveConfig() {
  barbers = config.barbers.map(({ name }) => name);
  prices = Object.fromEntries(config.services.map(({ name, price }) => [name, price]));
  populateSelectors();
  renderConfig();
  render();
}

function populateSelectors() {
  serviceInput.innerHTML = '<option value="">Seleccionar servicio</option>' + config.services.map(({ name }) => `<option>${escapeHtml(name)}</option>`).join('');
  document.getElementById('saleProduct').innerHTML = '<option value="">Seleccionar producto</option>' + config.products.map(({ name }) => `<option>${escapeHtml(name)}</option>`).join('');
  advanceForm.elements.barber.innerHTML = '<option value="">Seleccionar barbero</option>' + config.barbers.map(({ name }) => `<option>${escapeHtml(name)}</option>`).join('');
}

function renderConfig() {
  const list = (type, price = false) => config[type].map((item) => `<div class="config-item"><span>${escapeHtml(item.name)}${price ? ` · ${money.format(item.price)}` : ''}</span><span class="config-actions"><button type="button" data-config-edit="${type}" data-id="${escapeHtml(item.id)}">Editar</button><button type="button" data-config-delete="${type}" data-id="${escapeHtml(item.id)}">Eliminar</button></span></div>`).join('');
  document.getElementById('serviceConfigList').innerHTML = list('services', true);
  document.getElementById('productConfigList').innerHTML = list('products', true);
  document.getElementById('barberConfigList').innerHTML = list('barbers');
  commissionForm.elements.commission.value = config.commission;
}

function saveCatalog(type, formElement) {
  const values = Object.fromEntries(new FormData(formElement));
  const existing = config[type].find((item) => item.id === values.id);
  const duplicate = config[type].some((item) => item.id !== values.id && item.name.toLowerCase() === values.name.trim().toLowerCase());
  formElement.elements.name.setCustomValidity(duplicate ? 'Ya existe un elemento con ese nombre.' : '');
  if (!formElement.reportValidity()) return;
  const item = { id: values.id || crypto.randomUUID(), name: values.name.trim(), ...(type !== 'barbers' ? { price: parseAmount(values.price) } : {}) };
  if (type !== 'barbers' && item.price <= 0) {
    formElement.elements.price.setCustomValidity('El precio debe ser mayor que cero.');
    return formElement.reportValidity();
  }
  if (existing && existing.name !== item.name) {
    if (type === 'services') entries = entries.map((entry) => entry.service === existing?.name ? { ...entry, service: item.name } : entry);
    if (type === 'products') sales = sales.map((sale) => sale.product === existing?.name ? { ...sale, product: item.name } : sale);
    if (type === 'barbers') {
      entries = entries.map((entry) => entry.barber === existing?.name ? { ...entry, barber: item.name } : entry);
      advances = advances.map((advance) => advance.barber === existing?.name ? { ...advance, barber: item.name } : advance);
    }
    save(); saveSales(); saveAdvances();
  }
  config[type] = existing ? config[type].map((current) => current.id === existing.id ? item : current) : [...config[type], item];
  formElement.reset();
  configDialogs[type].close();
  saveConfig();
}

function configInUse(type, name) {
  if (type === 'services') return entries.some((entry) => entry.service === name);
  if (type === 'products') return sales.some((sale) => sale.product === name);
  return entries.some((entry) => entry.barber === name) || advances.some((advance) => advance.barber === name);
}

function openConfigDialog(type, item = null) {
  const formElement = type === 'services' ? serviceConfigForm : type === 'products' ? productConfigForm : barberConfigForm;
  formElement.reset();
  formElement.elements.name.setCustomValidity('');
  if (type !== 'barbers') formElement.elements.price.setCustomValidity('');
  formElement.elements.id.value = item?.id || '';
  formElement.elements.name.value = item?.name || '';
  if (type !== 'barbers') formElement.elements.price.value = item ? formatAmount(item.price) : '';
  document.getElementById(`${type === 'services' ? 'service' : type === 'products' ? 'product' : 'barber'}ConfigMode`).textContent = item ? `MODIFICAR ${type === 'services' ? 'SERVICIO' : type === 'products' ? 'PRODUCTO' : 'BARBERO'}` : `NUEVO ${type === 'services' ? 'SERVICIO' : type === 'products' ? 'PRODUCTO' : 'BARBERO'}`;
  configDialogs[type].showModal();
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

function selectedExpenses() {
  return expenses.filter((expense) => expense.date === workday.value);
}

function isDayOpen(date) {
  const register = cashRegisters[date];
  return Boolean(register && (register.opened === true || 'initialCash' in register || 'initialMp' in register));
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
  const dayExpenses = selectedExpenses();
  const register = cashRegisters[workday.value] || {};
  const opened = isDayOpen(workday.value);
  const total = list.reduce((sum, entry) => sum + Number(entry.amount) + Number(entry.tip || 0), 0)
    + daySales.reduce((sum, sale) => sum + sale.total, 0);
  document.getElementById('dailyTotal').textContent = money.format(total);
  document.getElementById('dailyCount').textContent = `${list.length} ${list.length === 1 ? 'corte' : 'cortes'} · ${daySales.length} ${daySales.length === 1 ? 'venta' : 'ventas'}`;
  document.getElementById('tipsTotal').textContent = money.format(list.reduce((sum, entry) => sum + Number(entry.tip || 0), 0));
  document.getElementById('cashTotal').textContent = money.format(Number(register.initialCash || 0) + paymentTotal(list, 'Efectivo') + salePaymentTotal(daySales, 'Efectivo') - advancePaymentTotal(dayAdvances, 'Efectivo') - expensePaymentTotal(dayExpenses, 'Efectivo'));
  document.getElementById('mpTotal').textContent = money.format(Number(register.initialMp || 0) + paymentTotal(list, 'Mercado Pago') + salePaymentTotal(daySales, 'Mercado Pago') - advancePaymentTotal(dayAdvances, 'Mercado Pago') - expensePaymentTotal(dayExpenses, 'Mercado Pago'));
  document.getElementById('barberColumns').innerHTML = barbers.map((barber) => barberColumn(barber, list)).join('');
  renderSales(daySales);
  renderAdvances(dayAdvances);
  renderExpenses(dayExpenses);
  ['initialCash', 'initialMp'].forEach((name) => { openingCashForm.elements[name].value = name in register ? formatAmount(register[name]) : ''; });
  ['realCash', 'realMp'].forEach((name) => { cashRegisterForm.elements[name].value = name in register ? formatAmount(register[name]) : ''; });
  const openingStatus = document.getElementById('openingStatus');
  openingStatus.textContent = opened ? 'Jornada iniciada' : 'Pendiente';
  openingStatus.classList.toggle('open', opened);
  openingCashForm.hidden = opened && !editingOpening;
  document.getElementById('openingSaved').hidden = !opened || editingOpening;
  document.getElementById('openingCashValue').textContent = money.format(Number(register.initialCash || 0));
  document.getElementById('openingMpValue').textContent = money.format(Number(register.initialMp || 0));
  openingCashForm.querySelector('button').textContent = opened ? 'Guardar cambios' : 'Iniciar jornada';
  ['addSale', 'addAdvance', 'addExpense'].forEach((id) => { document.getElementById(id).disabled = !opened; });
  cashRegisterForm.querySelector('button').disabled = !opened;
  renderSummary();
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
        <button class="add-cut" type="button" data-barber="${escapeHtml(barber)}" aria-label="Registrar corte para ${escapeHtml(barber)}" title="Agregar corte" ${isDayOpen(workday.value) ? '' : 'disabled'}>+</button>
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
    ['Comisión', money.format(Number(entry.commissionAmount || 0))],
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
  document.querySelector('h1').textContent = button.dataset.view === 'salesView' ? 'Caja y movimientos' : button.dataset.view === 'summaryView' ? 'Resúmenes' : button.dataset.view === 'configView' ? 'Configuración' : 'Panel diario';
  if (button.dataset.view === 'summaryView') {
    document.getElementById('summaryPeriod').value = 'week';
    updateSummaryReference();
    renderSummary();
  }
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
document.getElementById('addExpense').addEventListener('click', () => openExpenseDialog());
['click', 'keydown'].forEach((type) => document.getElementById('expenseRows').addEventListener(type, (event) => {
  if (type === 'keydown' && event.key !== 'Enter') return;
  const row = event.target.closest('[data-expense]');
  if (row) openExpenseDetail(row.dataset.expense);
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

expenseForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(expenseForm));
  expenseForm.elements.amount.setCustomValidity(parseAmount(values.amount) > 0 ? '' : 'El importe debe ser mayor que cero.');
  if (!expenseForm.reportValidity()) return;
  const expense = { ...values, amount: parseAmount(values.amount), date: workday.value, id: editingExpenseId || crypto.randomUUID() };
  expenses = editingExpenseId ? expenses.map((item) => item.id === editingExpenseId ? expense : item) : [...expenses, expense];
  saveExpenses();
  editingExpenseId = null;
  expenseDialog.close();
  render();
});

openingCashForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(openingCashForm));
  const current = cashRegisters[workday.value] || {};
  cashRegisters[workday.value] = { ...current, initialCash: parseAmount(values.initialCash), initialMp: parseAmount(values.initialMp), opened: true, openedAt: current.openedAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
  saveCashRegisters();
  editingOpening = false;
  render();
});

cashRegisterForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(cashRegisterForm));
  cashRegisters[workday.value] = { ...(cashRegisters[workday.value] || {}), realCash: parseAmount(values.realCash), realMp: parseAmount(values.realMp), updatedAt: new Date().toISOString() };
  saveCashRegisters();
  render();
});

serviceInput.addEventListener('change', (event) => {
  amountInput.value = prices[event.target.value] ? formatAmount(prices[event.target.value]) : '';
});
saleForm.elements.product.addEventListener('change', (event) => {
  const product = config.products.find(({ name }) => name === event.target.value);
  saleForm.elements.unitPrice.value = product ? formatAmount(product.price) : '';
  updateSaleTotal();
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
  const previous = entries.find((cut) => cut.id === editingId);
  const commissionRate = previous?.commissionRate ?? config.commission;
  const amount = parseAmount(values.amount);
  const entry = { ...values, date: workday.value, amount, tip: parseAmount(values.tip), cashAmount: parseAmount(values.cashAmount), mpAmount: parseAmount(values.mpAmount), commissionRate, commissionAmount: amount * commissionRate / 100, id: editingId || crypto.randomUUID() };
  entries = editingId ? entries.map((cut) => cut.id === editingId ? entry : cut) : [...entries, entry];
  save();
  editingId = null;
  dialog.close();
  render();
});

document.getElementById('editOpeningCash').addEventListener('click', () => {
  editingOpening = true;
  render();
});
workday.addEventListener('change', () => {
  editingOpening = false;
  render();
});
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
document.getElementById('closeExpenseDialog').addEventListener('click', () => expenseDialog.close());
expenseDialog.addEventListener('click', (event) => { if (event.target === expenseDialog) expenseDialog.close(); });
document.getElementById('closeExpenseDetail').addEventListener('click', () => expenseDetailDialog.close());
expenseDetailDialog.addEventListener('click', (event) => { if (event.target === expenseDetailDialog) expenseDetailDialog.close(); });
document.getElementById('editExpense').addEventListener('click', () => openExpenseDialog(selectedExpenseId));
document.getElementById('deleteExpense').addEventListener('click', () => {
  if (!selectedExpenseId || !confirm('¿Eliminar esta salida de caja?')) return;
  expenses = expenses.filter((expense) => expense.id !== selectedExpenseId);
  saveExpenses();
  selectedExpenseId = null;
  expenseDetailDialog.close();
  render();
});

serviceConfigForm.addEventListener('submit', (event) => { event.preventDefault(); saveCatalog('services', serviceConfigForm); });
productConfigForm.addEventListener('submit', (event) => { event.preventDefault(); saveCatalog('products', productConfigForm); });
barberConfigForm.addEventListener('submit', (event) => { event.preventDefault(); saveCatalog('barbers', barberConfigForm); });
document.getElementById('addServiceConfig').addEventListener('click', () => openConfigDialog('services'));
document.getElementById('addProductConfig').addEventListener('click', () => openConfigDialog('products'));
document.getElementById('addBarberConfig').addEventListener('click', () => openConfigDialog('barbers'));
Object.values(configDialogs).forEach((configDialog) => {
  configDialog.querySelector('.config-close').addEventListener('click', () => configDialog.close());
  configDialog.addEventListener('click', (event) => { if (event.target === configDialog) configDialog.close(); });
});
commissionForm.addEventListener('submit', (event) => {
  event.preventDefault();
  config.commission = Number(commissionForm.elements.commission.value);
  saveConfig();
});
document.getElementById('changeCommission').addEventListener('click', () => {
  dailyCommissionForm.elements.commission.value = config.commission;
  commissionDialog.showModal();
});
document.getElementById('closeCommissionDialog').addEventListener('click', () => commissionDialog.close());
commissionDialog.addEventListener('click', (event) => { if (event.target === commissionDialog) commissionDialog.close(); });
dailyCommissionForm.addEventListener('submit', (event) => {
  event.preventDefault();
  config.commission = Number(dailyCommissionForm.elements.commission.value);
  commissionDialog.close();
  saveConfig();
});
document.getElementById('configView').addEventListener('click', (event) => {
  const button = event.target.closest('[data-config-edit], [data-config-delete]');
  if (!button) return;
  const type = button.dataset.configEdit || button.dataset.configDelete;
  const item = config[type].find((current) => current.id === button.dataset.id);
  if (!item) return;
  if (button.dataset.configDelete) {
    if (configInUse(type, item.name)) return alert('No se puede eliminar porque tiene operaciones asociadas.');
    if (!confirm(`¿Eliminar ${item.name}?`)) return;
    config[type] = config[type].filter((current) => current.id !== item.id);
    return saveConfig();
  }
  openConfigDialog(type, item);
});

renderConfig();
render();
console.assert(paymentTotal([{ payment: 'Efectivo', amount: 1000, tip: 200 }], 'Efectivo') === 1200);
console.assert(paymentTotal([{ payment: 'Ambos', cashAmount: 500, mpAmount: 700 }], 'Mercado Pago') === 700);
console.assert(salePaymentTotal([{ payment: 'Efectivo', total: 1500 }], 'Efectivo') === 1500);
console.assert(advancePaymentTotal([{ payment: 'Efectivo', amount: 500 }], 'Efectivo') === 500);
console.assert(expensePaymentTotal([{ payment: 'Mercado Pago', amount: 800 }], 'Mercado Pago') === 800);
console.assert(barberBalance([{ amount: 90000 }], 4000, 5000) === 44000);
console.assert(parseAmount('15.000') === 15000);
console.assert(periodBounds('week', '2026-07', 1).join() === '2026-07-06,2026-07-12');
console.assert(periodBounds('week', '2026-07', 4).join() === '2026-07-27,2026-08-02');
console.assert(currentMonthWeek('2026-07-18') === 2);
