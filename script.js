const form = document.getElementById('cutForm');
const dialog = document.getElementById('cutDialog');
const payment = document.getElementById('payment');
const mixedPayment = document.getElementById('mixedPayment');
const mixedInputs = [document.getElementById('cashAmount'), document.getElementById('transferAmount')];
const storageKey = 'theluxe-barberia-cuts';
const demoKey = 'theluxe-demo-seeded-v1';
const settingsKey = 'theluxe-settings';
const barbers = ['Mateo', 'Julián', 'Nicolás', 'Tomás', 'Franco', 'Agustín', 'Lucas', 'Bruno', 'Santino'];
const services = ['Corte clásico', 'Corte + barba', 'Barba', 'Diseño'];
const localDate = (date = new Date()) => new Date(date - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
let entries = JSON.parse(localStorage.getItem(storageKey) || '[]');
let settings = JSON.parse(localStorage.getItem(settingsKey) || 'null') || {
  prices: { 'Corte clásico': 15000, 'Corte + barba': 22000, Barba: 10000, Diseño: 18000 },
  commission: 50,
};
settings.commission ??= Number(Object.values(settings.commissions || {})[0] ?? 50);

function demoEntries() {
  const services = [
    ['Corte clásico', 15000],
    ['Corte + barba', 22000],
    ['Barba', 10000],
    ['Diseño', 18000],
  ];
  const result = [];
  for (let offset = 120; offset >= 0; offset--) {
    const date = new Date();
    date.setDate(date.getDate() - offset);
    if (date.getDay() === 0) continue;
    const cuts = 4 + (offset * 5 % 7);
    for (let index = 0; index < cuts; index++) {
      const [service, amount] = services[(offset + index) % services.length];
      const tip = (offset + index) % 4 === 0 ? 2000 + ((offset + index) % 3) * 500 : 0;
      const payment = ['Efectivo', 'Transferencia', 'Mixto'][(offset + index * 2) % 3];
      const total = amount + tip;
      const cashAmount = payment === 'Mixto' ? Math.floor(total * .4 / 500) * 500 : '';
      result.push({
        id: crypto.randomUUID(),
        date: localDate(date),
        barber: barbers[(offset * 3 + index) % barbers.length],
        service,
        amount,
        tip,
        payment,
        cashAmount,
        transferAmount: payment === 'Mixto' ? total - cashAmount : '',
        notes: '',
      });
    }
  }
  return result;
}

if (!localStorage.getItem(demoKey)) {
  entries.push(...demoEntries());
  localStorage.setItem(storageKey, JSON.stringify(entries));
  localStorage.setItem(demoKey, '1');
}

document.getElementById('todayLabel').textContent = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

function periodStart(period) {
  const today = new Date(`${localDate()}T00:00:00`);
  if (period === 'day') return today;
  if (period === 'month') return new Date(today.getFullYear(), today.getMonth(), 1);
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  return monday;
}

function summary(period) {
  const list = period === 'all' ? entries : entries.filter((entry) => new Date(`${entry.date}T00:00:00`) >= periodStart(period));
  return { count: list.length, total: list.reduce((sum, entry) => sum + Number(entry.amount) + Number(entry.tip || 0), 0) };
}

function render() {
  const today = summary('day');
  const todayEntries = entries.filter((entry) => entry.date === localDate());
  const paymentTotal = (type) => todayEntries.reduce((sum, entry) => {
    if (entry.payment === type) return sum + Number(entry.amount) + Number(entry.tip || 0);
    if (entry.payment === 'Mixto') return sum + Number(type === 'Efectivo' ? entry.cashAmount : entry.transferAmount);
    return sum;
  }, 0);
  document.getElementById('dailyTotal').textContent = money.format(today.total);
  document.getElementById('dailyCount').textContent = `${today.count} ${today.count === 1 ? 'servicio' : 'servicios'}`;
  document.getElementById('tipsTotal').textContent = money.format(todayEntries.reduce((sum, entry) => sum + Number(entry.tip || 0), 0));
  document.getElementById('cashTotal').textContent = money.format(paymentTotal('Efectivo'));
  document.getElementById('transferTotal').textContent = money.format(paymentTotal('Transferencia'));
  renderBarberColumns(todayEntries);
  renderPeriodOptions();
  renderGeneral();
  renderSettings();
}

function renderBarberColumns(todayEntries) {
  document.getElementById('barberColumns').innerHTML = barbers.map((barber) => {
    const services = todayEntries.filter((entry) => entry.barber === barber);
    const total = services.reduce((sum, entry) => sum + Number(entry.amount) + Number(entry.tip || 0), 0);
    const rows = services.length ? services.map((entry) => `
      <div class="barber-service">
        <strong>${escapeHtml(entry.service)}</strong><span>${money.format(Number(entry.amount) + Number(entry.tip || 0))}</span>
        <small>${escapeHtml(entry.payment || 'Sin especificar')}${Number(entry.tip) ? ` · Propina ${money.format(entry.tip)}` : ''}</small>
      </div>`).join('') : '<div class="barber-empty">Sin servicios cargados</div>';
    return `<section class="barber-column"><header class="barber-column-header"><strong>${escapeHtml(barber)}</strong><span>${services.length} ${services.length === 1 ? 'corte' : 'cortes'}</span></header><div class="barber-services">${rows}</div><footer class="barber-column-total"><span>Total del día</span><strong>${money.format(total)}</strong></footer></section>`;
  }).join('');
}

function filteredEntries() {
  const months = selectedValues('filterMonth');
  const weeks = selectedValues('filterWeek');
  const barber = document.getElementById('filterBarber').value;
  const service = document.getElementById('filterService').value;
  const paymentType = document.getElementById('filterPayment').value;
  return entries.filter((entry) => (weeks.length ? weeks.some((week) => entry.date >= week && entry.date <= weekEnd(week)) : !months.length || months.some((month) => entry.date.startsWith(month))) && (!barber || entry.barber === barber) && (!service || entry.service === service) && (!paymentType || entry.payment === paymentType));
}

const selectedValues = (id) => [...document.querySelectorAll(`#${id} input:checked`)].map((input) => input.value).filter(Boolean);

function weekEnd(start) {
  const end = new Date(`${start}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 6);
  return end.toISOString().slice(0, 10);
}

function monthWeeks(month) {
  const [year, monthNumber] = month.split('-').map(Number);
  const monday = new Date(Date.UTC(year, monthNumber - 1, 1));
  monday.setUTCDate(monday.getUTCDate() + ((8 - monday.getUTCDay()) % 7));
  const weeks = [];
  while (monday.getUTCMonth() === monthNumber - 1) {
    weeks.push(monday.toISOString().slice(0, 10));
    monday.setUTCDate(monday.getUTCDate() + 7);
  }
  return weeks;
}

function renderGeneral() {
  const filtered = filteredEntries();
  const total = filtered.reduce((sum, entry) => sum + Number(entry.amount) + Number(entry.tip || 0), 0);
  const tips = filtered.reduce((sum, entry) => sum + Number(entry.tip || 0), 0);
  document.getElementById('generalTotal').textContent = money.format(total);
  document.getElementById('generalCount').textContent = filtered.length;
  document.getElementById('generalTips').textContent = money.format(tips);
  document.getElementById('generalAverage').textContent = money.format(filtered.length ? total / filtered.length : 0);

  const days = filtered.reduce((result, entry) => {
    result[entry.date] ??= { count: 0, cash: 0, transfer: 0, tips: 0 };
    result[entry.date].count++;
    result[entry.date].tips += Number(entry.tip || 0);
    const charged = Number(entry.amount) + Number(entry.tip || 0);
    if (entry.payment === 'Efectivo') result[entry.date].cash += charged;
    if (entry.payment === 'Transferencia') result[entry.date].transfer += charged;
    if (entry.payment === 'Mixto') {
      result[entry.date].cash += Number(entry.cashAmount || 0);
      result[entry.date].transfer += Number(entry.transferAmount || 0);
    }
    return result;
  }, {});
  document.getElementById('dailyReport').innerHTML = Object.keys(days).length
    ? Object.entries(days).sort(([a], [b]) => b.localeCompare(a)).map(([date, data]) => `<tr><td>${new Date(`${date}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'long' })}</td><td>${new Date(`${date}T12:00:00`).toLocaleDateString('es-AR')}</td><td>${data.count}</td><td>${money.format(data.transfer)}</td><td>${money.format(data.cash)}</td><td>${money.format(data.tips)}</td><td>${money.format(data.cash + data.transfer)}</td></tr>`).join('')
    : '<tr><td class="table-empty" colspan="7">No hay movimientos para estos filtros.</td></tr>';
  renderBarberReport(filtered);
}

function renderBarberReport(filtered) {
  const barber = document.getElementById('filterBarber').value;
  const sales = filtered.reduce((sum, entry) => sum + Number(entry.amount), 0);
  const tips = filtered.reduce((sum, entry) => sum + Number(entry.tip || 0), 0);
  document.getElementById('barberSales').textContent = money.format(sales);
  document.getElementById('barberTips').textContent = money.format(tips);
  document.getElementById('barberCuts').textContent = filtered.length;
  document.getElementById('barberCommission').textContent = money.format(sales * Number(settings.commission) / 100);
  document.getElementById('barberName').textContent = barber || 'Todos los barberos';
  document.getElementById('barberReportTitle').textContent = barber ? `Detalle de ${barber}` : 'Detalle de todos los barberos';
  const days = filtered.reduce((result, entry) => {
    result[entry.date] ??= { count: 0, sales: 0, tips: 0 };
    result[entry.date].count++;
    result[entry.date].sales += Number(entry.amount);
    result[entry.date].tips += Number(entry.tip || 0);
    return result;
  }, {});
  document.getElementById('barberReport').innerHTML = Object.keys(days).length
    ? Object.entries(days).sort(([a], [b]) => a.localeCompare(b)).map(([date, data]) => `<tr><td>${new Date(`${date}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'long' })}</td><td>${new Date(`${date}T12:00:00`).toLocaleDateString('es-AR')}</td><td>${data.count}</td><td>${money.format(data.sales)}</td><td>${money.format(data.tips)}</td><td>${money.format(data.sales + data.tips)}</td></tr>`).join('')
    : '<tr><td class="table-empty" colspan="6">No hay movimientos para este barbero y período.</td></tr>';
}

function renderSettings() {
  document.getElementById('serviceSettings').innerHTML = services.map((service) => `<div class="setting-row"><label for="price-${services.indexOf(service)}">${escapeHtml(service)}</label><div class="money-input"><b>$</b><input id="price-${services.indexOf(service)}" name="price:${escapeHtml(service)}" type="number" min="0" step="500" value="${Number(settings.prices[service] || 0)}" required></div></div>`).join('');
  document.getElementById('commissionSettings').innerHTML = `<div class="setting-row"><label for="defaultCommission">Comisión por defecto</label><div class="percent-input"><input id="defaultCommission" name="commission" type="number" min="0" max="100" step="1" value="${Number(settings.commission)}" required><b>%</b></div></div>`;
}

function renderPeriodOptions() {
  const monthSelect = document.getElementById('filterMonth');
  const weekSelect = document.getElementById('filterWeek');
  const selectedMonths = selectedValues('filterMonth');
  const selectedWeeks = selectedValues('filterWeek');
  const months = [...new Set(entries.map((entry) => entry.date.slice(0, 7)))].sort().reverse();
  monthSelect.innerHTML = months.map((month, index) => `<label><input type="radio" name="filter-month" value="${month}"${selectedMonths.includes(month) || (!selectedMonths.length && index === 0) ? ' checked' : ''}>${new Date(`${month}-01T12:00:00`).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}</label>`).join('') || '<span class="empty-state">Sin períodos</span>';
  const activeMonth = selectedValues('filterMonth')[0];
  const weeks = activeMonth ? monthWeeks(activeMonth) : [];
  weekSelect.innerHTML = `<label><input type="radio" name="filter-week" value=""${selectedWeeks.length ? '' : ' checked'}>Todas</label>${weeks.map((start, index) => `<label><input type="radio" name="filter-week" value="${start}"${selectedWeeks.includes(start) ? ' checked' : ''}>Semana ${index + 1}</label>`).join('')}`;
  updatePeriodLabels();
}

function updatePeriodLabels() {
  const month = document.querySelector('#filterMonth input:checked');
  const week = document.querySelector('#filterWeek input:checked');
  document.getElementById('monthSummary').textContent = month ? month.parentElement.textContent.trim() : 'Elegir mes';
  document.getElementById('weekSummary').textContent = week ? week.parentElement.textContent.trim() : 'Todas';
}

function openView(id) {
  document.querySelectorAll('.view').forEach((view) => { view.classList.toggle('active', view.id === id); view.hidden = view.id !== id; });
  document.querySelectorAll('.nav-item').forEach((button) => { const active = button.dataset.view === id; button.classList.toggle('active', active); button.toggleAttribute('aria-current', active); });
  const titles = { summaryView: ['OPERACIÓN DIARIA', 'Hoy'], generalView: ['ANÁLISIS', 'Reportes'], settingsView: ['AJUSTES', 'Configuración'] };
  document.getElementById('viewEyebrow').textContent = titles[id][0];
  document.getElementById('viewTitle').textContent = titles[id][1];
}

function toggleMixedPayment() {
  const mixed = payment.value === 'Mixto';
  mixedPayment.hidden = !mixed;
  mixedInputs.forEach((input) => { input.required = mixed; if (!mixed) input.value = ''; });
}

const mixedTotalMatches = (values) => values.payment !== 'Mixto' || Number(values.cashAmount) + Number(values.transferAmount) === Number(values.amount) + Number(values.tip || 0);

document.getElementById('openDialog').addEventListener('click', () => dialog.showModal());
document.getElementById('closeDialog').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
payment.addEventListener('change', toggleMixedPayment);
document.getElementById('service').addEventListener('change', (event) => { document.getElementById('amount').value = settings.prices[event.target.value] || ''; });
document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => openView(button.dataset.view)));
document.querySelectorAll('[data-report-tab]').forEach((button) => button.addEventListener('click', () => {
  const id = button.dataset.reportTab;
  if (id === 'barberOverview' && !document.getElementById('filterBarber').value) document.getElementById('filterBarber').selectedIndex = 1;
  if (id === 'generalOverview') document.getElementById('filterBarber').selectedIndex = 0;
  document.querySelector('.barber-filter').hidden = id !== 'barberOverview';
  document.querySelectorAll('.report-tab').forEach((tab) => { const active = tab === button; tab.classList.toggle('active', active); tab.setAttribute('aria-selected', active); });
  document.querySelectorAll('.report-pane').forEach((pane) => { const active = pane.id === id; pane.classList.toggle('active', active); pane.hidden = !active; });
  renderGeneral();
}));
document.querySelector('.filters').addEventListener('change', (event) => {
  const details = event.target.closest('details');
  if (event.target.closest('#filterMonth')) {
    document.querySelectorAll('#filterWeek input').forEach((input) => { input.checked = false; });
    renderPeriodOptions();
  }
  details?.removeAttribute('open');
  updatePeriodLabels();
  renderGeneral();
});
document.getElementById('clearFilters').addEventListener('click', () => {
  document.querySelectorAll('.multi-options input').forEach((input) => { input.checked = false; });
  document.querySelectorAll('.filters select').forEach((select) => { select.selectedIndex = 0; });
  renderPeriodOptions();
  updatePeriodLabels();
  renderGeneral();
});
document.getElementById('settingsForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const values = new FormData(event.target);
  services.forEach((service) => { settings.prices[service] = Number(values.get(`price:${service}`)); });
  settings.commission = Number(values.get('commission'));
  delete settings.commissions;
  localStorage.setItem(settingsKey, JSON.stringify(settings));
  document.getElementById('settingsStatus').textContent = '✓ Configuración guardada';
  setTimeout(() => { document.getElementById('settingsStatus').textContent = ''; }, 2500);
  renderGeneral();
});
form.addEventListener('submit', (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(form));
  if (!mixedTotalMatches(values)) {
    document.getElementById('formStatus').textContent = 'Las dos partes deben sumar el precio total.';
    return;
  }
  entries.push({ ...values, date: localDate(), amount: Number(values.amount), tip: Number(values.tip || 0), id: crypto.randomUUID() });
  localStorage.setItem(storageKey, JSON.stringify(entries));
  render();
  form.reset();
  toggleMixedPayment();
  dialog.close();
});

document.getElementById('clearEntries').addEventListener('click', () => {
  const today = localDate();
  if (entries.some((entry) => entry.date === today) && confirm('¿Borrar todos los cortes de hoy?')) {
    entries = entries.filter((entry) => entry.date !== today);
    localStorage.setItem(storageKey, JSON.stringify(entries));
    render();
  }
});

render();
console.assert(mixedTotalMatches({ payment: 'Mixto', cashAmount: 4000, transferAmount: 7000, amount: 10000, tip: 1000 }));
console.assert(monthWeeks('2026-07')[0] === '2026-07-06' && weekEnd('2026-07-27') === '2026-08-02');
