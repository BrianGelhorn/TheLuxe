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
  document.getElementById('salesGrandTotal').textContent = money.format(list.reduce((sum, sale) => sum + Number(sale.total), 0));
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
  document.getElementById('advancesGrandTotal').textContent = money.format(list.reduce((sum, advance) => sum + Number(advance.amount), 0));
}

function renderExpenses(list) {
  document.getElementById('expenseRows').innerHTML = list.sort((a, b) => a.time.localeCompare(b.time)).map((expense) => `<tr data-expense="${escapeHtml(expense.id)}" tabindex="0"><td>${escapeHtml(expense.time)}</td><td>${escapeHtml(expense.reason)}</td><td>${money.format(expense.amount)}</td><td>${escapeHtml(expense.payment === 'Mercado Pago' ? 'MP' : expense.payment)}</td></tr>`).join('');
  document.getElementById('expensesEmpty').hidden = list.length > 0;
  document.getElementById('expensesCashTotal').textContent = money.format(expensePaymentTotal(list, 'Efectivo'));
  document.getElementById('expensesMpTotal').textContent = money.format(expensePaymentTotal(list, 'Mercado Pago'));
  document.getElementById('expensesGrandTotal').textContent = money.format(list.reduce((sum, expense) => sum + Number(expense.amount), 0));
}

function cashMovements(list, adjustments = []) {
  return [
    ...list.map((item) => ({ ...item, type: 'Transferencia', removable: true })),
    ...adjustments.map((item) => ({ ...item, type: 'Ajuste inicial', from: `${item.medium}: ${money.format(item.previous)}`, to: `${item.medium}: ${money.format(item.current)}`, amount: item.current - item.previous })),
  ].sort((a, b) => a.time.localeCompare(b.time));
}

function renderTransfers(list, adjustments = []) {
  const movements = cashMovements(list, adjustments);
  document.getElementById('transferRows').innerHTML = movements.map((item) => `<tr><td>${escapeHtml(item.time)}</td><td>${escapeHtml(item.from)} → ${escapeHtml(item.to)}${item.removable ? '' : `<small>${escapeHtml(item.type)}</small>`}</td><td>${money.format(item.amount)}</td><td>${escapeHtml(item.description)}</td><td>${item.removable ? `<button class="delete-transfer" type="button" data-delete-transfer="${escapeHtml(item.id)}">Eliminar</button>` : '—'}</td></tr>`).join('');
  document.getElementById('transferCount').textContent = String(movements.length);
  document.getElementById('transfersEmpty').hidden = movements.length > 0;
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

function renderSummary() {
  const reference = document.getElementById('summaryDate');
  if (!reference.value || !reference.checkValidity()) updateSummaryReference();
  const period = document.getElementById('summaryPeriod').value;
  const [from, to] = periodBounds(period, document.getElementById('summaryDate').value, document.getElementById('summaryWeek').value);
  const inRange = (item) => item.date >= from && item.date <= to;
  const selectedServices = [...document.querySelectorAll('#summaryServiceOptions input:checked')].map(({ value }) => value);
  const barberFilter = document.getElementById('summaryBarberFilter');
  const shopMode = barberFilter.selectedOptions[0]?.dataset.scope === 'shop';
  const selectedBarber = shopMode ? '' : barberFilter.value;
  document.getElementById('barbersSummary').hidden = shopMode;
  document.getElementById('shopSummary').hidden = !shopMode;
  document.getElementById('summaryServiceField').hidden = shopMode;
  const payment = document.getElementById('summaryPaymentFilter').value;
  const matchesPayment = (item) => payment === 'Ambas' || item.payment === payment;
  // Local-wide result always ignores service and barber filters.
  const shopCuts = entries.filter(inRange);
  const shopSales = sales.filter(inRange);
  const shopAdvances = advances.filter(inRange);
  const shopExpenses = expenses.filter(inRange);
  const shopWithdrawals = Object.entries(cashRegisters).filter(([date]) => date >= from && date <= to)
    .reduce((sum, [, register]) => sum + Number(register.withdrawal || 0), 0);
  const shopTotals = ['Ambas', 'Efectivo', 'Mercado Pago'].map((medium) => {
    const result = summarize(shopCuts, shopSales, shopAdvances, shopExpenses, medium, defaultCommission);
    return { ...result, collected: result.invoiced + result.tips, withdrawals: medium === 'Mercado Pago' ? 0 : shopWithdrawals };
  });
  const shop = shopTotals[['Ambas', 'Efectivo', 'Mercado Pago'].indexOf(payment)];
  document.getElementById('shopInvoiced').textContent = money.format(shop.invoiced);
  document.getElementById('shopCommission').textContent = money.format(shop.commission);
  document.getElementById('shopExpenses').textContent = money.format(shop.expenses);
  document.getElementById('shopBalance').textContent = money.format(shop.invoiced - shop.commission - shop.expenses);
  document.getElementById('shopSaleCount').textContent = String(shop.saleCount);
  document.getElementById('shopSaleQuantity').textContent = String(shopSales.filter(matchesPayment).reduce((sum, sale) => sum + Number(sale.quantity || 0), 0));
  for (const [id, concepts] of [
    ['shopRevenueRows', [['Servicios sin propinas', 'services'], ['Ventas de productos', 'sales'], ['Facturado sin propinas', 'invoiced'], ['Propinas', 'tips'], ['Total facturado con propinas', 'collected']]],
    ['shopMovementRows', [['Gastos', 'expenses'], ['Adelantos', 'advances'], ['Retiros', 'withdrawals']]],
  ]) {
    document.getElementById(id).innerHTML = concepts.map(([label, field]) => {
      const cash = payment === 'Mercado Pago' ? 0 : shopTotals[1][field];
      const mp = payment === 'Efectivo' ? 0 : shopTotals[2][field];
      return `<tr><th scope="row">${label}</th><td>${money.format(shop[field])}</td><td>${money.format(cash)}</td><td>${money.format(mp)}</td></tr>`;
    }).join('');
  }
  const periodCuts = entries.filter((cut) => inRange(cut) && (shopMode || selectedServices.includes(cut.service)) && (!selectedBarber || cut.barber === selectedBarber) && (payment === 'Ambas' || cut.payment === payment || cut.payment === 'Ambos'));
  const periodSales = selectedBarber ? [] : sales.filter((sale) => inRange(sale) && matchesPayment(sale));
  const periodAdvances = advances.filter((advance) => inRange(advance) && (!selectedBarber || advance.barber === selectedBarber) && matchesPayment(advance));
  const periodExpenses = selectedBarber ? [] : expenses.filter((expense) => inRange(expense) && matchesPayment(expense));
  const total = summarize(periodCuts, periodSales, periodAdvances, periodExpenses, payment, defaultCommission);
  const dateLabel = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  document.getElementById('summaryRange').textContent = `${dateLabel.format(new Date(`${from}T00:00:00`))} — ${dateLabel.format(new Date(`${to}T00:00:00`))}`;
  const operationCount = total.cuts;
  document.getElementById('summaryOperationCount').textContent = `${operationCount} ${operationCount === 1 ? 'servicio' : 'servicios'}`;
  const gross = total.services + total.tips;
  const netIncome = total.commission + total.tips;
  const grossTicket = operationCount ? gross / operationCount : 0;
  const netTicket = operationCount ? netIncome / operationCount : 0;
  document.getElementById('summaryAverageTicket').textContent = money.format(grossTicket);
  document.getElementById('summaryAverageTicketNeto').textContent = money.format(netTicket);
  const servicesCash = payment === 'Mercado Pago' ? 0 : cutValueByPayment(periodCuts, 'Efectivo', 'amount');
  const servicesMp = payment === 'Efectivo' ? 0 : cutValueByPayment(periodCuts, 'Mercado Pago', 'amount');
  const tipsCash = payment === 'Mercado Pago' ? 0 : cutValueByPayment(periodCuts, 'Efectivo', 'tip');
  const tipsMp = payment === 'Efectivo' ? 0 : cutValueByPayment(periodCuts, 'Mercado Pago', 'tip');
  document.getElementById('summaryInvoicedCuts').textContent = money.format(total.services);
  document.getElementById('summaryInvoicedTips').textContent = money.format(total.tips);
  document.getElementById('summaryInvoicedCutsCash').textContent = money.format(servicesCash);
  document.getElementById('summaryInvoicedCutsMp').textContent = money.format(servicesMp);
  document.getElementById('summaryInvoicedTipsCash').textContent = money.format(tipsCash);
  document.getElementById('summaryInvoicedTipsMp').textContent = money.format(tipsMp);
  const withdrawals = selectedBarber || payment === 'Mercado Pago' ? 0 : Object.entries(cashRegisters).filter(([date]) => date >= from && date <= to).reduce((sum, [, register]) => sum + Number(register.withdrawal || 0), 0);
  document.getElementById('summaryWithdrawals').textContent = money.format(withdrawals);
  document.getElementById('summaryInvoiced').textContent = money.format(gross);
  document.getElementById('summaryCommission').textContent = money.format(netIncome);
  document.getElementById('summaryCommissionTips').textContent = money.format(total.tips);
  document.getElementById('summaryCommissionAmount').textContent = money.format(total.commission);
  ['Advances', 'Expenses'].forEach((name) => { document.getElementById(`summary${name}`).textContent = money.format(total[name.toLowerCase()]); });

  const groupKey = (item) => period === 'year' ? item.date.slice(0, 7) : item.date;
  const withdrawalDays = selectedBarber || payment === 'Mercado Pago' ? [] : Object.entries(cashRegisters)
    .filter(([date, register]) => date >= from && date <= to && Number(register.withdrawal || 0))
    .map(([date]) => ({ date }));
  const keys = [...new Set([...periodCuts, ...periodSales, ...periodAdvances, ...periodExpenses, ...withdrawalDays].map(groupKey))].sort();
  const monthLabel = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' });
  document.getElementById('summaryBreakdownTitle').textContent = period === 'year' ? 'Resumen por mes' : 'Resumen por día';
  document.getElementById('summaryRows').innerHTML = keys.map((key) => {
    const matches = (item) => groupKey(item) === key;
    const row = summarize(periodCuts.filter(matches), periodSales.filter(matches), periodAdvances.filter(matches), periodExpenses.filter(matches), payment, defaultCommission);
    const rowWithdrawal = selectedBarber || payment === 'Mercado Pago' ? 0 : Object.entries(cashRegisters)
      .filter(([date]) => date >= from && date <= to && groupKey({ date }) === key)
      .reduce((sum, [, register]) => sum + Number(register.withdrawal || 0), 0);
    const label = period === 'year' ? monthLabel.format(new Date(`${key}-01T00:00:00`)) : dateLabel.format(new Date(`${key}T00:00:00`));
    return `<tr><td>${escapeHtml(label)}</td><td>${row.cuts}</td><td>${money.format(row.services)}</td><td>${money.format(row.sales)}</td><td>${money.format(row.tips)}</td><td>${money.format(row.commission)}</td><td>${money.format(row.advances)}</td><td>${money.format(row.expenses)}</td><td>${money.format(rowWithdrawal)}</td><td>${money.format(row.balance)}</td></tr>`;
  }).join('');
  document.getElementById('summaryEmpty').hidden = keys.length > 0;

}
