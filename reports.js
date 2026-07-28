function salePaymentTotal(list, type) {
  return list.reduce((sum, sale) => sum + (sale.payment === type ? sale.total : 0), 0);
}

function advancePaymentTotal(list, type) {
  return list.reduce((sum, advance) => sum + (advance.payment === type ? advance.amount : 0), 0);
}

function expensePaymentTotal(list, type) {
  return list.reduce((sum, expense) => sum + (expense.payment === type ? expense.amount : 0), 0);
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
  document.getElementById('salesCashTotal').textContent = money.format(salePaymentTotal(list, 'Efectivo'));
  document.getElementById('salesMpTotal').textContent = money.format(salePaymentTotal(list, 'Mercado Pago'));
  document.getElementById('salesGrandTotal').textContent = money.format(list.reduce((sum, sale) => sum + sale.total, 0));
}

function renderAdvances(list) {
  document.getElementById('advanceRows').innerHTML = list.sort((a, b) => a.time.localeCompare(b.time)).map((advance) => `
    <tr data-advance="${escapeHtml(advance.id)}" tabindex="0">
      <td>${escapeHtml(advance.time)}</td><td>${escapeHtml(advance.barber)}</td>
      <td>${money.format(advance.amount)}</td><td>${escapeHtml(advance.payment === 'Mercado Pago' ? 'MP' : advance.payment)}</td>
      <td>${escapeHtml(advance.reason || '—')}</td>
    </tr>`).join('');
  document.getElementById('advancesEmpty').hidden = list.length > 0;
  document.getElementById('advancesCashTotal').textContent = money.format(advancePaymentTotal(list, 'Efectivo'));
  document.getElementById('advancesMpTotal').textContent = money.format(advancePaymentTotal(list, 'Mercado Pago'));
  document.getElementById('advancesGrandTotal').textContent = money.format(list.reduce((sum, advance) => sum + advance.amount, 0));
}

function renderExpenses(list) {
  document.getElementById('expenseRows').innerHTML = list.sort((a, b) => a.time.localeCompare(b.time)).map((expense) => `<tr data-expense="${escapeHtml(expense.id)}" tabindex="0"><td>${escapeHtml(expense.time)}</td><td>${escapeHtml(expense.reason)}</td><td>${money.format(expense.amount)}</td><td>${escapeHtml(expense.payment === 'Mercado Pago' ? 'MP' : expense.payment)}</td></tr>`).join('');
  document.getElementById('expensesEmpty').hidden = list.length > 0;
  document.getElementById('expensesCashTotal').textContent = money.format(expensePaymentTotal(list, 'Efectivo'));
  document.getElementById('expensesMpTotal').textContent = money.format(expensePaymentTotal(list, 'Mercado Pago'));
  document.getElementById('expensesGrandTotal').textContent = money.format(list.reduce((sum, expense) => sum + expense.amount, 0));
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

function currentMonthWeek(value) {
  const date = new Date(`${value}T00:00:00`);
  const firstMonday = new Date(date.getFullYear(), date.getMonth(), 1);
  firstMonday.setDate(firstMonday.getDate() + ((8 - firstMonday.getDay()) % 7));
  return Math.max(1, Math.min(monthWeeks(value.slice(0, 7)), Math.floor((date - firstMonday) / 604800000) + 1));
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
  if (period === 'week') document.getElementById('summaryWeek').value = currentMonthWeek(today());
}

function updateWeekOptions() {
  const select = document.getElementById('summaryWeek');
  const count = monthWeeks(document.getElementById('summaryDate').value);
  select.innerHTML = Array.from({ length: count }, (_, index) => `<option value="${index + 1}">Semana ${index + 1}</option>`).join('');
}

function cutValueByPayment(cuts, type, field) {
  return cuts.reduce((sum, cut) => {
    if (cut.payment !== 'Ambos') return sum + (cut.payment === type ? Number(cut[field] || 0) : 0);
    const total = Number(cut.amount) + Number(cut.tip || 0);
    const paid = Number(type === 'Efectivo' ? cut.cashAmount : cut.mpAmount);
    return sum + (total ? paid * Number(cut[field] || 0) / total : 0);
  }, 0);
}

function summarize(cuts, periodSales, periodAdvances, periodExpenses = []) {
  const services = cuts.reduce((sum, cut) => sum + Number(cut.amount), 0);
  const tips = cuts.reduce((sum, cut) => sum + Number(cut.tip || 0), 0);
  const salesTotal = periodSales.reduce((sum, sale) => sum + sale.total, 0);
  const advancesTotal = periodAdvances.reduce((sum, advance) => sum + advance.amount, 0);
  const expensesTotal = periodExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const commission = cuts.reduce((sum, cut) => sum + Number(cut.commissionAmount ?? Number(cut.amount) * config.commission / 100), 0);
  return {
    cuts: cuts.length, saleCount: periodSales.length, services, sales: salesTotal, tips, commission, advances: advancesTotal, expenses: expensesTotal,
    invoiced: services + salesTotal, balance: services + tips + salesTotal - advancesTotal - expensesTotal,
    cash: paymentTotal(cuts, 'Efectivo') + salePaymentTotal(periodSales, 'Efectivo') - advancePaymentTotal(periodAdvances, 'Efectivo') - expensePaymentTotal(periodExpenses, 'Efectivo'),
    mp: paymentTotal(cuts, 'Mercado Pago') + salePaymentTotal(periodSales, 'Mercado Pago') - advancePaymentTotal(periodAdvances, 'Mercado Pago') - expensePaymentTotal(periodExpenses, 'Mercado Pago'),
  };
}

function barberBalance(cuts, tips, advancesTotal) {
  return cuts.reduce((sum, cut) => sum + Number(cut.commissionAmount ?? Number(cut.amount) * config.commission / 100), 0) + tips - advancesTotal;
}

function renderSummary() {
  const period = document.getElementById('summaryPeriod').value;
  const [from, to] = periodBounds(period, document.getElementById('summaryDate').value, document.getElementById('summaryWeek').value);
  const inRange = (item) => item.date >= from && item.date <= to;
  const periodCuts = entries.filter(inRange);
  const periodSales = sales.filter(inRange);
  const periodAdvances = advances.filter(inRange);
  const periodExpenses = expenses.filter(inRange);
  const total = summarize(periodCuts, periodSales, periodAdvances, periodExpenses);
  const dateLabel = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  document.getElementById('summaryRange').textContent = `${dateLabel.format(new Date(`${from}T00:00:00`))} — ${dateLabel.format(new Date(`${to}T00:00:00`))}`;
  document.getElementById('summaryCuts').textContent = total.cuts;
  document.getElementById('summarySaleCount').textContent = total.saleCount;
  ['Services', 'Sales', 'Invoiced', 'Tips', 'Commission', 'Advances', 'Expenses', 'Balance'].forEach((name) => { document.getElementById(`summary${name}`).textContent = money.format(total[name.toLowerCase()]); });

  document.getElementById('cashSummaryRows').innerHTML = ['Efectivo', 'Mercado Pago'].map((type) => {
    const suffix = type === 'Efectivo' ? 'Cash' : 'Mp';
    const initial = Number(cashRegisters[from]?.[`initial${suffix}`] || 0);
    const real = Number(cashRegisters[to]?.[`real${suffix}`] || 0);
    const serviceEntries = cutValueByPayment(periodCuts, type, 'amount');
    const tipsByType = cutValueByPayment(periodCuts, type, 'tip');
    const entriesTotal = serviceEntries + salePaymentTotal(periodSales, type);
    const advanceTotal = advancePaymentTotal(periodAdvances, type);
    const expenseTotal = expensePaymentTotal(periodExpenses, type);
    const theoretical = initial + entriesTotal + tipsByType - advanceTotal - expenseTotal;
    return `<tr><td>${type}</td><td>${money.format(initial)}</td><td>${money.format(entriesTotal)}</td><td>${money.format(tipsByType)}</td><td>${money.format(advanceTotal)}</td><td>${money.format(expenseTotal)}</td><td>${money.format(theoretical)}</td><td>${money.format(real)}</td><td>${money.format(real - theoretical)}</td></tr>`;
  }).join('');

  const groupKey = (item) => period === 'year' ? item.date.slice(0, 7) : item.date;
  const keys = [...new Set([...periodCuts, ...periodSales, ...periodAdvances, ...periodExpenses].map(groupKey))].sort();
  const monthLabel = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' });
  document.getElementById('summaryBreakdownTitle').textContent = period === 'year' ? 'Resumen por mes' : 'Resumen por día';
  document.getElementById('summaryRows').innerHTML = keys.map((key) => {
    const matches = (item) => groupKey(item) === key;
    const row = summarize(periodCuts.filter(matches), periodSales.filter(matches), periodAdvances.filter(matches), periodExpenses.filter(matches));
    const label = period === 'year' ? monthLabel.format(new Date(`${key}-01T00:00:00`)) : dateLabel.format(new Date(`${key}T00:00:00`));
    return `<tr><td>${escapeHtml(label)}</td><td>${row.cuts}</td><td>${money.format(row.services)}</td><td>${money.format(row.sales)}</td><td>${money.format(row.tips)}</td><td>${money.format(row.commission)}</td><td>${money.format(row.advances)}</td><td>${money.format(row.expenses)}</td><td>${money.format(row.balance)}</td></tr>`;
  }).join('');
  document.getElementById('summaryEmpty').hidden = keys.length > 0;

  const activeBarbers = barbers.filter((barber) => periodCuts.some((cut) => cut.barber === barber) || periodAdvances.some((advance) => advance.barber === barber));
  document.getElementById('barberSummaryRows').innerHTML = activeBarbers.map((barber) => {
    const barberCuts = periodCuts.filter((cut) => cut.barber === barber);
    const row = summarize(barberCuts, [], periodAdvances.filter((advance) => advance.barber === barber));
    const balance = barberBalance(barberCuts, row.tips, row.advances);
    return `<tr><td>${escapeHtml(barber)}</td><td>${row.cuts}</td><td>${money.format(row.services)}</td><td>${money.format(row.tips)}</td><td>${money.format(row.advances)}</td><td>${money.format(balance)}</td></tr>`;
  }).join('');
  document.getElementById('barberSummaryEmpty').hidden = activeBarbers.length > 0;
}
