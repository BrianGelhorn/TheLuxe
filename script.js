const storageKey = 'theluxe-rf001-003-cuts';
const barbers = ['Mateo', 'Julián', 'Nicolás', 'Tomás', 'Franco', 'Agustín', 'Lucas', 'Bruno', 'Santino'];
const prices = { 'Corte clásico': 15000, 'Corte + barba': 22000, Barba: 10000, Diseño: 18000 };
const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const nowTime = () => new Date().toTimeString().slice(0, 5);
const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);

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
const notesInput = form.elements.notes;
let entries = JSON.parse(localStorage.getItem(storageKey) || '[]');
let editingId = null;
let selectedId = null;

workday.value = today();

function save() {
  localStorage.setItem(storageKey, JSON.stringify(entries));
}

function selectedEntries() {
  return entries.filter((entry) => entry.date === workday.value);
}

function paymentTotal(list, type) {
  return list.reduce((sum, entry) => sum + (entry.payment === type ? Number(entry.amount) + Number(entry.tip || 0) : 0), 0);
}

function render() {
  const list = selectedEntries();
  const total = list.reduce((sum, entry) => sum + Number(entry.amount) + Number(entry.tip || 0), 0);
  document.getElementById('dailyTotal').textContent = money.format(total);
  document.getElementById('dailyCount').textContent = `${list.length} ${list.length === 1 ? 'corte' : 'cortes'}`;
  document.getElementById('tipsTotal').textContent = money.format(list.reduce((sum, entry) => sum + Number(entry.tip || 0), 0));
  document.getElementById('cashTotal').textContent = money.format(paymentTotal(list, 'Efectivo'));
  document.getElementById('mpTotal').textContent = money.format(paymentTotal(list, 'Mercado Pago'));
  document.getElementById('barberColumns').innerHTML = barbers.map((barber) => barberColumn(barber, list)).join('');
}

function barberColumn(barber, list) {
  const cuts = list.filter((entry) => entry.barber === barber).sort((a, b) => a.time.localeCompare(b.time));
  const total = cuts.reduce((sum, entry) => sum + Number(entry.amount) + Number(entry.tip || 0), 0);
  const rows = cuts.length ? cuts.map((entry) => `
    <button class="barber-service" type="button" data-cut="${escapeHtml(entry.id)}">
      <small class="cut-time">${escapeHtml(entry.time)}</small>
      <span>${money.format(Number(entry.amount))}</span>
      <strong class="service-name">${escapeHtml(entry.service)}</strong>
      <small class="payment-detail">${escapeHtml(entry.payment)}${Number(entry.tip) ? ` · Propina ${money.format(entry.tip)}` : ''}</small>
      ${entry.notes ? `<small class="service-note">Nota: ${escapeHtml(entry.notes)}</small>` : ''}
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
  amountInput.value = entry.amount;
  tipInput.value = entry.tip || '';
  paymentInput.value = entry.payment;
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

serviceInput.addEventListener('change', (event) => {
  amountInput.value = prices[event.target.value] || '';
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(form));
  const entry = { ...values, date: workday.value, amount: Number(values.amount), tip: Number(values.tip || 0), id: editingId || crypto.randomUUID() };
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

render();
console.assert(paymentTotal([{ payment: 'Efectivo', amount: 1000, tip: 200 }], 'Efectivo') === 1200);
