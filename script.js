const defaultConfig = {
  services: [{ id: 'corte', name: 'Corte clásico', price: 15000 }, { id: 'corte-barba', name: 'Corte + barba', price: 22000 }, { id: 'barba', name: 'Barba', price: 10000 }, { id: 'diseno', name: 'Diseño', price: 18000 }],
  products: [{ id: 'pomada', name: 'Pomada', price: 12000 }, { id: 'shampoo', name: 'Shampoo', price: 9000 }],
  barbers: ['Mateo', 'Julián', 'Nicolás', 'Tomás', 'Franco', 'Agustín', 'Lucas', 'Bruno', 'Santino'].map((name) => ({ id: name, name, active: true })),
  commission: 50,
  commissionHistory: [{ date: '0000-01-01', rate: 50 }],
};
try { Object.keys(localStorage).filter((key) => key.startsWith('theluxe-') && key !== inventoryStorageKey).forEach((key) => localStorage.removeItem(key)); } catch {}
let config = structuredClone(defaultConfig);
let barbers = config.barbers.filter(({ active }) => active !== false).map(({ name }) => name);
let prices = Object.fromEntries(config.services.map(({ name, price }) => [name, price]));
const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const integer = new Intl.NumberFormat('es-AR');
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const nowTime = () => new Date().toTimeString().slice(0, 5);
const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
const formatAmount = (value) => value === '' || value == null ? '' : integer.format(parseAmount(value));
const searchText = (value) => String(value).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('es');
const matchesSearch = (name, query) => searchText(name).startsWith(searchText(query));

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
const transferForm = document.getElementById('transferForm');
const commissionDialog = document.getElementById('commissionDialog');
const dailyCommissionForm = document.getElementById('dailyCommissionForm');
const serviceConfigForm = document.getElementById('serviceConfigForm');
const productConfigForm = document.getElementById('productConfigForm');
const barberConfigForm = document.getElementById('barberConfigForm');
const commissionForm = document.getElementById('commissionForm');
const configDialogs = { services: document.getElementById('serviceConfigDialog'), products: document.getElementById('productConfigDialog'), barbers: document.getElementById('barberConfigDialog') };
const demoCutCounts = [3, 2, 4, 1, 3, 2, 4, 2, 3];
let entries = barbers.flatMap((barber, barberIndex) => Array.from({ length: demoCutCounts[barberIndex] }, (_, cutIndex) => {
  const service = config.services[(barberIndex + cutIndex) % config.services.length];
  const tip = (barberIndex + cutIndex) % 3 === 0 ? 2000 : 0;
  const payment = (barberIndex + cutIndex) % 5 === 0 ? 'Ambos' : (barberIndex + cutIndex) % 2 ? 'Mercado Pago' : 'Efectivo';
  const total = service.price + tip;
  const cashAmount = payment === 'Ambos' ? Math.round(total * .4) : 0;
  return { id: `demo-${barberIndex}-${cutIndex}`, date: today(), barber, time: `${String(10 + cutIndex).padStart(2, '0')}:${String(barberIndex * 5).padStart(2, '0')}`, service: service.name, amount: service.price, tip, payment, cashAmount, mpAmount: payment === 'Ambos' ? total - cashAmount : 0, notes: 'Dato de muestra', commissionRate: config.commission, commissionAmount: service.price * config.commission / 100 };
}));
let sales = [];
let advances = [];
let expenses = [];
let transfers = [];
let openingAdjustments = [];
let cashRegisters = { [today()]: { initialCash: 50000, initialMp: 80000, opened: true } };
let barberPayments = {};
let editingId = null;
let selectedId = null;
let editingSaleId = null;
let selectedSaleId = null;
let editingAdvanceId = null;
let selectedAdvanceId = null;
let editingExpenseId = null;
let selectedExpenseId = null;
let editingOpening = false;
let reorderingBarbers = false;
let pendingBarberOrder = [];

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

function saveTransfers() {
}

function saveOpeningAdjustments() {
}

function saveConfig() {
  barbers = config.barbers.filter(({ active }) => active !== false).map(({ name }) => name);
  prices = Object.fromEntries(config.services.map(({ name, price }) => [name, price]));
  populateSelectors();
  renderConfig();
  render();
}

function populateSelectors() {
  serviceInput.innerHTML = '<option value="">Seleccionar servicio</option>' + config.services.map(({ name }) => `<option>${escapeHtml(name)}</option>`).join('');
  document.getElementById('summaryServiceOptions').innerHTML = config.services.map(({ name }) => `<label><input type="checkbox" value="${escapeHtml(name)}" checked> ${escapeHtml(name)}</label>`).join('');
  document.getElementById('summaryBarberFilter').innerHTML = '<option value="">Todos los barberos</option>' + config.barbers.map(({ name }) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
  document.getElementById('saleProduct').innerHTML = '<option value="">Seleccionar producto</option>' + config.products.map(({ name }) => `<option>${escapeHtml(name)}</option>`).join('');
  advanceForm.elements.barber.innerHTML = '<option value="">Seleccionar barbero</option>' + config.barbers.filter(({ active }) => active !== false).map(({ name }) => `<option>${escapeHtml(name)}</option>`).join('');
}

function renderConfig() {
  const list = (type, price = false) => config[type].map((item) => `<div class="config-item"><span>${escapeHtml(item.name)}${price ? ` · ${money.format(item.price)}` : ''}</span><span class="config-actions"><button type="button" data-config-edit="${type}" data-id="${escapeHtml(item.id)}">Editar</button><button type="button" data-config-delete="${type}" data-id="${escapeHtml(item.id)}">Eliminar</button></span></div>`).join('');
  document.getElementById('serviceConfigList').innerHTML = list('services', true);
  document.getElementById('productConfigList').innerHTML = list('products', true);
  document.getElementById('barberConfigList').innerHTML = config.barbers.map((item) => `<div class="config-item" data-name="${escapeHtml(item.name)}"><span>${escapeHtml(item.name)}</span><span class="config-actions"><label class="config-active"><input type="checkbox" data-config-active="barbers" data-id="${escapeHtml(item.id)}" ${item.active !== false ? 'checked' : ''}> Activo</label><button type="button" data-config-edit="barbers" data-id="${escapeHtml(item.id)}">Editar</button><button type="button" data-config-delete="barbers" data-id="${escapeHtml(item.id)}">Eliminar</button></span></div>`).join('');
  filterBarberConfig();
  commissionForm.elements.commission.value = config.commission;
}

function filterBarberConfig() {
  const query = document.getElementById('barberConfigSearch').value;
  document.querySelectorAll('#barberConfigList [data-name]').forEach((item) => { item.style.display = matchesSearch(item.dataset.name, query) ? '' : 'none'; });
}

function saveCatalog(type, formElement) {
  const values = Object.fromEntries(new FormData(formElement));
  const existing = config[type].find((item) => item.id === values.id);
  const duplicate = config[type].some((item) => item.id !== values.id && item.name.toLowerCase() === values.name.trim().toLowerCase());
  formElement.elements.name.setCustomValidity(duplicate ? 'Ya existe un elemento con ese nombre.' : '');
  if (!formElement.reportValidity()) return;
  const item = { id: values.id || crypto.randomUUID(), name: values.name.trim(), ...(type !== 'barbers' ? { price: parseAmount(values.price) } : { active: existing?.active !== false }) };
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
      barberPayments = Object.fromEntries(Object.entries(barberPayments).map(([date, payments]) => [date, Object.fromEntries(Object.entries(payments).map(([barber, payment]) => [barber === existing.name ? item.name : barber, payment]))]));
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

function selectedTransfers() {
  return transfers.filter((transfer) => transfer.date === workday.value);
}

function selectedOpeningAdjustments() {
  return openingAdjustments.filter((adjustment) => adjustment.date === workday.value);
}

function barberPaymentRecord(barber, date = workday.value) {
  const record = barberPayments[date]?.[barber];
  if (!record) return { status: 'No pago', cashAmount: '', mpAmount: '' };
  if (typeof record === 'string') return { status: record, cashAmount: '', mpAmount: '' };
  return { status: record.status || 'No pago', cashAmount: record.cashAmount ?? '', mpAmount: record.mpAmount ?? '' };
}

function updateBarberPaymentColumn(column, payment) {
  const state = barberPaymentState(payment, Number(column.dataset.paymentDue));
  const mixed = state.mixed;
  column.classList.toggle('is-paid', state.isPaid);
  column.classList.toggle('is-payment-incomplete', mixed && !state.isPaid);
  column.dataset.paymentStatus = payment.status;
  column.querySelector('[data-payment-label]').textContent = state.label;
  column.querySelector('.payment-disclosure').title = `Pago del día: ${state.label}`;
  column.querySelectorAll('[data-barber-payment-method]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.barberPaymentMethod === payment.status));
  });
  column.querySelector('.payment-inline-split').hidden = !mixed;
  column.querySelectorAll('[data-payment-amount]').forEach((input) => { input.disabled = !mixed || reorderingBarbers; });
  column.querySelector('[data-payment-sum]').textContent = money.format(state.paidAmount);
  column.querySelector('[data-payment-balance-label]').textContent = state.excess ? 'De más' : 'Falta pagar';
  column.querySelector('[data-payment-balance]').textContent = money.format(state.excess || state.remaining);
}

function isDayOpen(date) {
  const register = cashRegisters[date];
  return Boolean(register && (register.opened === true || 'initialCash' in register || 'initialMp' in register));
}

function previousClosedRegister(date) {
  const previousDate = Object.keys(cashRegisters).filter((key) => key < date && 'realMp' in cashRegisters[key]).sort().at(-1);
  return previousDate ? { date: previousDate, register: cashRegisters[previousDate] } : null;
}

function shiftDate(date, days) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return isoDate(value);
}

function defaultCommission(date) {
  return Number([...(config.commissionHistory || [])].filter((item) => item.date <= date).sort((a, b) => a.date.localeCompare(b.date)).at(-1)?.rate ?? config.commission);
}

function effectiveCommission(date) {
  return Number(cashRegisters[date]?.commissionRate ?? defaultCommission(date));
}

function initializeOpening(date) {
  if (isDayOpen(date)) return false;
  const previous = previousClosedRegister(date);
  if (!previous) return false;
  cashRegisters[date] = {
    initialCash: Math.max(0, Number(previous.register.realCash || 0) - Number(previous.register.withdrawal || 0)),
    initialMp: Number(previous.register.realMp || 0), opened: true, autoOpened: true,
    openedAt: new Date().toISOString(), inheritedFrom: previous.date,
  };
  saveCashRegisters();
  return true;
}

function dayBalance(type, list = selectedEntries(), daySales = selectedSales(), dayAdvances = selectedAdvances(), dayExpenses = selectedExpenses(), dayTransfers = selectedTransfers()) {
  const register = cashRegisters[workday.value] || {};
  const initial = Number(register[type === 'Efectivo' ? 'initialCash' : 'initialMp'] || 0);
  return balance(type, initial, list, daySales, dayAdvances, dayExpenses, dayTransfers);
}

function renderClosingDifferences(cashTheoretical = dayBalance('Efectivo'), mpTheoretical = dayBalance('Mercado Pago')) {
  const register = cashRegisters[workday.value] || {};
  const cashValue = cashRegisterForm.elements.realCash.value;
  const mpValue = cashRegisterForm.elements.realMp.value;
  const withdrawal = parseAmount(cashRegisterForm.elements.withdrawal.value);
  document.getElementById('theoreticalCash').textContent = money.format(cashTheoretical);
  document.getElementById('theoreticalMp').textContent = money.format(mpTheoretical);
  document.getElementById('cashDifference').textContent = cashValue ? money.format(parseAmount(cashValue) - cashTheoretical) : '—';
  document.getElementById('mpDifference').textContent = mpValue ? money.format(parseAmount(mpValue) - mpTheoretical) : '—';
  const closed = 'realCash' in register && 'realMp' in register;
  document.getElementById('closingStatus').textContent = closed ? 'Cierre guardado' : 'Pendiente';
  document.getElementById('closingStatus').classList.toggle('closed', closed);
  document.getElementById('nextOpeningCash').textContent = `${money.format(Math.max(0, parseAmount(cashValue) - withdrawal))} efectivo`;
  document.getElementById('nextOpeningMp').textContent = `${money.format(parseAmount(mpValue))} MP`;
}

function toggleSplitPayment() {
  const split = paymentInput.value === 'Ambos';
  splitPayment.hidden = !split;
  cashAmountInput.required = split;
  mpAmountInput.required = split;
  cashAmountInput.setCustomValidity('');
}

function render() {
  initializeOpening(workday.value);
  const list = selectedEntries();
  const daySales = selectedSales();
  const dayAdvances = selectedAdvances();
  const dayExpenses = selectedExpenses();
  const dayTransfers = selectedTransfers();
  const register = cashRegisters[workday.value] || {};
  const opened = isDayOpen(workday.value);
  const revenue = dailyRevenue(list, daySales, effectiveCommission);
  const operationCount = list.length + daySales.length;
  document.getElementById('dailyCollected').textContent = money.format(revenue.collected);
  document.getElementById('dailyServicesOnly').textContent = money.format(revenue.services - revenue.tips);
  document.getElementById('dailyTips').textContent = money.format(revenue.tips);
  document.getElementById('dailyServicesCash').textContent = money.format(revenue.cashServices);
  document.getElementById('dailyServicesMp').textContent = money.format(revenue.mpServices);
  document.getElementById('dailyTipsCash').textContent = money.format(revenue.cashTips);
  document.getElementById('dailyTipsMp').textContent = money.format(revenue.mpTips);
  document.getElementById('dailyInvoiced').textContent = money.format(revenue.invoiced);
  document.getElementById('dailyInvoicedCash').textContent = money.format(revenue.cashInvoiced);
  document.getElementById('dailyInvoicedMp').textContent = money.format(revenue.mpInvoiced);
  document.getElementById('dailyCommission').textContent = money.format(revenue.commission);
  document.getElementById('dailyNet').textContent = money.format(revenue.net);
  document.getElementById('dailyNetCash').textContent = money.format(revenue.cashNet);
  document.getElementById('dailyNetMp').textContent = money.format(revenue.mpNet);
  document.getElementById('dailyServicesTotal').textContent = money.format(revenue.services);
  document.getElementById('dailyServicesTotalCash').textContent = money.format(revenue.cashServices + revenue.cashTips);
  document.getElementById('dailyServicesTotalMp').textContent = money.format(revenue.mpServices + revenue.mpTips);
  document.getElementById('dailySalesTotal').textContent = money.format(revenue.sales);
  document.getElementById('dailySalesCash').textContent = money.format(salePaymentTotal(daySales, 'Efectivo'));
  document.getElementById('dailySalesMp').textContent = money.format(salePaymentTotal(daySales, 'Mercado Pago'));
  document.getElementById('dailyCount').textContent = `${list.length} ${list.length === 1 ? 'corte' : 'cortes'}`;
  document.getElementById('dailySalesCount').textContent = `${daySales.length} ${daySales.length === 1 ? 'venta' : 'ventas'}`;
  document.getElementById('dailyAverageTicket').textContent = money.format(operationCount ? revenue.invoiced / operationCount : 0);
  const cashBalance = dayBalance('Efectivo', list, daySales, dayAdvances, dayExpenses, dayTransfers);
  const mpBalance = dayBalance('Mercado Pago', list, daySales, dayAdvances, dayExpenses, dayTransfers);
  document.getElementById('cashTotal').textContent = money.format(cashBalance);
  document.getElementById('mpTotal').textContent = money.format(mpBalance);
  document.getElementById('transferCashAvailable').textContent = money.format(cashBalance);
  document.getElementById('transferMpAvailable').textContent = money.format(mpBalance);
  const barberColumns = document.getElementById('barberColumns');
  barberColumns.innerHTML = (reorderingBarbers ? pendingBarberOrder : barbers).map((barber) => barberColumn(barber, list)).join('');
  barberColumns.classList.toggle('reordering', reorderingBarbers);
  renderSales(daySales);
  renderAdvances(dayAdvances);
  renderExpenses(dayExpenses);
  renderTransfers(dayTransfers, selectedOpeningAdjustments());
  renderInventory();
  const previousClosing = opened ? null : previousClosedRegister(workday.value);
  openingCashForm.elements.initialCash.value = 'initialCash' in register ? formatAmount(register.initialCash) : '';
  openingCashForm.elements.initialMp.value = 'initialMp' in register ? formatAmount(register.initialMp) : previousClosing ? formatAmount(previousClosing.register.realMp) : '';
  const inheritedMpHint = document.getElementById('inheritedMpHint');
  inheritedMpHint.hidden = !previousClosing;
  inheritedMpHint.textContent = previousClosing ? `Tomado del cierre de la jornada ${previousClosing.date}` : '';
  ['realCash', 'realMp', 'withdrawal'].forEach((name) => { cashRegisterForm.elements[name].value = name in register ? formatAmount(register[name]) : name === 'withdrawal' ? '0' : ''; });
  renderClosingDifferences(cashBalance, mpBalance);
  const openingStatus = document.getElementById('openingStatus');
  openingStatus.textContent = opened ? 'Jornada iniciada' : 'Pendiente';
  openingStatus.classList.toggle('open', opened);
  openingCashForm.hidden = opened && !editingOpening;
  document.getElementById('openingSaved').hidden = !opened || editingOpening;
  document.getElementById('openingCashValue').textContent = money.format(Number(register.initialCash || 0));
  document.getElementById('openingMpValue').textContent = money.format(Number(register.initialMp || 0));
  openingCashForm.querySelector('button[type="submit"]').textContent = opened ? 'Guardar cambios' : 'Iniciar jornada';
  document.getElementById('openingEditDescription').hidden = !opened || !editingOpening;
  document.getElementById('cancelOpeningEdit').hidden = !opened || !editingOpening;
  openingCashForm.elements.editDescription.required = opened && editingOpening;
  ['addSale', 'addAdvance', 'addExpense'].forEach((id) => { document.getElementById(id).disabled = !opened; });
  transferForm.querySelector('button').disabled = !opened;
  cashRegisterForm.querySelector('button').disabled = !opened;
  renderSummary();
}

function barberColumn(barber, list) {
  const cuts = list.filter((entry) => entry.barber === barber).sort((a, b) => a.time.localeCompare(b.time));
  const total = cuts.reduce((sum, entry) => sum + Number(entry.amount) + Number(entry.tip || 0), 0);
  const payment = barberPaymentRecord(barber);
  const paymentStatus = payment.status;
  const payout = barberPayout(cuts, effectiveCommission);
  const paymentState = barberPaymentState(payment, payout.total);
  const paymentMethods = ['No pago', 'Efectivo', 'Mercado Pago', 'Mixto'].map((method) => `<button type="button" class="payment-method-option" data-barber-payment-method="${method}" aria-pressed="${method === paymentStatus}" aria-label="${method} para ${escapeHtml(barber)}" title="${method}" ${reorderingBarbers ? 'disabled' : ''}>${method === 'Mercado Pago' ? 'MP' : method}</button>`).join('');
  const rows = cuts.length ? cuts.map((entry) => `
    <button class="barber-service" type="button" data-cut="${escapeHtml(entry.id)}">
      <span class="cut-summary">
        <strong class="service-name">${escapeHtml(entry.service)}</strong>
        <small class="cut-time">${escapeHtml(entry.time)}</small>
      </span>
      <span class="service-prices">
        <b class="${entry.payment === 'Efectivo' ? 'cash-price' : entry.payment === 'Mercado Pago' ? 'mp-price' : ''}">${money.format(Number(entry.amount) + Number(entry.tip || 0))}</b>
        <span class="price-breakdown">
          ${entry.payment === 'Ambos' ? `
            <small class="cash-price" aria-label="Efectivo: ${money.format(Number(entry.cashAmount))}">${money.format(Number(entry.cashAmount))}</small>
            <small class="mp-price" aria-label="Mercado Pago: ${money.format(Number(entry.mpAmount))}">${money.format(Number(entry.mpAmount))}</small>` : ''}
          ${Number(entry.tip) ? `<small class="tip-price" aria-label="Propina: ${money.format(Number(entry.tip))}">${money.format(Number(entry.tip))}</small>` : ''}
        </span>
      </span>
      ${entry.notes ? `<small class="service-note">Nota: ${escapeHtml(entry.notes)}</small>` : ''}
    </button>`).join('') : '<div class="barber-empty">Sin cortes cargados</div>';
  return `
    <section class="barber-column${paymentState.isPaid ? ' is-paid' : paymentState.mixed ? ' is-payment-incomplete' : ''}" data-payment-due="${payout.total}" data-payment-status="${escapeHtml(paymentStatus)}" data-barber-column="${escapeHtml(barber)}" ${reorderingBarbers ? 'draggable="true" tabindex="0"' : ''}>
      <header class="barber-column-header">
        <strong>${escapeHtml(barber)}</strong>
        <button class="add-cut" type="button" data-barber="${escapeHtml(barber)}" aria-label="Registrar corte para ${escapeHtml(barber)}" title="Agregar corte" ${isDayOpen(workday.value) ? '' : 'disabled'}>+</button>
      </header>
      <div class="barber-services">${rows}</div>
      <footer class="barber-column-footer">
        <div class="barber-column-total"><span>Total</span><span class="barber-total-value"><strong>${money.format(total)}</strong><small>${cuts.length} ${cuts.length === 1 ? 'corte' : 'cortes'}</small></span></div>
        <dl class="payment-breakdown">
          <div><dt>Propinas</dt><dd>${money.format(payout.tips)}</dd></div>
          <div title="Suma de los cortes con su comisión aplicada, sin propinas"><dt>Comisión</dt><dd>${money.format(payout.commission)}</dd></div>
          <div class="payment-amount-due" title="Comisión de los cortes más propinas; no descuenta adelantos"><dt>Total a pagar</dt><dd>${money.format(payout.total)}</dd></div>
        </dl>
        <details class="barber-payment-control">
          <summary class="payment-disclosure" title="Pago del día: ${escapeHtml(paymentState.label)}" ${reorderingBarbers ? 'aria-disabled="true"' : ''}>
            <span class="payment-disclosure-mark" aria-hidden="true"></span>
            <span data-payment-label aria-live="polite">${paymentState.label}</span>
            <span class="payment-disclosure-chevron" aria-hidden="true"></span>
          </summary>
          <div class="payment-dropdown-content">
          <div class="payment-method-options" role="group" aria-label="Pago del día de ${escapeHtml(barber)}">${paymentMethods}</div>
          <div class="payment-inline-split" ${paymentStatus === 'Mixto' ? '' : 'hidden'}>
            <label><span>Efectivo</span><span class="payment-inline-money"><span aria-hidden="true">$</span><input type="text" inputmode="numeric" autocomplete="off" placeholder="0" data-payment-amount="cashAmount" aria-label="Efectivo del pago de ${escapeHtml(barber)}" value="${escapeHtml(formatAmount(payment.cashAmount))}" ${paymentStatus !== 'Mixto' || reorderingBarbers ? 'disabled' : ''}></span></label>
            <label><span title="Mercado Pago">MP</span><span class="payment-inline-money"><span aria-hidden="true">$</span><input type="text" inputmode="numeric" autocomplete="off" placeholder="0" data-payment-amount="mpAmount" aria-label="Mercado Pago del pago de ${escapeHtml(barber)}" value="${escapeHtml(formatAmount(payment.mpAmount))}" ${paymentStatus !== 'Mixto' || reorderingBarbers ? 'disabled' : ''}></span></label>
            <div class="payment-inline-total"><span>Total pagado</span><strong data-payment-sum>${money.format(paymentState.paidAmount)}</strong></div>
            <div class="payment-inline-total payment-balance"><span data-payment-balance-label>${paymentState.excess ? 'De más' : 'Falta pagar'}</span><strong data-payment-balance aria-live="polite">${money.format(paymentState.excess || paymentState.remaining)}</strong></div>
          </div>
          </div>
        </details>
      </footer>
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
  if (reorderingBarbers) {
    if (event.target.closest('.barber-payment-control')) event.preventDefault();
    return;
  }
  const paymentMethod = event.target.closest('[data-barber-payment-method]');
  if (paymentMethod) {
    const column = paymentMethod.closest('[data-barber-column]');
    const barber = column.dataset.barberColumn;
    const payment = { ...barberPaymentRecord(barber), status: paymentMethod.dataset.barberPaymentMethod };
    barberPayments[workday.value] = { ...(barberPayments[workday.value] || {}), [barber]: payment };
    updateBarberPaymentColumn(column, payment);
    if (payment.status === 'Mixto') column.querySelector('[data-payment-amount]').focus({ preventScroll: true });
    return;
  }
  const cut = event.target.closest('[data-cut]');
  if (cut) return openDetail(cut.dataset.cut);
  const button = event.target.closest('[data-barber]');
  if (button) openCutDialog(button.dataset.barber);
});

document.getElementById('barberColumns').addEventListener('input', (event) => {
  const input = event.target.closest('[data-payment-amount]');
  if (!input || reorderingBarbers) return;
  const column = input.closest('[data-barber-column]');
  const barber = column.dataset.barberColumn;
  const payment = barberPaymentRecord(barber);
  if (payment.status !== 'Mixto') return;
  const field = input.dataset.paymentAmount;
  if (!['cashAmount', 'mpAmount'].includes(field)) return;
  const digitsBeforeCaret = input.value.slice(0, input.selectionStart ?? input.value.length).replace(/\D/g, '').length;
  input.value = formatAmount(input.value);
  let caret = 0;
  let digits = 0;
  while (caret < input.value.length && digits < digitsBeforeCaret) { if (/\d/.test(input.value[caret])) digits++; caret++; }
  input.setSelectionRange(caret, caret);
  const updated = { ...payment, [field]: input.value === '' ? '' : parseAmount(input.value) };
  barberPayments[workday.value] = { ...(barberPayments[workday.value] || {}), [barber]: updated };
  updateBarberPaymentColumn(column, updated);
});

function setBarberOrderMode(enabled) {
  reorderingBarbers = enabled;
  if (enabled) pendingBarberOrder = [...barbers];
  const action = document.getElementById('reorderBarbers');
  action.textContent = enabled ? 'Aplicar orden' : 'Ordenar columnas';
  action.classList.toggle('primary-btn', enabled);
  action.classList.toggle('secondary-btn', !enabled);
  document.getElementById('cancelBarberOrder').hidden = !enabled;
  document.getElementById('barberOrderHint').hidden = !enabled;
  render();
}

document.getElementById('reorderBarbers').addEventListener('click', () => {
  if (!reorderingBarbers) return setBarberOrderMode(true);
  const order = [...document.querySelectorAll('[data-barber-column]')].map((column) => column.dataset.barberColumn);
  if (order.length !== barbers.length || order.some((barber) => !barbers.includes(barber))) return;
  config.barbers = [...order.map((name) => config.barbers.find((barber) => barber.name === name)), ...config.barbers.filter(({ name }) => !order.includes(name))];
  reorderingBarbers = false;
  saveConfig();
  setBarberOrderMode(false);
});
document.getElementById('cancelBarberOrder').addEventListener('click', () => setBarberOrderMode(false));

document.getElementById('barberColumns').addEventListener('dragstart', (event) => {
  if (!reorderingBarbers) return;
  const column = event.target.closest('[data-barber-column]');
  if (!column) return;
  column.classList.add('dragging');
  event.dataTransfer.effectAllowed = 'move';
});
document.getElementById('barberColumns').addEventListener('dragover', (event) => {
  const container = event.currentTarget;
  const dragging = container.querySelector('.dragging');
  const target = event.target.closest('[data-barber-column]');
  if (!dragging || !target || dragging === target) return;
  event.preventDefault();
  const after = event.clientX > target.getBoundingClientRect().left + target.offsetWidth / 2;
  container.insertBefore(dragging, after ? target.nextSibling : target);
});
document.getElementById('barberColumns').addEventListener('dragend', (event) => {
  event.target.closest('[data-barber-column]')?.classList.remove('dragging');
  pendingBarberOrder = [...document.querySelectorAll('[data-barber-column]')].map((column) => column.dataset.barberColumn);
});

document.getElementById('sidebarToggle').addEventListener('click', (event) => {
  const expanded = document.querySelector('.app-shell').classList.toggle('sidebar-open');
  event.currentTarget.setAttribute('aria-expanded', expanded);
  event.currentTarget.setAttribute('aria-label', `${expanded ? 'Cerrar' : 'Abrir'} menú lateral`);
});

document.querySelector('.app-shell').addEventListener('click', (event) => {
  const button = event.target.closest('[data-view]');
  if (!button) return;
  document.querySelectorAll('[data-view]').forEach((item) => {
    item.classList.toggle('active', item.dataset.view === button.dataset.view);
    item.toggleAttribute('aria-current', item.dataset.view === button.dataset.view);
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
document.getElementById('summaryServiceOptions').addEventListener('change', () => {
  const checked = [...document.querySelectorAll('#summaryServiceOptions input:checked')];
  const summary = document.querySelector('#summaryServiceFilter summary');
  summary.textContent = checked.length === config.services.length ? 'Todos los servicios' : checked.length === 1 ? checked[0].value : `${checked.length} servicios seleccionados`;
  renderSummary();
});
document.getElementById('summaryBarberFilter').addEventListener('change', renderSummary);
document.getElementById('summaryPaymentFilter').addEventListener('change', renderSummary);

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

transferForm.elements.from.addEventListener('change', () => transferForm.elements.amount.setCustomValidity(''));
transferForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(transferForm));
  if (!isDayOpen(workday.value) || !['Efectivo', 'Mercado Pago'].includes(values.from)) return;
  values.to = values.from === 'Efectivo' ? 'Mercado Pago' : 'Efectivo';
  const amount = parseAmount(values.amount);
  const available = dayBalance(values.from);
  values.description = values.description.trim() || 'Transferencia entre medios';
  transferForm.elements.amount.setCustomValidity(!Number.isSafeInteger(amount) || amount <= 0 ? 'Ingresá un importe válido mayor que cero.' : amount > available ? 'El saldo disponible es insuficiente.' : '');
  if (!transferForm.reportValidity()) return;
  transfers.push({ ...values, amount, time: nowTime(), date: workday.value, id: crypto.randomUUID() });
  saveTransfers();
  transferForm.elements.amount.value = '';
  transferForm.elements.description.value = '';
  render();
});
document.getElementById('transferRows').addEventListener('click', (event) => {
  const button = event.target.closest('[data-delete-transfer]');
  if (!button || !confirm('¿Eliminar este movimiento entre medios?')) return;
  transfers = transfers.filter((transfer) => transfer.id !== button.dataset.deleteTransfer);
  saveTransfers();
  render();
});

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
  const initialCash = parseAmount(values.initialCash);
  const initialMp = parseAmount(values.initialMp);
  const changed = isDayOpen(workday.value) && (initialCash !== Number(current.initialCash) || initialMp !== Number(current.initialMp));
  const description = values.editDescription.trim();
  openingCashForm.elements.editDescription.setCustomValidity(changed && !description ? 'Ingresá el motivo de la modificación.' : '');
  if (!openingCashForm.reportValidity()) return;
  if (changed) {
    [['Efectivo', 'initialCash', initialCash], ['Mercado Pago', 'initialMp', initialMp]].forEach(([medium, key, value]) => {
      if (value !== Number(current[key])) openingAdjustments.push({ id: crypto.randomUUID(), date: workday.value, time: nowTime(), medium, previous: Number(current[key]), current: value, description });
    });
    saveOpeningAdjustments();
  }
  cashRegisters[workday.value] = { ...current, initialCash, initialMp, opened: true, autoOpened: changed ? false : current.autoOpened, openedAt: current.openedAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
  saveCashRegisters();
  editingOpening = false;
  openingCashForm.elements.editDescription.value = '';
  render();
});

cashRegisterForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(cashRegisterForm));
  const realCash = parseAmount(values.realCash);
  const withdrawal = parseAmount(values.withdrawal);
  cashRegisterForm.elements.withdrawal.setCustomValidity(withdrawal > realCash ? 'El retiro no puede superar el efectivo real.' : '');
  if (!cashRegisterForm.reportValidity()) return;
  cashRegisters[workday.value] = { ...(cashRegisters[workday.value] || {}), realCash, realMp: parseAmount(values.realMp), withdrawal, closedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  saveCashRegisters();
  const nextDate = shiftDate(workday.value, 1);
  const nextRegister = cashRegisters[nextDate];
  if (nextRegister?.autoOpened && nextRegister.inheritedFrom === workday.value) {
    cashRegisters[nextDate] = { ...nextRegister, initialCash: Math.max(0, realCash - withdrawal), initialMp: parseAmount(values.realMp), updatedAt: new Date().toISOString() };
    saveCashRegisters();
  } else initializeOpening(nextDate);
  render();
});
[cashRegisterForm.elements.realCash, cashRegisterForm.elements.realMp, cashRegisterForm.elements.withdrawal].forEach((input) => input.addEventListener('input', () => renderClosingDifferences()));

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
  const amount = parseAmount(values.amount);
  const tip = parseAmount(values.tip);
  const cashAmount = parseAmount(values.cashAmount);
  const mpAmount = parseAmount(values.mpAmount);
  amountInput.setCustomValidity(amount > 0 ? '' : 'El precio debe ser mayor que cero.');
  cashAmountInput.setCustomValidity('');
  if (values.payment === 'Ambos') {
    cashAmountInput.setCustomValidity(cashAmount + mpAmount === amount + tip
      ? mixedTipError({ payment: values.payment, tip, cashAmount, mpAmount })
      : 'La suma debe coincidir con el precio del corte más la propina.');
  }
  if (!form.reportValidity()) return;
  const previous = entries.find((cut) => cut.id === editingId);
  const commissionRate = previous?.commissionRate ?? effectiveCommission(workday.value);
  const entry = { ...values, date: workday.value, amount, tip, cashAmount, mpAmount, commissionRate, commissionAmount: amount * commissionRate / 100, id: editingId || crypto.randomUUID() };
  entries = editingId ? entries.map((cut) => cut.id === editingId ? entry : cut) : [...entries, entry];
  save();
  editingId = null;
  dialog.close();
  render();
});

document.getElementById('editOpeningCash').addEventListener('click', () => {
  editingOpening = true;
  openingCashForm.elements.editDescription.value = '';
  render();
});
document.getElementById('cancelOpeningEdit').addEventListener('click', () => {
  editingOpening = false;
  openingCashForm.elements.editDescription.value = '';
  openingCashForm.elements.editDescription.setCustomValidity('');
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
document.getElementById('barberConfigSearch').addEventListener('input', filterBarberConfig);
Object.values(configDialogs).forEach((configDialog) => {
  configDialog.querySelector('.config-close').addEventListener('click', () => configDialog.close());
  configDialog.addEventListener('click', (event) => { if (event.target === configDialog) configDialog.close(); });
});
commissionForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const history = config.commissionHistory?.length ? config.commissionHistory : [{ date: '0000-01-01', rate: config.commission }];
  config.commission = Number(commissionForm.elements.commission.value);
  config.commissionHistory = [...history.filter(({ date }) => date !== today()), { date: today(), rate: config.commission }];
  saveConfig();
});
document.getElementById('changeCommission').addEventListener('click', () => {
  dailyCommissionForm.elements.commission.value = effectiveCommission(workday.value);
  commissionDialog.showModal();
});
document.getElementById('closeCommissionDialog').addEventListener('click', () => commissionDialog.close());
commissionDialog.addEventListener('click', (event) => { if (event.target === commissionDialog) commissionDialog.close(); });
dailyCommissionForm.addEventListener('submit', (event) => {
  event.preventDefault();
  cashRegisters[workday.value] = { ...(cashRegisters[workday.value] || {}), commissionRate: Number(dailyCommissionForm.elements.commission.value) };
  commissionDialog.close();
  saveCashRegisters();
  render();
});
document.getElementById('configView').addEventListener('click', (event) => {
  const button = event.target.closest('[data-config-edit], [data-config-delete], [data-config-active]');
  if (!button) return;
  const type = button.dataset.configEdit || button.dataset.configDelete || button.dataset.configActive;
  const item = config[type].find((current) => current.id === button.dataset.id);
  if (!item) return;
  if (button.dataset.configActive) {
    item.active = button.checked;
    return saveConfig();
  }
  if (button.dataset.configDelete) {
    if (configInUse(type, item.name)) return alert('No se puede eliminar porque tiene operaciones asociadas.');
    if (!confirm(`¿Eliminar ${item.name}?`)) return;
    config[type] = config[type].filter((current) => current.id !== item.id);
    return saveConfig();
  }
  openConfigDialog(type, item);
});

initInventory();
renderConfig();
render();
