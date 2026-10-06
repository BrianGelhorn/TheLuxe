const defaultConfig = {
  services: [{ id: 'corte', name: 'Corte clásico', price: 15000 }, { id: 'corte-barba', name: 'Corte + barba', price: 22000 }, { id: 'barba', name: 'Barba', price: 10000 }, { id: 'diseno', name: 'Diseño', price: 18000 }],
  barbers: ['Mateo', 'Julián', 'Nicolás', 'Tomás', 'Franco', 'Agustín', 'Lucas', 'Bruno', 'Santino'].map((name) => ({ id: name, name, active: true })),
  expenseCategories: [{ id: 'otros', name: 'Otros' }],
  commission: 50,
  commissionHistory: [{ date: '0000-01-01', rate: 50 }],
};
let config = structuredClone(defaultConfig);
let barbers = config.barbers.filter(({ active }) => active !== false).map(({ name }) => name);
let prices = Object.fromEntries(config.services.map(({ name, price }) => [name, price]));
const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const unitMoney = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 2 });
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
const salePaymentInput = saleForm.elements.payment;
const saleSplitPayment = document.getElementById('saleSplitPayment');
const saleCashAmountInput = saleForm.elements.cashAmount;
const saleMpAmountInput = saleForm.elements.mpAmount;
const advanceForm = document.getElementById('advanceForm');
const advanceDialog = document.getElementById('advanceDialog');
const advanceDetailDialog = document.getElementById('advanceDetailDialog');
const expenseForm = document.getElementById('expenseForm');
const expenseDialog = document.getElementById('expenseDialog');
const expenseDetailDialog = document.getElementById('expenseDetailDialog');
const expenseCategoryConfigForm = document.getElementById('expenseCategoryConfigForm');
const openingCashForm = document.getElementById('openingCashForm');
const cashRegisterForm = document.getElementById('cashRegisterForm');
const transferForm = document.getElementById('transferForm');
const dailyView = document.getElementById('dailyView');
const salesView = document.getElementById('salesView');
const stockView = document.getElementById('stockView');
const commissionDialog = document.getElementById('commissionDialog');
const dailyCommissionForm = document.getElementById('dailyCommissionForm');
const serviceConfigForm = document.getElementById('serviceConfigForm');
const barberConfigForm = document.getElementById('barberConfigForm');
const commissionForm = document.getElementById('commissionForm');
const configDialogs = { services: document.getElementById('serviceConfigDialog'), barbers: document.getElementById('barberConfigDialog'), expenseCategories: document.getElementById('expenseCategoryConfigDialog') };
const configForms = { services: serviceConfigForm, barbers: barberConfigForm, expenseCategories: expenseCategoryConfigForm };
const configLabels = { services: 'SERVICIO', barbers: 'BARBERO', expenseCategories: 'CATEGORÍA' };
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
let editingClosing = false;
let reorderingBarbers = false;
let pendingBarberOrder = [];

function dailyOperationsLocked() {
  const register = cashRegisters[workday.value] || {};
  return 'realCash' in register && 'realMp' in register && !editingClosing;
}

const closingInput = (name) => cashRegisterForm.elements[name] || cashRegisterForm.elements.namedItem(name);

function applyDailyLock(opened, closed) {
  const locked = dailyOperationsLocked();
  for (const view of [dailyView, salesView, stockView]) {
    view.classList.toggle('daily-locked', locked);
    view.setAttribute('aria-disabled', String(locked));
    view.querySelectorAll('button, input, select, textarea').forEach((control) => {
      if (control.closest('#cashRegisterForm, .closing-edit-actions')) return;
      if (locked) {
        control.disabled = true;
        control.dataset.dailyLockDisabled = 'true';
      } else if (control.dataset.dailyLockDisabled === 'true') {
        control.disabled = false;
        delete control.dataset.dailyLockDisabled;
      }
    });
  }
  document.getElementById('dailyLockFeedback').hidden = !locked;
  document.getElementById('salesLockFeedback').hidden = !locked;
  document.getElementById('stockLockFeedback').hidden = !locked;
  ['realCash', 'realMp', 'withdrawal', 'withdrawalMp'].forEach((name) => {
    const input = closingInput(name);
    if (!input) return;
    input.disabled = closed && !editingClosing;
    input.readOnly = closed && !editingClosing;
  });
  cashRegisterForm.querySelector('[type="submit"]').disabled = !opened;
  document.getElementById('editClosing').disabled = false;
  document.getElementById('cancelClosingEdit').disabled = false;
}

workday.value = today();
document.getElementById('summaryDate').value = today().slice(0, 7);
updateWeekOptions();
document.getElementById('summaryWeek').value = currentMonthWeek(today());
populateSelectors();
document.querySelectorAll('.money-input input').forEach((input) => input.addEventListener('input', () => {
  if (input.type !== 'number') input.value = formatAmount(input.value);
  input.setCustomValidity('');
}));

function save() {
  queueStateSave();
}

function saveSales() {
  queueStateSave();
}

function saveAdvances() {
  queueStateSave();
}

function saveExpenses() {
  queueStateSave();
}

function saveCashRegisters() {
  queueStateSave();
}

function saveTransfers() {
  queueStateSave();
}

function saveOpeningAdjustments() {
  queueStateSave();
}

function saveConfig() {
  barbers = config.barbers.filter(({ active }) => active !== false).map(({ name }) => name);
  prices = Object.fromEntries(config.services.map(({ name, price }) => [name, price]));
  populateSelectors();
  renderConfig();
  render();
  queueStateSave();
}

function saveBarberPayments() { queueStateSave(); }

function populateSaleProducts() {
  const selectedProduct = saleForm.elements.product.value;
  document.getElementById('saleProduct').innerHTML = '<option value="">Seleccionar producto</option>' + inventory.products.filter((product) => product.active && product.saleEnabled).map((product) => `<option value="${escapeHtml(product.id)}">${escapeHtml(product.name)}</option>`).join('');
  saleForm.elements.product.value = selectedProduct;
}

function populateSelectors() {
  const options = [...document.querySelectorAll('#summaryServiceOptions input')];
  const selectedServices = new Set(options.filter((input) => input.checked).map((input) => input.value));
  const allServices = options.every((input) => input.checked);
  const barberFilter = document.getElementById('summaryBarberFilter');
  const selectedBarber = barberFilter.value;
  const shopMode = barberFilter.selectedOptions[0]?.dataset.scope === 'shop';
  serviceInput.innerHTML = '<option value="">Seleccionar servicio</option>' + config.services.map(({ name }) => `<option>${escapeHtml(name)}</option>`).join('');
  document.getElementById('summaryServiceOptions').innerHTML = config.services.map(({ name }) => `<label><input type="checkbox" value="${escapeHtml(name)}" ${allServices || selectedServices.has(name) ? 'checked' : ''}> ${escapeHtml(name)}</label>`).join('');
  const historicalBarbers = new Map(inventory.movements.filter((row) => row.barberId && !config.barbers.some((barber) => barber.id === row.barberId)).map((row) => [row.barberId, row.barberName]));
  barberFilter.innerHTML = '<option value="">Todos los barberos</option><option value="__shop__" data-scope="shop">Barbería</option>' + config.barbers.map(({ name }) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('') + [...historicalBarbers].map(([id, name]) => `<option value="__stock__${escapeHtml(id)}" data-stock-id="${escapeHtml(id)}">${escapeHtml(name)} (solo stock histórico)</option>`).join('');
  // Identify the local option by scope, not by a value that could be a barber name.
  const selectedIndex = [...barberFilter.options].findIndex((option) => shopMode ? option.dataset.scope === 'shop' : option.dataset.scope !== 'shop' && option.value === selectedBarber);
  barberFilter.selectedIndex = selectedIndex < 0 ? 0 : selectedIndex;
  updateServiceFilterLabel();
  populateSaleProducts();
  advanceForm.elements.barber.innerHTML = '<option value="">Seleccionar barbero</option>' + config.barbers.filter(({ active }) => active !== false).map(({ name }) => `<option>${escapeHtml(name)}</option>`).join('');
  expenseForm.elements.category.innerHTML = '<option value="">Sin categoría</option>' + config.expenseCategories.map(({ name }) => `<option>${escapeHtml(name)}</option>`).join('');
}

function renderConfig() {
  const list = (type, price = false) => config[type].map((item) => `<div class="config-item"><span>${escapeHtml(item.name)}${price ? ` · ${money.format(item.price)}` : ''}</span><span class="config-actions"><button type="button" data-config-edit="${type}" data-id="${escapeHtml(item.id)}">Editar</button><button type="button" data-config-delete="${type}" data-id="${escapeHtml(item.id)}">Eliminar</button></span></div>`).join('');
  document.getElementById('serviceConfigList').innerHTML = list('services', true);
  document.getElementById('expenseCategoryConfigList').innerHTML = list('expenseCategories');
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
  const priced = type === 'services';
  const item = { id: values.id || crypto.randomUUID(), name: values.name.trim(), ...(priced ? { price: parseAmount(values.price) } : type === 'barbers' ? { active: existing?.active !== false } : {}) };
  if (priced && item.price <= 0) {
    formElement.elements.price.setCustomValidity('El precio debe ser mayor que cero.');
    return formElement.reportValidity();
  }
  if (existing && existing.name !== item.name) {
    if (type === 'services') entries = entries.map((entry) => entry.service === existing?.name ? { ...entry, service: item.name } : entry);
    if (type === 'barbers') {
      entries = entries.map((entry) => entry.barber === existing?.name ? { ...entry, barber: item.name } : entry);
      advances = advances.map((advance) => advance.barber === existing?.name ? { ...advance, barber: item.name } : advance);
      barberPayments = Object.fromEntries(Object.entries(barberPayments).map(([date, payments]) => [date, Object.fromEntries(Object.entries(payments).map(([barber, payment]) => [barber === existing.name ? item.name : barber, payment]))]));
    }
    if (type === 'expenseCategories') expenses = expenses.map((expense) => expense.category === existing.name ? { ...expense, category: item.name } : expense);
    save(); saveSales(); saveAdvances(); saveExpenses();
  }
  config[type] = existing ? config[type].map((current) => current.id === existing.id ? item : current) : [...config[type], item];
  formElement.reset();
  configDialogs[type].close();
  saveConfig();
}

function configInUse(type, name) {
  if (type === 'services') return entries.some((entry) => entry.service === name);
  if (type === 'expenseCategories') return expenses.some((expense) => expense.category === name);
  return entries.some((entry) => entry.barber === name) || advances.some((advance) => advance.barber === name)
    || Object.keys(barberPayments).some((date) => {
      const payment = barberPaymentRecord(name, date);
      return payment.status !== 'No pago' || Number(payment.cashAmount || 0) > 0 || Number(payment.mpAmount || 0) > 0;
    });
}

function openConfigDialog(type, item = null) {
  const formElement = configForms[type];
  formElement.reset();
  formElement.elements.name.setCustomValidity('');
  if (type === 'services') formElement.elements.price.setCustomValidity('');
  formElement.elements.id.value = item?.id || '';
  formElement.elements.name.value = item?.name || '';
  if (type === 'services') formElement.elements.price.value = item ? formatAmount(item.price) : '';
  document.getElementById(`${type === 'expenseCategories' ? 'expenseCategory' : type.slice(0, -1)}ConfigMode`).textContent = item ? `MODIFICAR ${configLabels[type]}` : `NUEVO ${configLabels[type]}`;
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

function unpaidBarbers() {
  return [...new Set([...selectedEntries().map((entry) => entry.barber), ...selectedAdvances().map((advance) => advance.barber)])]
    .filter((barber) => {
      const settlement = barberSettlement(selectedEntries().filter((entry) => entry.barber === barber), selectedAdvances().filter((advance) => advance.barber === barber), barberPaymentRecord(barber), effectiveCommission);
      return settlement.due > settlement.paidCash + settlement.paidMp;
    });
}

function renderClosingUnpaidWarning() {
  const register = cashRegisters[workday.value] || {};
  const closed = 'realCash' in register && 'realMp' in register;
  const unpaid = !closed || editingClosing ? unpaidBarbers() : [];
  const warning = document.getElementById('closingUnpaidWarning');
  warning.hidden = !isDayOpen(workday.value) || unpaid.length === 0;
  warning.textContent = unpaid.length ? `Pagos pendientes: ${unpaid.join(', ')}.` : '';
}

function barberPaymentRecord(barber, date = workday.value) {
  const record = barberPayments[date]?.[barber];
  if (!record) return { status: 'No pago', cashAmount: '', mpAmount: '' };
  if (typeof record === 'string') return { status: record, cashAmount: '', mpAmount: '' };
  return { status: record.status || 'No pago', cashAmount: record.cashAmount ?? '', mpAmount: record.mpAmount ?? '', ...(record.paidAmount === undefined ? {} : { paidAmount: record.paidAmount }) };
}

function paymentStatusLabel(payment, state) {
  if (payment.status !== 'Efectivo' && payment.status !== 'Mercado Pago') return state.label;
  return state.remaining ? `${state.label} · Faltan ${money.format(state.remaining)}`
    : state.excess ? `${state.label} · ${money.format(state.excess)} de más` : state.label;
}

function updateBarberPaymentColumn(column, payment) {
  const state = barberPaymentState(payment, Number(column.dataset.paymentDue));
  if (column.dataset.advanceCovered === 'true' && payment.status === 'No pago') {
    state.isPaid = true;
    state.label = 'Cubierto con adelantos';
  }
  const mixed = state.mixed;
  const label = paymentStatusLabel(payment, state);
  column.classList.toggle('is-paid', state.isPaid);
  column.classList.toggle('is-payment-incomplete', payment.status !== 'No pago' && !state.isPaid);
  column.dataset.paymentStatus = payment.status;
  column.querySelector('[data-payment-label]').textContent = label;
  column.querySelector('.payment-disclosure').title = `Pago del día: ${label}`;
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

function openRegisterDates() {
  return Object.entries(cashRegisters)
    .filter(([date, register]) => isDayOpen(date) && !('realCash' in register && 'realMp' in register))
    .map(([date]) => date)
    .sort();
}

function renderOpenDaysWarning() {
  const dates = openRegisterDates();
  const formatDate = (date) => new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(`${date}T12:00:00`));
  document.getElementById('openDaysWarning').hidden = dates.length === 0;
  document.getElementById('openDaysWarningText').textContent = dates.length
    ? `${dates.map(formatDate).join(', ')}. Cerrá cada jornada antes de continuar.`
    : '';
}

function defaultCommission(date) {
  return Number([...(config.commissionHistory || [])].filter((item) => item.date <= date).sort((a, b) => a.date.localeCompare(b.date)).at(-1)?.rate ?? config.commission);
}

function effectiveCommission(date) {
  return Number(cashRegisters[date]?.commissionRate ?? defaultCommission(date));
}

function dayBalance(type, list = selectedEntries(), daySales = selectedSales(), dayAdvances = selectedAdvances(), dayExpenses = selectedExpenses(), dayTransfers = selectedTransfers()) {
  const register = cashRegisters[workday.value] || {};
  const initial = Number(register[type === 'Efectivo' ? 'initialCash' : 'initialMp'] || 0);
  const paid = Object.keys(barberPayments[workday.value] || {}).reduce((sum, barber) => {
    const settlement = barberSettlement(list.filter((entry) => entry.barber === barber), dayAdvances.filter((advance) => advance.barber === barber), barberPaymentRecord(barber), effectiveCommission);
    return sum + (type === 'Efectivo' ? settlement.paidCash : settlement.paidMp);
  }, 0);
  return balance(type, initial, list, daySales, dayAdvances, dayExpenses, dayTransfers) - paid;
}

function renderAvailableBalances() {
  const cash = dayBalance('Efectivo');
  const mp = dayBalance('Mercado Pago');
  document.getElementById('cashTotal').textContent = money.format(cash);
  document.getElementById('mpTotal').textContent = money.format(mp);
  document.getElementById('transferCashAvailable').textContent = money.format(cash);
  document.getElementById('transferMpAvailable').textContent = money.format(mp);
  renderClosingDifferences(cash, mp);
  renderClosingUnpaidWarning();
}

function renderClosingDifferences(cashTheoretical = dayBalance('Efectivo'), mpTheoretical = dayBalance('Mercado Pago')) {
  const register = cashRegisters[workday.value] || {};
  const cashValue = cashRegisterForm.elements.realCash.value;
  const mpValue = cashRegisterForm.elements.realMp.value;
  const withdrawal = parseAmount(cashRegisterForm.elements.withdrawal.value);
  const withdrawalMp = parseAmount(closingInput('withdrawalMp')?.value);
  document.getElementById('theoreticalCash').textContent = money.format(cashTheoretical);
  document.getElementById('theoreticalMp').textContent = money.format(mpTheoretical);
  document.getElementById('cashDifference').textContent = cashValue ? money.format(parseAmount(cashValue) - cashTheoretical) : '—';
  document.getElementById('mpDifference').textContent = mpValue ? money.format(parseAmount(mpValue) - mpTheoretical) : '—';
  const closed = 'realCash' in register && 'realMp' in register;
  document.getElementById('closingStatus').textContent = closed ? 'Cierre guardado' : 'Pendiente';
  document.getElementById('closingStatus').classList.toggle('closed', closed);
  document.getElementById('nextOpeningCash').textContent = `${money.format(Math.max(0, parseAmount(cashValue) - withdrawal))} efectivo`;
  document.getElementById('nextOpeningMp').textContent = `${money.format(Math.max(0, parseAmount(mpValue) - withdrawalMp))} MP`;
}

function toggleSplitPayment() {
  const split = paymentInput.value === 'Ambos';
  splitPayment.hidden = !split;
  cashAmountInput.required = split;
  mpAmountInput.required = split;
  cashAmountInput.setCustomValidity('');
}

function toggleSaleSplitPayment() {
  const split = salePaymentInput.value === 'Ambos';
  saleSplitPayment.hidden = !split;
  saleCashAmountInput.required = split;
  saleMpAmountInput.required = split;
  saleCashAmountInput.setCustomValidity('');
}

function render() {
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
  document.getElementById('dailyTips').textContent = money.format(revenue.tips);
  document.getElementById('dailyTipsCash').textContent = money.format(revenue.cashTips);
  document.getElementById('dailyTipsMp').textContent = money.format(revenue.mpTips);
  document.getElementById('dailyInvoiced').textContent = money.format(revenue.invoiced);
  document.getElementById('dailyCommission').textContent = money.format(revenue.commission);
  document.getElementById('dailyNet').textContent = money.format(revenue.net);
  document.getElementById('dailyServicesTotal').textContent = money.format(revenue.services);
  document.getElementById('dailyServicesTotalCash').textContent = money.format(revenue.cashServices + revenue.cashTips);
  document.getElementById('dailyServicesTotalMp').textContent = money.format(revenue.mpServices + revenue.mpTips);
  document.getElementById('dailyServices').textContent = money.format(revenue.services - revenue.tips);
  document.getElementById('dailyServicesCash').textContent = money.format(revenue.cashServices);
  document.getElementById('dailyServicesMp').textContent = money.format(revenue.mpServices);
  document.getElementById('dailySalesTotal').textContent = money.format(revenue.sales);
  document.getElementById('dailySalesCash').textContent = money.format(salePaymentTotal(daySales, 'Efectivo'));
  document.getElementById('dailySalesMp').textContent = money.format(salePaymentTotal(daySales, 'Mercado Pago'));
  document.getElementById('dailyCount').textContent = `${list.length} ${list.length === 1 ? 'corte' : 'cortes'}`;
  document.getElementById('dailySalesCount').textContent = `${daySales.length} ${daySales.length === 1 ? 'venta' : 'ventas'}`;
  document.getElementById('dailyAverageTicket').textContent = money.format(operationCount ? revenue.collected / operationCount : 0);
  document.getElementById('dailyServiceTicket').textContent = money.format(list.length ? revenue.services / list.length : 0);
  document.getElementById('dailySalesTicket').textContent = money.format(daySales.length ? revenue.sales / daySales.length : 0);
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
  openingCashForm.elements.initialCash.value = 'initialCash' in register ? formatAmount(register.initialCash) : previousClosing ? formatAmount(Math.max(0, Number(previousClosing.register.realCash || 0) - Number(previousClosing.register.withdrawal || 0))) : '';
  openingCashForm.elements.initialMp.value = 'initialMp' in register ? formatAmount(register.initialMp) : previousClosing ? formatAmount(Math.max(0, Number(previousClosing.register.realMp || 0) - Number(previousClosing.register.withdrawalMp || 0))) : '';
  const inheritedMpHint = document.getElementById('inheritedMpHint');
  inheritedMpHint.hidden = !previousClosing;
  inheritedMpHint.textContent = previousClosing ? `Tomado del cierre de la jornada ${previousClosing.date}` : '';
  ['realCash', 'realMp', 'withdrawal', 'withdrawalMp'].forEach((name) => {
    const input = closingInput(name);
    if (!input) return;
    input.value = name in register ? formatAmount(register[name]) : name === 'withdrawal' || name === 'withdrawalMp' ? '0' : '';
  });
  renderClosingDifferences(cashBalance, mpBalance);
  const closed = 'realCash' in register && 'realMp' in register;
  renderClosingUnpaidWarning();
  ['realCash', 'realMp', 'withdrawal', 'withdrawalMp'].forEach((name) => { if (closingInput(name)) closingInput(name).readOnly = closed && !editingClosing; });
  cashRegisterForm.querySelector('[type="submit"]').hidden = closed && !editingClosing;
  cashRegisterForm.classList.toggle('is-editing', closed && editingClosing);
  const closingActions = document.querySelector('.closing-edit-actions');
  closingActions.hidden = !closed;
  document.getElementById('editClosing').hidden = editingClosing;
  document.getElementById('cancelClosingEdit').hidden = !editingClosing;
  document.getElementById('closingStatus').textContent = closed ? (editingClosing ? 'Modificando cierre' : 'Cierre guardado') : 'Pendiente';
  document.getElementById('closingStatus').classList.toggle('editing', closed && editingClosing);
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
  cashRegisterForm.querySelector('[type="submit"]').disabled = !opened && !closed;
  applyDailyLock(opened, closed);
  renderOpenDaysWarning();
  renderSummary();
}

function barberColumn(barber, list) {
  const cuts = list.filter((entry) => entry.barber === barber).sort((a, b) => a.time.localeCompare(b.time));
  const total = cuts.reduce((sum, entry) => sum + Number(entry.amount) + Number(entry.tip || 0), 0);
  const payment = barberPaymentRecord(barber);
  const paymentStatus = payment.status;
  const settlement = barberSettlement(cuts, selectedAdvances().filter((advance) => advance.barber === barber), payment, effectiveCommission);
  const payout = { tips: settlement.tips, commission: settlement.commission, total: settlement.due };
  const paymentState = barberPaymentState(payment, settlement.due);
  if (settlement.gross && !settlement.due && payment.status === 'No pago') {
    paymentState.isPaid = true;
    paymentState.label = 'Cubierto con adelantos';
  }
  const paymentLabel = paymentStatusLabel(payment, paymentState);
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
    <section class="barber-column${paymentState.isPaid ? ' is-paid' : paymentStatus !== 'No pago' ? ' is-payment-incomplete' : ''}" data-payment-due="${payout.total}" data-advance-covered="${Boolean(settlement.gross && !settlement.due && settlement.advance)}" data-payment-status="${escapeHtml(paymentStatus)}" data-barber-column="${escapeHtml(barber)}" ${reorderingBarbers ? 'draggable="true" tabindex="0"' : ''}>
      <header class="barber-column-header">
        <strong>${escapeHtml(barber)}</strong>
        <button class="add-cut" type="button" data-barber="${escapeHtml(barber)}" aria-label="Registrar corte para ${escapeHtml(barber)}" title="Agregar corte" ${isDayOpen(workday.value) ? '' : 'disabled'}>+</button>
      </header>
      <div class="barber-services">${rows}</div>
      <footer class="barber-column-footer">
       <div class="barber-column-total"><span>Total de servicios</span><span class="barber-total-value"><strong>${money.format(total)}</strong><small>${cuts.length} ${cuts.length === 1 ? 'corte' : 'cortes'}</small></span></div>
       <div class="barber-payout-label">Resumen del barbero</div>
       <dl class="payment-breakdown">
          <div><dt>Propinas</dt><dd>${money.format(payout.tips)}</dd></div>
           <div title="Suma de los cortes con su comisión aplicada, sin propinas"><dt>Comisión</dt><dd>${money.format(payout.commission)}</dd></div>
           ${settlement.advance ? `<div><dt>Adelantos entregados</dt><dd>−${money.format(settlement.advance)}</dd></div>` : ''}
           ${settlement.advanceExcess ? `<div><dt>Adelanto excedente</dt><dd>${money.format(settlement.advanceExcess)}</dd></div>` : ''}
          <div class="payment-amount-due" title="Comisión y propinas pendientes luego de adelantos ya egresados de caja"><dt>Total a pagar</dt><dd>${money.format(payout.total)}</dd></div>
        </dl>
        <details class="barber-payment-control">
          <summary class="payment-disclosure" title="Pago del día: ${escapeHtml(paymentLabel)}" ${reorderingBarbers ? 'aria-disabled="true"' : ''}>
            <span class="payment-disclosure-mark" aria-hidden="true"></span>
            <span data-payment-label aria-live="polite">${paymentLabel}</span>
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
  amountInput.setCustomValidity('');
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
  cashAmountInput.value = formatAmount(entry.cashAmount);
  mpAmountInput.value = formatAmount(entry.mpAmount);
  toggleSplitPayment();
  notesInput.value = entry.notes || '';
  document.getElementById('formMode').textContent = 'MODIFICAR CORTE';
  document.getElementById('dialogTitle').textContent = `Corte de ${entry.barber}`;
  detailDialog.close();
  dialog.showModal();
}

document.getElementById('barberColumns').addEventListener('click', (event) => {
  if (dailyOperationsLocked()) return;
  if (reorderingBarbers) {
    if (event.target.closest('.barber-payment-control')) event.preventDefault();
    return;
  }
  const paymentMethod = event.target.closest('[data-barber-payment-method]');
  if (paymentMethod) {
    const column = paymentMethod.closest('[data-barber-column]');
    const barber = column.dataset.barberColumn;
    const previous = barberPaymentRecord(barber);
    const status = paymentMethod.dataset.barberPaymentMethod;
    const payment = { ...previous, status };
    if (status === 'Efectivo' || status === 'Mercado Pago') {
      const due = Number(column.dataset.paymentDue);
      payment.paidAmount = previous.status === status ? Math.max(Number(previous.paidAmount ?? due), due) : due;
    }
    barberPayments[workday.value] = { ...(barberPayments[workday.value] || {}), [barber]: payment };
    saveBarberPayments();
    updateBarberPaymentColumn(column, payment);
    renderAvailableBalances();
    renderSummary();
    if (payment.status === 'Mixto') column.querySelector('[data-payment-amount]').focus({ preventScroll: true });
    return;
  }
  const cut = event.target.closest('[data-cut]');
  if (cut) return openDetail(cut.dataset.cut);
  const button = event.target.closest('[data-barber]');
  if (button) openCutDialog(button.dataset.barber);
});

document.getElementById('barberColumns').addEventListener('input', (event) => {
  if (dailyOperationsLocked()) return;
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
  saveBarberPayments();
  updateBarberPaymentColumn(column, updated);
  renderAvailableBalances();
  renderSummary();
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
  if (dailyOperationsLocked()) return;
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
    if (item.dataset.view === button.dataset.view) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  });
  document.querySelectorAll('.view').forEach((view) => view.classList.toggle('active', view.id === button.dataset.view));
  document.querySelector('h1').textContent = button.dataset.view === 'salesView' ? 'Caja y movimientos' : button.dataset.view === 'stockView' ? 'Control de stock' : button.dataset.view === 'summaryView' ? 'Resúmenes' : button.dataset.view === 'configView' ? 'Configuración' : 'Panel diario';
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
function updateServiceFilterLabel() {
  const checked = [...document.querySelectorAll('#summaryServiceOptions input:checked')];
  const summary = document.querySelector('#summaryServiceFilter summary');
  summary.textContent = checked.length === config.services.length ? 'Todos los servicios' : checked.length === 1 ? checked[0].value : `${checked.length} servicios seleccionados`;
}
document.getElementById('summaryServiceOptions').addEventListener('change', () => {
  updateServiceFilterLabel();
  renderSummary();
});
document.getElementById('summaryBarberFilter').addEventListener('change', renderSummary);
document.getElementById('summaryPaymentFilter').addEventListener('change', renderSummary);
document.getElementById('stockChartMode').addEventListener('change', renderSummary);
document.getElementById('stockChartProductOptions').addEventListener('change', renderSummary);

document.getElementById('addSale').addEventListener('click', () => { if (!dailyOperationsLocked()) openSaleDialog(); });
['click', 'keydown'].forEach((type) => document.getElementById('salesRows').addEventListener(type, (event) => {
  if (dailyOperationsLocked()) return;
  if (type === 'keydown' && event.key !== 'Enter') return;
  const row = event.target.closest('[data-sale]');
  if (row) openSaleDetail(row.dataset.sale);
}));
document.getElementById('addAdvance').addEventListener('click', () => { if (!dailyOperationsLocked()) openAdvanceDialog(); });
['click', 'keydown'].forEach((type) => document.getElementById('advanceRows').addEventListener(type, (event) => {
  if (dailyOperationsLocked()) return;
  if (type === 'keydown' && event.key !== 'Enter') return;
  const row = event.target.closest('[data-advance]');
  if (row) openAdvanceDetail(row.dataset.advance);
}));
document.getElementById('addExpense').addEventListener('click', () => { if (!dailyOperationsLocked()) openExpenseDialog(); });
['click', 'keydown'].forEach((type) => document.getElementById('expenseRows').addEventListener(type, (event) => {
  if (dailyOperationsLocked()) return;
  if (type === 'keydown' && event.key !== 'Enter') return;
  const row = event.target.closest('[data-expense]');
  if (row) openExpenseDetail(row.dataset.expense);
}));
[saleForm.elements.quantity, saleForm.elements.unitPrice].forEach((input) => input.addEventListener('input', () => {
  updateSaleTotal();
  saleCashAmountInput.setCustomValidity('');
}));

transferForm.elements.from.addEventListener('change', () => transferForm.elements.amount.setCustomValidity(''));
transferForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (dailyOperationsLocked()) return;
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
  if (dailyOperationsLocked()) return;
  const button = event.target.closest('[data-delete-transfer]');
  if (!button || !confirm('¿Eliminar este movimiento entre medios?')) return;
  transfers = transfers.filter((transfer) => transfer.id !== button.dataset.deleteTransfer);
  saveTransfers();
  render();
});

saleForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (dailyOperationsLocked()) return;
  const values = Object.fromEntries(new FormData(saleForm));
  const quantity = Number(values.quantity);
  const unitPrice = parseAmount(values.unitPrice);
  const total = quantity * unitPrice;
  const cashAmount = parseAmount(values.cashAmount);
  const mpAmount = parseAmount(values.mpAmount);
  saleForm.elements.unitPrice.setCustomValidity(unitPrice > 0 ? '' : 'El precio debe ser mayor que cero.');
  saleCashAmountInput.setCustomValidity('');
  if (values.payment === 'Ambos' && cashAmount + mpAmount !== total) {
    saleCashAmountInput.setCustomValidity('La suma debe coincidir con el importe total de la venta.');
  }
  if (!saleForm.reportValidity()) return;
  const product = inventory.products.find((item) => item.id === values.product && item.active && item.saleEnabled);
  saleForm.elements.product.setCustomValidity(product ? '' : 'Elegí un producto disponible.');
  if (!saleForm.reportValidity()) return;
  const sale = { ...values, productId: product.id, product: product.name, quantity, unitPrice, total, date: workday.value, id: editingSaleId || crypto.randomUUID() };
  if (values.payment === 'Ambos') Object.assign(sale, { cashAmount, mpAmount });
  else {
    delete sale.cashAmount;
    delete sale.mpAmount;
  }
  const previous = sales.find((item) => item.id === editingSaleId);
  if (!saveSaleInventory(sale, previous)) {
    saleForm.elements.product.setCustomValidity(document.getElementById('stockMessage').textContent || 'No se pudo actualizar el stock.');
    saleForm.reportValidity();
    render();
    return;
  }
  sales = editingSaleId ? sales.map((item) => item.id === editingSaleId ? sale : item) : [...sales, sale];
  saveSales();
  editingSaleId = null;
  saleDialog.close();
  render();
});

advanceForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (dailyOperationsLocked()) return;
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
  if (dailyOperationsLocked()) return;
  const values = Object.fromEntries(new FormData(expenseForm));
  expenseForm.elements.amount.setCustomValidity(parseAmount(values.amount) > 0 ? '' : 'El importe debe ser mayor que cero.');
  if (!expenseForm.reportValidity()) return;
  const expense = { ...values, amount: parseAmount(values.amount), date: workday.value, id: editingExpenseId || crypto.randomUUID() };
  if (!expense.category) delete expense.category;
  expenses = editingExpenseId ? expenses.map((item) => item.id === editingExpenseId ? expense : item) : [...expenses, expense];
  saveExpenses();
  editingExpenseId = null;
  expenseDialog.close();
  render();
});

openingCashForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (dailyOperationsLocked()) return;
  const values = Object.fromEntries(new FormData(openingCashForm));
  const current = cashRegisters[workday.value] || {};
  const initialCash = parseAmount(values.initialCash);
  const initialMp = parseAmount(values.initialMp);
  const changed = isDayOpen(workday.value) && (initialCash !== Number(current.initialCash) || initialMp !== Number(current.initialMp));
  const description = String(values.editDescription || '').trim();
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
  const register = cashRegisters[workday.value] || {};
  if ('realCash' in register && 'realMp' in register && !editingClosing) return;
  const values = Object.fromEntries(new FormData(cashRegisterForm));
  const realCash = parseAmount(values.realCash);
  const realMp = parseAmount(values.realMp);
  const withdrawal = parseAmount(values.withdrawal);
  const withdrawalMp = parseAmount(values.withdrawalMp);
  cashRegisterForm.elements.withdrawal.setCustomValidity(withdrawal > realCash ? 'El retiro no puede superar el efectivo real.' : '');
  closingInput('withdrawalMp')?.setCustomValidity(withdrawalMp > realMp ? 'El retiro no puede superar el MP real.' : '');
  if (!cashRegisterForm.reportValidity()) return;
  const unpaid = unpaidBarbers();
  if (unpaid.length && !confirm(`Quedan pagos pendientes de ${unpaid.join(', ')}. Confirmá el cierre de todos modos.`)) return;
  cashRegisters[workday.value] = { ...(cashRegisters[workday.value] || {}), realCash, realMp, withdrawal, withdrawalMp, closedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  saveCashRegisters();
  for (const [date, register] of Object.entries(cashRegisters)) {
    if (register.autoOpened && register.inheritedFrom === workday.value) {
      cashRegisters[date] = { ...register, initialCash: Math.max(0, realCash - withdrawal), initialMp: Math.max(0, realMp - withdrawalMp), updatedAt: new Date().toISOString() };
    }
  }
  saveCashRegisters();
  editingClosing = false;
  render();
});
[closingInput('realCash'), closingInput('realMp'), closingInput('withdrawal'), closingInput('withdrawalMp')].filter(Boolean).forEach((input) => input.addEventListener('input', () => renderClosingDifferences()));
document.getElementById('editClosing').addEventListener('click', () => {
  editingClosing = true;
  render();
});
document.getElementById('cancelClosingEdit').addEventListener('click', () => {
  editingClosing = false;
  ['withdrawal', 'withdrawalMp'].forEach((name) => closingInput(name)?.setCustomValidity(''));
  render();
});

serviceInput.addEventListener('change', (event) => {
  amountInput.value = prices[event.target.value] ? formatAmount(prices[event.target.value]) : '';
  amountInput.setCustomValidity('');
});
saleForm.elements.product.addEventListener('change', (event) => {
  saleForm.elements.product.setCustomValidity('');
  const product = inventory.products.find((item) => item.id === event.target.value && item.active && item.saleEnabled);
  saleForm.elements.unitPrice.value = product ? formatAmount(product.salePrice) : '';
  saleForm.elements.unitPrice.setCustomValidity('');
  updateSaleTotal();
});
salePaymentInput.addEventListener('change', toggleSaleSplitPayment);
[saleCashAmountInput, saleMpAmountInput].forEach((input) => input.addEventListener('input', () => saleCashAmountInput.setCustomValidity('')));
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
  editingClosing = false;
  ['withdrawal', 'withdrawalMp'].forEach((name) => closingInput(name)?.setCustomValidity(''));
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
  const sale = sales.find((item) => item.id === selectedSaleId);
  if (!saveSaleInventory(null, sale)) {
    const feedback = document.getElementById('saleDeleteStockError');
    feedback.textContent = document.getElementById('stockMessage').textContent || 'No se pudo devolver el stock; la venta no se eliminó.';
    feedback.hidden = false;
    render();
    return;
  }
  sales = sales.filter((item) => item.id !== selectedSaleId);
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
[serviceConfigForm, barberConfigForm].forEach((catalogForm) => {
  catalogForm.elements.name.addEventListener('input', () => catalogForm.elements.name.setCustomValidity(''));
});
barberConfigForm.addEventListener('submit', (event) => { event.preventDefault(); saveCatalog('barbers', barberConfigForm); });
expenseCategoryConfigForm.addEventListener('submit', (event) => { event.preventDefault(); saveCatalog('expenseCategories', expenseCategoryConfigForm); });
document.getElementById('addServiceConfig').addEventListener('click', () => openConfigDialog('services'));
document.getElementById('addBarberConfig').addEventListener('click', () => openConfigDialog('barbers'));
document.getElementById('addExpenseCategoryConfig').addEventListener('click', () => openConfigDialog('expenseCategories'));
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
commissionDialog.addEventListener('mousedown', (event) => { if (event.target === commissionDialog) commissionDialog.close(); });
dailyCommissionForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!dailyCommissionForm.reportValidity()) return;
  const commissionRate = Number(dailyCommissionForm.elements.commission.value);
  cashRegisters[workday.value] = { ...(cashRegisters[workday.value] || {}), commissionRate };
  // An explicit daily override replaces that day's snapshots; changing the
  // default configuration still preserves commissions recorded on other days.
  entries = entries.map((cut) => cut.date === workday.value ? { ...cut, commissionRate, commissionAmount: Number(cut.amount) * commissionRate / 100 } : cut);
  save();
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

const stateApiEnabled = typeof window.fetch === 'function';
let tabId = null;
try {
  tabId = sessionStorage.getItem('theluxe-tab-v1') || crypto.randomUUID();
  sessionStorage.setItem('theluxe-tab-v1', tabId);
} catch { /* Conserva el respaldo con una clave de reserva si no hay sessionStorage. */ }
let pendingStateKey = tabId ? `theluxe-pending-state-v1:${tabId}` : 'theluxe-pending-state-v1';
const tabChannel = typeof window.BroadcastChannel === 'function' && tabId ? new window.BroadcastChannel('theluxe-pending-tabs') : null;
const tabNonce = tabChannel ? crypto.randomUUID() : null;
let tabOccupied = false;
if (tabChannel) tabChannel.onmessage = ({ data }) => {
  if (data?.id !== tabId || data.nonce === tabNonce) return;
  if (data.type === 'claim') tabChannel.postMessage({ type: 'occupied', id: tabId, nonce: tabNonce });
  if (data.type === 'occupied') tabOccupied = true;
};
window.addEventListener('pagehide', () => tabChannel?.close());
async function claimTab() {
  if (!tabChannel) return;
  tabOccupied = false;
  tabChannel.postMessage({ type: 'claim', id: tabId, nonce: tabNonce });
  await new Promise((resolve) => window.setTimeout(resolve, 50));
  if (tabOccupied) {
    tabId = crypto.randomUUID();
    sessionStorage.setItem('theluxe-tab-v1', tabId);
    pendingStateKey = `theluxe-pending-state-v1:${tabId}`;
  }
}
let stateRevision = 0;
let stateDirty = false;
let stateSaving = false;
let stateFlushQueued = false;
let stateConflict = false;
let stateLoaded = false;
function stateSnapshot() { return structuredClone({ config, entries, sales, advances, expenses, transfers, openingAdjustments, cashRegisters, barberPayments, inventory }); }
function stateMessage(message, error = false, retry = false) {
  const notice = document.getElementById('persistenceNotice');
  notice.hidden = !message; notice.classList.toggle('error', error);
  notice.setAttribute('role', error ? 'alert' : 'status');
  notice.setAttribute('aria-live', error ? 'assertive' : 'polite');
  document.getElementById('persistenceMessage').textContent = message;
  document.getElementById('retryPersistence').hidden = !retry;
}
function conflictActions(visible) { document.getElementById('conflictActions').hidden = !visible; }
function backUpPendingState(snapshot = stateSnapshot()) {
  try {
    const pending = JSON.stringify({ revision: stateRevision, state: snapshot });
    localStorage.setItem(pendingStateKey, pending);
    return pending;
  } catch { return false; }
}
function clearPendingState(expected) {
  try {
    if (localStorage.getItem(pendingStateKey) !== expected) return false;
    localStorage.removeItem(pendingStateKey);
    return true;
  } catch { return false; }
}
function enterStateConflict(message) {
  stateConflict = true; stateDirty = true;
  document.querySelector('.app-shell').inert = true;
  conflictActions(true);
  stateMessage(message, true);
}
function queueStateSave() {
  if (!stateApiEnabled) return;
  stateDirty = true;
  if (!backUpPendingState()) stateMessage('No se pudo crear una copia de los cambios pendientes en este navegador. No cierres la página hasta confirmar el guardado en la base.', true);
  if (stateFlushQueued || stateSaving || stateConflict) return;
  stateFlushQueued = true;
  queueMicrotask(() => { stateFlushQueued = false; void flushStateSave(); });
}
async function flushStateSave() {
  if (!stateDirty || stateSaving || stateConflict) return;
  stateSaving = true; stateDirty = false; stateMessage('Guardando cambios…');
  const snapshot = stateSnapshot();
  const pending = backUpPendingState(snapshot);
  try {
    const response = await window.fetch('/api/state', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: stateRevision, state: snapshot }) });
    if (response.status === 409) {
      enterStateConflict('Los datos cambiaron en otra sesión. No se sobrescribió la base; descargá la copia local antes de decidir usar la versión de la base de datos.');
      return;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const saved = await response.json();
    if (!Number.isSafeInteger(saved.revision) || saved.revision !== stateRevision + 1) throw new Error('Revisión inválida');
    stateRevision = saved.revision;
    if (stateDirty) backUpPendingState();
    else clearPendingState(pending);
    stateMessage('');
  } catch {
    stateDirty = true;
    stateMessage('No se pudieron guardar los cambios. Permanecen en esta pantalla; reintentá antes de recargar.', true, true);
  } finally {
    stateSaving = false;
    if (stateDirty && !stateConflict && document.getElementById('retryPersistence').hidden) queueStateSave();
  }
}
function hydrateState(state) {
  if (!state || !state.config || !Array.isArray(state.config.services) || !Array.isArray(state.config.barbers)
    || !['entries', 'sales', 'advances', 'expenses', 'transfers', 'openingAdjustments'].every((key) => Array.isArray(state[key]))
    || !state.cashRegisters || !state.barberPayments || inventoryError(state.inventory)) throw new Error('Respuesta inválida');
  ({ config, entries, sales, advances, expenses, transfers, openingAdjustments, cashRegisters, barberPayments, inventory } = state);
  inventory = inventory.version === 1 ? migrateInventory(inventory) : inventory;
  inventoryReadError = false;
  let migratedPayments = false;
  for (const [date, payments] of Object.entries(barberPayments)) {
    for (const [barber, payment] of Object.entries(payments)) {
      const status = typeof payment === 'string' ? payment : payment.status;
      if (!['Efectivo', 'Mercado Pago'].includes(status) || typeof payment !== 'string' && payment.paidAmount !== undefined) continue;
      const cuts = entries.filter((cut) => cut.date === date && cut.barber === barber);
      const dayAdvances = advances.filter((advance) => advance.date === date && advance.barber === barber);
      const paidAmount = barberSettlement(cuts, dayAdvances, {}, effectiveCommission).due;
      payments[barber] = { ...(typeof payment === 'string' ? { status, cashAmount: '', mpAmount: '' } : payment), paidAmount };
      migratedPayments = true;
    }
  }
  return migratedPayments;
}
async function bootstrapState() {
  const shell = document.querySelector('.app-shell');
  if (!stateApiEnabled) {
    if (document.querySelector('meta[name="theluxe-build"]')) {
      shell.inert = true;
      stateMessage('Este navegador no puede conectarse a la base de datos. Actualizá el navegador antes de operar.', true);
      return;
    }
    initInventory(); renderConfig(); render(); return;
  }
  shell.inert = true; stateMessage('Cargando datos guardados…');
  const localInventoryOk = loadInventory(); // Legacy inventory stays as a backup until DB import succeeds.
  try {
    await claimTab();
    const response = await window.fetch('/api/state', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const stored = await response.json();
    if (!Number.isSafeInteger(stored.revision) || stored.revision < 0) throw new Error('Respuesta inválida');
    stateRevision = stored.revision;
    const pendingRaw = localStorage.getItem(pendingStateKey);
    const pending = pendingRaw ? JSON.parse(pendingRaw) : null;
    let migratedPayments = false;
    if (pending && (!Number.isSafeInteger(pending.revision) || pending.revision < 0 || !pending.state)) throw new Error('Respaldo pendiente inválido');
    if (pending && stored.state && JSON.stringify(pending.state) === JSON.stringify(stored.state)) clearPendingState(pendingRaw);
    else if (pending) {
      migratedPayments = hydrateState(pending.state);
      if (pending.revision !== stateRevision) {
        initInventory(false); renderConfig(); render();
        stateLoaded = true;
        enterStateConflict('Hay cambios locales sin guardar y la base cambió en otra sesión. Descargá la copia local antes de decidir usar la versión de la base de datos.');
        return;
      }
    }
    if (!pending && stored.state === null) {
      if (!localInventoryOk) throw new Error('Inventario local inválido');
      entries = []; sales = []; advances = []; expenses = []; transfers = []; openingAdjustments = []; cashRegisters = {}; barberPayments = {};
    } else if (!pending || stored.state && JSON.stringify(pending.state) === JSON.stringify(stored.state)) {
      migratedPayments = hydrateState(stored.state);
      stockMessage('');
    }
    initInventory(false); renderConfig(); render();
    stateLoaded = true; shell.inert = false; conflictActions(false); stateMessage('');
    if (stored.state === null || pending && pending.revision === stateRevision || migratedPayments) queueStateSave();
  } catch (error) {
    stateMessage(error.message === 'Inventario local inválido'
      ? 'El inventario local no es válido. No se creó una base nueva ni se sobrescribió el respaldo. Reparalo antes de reintentar.'
      : 'No se pudieron cargar los datos guardados. La aplicación permanece bloqueada para no sobrescribir información.', true, true);
  }
}
document.getElementById('retryPersistence').addEventListener('click', () => {
  if (!stateLoaded) { void bootstrapState(); return; }
  if (!stateConflict) { stateMessage(''); void flushStateSave(); }
});
function exportPendingState() {
  const json = JSON.stringify({ revision: stateRevision, state: stateSnapshot() }, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL ? URL.createObjectURL(blob) : `data:application/json;charset=utf-8,${encodeURIComponent(json)}`;
  const link = document.createElement('a');
  link.href = url; link.download = `theluxe-copia-sin-guardar-${today()}.json`;
  document.body.append(link); link.click(); link.remove();
  if (URL.revokeObjectURL && URL.createObjectURL) window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
async function useDatabaseState() {
  if (!stateConflict || !confirm('Se descartarán los cambios locales de esta pestaña y se usará la versión actual de la base de datos. Descargá primero la copia si la necesitás. ¿Continuar?')) return;
  const expected = localStorage.getItem(pendingStateKey);
  stateMessage('Cargando la versión de la base de datos…');
  try {
    const response = await window.fetch('/api/state', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const stored = await response.json();
    if (!Number.isSafeInteger(stored.revision) || stored.revision < 0 || !stored.state) throw new Error('Respuesta inválida');
    hydrateState(stored.state);
    stateRevision = stored.revision; stateDirty = false; stateConflict = false;
    populateSelectors(); renderConfig(); render();
    document.querySelector('.app-shell').inert = false;
    conflictActions(false);
    if (expected !== null && !clearPendingState(expected)) stateMessage('Se está usando la versión de la base de datos, pero no se pudo borrar la copia local. Descargala o eliminála manualmente antes de recargar.', true);
    else stateMessage('');
  } catch {
    stateMessage('No se pudo cargar la versión de la base de datos. El conflicto y la copia local siguen protegidos; reintentá cuando haya conexión.', true);
  }
}
document.getElementById('exportPendingState').addEventListener('click', exportPendingState);
document.getElementById('useDatabaseState').addEventListener('click', () => { void useDatabaseState(); });
window.addEventListener('beforeunload', (event) => {
  if (!stateDirty && !stateSaving) return;
  event.preventDefault(); event.returnValue = '';
});
void bootstrapState();

let mainUpdateAvailable = false;
const updaterUrl = 'http://127.0.0.1:8001';

async function checkForUpdates() {
  const current = document.querySelector('meta[name="theluxe-build"]')?.content;
  if (!/^[a-f0-9]{64}$/.test(current || '')) return 'unavailable';
  if (typeof window.fetch !== 'function') return 'error';
  try {
    const response = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) return 'error';
    const { version } = await response.json();
    if (!/^[a-f0-9]{64}$/.test(version)) return 'error';
    const available = version !== current;
    document.getElementById('updateNotice').hidden = !available;
    if (available) {
      mainUpdateAvailable = false;
      document.getElementById('reloadUpdate').textContent = 'Recargar';
      document.getElementById('configApplyUpdate').textContent = 'Recargar';
    }
    if (!mainUpdateAvailable) document.getElementById('configApplyUpdate').hidden = !available;
    const status = document.getElementById('configUpdateStatus');
    if (available || !status.hidden && !mainUpdateAvailable) {
      status.hidden = false;
      status.textContent = available ? 'Actualización instalada. Recargá para usarla.' : 'Ya tenés la última versión publicada.';
    }
    return available ? 'available' : 'current';
  } catch { return 'error'; }
}

async function updaterStatus() {
  const response = await fetch(`${updaterUrl}/status`, { cache: 'no-store' });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'No se pudo consultar GitHub main.');
  return result;
}

document.getElementById('checkUpdates').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  const status = document.getElementById('configUpdateStatus');
  button.disabled = true;
  status.hidden = false;
  status.textContent = 'Buscando actualizaciones…';
  try {
    const result = await checkForUpdates();
    if (result === 'available') return;
    if (result === 'unavailable') { status.textContent = 'Abrí la versión compilada del programa.'; return; }
    const release = await updaterStatus();
    if (release.busy) { status.textContent = `Actualizando: ${release.phase}.`; return; }
    if (release.error) {
      mainUpdateAvailable = Boolean(release.available);
      document.getElementById('configApplyUpdate').hidden = !mainUpdateAvailable;
      status.textContent = `La actualización falló: ${release.error}`;
      return;
    }
    mainUpdateAvailable = release.available;
    document.getElementById('configApplyUpdate').hidden = !release.available;
    document.getElementById('configApplyUpdate').textContent = 'Actualizar';
    status.textContent = release.available ? 'Hay una nueva versión en GitHub main.' : 'Ya tenés la última versión de GitHub main.';
  } catch (failure) {
    status.textContent = `No se pudo consultar GitHub. ${String(failure.message || '').slice(0, 200)} Iniciá el actualizador local o revisá la conexión.`;
  } finally { button.disabled = false; }
});

async function applyUpdate() {
  if (stateDirty || stateSaving) {
    alert('Hay cambios pendientes de guardado. Reintentá el guardado antes de actualizar o recargar.');
    return;
  }
  if (!mainUpdateAvailable) {
    if (confirm('Se recargará la aplicación. No se perderán las ventas ni los datos financieros confirmados. ¿Continuar?')) window.location.reload();
    return;
  }
  if (!confirm('Se instalará main y se reiniciará Docker. Los datos financieros confirmados permanecen guardados. ¿Continuar?')) return;
  const button = document.getElementById('configApplyUpdate');
  const status = document.getElementById('configUpdateStatus');
  button.disabled = true;
  status.hidden = false;
  status.textContent = 'Instalando actualización…';
  try {
    const response = await fetch(`${updaterUrl}/update`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', cache: 'no-store' });
    const result = await response.json();
    if (!response.ok || !result.started) throw new Error(result.error || 'No se pudo iniciar la actualización.');
    for (let attempt = 0; attempt < 500; attempt++) {
      await new Promise((resolve) => window.setTimeout(resolve, 2000));
      if (await checkForUpdates() === 'available') return;
      const progress = await updaterStatus();
      if (progress.busy) { status.textContent = `Actualizando: ${progress.phase}.`; continue; }
      if (progress.error) throw new Error(progress.error);
      if (!progress.available) {
        mainUpdateAvailable = false;
        button.hidden = true;
        status.textContent = 'Actualización instalada. No hubo cambios en la aplicación.';
        return;
      }
      throw new Error('Docker no está sirviendo la actualización. Intentá buscar de nuevo.');
    }
    throw new Error('La actualización tardó demasiado. Revisá Docker e intentá buscar de nuevo.');
  } catch (error) {
    status.textContent = `No se pudo actualizar: ${error.message}`;
  } finally { button.disabled = false; }
}

document.getElementById('configApplyUpdate').addEventListener('click', () => { void applyUpdate(); });
document.getElementById('reloadUpdate').addEventListener('click', () => { void applyUpdate(); });
if (document.querySelector('meta[name="theluxe-build"]')) {
  void checkForUpdates();
  window.addEventListener('focus', () => { void checkForUpdates(); });
  window.setInterval(() => { if (!document.hidden) void checkForUpdates(); }, 5 * 60 * 1000);
}
