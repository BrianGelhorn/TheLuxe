function renderSales(list) {
  const paymentLabel = (sale) => sale.payment === 'Ambos'
    ? `<span>Ambos</span><small class="sale-payment-breakdown"><span class="cash-price">Efectivo: ${money.format(Number(sale.cashAmount))}</span><span class="mp-price">MP: ${money.format(Number(sale.mpAmount))}</span></small>`
    : escapeHtml(sale.payment === 'Mercado Pago' ? 'MP' : sale.payment);
  document.getElementById('salesRows').innerHTML = list.sort((a, b) => a.time.localeCompare(b.time)).map((sale) => `
    <tr data-sale="${escapeHtml(sale.id)}" tabindex="0">
      <td>${escapeHtml(sale.time)}</td><td>${escapeHtml(sale.product)}</td><td>${sale.quantity}</td>
      <td>${money.format(sale.unitPrice)}</td><td>${money.format(sale.total)}</td>
      <td>${paymentLabel(sale)}</td>
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
  document.getElementById('expenseRows').innerHTML = list.sort((a, b) => a.time.localeCompare(b.time)).map((expense) => `<tr data-expense="${escapeHtml(expense.id)}" tabindex="0"><td>${escapeHtml(expense.time)}</td><td>${escapeHtml(expense.category || '—')}</td><td>${escapeHtml(expense.reason)}</td><td>${money.format(expense.amount)}</td><td>${escapeHtml(expense.payment === 'Mercado Pago' ? 'MP' : expense.payment)}</td></tr>`).join('');
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

function updateStockChartFilterLabel(products) {
  const checked = [...document.querySelectorAll('#stockChartProductOptions input:checked')];
  document.querySelector('#stockChartProductFilter summary').textContent = !products.length ? 'Sin productos' : checked.length === products.length ? 'Todos los productos' : checked.length === 1 ? checked[0].parentElement.textContent.trim() : `${checked.length} productos seleccionados`;
}

function renderStockReport(from, to, period) {
  const products = inventory.products.filter((product) => product.stockEnabled && product.startDate <= to);
  const barberFilter = document.getElementById('summaryBarberFilter');
  const selectedBarber = barberFilter.selectedOptions[0]?.dataset.scope === 'shop' ? '' : barberFilter.selectedOptions[0]?.dataset.stockId || config.barbers.find((barber) => barber.name === barberFilter.value)?.id || '';
  document.getElementById('stockReportBarberNote').hidden = !selectedBarber;
  const movements = inventory.movements.filter((row) => !row.cancelled && row.date >= from && row.date <= to && (row.type !== 'consumo' || !selectedBarber || row.barberId === selectedBarber));
  const valuations = new Map(products.map((product) => [product.id, inventoryValuation(product, inventory.movements, to)]));
  const movementCost = (row, product) => row.cost ?? valuations.get(product.id).costs.get(row.id) ?? row.quantity * inventoryUnitCost(product);
  const averageTo = to < today() ? to : today();
  const averageDays = from > averageTo ? 0 : Math.round((Date.parse(`${averageTo}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1;
  const rows = products.map((product) => {
    const productMovements = movements.filter((row) => row.productId === product.id);
    const incoming = productMovements.filter((row) => row.type === 'entrada').reduce((sum, row) => sum + row.quantity, 0);
    const consumed = productMovements.filter((row) => row.type === 'consumo').reduce((sum, row) => sum + row.quantity, 0);
    const stock = inventorySummary(product, inventory.movements, to).stock;
    const unitCost = inventoryUnitCost(product);
    const valuation = valuations.get(product.id);
    const productAverageFrom = product.startDate > from ? product.startDate : from;
    const usageDays = productAverageFrom > averageTo ? 0 : Math.round((Date.parse(`${averageTo}T00:00:00Z`) - Date.parse(`${productAverageFrom}T00:00:00Z`)) / 86400000) + 1;
    return { product, incoming, consumed, stock, unitCost, usageDays, incomingCost: productMovements.filter((row) => row.type === 'entrada').reduce((sum, row) => sum + movementCost(row, product), 0), consumedCost: productMovements.filter((row) => row.type === 'consumo').reduce((sum, row) => sum + movementCost(row, product), 0), stockCost: valuation.stock };
  });
  const totals = rows.reduce((result, row) => ({
    incoming: result.incoming + row.incomingCost,
    consumed: result.consumed + row.consumedCost,
    stock: result.stock + Math.max(0, row.stockCost),
  }), { incoming: 0, consumed: 0, stock: 0 });
  document.getElementById('stockReportConsumed').textContent = money.format(totals.consumed);
  document.getElementById('stockReportAverage').textContent = money.format(averageDays ? totals.consumed / averageDays : 0);
  document.getElementById('stockReportIncoming').textContent = money.format(totals.incoming);
  document.getElementById('stockReportCurrent').textContent = money.format(totals.stock);
  document.getElementById('stockSupplyCost').textContent = money.format(rows.filter((row) => !row.product.saleEnabled).reduce((sum, row) => sum + row.consumedCost, 0));
  document.getElementById('stockReportProductCount').textContent = `${rows.length} ${rows.length === 1 ? 'producto' : 'productos'}`;
  const missingPrices = rows.filter((row) => !row.unitCost);
  document.getElementById('stockReportPriceWarning').hidden = missingPrices.length === 0;
  document.getElementById('stockReportPriceWarningText').textContent = missingPrices.length ? `${missingPrices.length} ${missingPrices.length === 1 ? 'producto no tiene' : 'productos no tienen'} costo unitario. Los valores monetarios están incompletos.` : '';
  document.getElementById('stockReportRows').innerHTML = rows.map(({ product, incoming, consumed, stock, unitCost, usageDays, incomingCost, consumedCost, stockCost }) => {
    const price = unitCost ? unitMoney.format(unitCost) : '<span class="stock-missing-price">Sin precio</span>';
    return `<tr><td>${escapeHtml(product.name)}<small>${product.saleEnabled ? 'Producto de venta' : 'Insumo de barbería'}${product.active ? '' : ' · Archivado'}</small></td><td>${price}<small>por ${product.unit === 'unidades' ? 'unidad' : escapeHtml(product.unit)}</small></td><td>${integer.format(stock)}<small>${escapeHtml(product.unit)}</small></td><td>${integer.format(incoming)}<small>${escapeHtml(product.unit)} · ${money.format(incomingCost)}</small></td><td>${integer.format(consumed)}<small>${escapeHtml(product.unit)} · ${money.format(consumedCost)}</small></td><td>${integer.format(usageDays ? consumed / usageDays : 0)}<small>${escapeHtml(product.unit)} por día</small></td><td>${money.format(Math.max(0, stockCost))}</td></tr>`;
  }).join('');
  document.getElementById('stockReportEmpty').hidden = rows.length > 0;
  const productOptions = document.getElementById('stockChartProductOptions');
  const previousProducts = new Set([...productOptions.querySelectorAll('input')].map((input) => input.value));
  const previousSelection = new Set([...productOptions.querySelectorAll('input:checked')].map((input) => input.value));
  const initialized = productOptions.dataset.initialized === 'true';
  productOptions.innerHTML = products.map((product) => `<label><input type="checkbox" value="${escapeHtml(product.id)}"${!initialized || !previousProducts.has(product.id) || previousSelection.has(product.id) ? ' checked' : ''}> ${escapeHtml(product.name)}</label>`).join('');
  productOptions.dataset.initialized = 'true';
  updateStockChartFilterLabel(products);
  const selectedIds = new Set([...productOptions.querySelectorAll('input:checked')].map((input) => input.value));
  const selectedProducts = products.filter((product) => selectedIds.has(product.id));
  const mode = document.getElementById('stockChartMode').value;
  const keys = period === 'year'
    ? Array.from({ length: 12 }, (_, index) => `${from.slice(0, 4)}-${String(index + 1).padStart(2, '0')}`)
    : Array.from({ length: Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1 }, (_, index) => new Date(Date.parse(`${from}T00:00:00Z`) + index * 86400000).toISOString().slice(0, 10));
  const monthLabel = new Intl.DateTimeFormat('es-AR', { month: 'short', timeZone: 'UTC' });
  const colors = new Map(products.map((product, index) => [product.id, `hsl(${Math.round(index * 137.5 + 38) % 360} 58% 63%)`]));
  const series = new Map(selectedProducts.map((product) => {
    const chartValues = new Map();
    for (const row of movements.filter((movement) => movement.productId === product.id)) {
      const key = period === 'year' ? row.date.slice(0, 7) : row.date;
      const values = chartValues.get(key) || { incoming: 0, consumed: 0 };
      values[row.type === 'entrada' ? 'incoming' : 'consumed'] += mode === 'money' ? movementCost(row, product) : row.quantity;
      chartValues.set(key, values);
    }
    return [product.id, chartValues];
  }));
  const maximum = Math.max(0, ...selectedProducts.flatMap((product) => keys.flatMap((key) => Object.values(series.get(product.id).get(key) || { incoming: 0, consumed: 0 }))));
  const hasValues = maximum > 0;
  const format = (product, value) => mode === 'money' ? money.format(value) : `${integer.format(value)} ${product.unit}`;
  document.getElementById('stockChartLegend').innerHTML = selectedProducts.map((product) => `<span class="stock-chart-product" style="--series-color:${colors.get(product.id)}"><i></i>${escapeHtml(product.name)}<small>${escapeHtml(product.unit)}</small></span>`).join('');
  const columns = keys.map((key) => {
    const label = period === 'year' ? monthLabel.format(new Date(`${key}-01T00:00:00Z`)).replace('.', '') : key.slice(8, 10);
    const accessibleLabel = period === 'year' ? label : `${key.slice(8, 10)}/${key.slice(5, 7)}`;
    const values = selectedProducts.map((product) => ({ product, ...(series.get(product.id).get(key) || { incoming: 0, consumed: 0 }) }));
    const ariaLabel = `${accessibleLabel}: ${values.map(({ product, incoming, consumed }) => `${product.name}, reposiciones ${format(product, incoming)}, consumos ${format(product, consumed)}`).join('; ')}`;
    const bars = (type) => values.map(({ product, [type]: value }) => `<i data-product="${escapeHtml(product.id)}" class="stock-chart-bar ${type}${value ? ' has-value' : ''}" style="--series-color:${colors.get(product.id)};height:${maximum ? value / maximum * 100 : 0}%" title="${escapeHtml(product.name)}: ${format(product, value)}"></i>`).join('');
    return `<div class="stock-chart-column" role="img" aria-label="${escapeHtml(ariaLabel)}"><div class="stock-chart-bars incoming">${bars('incoming')}</div><small>${label}</small><div class="stock-chart-bars consumed">${bars('consumed')}</div></div>`;
  }).join('');
  const units = new Set(selectedProducts.map((product) => product.unit));
  document.getElementById('stockChartQuantityNote').hidden = mode !== 'quantity' || units.size <= 1;
  const scale = mode === 'money' ? money.format(maximum) : `${integer.format(maximum)}${units.size === 1 ? ` ${[...units][0]}` : ' según unidad'}`;
  document.getElementById('stockReportChart').innerHTML = hasValues ? `<div class="stock-chart-scale" aria-hidden="true"><span>+ ${scale}</span><span>0</span><span>− ${scale}</span></div><div class="stock-chart" style="--stock-chart-columns:${keys.length};--stock-series:${selectedProducts.length}">${columns}</div>` : '';
  document.getElementById('stockReportChart').hidden = !hasValues;
  document.getElementById('stockReportChartEmpty').textContent = selectedProducts.length ? 'Sin movimientos para los productos seleccionados' : 'Seleccioná al menos un producto para graficar';
  document.getElementById('stockReportChartEmpty').hidden = hasValues;
}

function registerWithdrawals(from, to, payment = 'Ambas') {
  const field = payment === 'Mercado Pago' ? 'withdrawalMp' : 'withdrawal';
  if (payment === 'Ambas') return Object.entries(cashRegisters).filter(([date]) => date >= from && date <= to)
    .reduce((sum, [, register]) => sum + Number(register.withdrawal || 0) + Number(register.withdrawalMp || 0), 0);
  return Object.entries(cashRegisters).filter(([date]) => date >= from && date <= to)
    .reduce((sum, [, register]) => sum + Number(register[field] || 0), 0);
}

function paidCommissions(from, to, payment = 'Ambas') {
  const dates = new Set([...entries, ...advances].filter((item) => item.date >= from && item.date <= to).map((item) => item.date));
  Object.keys(barberPayments).filter((date) => date >= from && date <= to).forEach((date) => dates.add(date));
  return [...dates].reduce((total, date) => {
    const cuts = entries.filter((cut) => cut.date === date);
    const dayAdvances = advances.filter((advance) => advance.date === date);
    const names = new Set([...cuts, ...dayAdvances].map((item) => item.barber).filter(Boolean));
    Object.keys(barberPayments[date] || {}).forEach((name) => names.add(name));
    return total + [...names].reduce((sum, barber) => {
      const settlement = barberSettlement(cuts.filter((cut) => cut.barber === barber), dayAdvances.filter((advance) => advance.barber === barber), barberPaymentRecord(barber, date), effectiveCommission);
      return sum + Number(payment === 'Efectivo' ? settlement.commissionPaidCash : payment === 'Mercado Pago' ? settlement.commissionPaidMp : settlement.commissionPaid);
    }, 0);
  }, 0);
}

function renderExpenseCategories(list, shopMode) {
  document.getElementById('shopExpenseCategories').hidden = !shopMode;
  const totals = new Map();
  list.forEach((expense) => totals.set(expense.category || 'Sin categoría', (totals.get(expense.category || 'Sin categoría') || 0) + Number(expense.amount)));
  const rows = [...totals].sort(([a], [b]) => a.localeCompare(b, 'es')).map(([category, amount]) => `<tr><td>${escapeHtml(category)}</td><td>${money.format(amount)}</td></tr>`).join('');
  document.getElementById('shopExpenseCategoryRows').innerHTML = rows;
  document.getElementById('shopExpenseCategoriesEmpty').hidden = totals.size > 0;
}

function renderProductMargin(from, to, payment, shopMode) {
  const report = document.getElementById('productMarginReport');
  const movements = new Map(inventory.movements.filter((row) => !row.cancelled && row.source === 'sale' && row.sourceId && Number.isFinite(Number(row.cost))).map((row) => [row.sourceId, row]));
  const periodSales = shopMode ? sales.filter((sale) => sale.date >= from && sale.date <= to && (payment === 'Ambas' || sale.payment === payment || sale.payment === 'Ambos')) : [];
  const linkedSales = periodSales.filter((sale) => movements.has(sale.id));
  const values = linkedSales.reduce((sum, sale) => {
    const revenue = payment === 'Ambas' ? Number(sale.total) : salePaymentTotal([sale], payment);
    const cost = Number(movements.get(sale.id).cost) * (payment === 'Ambas' ? 1 : Number(sale.total) ? revenue / Number(sale.total) : 0);
    return { sales: sum.sales + revenue, cost: sum.cost + cost };
  }, { sales: 0, cost: 0 });
  report.hidden = periodSales.length === 0;
  document.getElementById('productMarginMetrics').hidden = linkedSales.length === 0;
  document.getElementById('productMarginCoverage').textContent = `${linkedSales.length} de ${periodSales.length} ventas tienen costo de stock registrado. Las demás no integran este margen. No es ganancia neta ni se resta otra vez del balance.`;
  document.getElementById('productMarginSales').textContent = money.format(values.sales);
  document.getElementById('productMarginCost').textContent = money.format(values.cost);
  document.getElementById('productMarginValue').textContent = money.format(values.sales - values.cost);
}

function renderSummary() {
  const reference = document.getElementById('summaryDate');
  if (!reference.value || !reference.checkValidity()) updateSummaryReference();
  const period = document.getElementById('summaryPeriod').value;
  const [from, to] = periodBounds(period, document.getElementById('summaryDate').value, document.getElementById('summaryWeek').value);
  renderStockReport(from, to, period);
  const inRange = (item) => item.date >= from && item.date <= to;
  const selectedServices = [...document.querySelectorAll('#summaryServiceOptions input:checked')].map(({ value }) => value);
  const barberFilter = document.getElementById('summaryBarberFilter');
  const shopMode = barberFilter.selectedOptions[0]?.dataset.scope === 'shop';
  const selectedBarber = shopMode ? '' : barberFilter.value;
  document.getElementById('barbersSummary').hidden = shopMode;
  document.getElementById('shopSummary').hidden = !shopMode;
  document.getElementById('summaryServiceField').hidden = shopMode;
  document.getElementById('summaryHistory').classList.toggle('barber-mode', !shopMode);
  document.getElementById('summaryHistory').classList.toggle('shop-mode', shopMode);
  document.getElementById('summaryHistoryScope').dataset.tip = shopMode ? 'Balance = facturado - comisiones pagadas - gastos.' : 'Balance = servicios + ventas - comisiones.';
  const payment = document.getElementById('summaryPaymentFilter').value;
  const matchesPayment = (item) => payment === 'Ambas' || item.payment === payment;
  const matchesSalePayment = (sale) => matchesPayment(sale) || sale.payment === 'Ambos';
  // Local-wide result always ignores service and barber filters.
  const shopCuts = entries.filter(inRange);
  const shopSales = sales.filter(inRange);
  const shopAdvances = advances.filter(inRange);
  const shopExpenses = expenses.filter(inRange);
  const shopWithdrawals = registerWithdrawals(from, to);
  const shopTotals = ['Ambas', 'Efectivo', 'Mercado Pago'].map((medium) => {
    const result = summarize(shopCuts, shopSales, shopAdvances, shopExpenses, medium, defaultCommission);
    return { ...result, commission: paidCommissions(from, to, medium), collected: result.invoiced + result.tips, withdrawals: registerWithdrawals(from, to, medium) };
  });
  const shop = shopTotals[['Ambas', 'Efectivo', 'Mercado Pago'].indexOf(payment)];
  document.getElementById('shopInvoiced').textContent = money.format(shop.invoiced);
  document.getElementById('shopCommission').textContent = money.format(shop.commission);
  document.getElementById('shopExpenses').textContent = money.format(shop.expenses);
  document.getElementById('shopBalance').textContent = money.format(shop.invoiced - shop.commission - shop.expenses);
  document.getElementById('shopSaleCount').textContent = String(shop.saleCount);
  document.getElementById('shopSaleQuantity').textContent = String(shopSales.filter(matchesSalePayment).reduce((sum, sale) => sum + Number(sale.quantity || 0), 0));
  for (const [id, concepts] of [
    ['shopRevenueRows', [['Servicios sin propinas', 'services'], ['Ventas de productos', 'sales'], ['Facturado sin propinas', 'invoiced'], ['Propinas', 'tips'], ['Total facturado con propinas', 'collected']]],
    ['shopMovementRows', [['Gastos', 'expenses'], ['Retiros', 'withdrawals']]],
  ]) {
    document.getElementById(id).innerHTML = concepts.map(([label, field]) => {
      const cash = payment === 'Mercado Pago' ? 0 : shopTotals[1][field];
      const mp = payment === 'Efectivo' ? 0 : shopTotals[2][field];
      return `<tr><th scope="row">${label}</th><td>${money.format(shop[field])}</td><td>${money.format(cash)}</td><td>${money.format(mp)}</td></tr>`;
    }).join('');
  }
  const periodCuts = entries.filter((cut) => inRange(cut) && (shopMode || selectedServices.includes(cut.service)) && (!selectedBarber || cut.barber === selectedBarber) && (payment === 'Ambas' || cut.payment === payment || cut.payment === 'Ambos'));
  const periodSales = selectedBarber ? [] : sales.filter((sale) => inRange(sale) && matchesSalePayment(sale));
  const periodAdvances = shopMode ? [] : advances.filter((advance) => inRange(advance) && (!selectedBarber || advance.barber === selectedBarber) && matchesPayment(advance));
  const periodExpenses = shopMode ? expenses.filter((expense) => inRange(expense) && matchesPayment(expense)) : [];
  const total = summarize(periodCuts, periodSales, periodAdvances, periodExpenses, payment, defaultCommission);
  renderExpenseCategories(periodExpenses, shopMode);
  renderProductMargin(from, to, payment, shopMode);
  const dateLabel = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  document.getElementById('summaryRange').textContent = `${dateLabel.format(new Date(`${from}T00:00:00`))} — ${dateLabel.format(new Date(`${to}T00:00:00`))}`;
  const operationCount = total.cuts;
  document.getElementById('summaryOperationCount').textContent = `${operationCount} ${operationCount === 1 ? 'servicio' : 'servicios'}`;
  const gross = total.services + total.tips;
  const netIncome = total.commission + total.tips;
  const ticketCount = operationCount + total.saleCount;
  const grossTicket = ticketCount ? (gross + total.sales) / ticketCount : 0;
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
  const withdrawals = selectedBarber ? 0 : registerWithdrawals(from, to, payment);
  document.getElementById('summaryWithdrawals').textContent = money.format(withdrawals);
  document.getElementById('summaryInvoiced').textContent = money.format(gross);
  document.getElementById('summaryCommission').textContent = money.format(netIncome);
  document.getElementById('summaryCommissionTips').textContent = money.format(total.tips);
  document.getElementById('summaryCommissionAmount').textContent = money.format(total.commission);
  document.getElementById('summaryAdvances').textContent = money.format(total.advances);
  document.getElementById('summaryExpenses').textContent = money.format(total.expenses);

  const groupKey = (item) => period === 'year' ? item.date.slice(0, 7) : item.date;
  const withdrawalDays = !shopMode ? [] : Object.entries(cashRegisters)
    .filter(([date, register]) => date >= from && date <= to && Number(payment === 'Mercado Pago' ? register.withdrawalMp || 0 : payment === 'Efectivo' ? register.withdrawal || 0 : Number(register.withdrawal || 0) + Number(register.withdrawalMp || 0)))
    .map(([date]) => ({ date }));
  const keys = [...new Set([...periodCuts, ...periodSales, ...periodAdvances, ...periodExpenses, ...withdrawalDays].map(groupKey))].sort();
  const monthLabel = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' });
  document.getElementById('summaryBreakdownTitle').textContent = period === 'year' ? 'Resumen por mes' : 'Resumen por día';
  document.getElementById('summaryRows').innerHTML = keys.map((key) => {
    const matches = (item) => groupKey(item) === key;
    const row = summarize(periodCuts.filter(matches), periodSales.filter(matches), periodAdvances.filter(matches), periodExpenses.filter(matches), payment, defaultCommission);
    const [rowFrom, rowTo] = period === 'year' ? periodBounds('month', key) : [key, key];
    const rowWithdrawal = shopMode ? registerWithdrawals(rowFrom, rowTo, payment) : 0;
    const rowCommission = shopMode ? paidCommissions(rowFrom, rowTo, payment) : row.commission;
    const rowBalance = shopMode ? row.invoiced - rowCommission - row.expenses : row.balance;
    const label = period === 'year' ? monthLabel.format(new Date(`${key}-01T00:00:00`)) : dateLabel.format(new Date(`${key}T00:00:00`));
    return `<tr><td>${escapeHtml(label)}</td><td>${row.cuts}</td><td>${money.format(row.services)}</td><td>${money.format(row.sales)}</td><td>${money.format(row.tips)}</td><td>${money.format(rowCommission)}</td><td class="history-advance">${money.format(row.advances)}</td><td class="history-expense">${money.format(row.expenses)}</td><td class="history-withdrawal">${money.format(rowWithdrawal)}</td><td>${money.format(rowBalance)}</td></tr>`;
  }).join('');
  document.getElementById('summaryEmpty').hidden = keys.length > 0;

}
