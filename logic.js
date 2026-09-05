(function (root) {
  const parseAmount = (value) => Number(String(value || '').replace(/\D/g, ''));

  function salePaymentTotal(list, type) {
    return list.reduce((sum, sale) => sum + (sale.payment === type ? Number(sale.total) : 0), 0);
  }

  function advancePaymentTotal(list, type) {
    return list.reduce((sum, advance) => sum + (advance.payment === type ? Number(advance.amount) : 0), 0);
  }

  function expensePaymentTotal(list, type) {
    return list.reduce((sum, expense) => sum + (expense.payment === type ? Number(expense.amount) : 0), 0);
  }

  function paymentTotal(list, type) {
    return list.reduce((sum, entry) => sum + (entry.payment === 'Ambos'
      ? Number(type === 'Efectivo' ? entry.cashAmount : entry.mpAmount)
      : entry.payment === type ? Number(entry.amount) + Number(entry.tip || 0) : 0), 0);
  }

  function transferTotal(list, type) {
    return list.reduce((sum, transfer) => sum + (transfer.to === type ? Number(transfer.amount) : transfer.from === type ? -Number(transfer.amount) : 0), 0);
  }

  function dominantPayment(entry) {
    if (entry.payment !== 'Ambos') return entry.payment;
    return Number(entry.cashAmount) >= Number(entry.mpAmount) ? 'Efectivo' : 'Mercado Pago';
  }

  function mixedTipError(entry) {
    if (entry.payment !== 'Ambos' || Number(entry.tip || 0) <= Math.max(Number(entry.cashAmount || 0), Number(entry.mpAmount || 0))) return '';
    return 'La propina no puede superar el importe del medio que más aportó.';
  }

  function balance(type, initial, cuts = [], sales = [], advances = [], expenses = [], transfers = []) {
    return Number(initial || 0) + paymentTotal(cuts, type) + salePaymentTotal(sales, type) - advancePaymentTotal(advances, type) - expensePaymentTotal(expenses, type) + transferTotal(transfers, type);
  }

  function barberPayout(cuts, commissionAt = () => 0) {
    const tips = cuts.reduce((sum, cut) => sum + Number(cut.tip || 0), 0);
    const earnedCommission = cuts.reduce((sum, cut) => sum + Number(cut.commissionAmount ?? Number(cut.amount) * (cut.commissionRate ?? commissionAt(cut.date)) / 100), 0);
    // The daily payment fields and currency display use whole pesos; round once after summing.
    const commission = Math.round(earnedCommission);
    return { tips, commission, total: commission + tips };
  }

  function barberPaymentState(payment, totalDue) {
    const mixed = payment.status === 'Mixto';
    const paidAmount = Number(payment.cashAmount || 0) + Number(payment.mpAmount || 0);
    const isPaid = mixed ? paidAmount >= totalDue : ['Efectivo', 'Mercado Pago'].includes(payment.status);
    const label = mixed ? `Mixto · ${isPaid ? 'Completo' : 'Incompleto'}`
      : isPaid ? `Pagado · ${payment.status === 'Mercado Pago' ? 'MP' : payment.status}` : 'No pago';
    return { mixed, paidAmount, isPaid, label, remaining: Math.max(0, totalDue - paidAmount), excess: Math.max(0, paidAmount - totalDue) };
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

  function cutValueByPayment(cuts, type, field) {
    return cuts.reduce((sum, cut) => {
      if (cut.payment !== 'Ambos') return sum + (cut.payment === type ? Number(cut[field] || 0) : 0);
      const paid = Number(type === 'Efectivo' ? cut.cashAmount : cut.mpAmount);
      const tip = dominantPayment(cut) === type ? Number(cut.tip || 0) : 0;
      const service = paid - tip;
      if (field === 'tip') return sum + tip;
      if (field === 'amount') return sum + service;
      return sum + (cut.amount ? service * Number(cut[field] || 0) / Number(cut.amount) : 0);
    }, 0);
  }

  function summarize(cuts, sales, advances, expenses = [], payment = 'Ambas', commissionAt = () => 0) {
    const matchesPayment = (item) => payment === 'Ambas' || item.payment === payment;
    sales = sales.filter(matchesPayment);
    advances = advances.filter(matchesPayment);
    expenses = expenses.filter(matchesPayment);
    const services = payment === 'Ambas' ? cuts.reduce((sum, cut) => sum + Number(cut.amount), 0) : cutValueByPayment(cuts, payment, 'amount');
    const tips = payment === 'Ambas' ? cuts.reduce((sum, cut) => sum + Number(cut.tip || 0), 0) : cutValueByPayment(cuts, payment, 'tip');
    const salesTotal = sales.reduce((sum, sale) => sum + Number(sale.total), 0);
    const advancesTotal = advances.reduce((sum, advance) => sum + Number(advance.amount), 0);
    const expensesTotal = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
    const commissionCuts = cuts.map((cut) => ({ ...cut, commission: Number(cut.commissionAmount ?? Number(cut.amount) * (commissionAt(cut.date) ?? cut.commissionRate) / 100) }));
    const commission = payment === 'Ambas' ? commissionCuts.reduce((sum, cut) => sum + cut.commission, 0) : cutValueByPayment(commissionCuts, payment, 'commission');
    const cutCount = payment === 'Ambas' ? cuts.length : cuts.filter((cut) => dominantPayment(cut) === payment).length;
    return {
      cuts: cutCount, saleCount: sales.length, services, sales: salesTotal, tips, commission, advances: advancesTotal, expenses: expensesTotal,
      invoiced: services + salesTotal, balance: services + salesTotal - commission,
      cash: paymentTotal(cuts, 'Efectivo') + salePaymentTotal(sales, 'Efectivo') - advancePaymentTotal(advances, 'Efectivo') - expensePaymentTotal(expenses, 'Efectivo'),
      mp: paymentTotal(cuts, 'Mercado Pago') + salePaymentTotal(sales, 'Mercado Pago') - advancePaymentTotal(advances, 'Mercado Pago') - expensePaymentTotal(expenses, 'Mercado Pago'),
    };
  }

  function dailyRevenue(cuts, sales, commissionAt = () => 0) {
    const total = summarize(cuts, sales, [], [], 'Ambas', commissionAt);
    const cash = summarize(cuts, sales, [], [], 'Efectivo', commissionAt);
    // Match the whole-peso display and assign the remainder to MP so both methods add up.
    const commission = Math.round(total.commission);
    const cashInvoiced = Math.round(cash.invoiced);
    const cashServices = cashInvoiced - cash.sales;
    const cashTips = cash.cash - cashInvoiced;
    const cashNet = cashInvoiced - Math.round(cash.commission);
    const net = total.invoiced - commission;
    return {
      collected: total.invoiced + total.tips, tips: total.tips, invoiced: total.invoiced, commission, net,
      services: total.services + total.tips, sales: total.sales,
      cashServices, mpServices: total.services - cashServices, cashTips, mpTips: total.tips - cashTips,
      cashInvoiced, mpInvoiced: total.invoiced - cashInvoiced, cashNet, mpNet: net - cashNet,
    };
  }

  function inventorySummary(product, movements, date) {
    const rows = movements.filter((row) => row.productId === product.id && !row.cancelled && row.date <= date);
    const incoming = rows.filter((row) => row.date === date && row.type === 'entrada').reduce((sum, row) => sum + row.quantity, 0);
    const consumed = rows.filter((row) => row.date === date && row.type === 'consumo').reduce((sum, row) => sum + row.quantity, 0);
    const stock = (product.startDate <= date ? product.initialStock : 0) + rows.reduce((sum, row) => sum + (row.type === 'entrada' ? row.quantity : -row.quantity), 0);
    return { stock, incoming, consumed };
  }

  function inventoryError(state) {
    const validText = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
    const validDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
    const validQuantity = (value) => Number.isSafeInteger(value) && value >= 0 && value <= 1000000000;
    if (!state || state.version !== 1 || !Array.isArray(state.products) || !Array.isArray(state.movements)) return 'El inventario guardado no tiene un formato válido.';
    const products = new Map();
    const names = new Set();
    for (const item of state.products) {
      if (!item || !validText(item.id, 80) || products.has(item.id) || !validText(item.name, 80) || !['unidades', 'ml', 'g'].includes(item.unit) || !validQuantity(item.initialStock) || !validDate(item.startDate) || typeof item.active !== 'boolean') return 'Revisá el nombre, la unidad y el stock inicial del producto.';
      const name = item.name.trim().normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('es');
      if (names.has(name)) return 'Ya existe un producto con ese nombre, incluso entre los archivados.';
      names.add(name);
      products.set(item.id, item);
    }
    const ids = new Set();
    const changes = new Map([...products.keys()].map((id) => [id, new Map()]));
    for (const row of state.movements) {
      const product = products.get(row?.productId);
      if (!row || !product || !validText(row.id, 80) || ids.has(row.id) || !validDate(row.date) || row.date < product.startDate || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(row.time) || !['entrada', 'consumo'].includes(row.type) || !validQuantity(row.quantity) || row.quantity === 0 || typeof row.cancelled !== 'boolean' || typeof row.notes !== 'string' || row.notes.length > 120) return 'Revisá el producto, la fecha y la cantidad del movimiento.';
      ids.add(row.id);
      if (row.cancelled) continue;
      const days = changes.get(row.productId);
      days.set(row.date, (days.get(row.date) || 0) + (row.type === 'entrada' ? row.quantity : -row.quantity));
    }
    for (const product of products.values()) {
      let stock = product.initialStock;
      for (const [date, change] of [...changes.get(product.id)].sort(([a], [b]) => a.localeCompare(b))) {
        stock += change;
        if (!Number.isSafeInteger(stock) || stock < 0) return `Stock insuficiente de ${product.name} en la jornada ${date}. Revisá también los movimientos posteriores.`;
      }
    }
    return '';
  }

  root.TheLuxeLogic = Object.freeze({ parseAmount, salePaymentTotal, advancePaymentTotal, expensePaymentTotal, paymentTotal, transferTotal, dominantPayment, mixedTipError, balance, barberPayout, barberPaymentState, isoDate, monthWeeks, currentMonthWeek, periodBounds, cutValueByPayment, summarize, dailyRevenue, inventorySummary, inventoryError });
  Object.assign(root, root.TheLuxeLogic);
}(globalThis));
