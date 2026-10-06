(function (root) {
  const parseAmount = (value) => Number(String(value || '').replace(/\D/g, ''));

  function salePaymentTotal(list, type) {
    return list.reduce((sum, sale) => sum + (sale.payment === 'Ambos'
      ? Number(type === 'Efectivo' ? sale.cashAmount : sale.mpAmount)
      : sale.payment === type ? Number(sale.total) : 0), 0);
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
    return list.reduce((sum, transfer) => sum + (transfer.to === type ? Number(transfer.amount) : 0) - (transfer.from === type ? Number(transfer.amount) : 0), 0);
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

  // Advances leave the register when issued; this only reduces the later payout.
  function barberSettlement(cuts = [], advances = [], payment = {}, commissionAt = () => 0) {
    const { commission, tips, total: gross } = barberPayout(cuts, commissionAt);
    const advance = advances.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const due = Math.max(0, gross - advance);
    const simple = payment.status === 'Efectivo' || payment.status === 'Mercado Pago';
    const paidCash = simple ? (payment.status === 'Efectivo' ? Number(payment.paidAmount ?? due) : 0) : payment.status === 'Mixto' ? Number(payment.cashAmount || 0) : 0;
    const paidMp = simple ? (payment.status === 'Mercado Pago' ? Number(payment.paidAmount ?? due) : 0) : payment.status === 'Mixto' ? Number(payment.mpAmount || 0) : 0;
    let commissionRemaining = commission;
    const allocate = (amount) => {
      const paid = Math.min(commissionRemaining, Math.max(0, amount));
      commissionRemaining -= paid;
      return paid;
    };
    const advanceCash = advances.filter((item) => item.payment === 'Efectivo').reduce((sum, item) => sum + allocate(Number(item.amount || 0)), 0);
    const advanceMp = advances.filter((item) => item.payment === 'Mercado Pago').reduce((sum, item) => sum + allocate(Number(item.amount || 0)), 0);
    const commissionPaidCash = advanceCash + allocate(paidCash);
    const commissionPaidMp = advanceMp + allocate(paidMp);
    return {
      commission, tips, gross, advance, advanceExcess: Math.max(0, advance - gross), due,
      paidCash, paidMp, commissionPaid: commissionPaidCash + commissionPaidMp, commissionPaidCash, commissionPaidMp,
    };
  }

  function barberPaymentState(payment, totalDue) {
    const mixed = payment.status === 'Mixto';
    const simple = payment.status === 'Efectivo' || payment.status === 'Mercado Pago';
    const paidAmount = simple ? Number(payment.paidAmount ?? totalDue) : Number(payment.cashAmount || 0) + Number(payment.mpAmount || 0);
    const isPaid = (simple || mixed) && paidAmount >= totalDue;
    const label = mixed ? `Mixto · ${isPaid ? 'Completo' : 'Incompleto'}`
      : simple ? `${isPaid ? paidAmount > totalDue ? 'Pagado de más' : 'Pagado' : 'Pago parcial'} · ${payment.status === 'Mercado Pago' ? 'MP' : 'Efectivo'}` : 'No pago';
    return { mixed, paidAmount, isPaid, label, remaining: Math.max(0, totalDue - paidAmount), excess: Math.max(0, paidAmount - totalDue) };
  }

  function isoDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function monthWeeks(value) {
    const [year, month] = value.split('-').map(Number);
    const firstSunday = new Date(year, month - 1, 1);
    firstSunday.setDate(firstSunday.getDate() + (7 - firstSunday.getDay()) % 7);
    const lastDay = new Date(year, month, 0);
    return Math.ceil((lastDay.getDate() - firstSunday.getDate()) / 7) + 1;
  }

  function currentMonthWeek(value) {
    const date = new Date(`${value}T00:00:00`);
    const firstSunday = new Date(date.getFullYear(), date.getMonth(), 1);
    firstSunday.setDate(firstSunday.getDate() + (7 - firstSunday.getDay()) % 7);
    return date.getDate() <= firstSunday.getDate() ? 1 : Math.ceil((date.getDate() - firstSunday.getDate()) / 7) + 1;
  }

  function periodBounds(period, value, week = 1) {
    let start;
    let end;
    if (period === 'week') {
      const [year, month] = value.split('-').map(Number);
      const firstSunday = new Date(year, month - 1, 1);
      firstSunday.setDate(firstSunday.getDate() + (7 - firstSunday.getDay()) % 7);
      const lastDay = new Date(year, month, 0);
      start = Number(week) === 1 ? new Date(year, month - 1, 1) : new Date(year, month - 1, firstSunday.getDate() + 1 + (Number(week) - 2) * 7);
      end = Number(week) === 1 ? firstSunday : new Date(start);
      if (Number(week) !== 1) end.setDate(start.getDate() + 6);
      if (end > lastDay) end = lastDay;
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
      return sum + (Number(cut.amount) ? service * Number(cut[field] || 0) / Number(cut.amount) : 0);
    }, 0);
  }

  function summarize(cuts, sales, advances, expenses = [], payment = 'Ambas', commissionAt = () => 0) {
    const matchesPayment = (item) => payment === 'Ambas' || item.payment === payment;
    sales = sales.filter((sale) => payment === 'Ambas' || sale.payment === payment || sale.payment === 'Ambos');
    advances = advances.filter(matchesPayment);
    expenses = expenses.filter(matchesPayment);
    const services = payment === 'Ambas' ? cuts.reduce((sum, cut) => sum + Number(cut.amount), 0) : cutValueByPayment(cuts, payment, 'amount');
    const tips = payment === 'Ambas' ? cuts.reduce((sum, cut) => sum + Number(cut.tip || 0), 0) : cutValueByPayment(cuts, payment, 'tip');
    const salesTotal = payment === 'Ambas' ? sales.reduce((sum, sale) => sum + Number(sale.total), 0) : salePaymentTotal(sales, payment);
    const advancesTotal = advances.reduce((sum, advance) => sum + Number(advance.amount), 0);
    const expensesTotal = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
    const commissionCuts = cuts.map((cut) => ({ ...cut, commission: Number(cut.commissionAmount ?? Number(cut.amount) * (cut.commissionRate ?? commissionAt(cut.date)) / 100) }));
    const commission = payment === 'Ambas' ? commissionCuts.reduce((sum, cut) => sum + cut.commission, 0) : cutValueByPayment(commissionCuts, payment, 'commission');
    const cutCount = payment === 'Ambas' ? cuts.length : cuts.filter((cut) => dominantPayment(cut) === payment).length;
    return {
      cuts: cutCount, saleCount: payment === 'Ambas' ? sales.length : sales.filter((sale) => dominantPayment(sale) === payment).length, services, sales: salesTotal, tips, commission, advances: advancesTotal, expenses: expensesTotal,
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

  function inventoryUnitCost(product) {
    return Number(product?.packageSize ? product.packageCost / product.packageSize : product?.unitCost || 0);
  }

  function inventoryValuation(product, movements, date) {
    const rows = movements.filter((row) => row.productId === product.id && !row.cancelled && row.date <= date)
      .slice().sort((a, b) => a.date.localeCompare(b.date) || (a.type === b.type ? a.time.localeCompare(b.time) || a.id.localeCompare(b.id) : a.type === 'entrada' ? -1 : 1));
    const lots = product.startDate <= date ? [{ quantity: product.initialStock, cost: Number(product.initialUnitCost ?? inventoryUnitCost(product)) }] : [];
    const costs = new Map();
    let incoming = 0;
    let consumed = 0;
    for (const row of rows) {
      if (row.type === 'entrada') {
        const cost = Number(row.unitCost ?? (row.cost === undefined ? inventoryUnitCost(product) : row.cost / row.quantity));
        lots.push({ quantity: row.quantity, cost });
        const value = row.cost ?? row.quantity * cost;
        costs.set(row.id, value);
        if (row.date === date) incoming += value;
        continue;
      }
      let remaining = row.quantity;
      let allocated = 0;
      for (const lot of lots) {
        const quantity = Math.min(remaining, lot.quantity);
        allocated += quantity * lot.cost;
        lot.quantity -= quantity;
        remaining -= quantity;
        if (!remaining) break;
      }
      const value = row.cost ?? allocated;
      costs.set(row.id, value);
      if (row.date === date) consumed += value;
    }
    return { incoming, consumed, stock: lots.reduce((sum, lot) => sum + lot.quantity * lot.cost, 0), costs };
  }

  function inventoryMovementCost(product, movements, movement) {
    return inventoryValuation(product, [...movements.filter((row) => row.id !== movement.id), movement], movement.date).costs.get(movement.id) || 0;
  }

  function inventoryCostSummary(products, movements, date, currentDate = date) {
    return products.reduce((total, product) => {
      const day = inventoryValuation(product, movements, date);
      const current = inventoryValuation(product, movements, currentDate);
      total.incoming += day.incoming;
      total.consumed += day.consumed;
      total.stock += Math.max(0, current.stock);
      return total;
    }, { incoming: 0, consumed: 0, stock: 0 });
  }

  function inventoryError(state) {
    const validText = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
    const validDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
    const validQuantity = (value) => Number.isSafeInteger(value) && value >= 0 && value <= 1000000000;
    const validCost = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1000000000;
    const validSnapshotCost = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
    if (!state || ![1, 2].includes(state.version) || !Array.isArray(state.products) || !Array.isArray(state.movements)) return 'El inventario guardado no tiene un formato válido.';
    const products = new Map();
    const names = new Set();
    for (const item of state.products) {
      const packaged = item && (item.packageSize !== undefined || item.packageCost !== undefined || item.packageLabel !== undefined);
      const validPackage = !packaged || (validQuantity(item.packageSize) && item.packageSize > 1 && validQuantity(item.packageCost) && item.packageCost > 0 && validText(item.packageLabel, 40) && item.unitCost === item.packageCost / item.packageSize);
      const v2 = state.version === 2;
      const stock = item?.stockEnabled;
      const sale = item?.saleEnabled;
      if (item?.supplyEnabled !== undefined && (typeof item.supplyEnabled !== 'boolean' || (!sale && !item.supplyEnabled) || (item.supplyEnabled && stock === false))) return 'Elegí Venta, Insumo o ambas opciones y mantené su control de stock.';
      if (!item || !validText(item.id, 80) || products.has(item.id) || !validText(item.name, 80) || (v2 && (typeof sale !== 'boolean' || typeof stock !== 'boolean' || (!sale && !stock))) || (stock !== false && (!['unidades', 'ml', 'g'].includes(item.unit) || !validQuantity(item.initialStock) || !validDate(item.startDate) || (v2 && !validCost(item.unitCost)) || !validPackage)) || (stock === false && (item.unit !== undefined || item.initialStock !== undefined || item.unitCost !== undefined || item.initialUnitCost !== undefined || item.startDate !== undefined || packaged)) || (item.unitCost !== undefined && !validCost(item.unitCost)) || (item.initialUnitCost !== undefined && !validCost(item.initialUnitCost)) || typeof item.active !== 'boolean' || (v2 && sale && (!validCost(item.salePrice) || item.salePrice <= 0)) || (v2 && !sale && item.salePrice !== undefined) || (v2 && sale && stock && item.unit !== 'unidades')) return v2 ? 'Revisá el nombre, las opciones de venta/stock y sus precios.' : 'Revisá el nombre, la unidad, el stock inicial del producto y su costo unitario.';
      const name = item.name.trim().normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('es');
      if (names.has(name)) return 'Ya existe un producto con ese nombre, incluso entre los archivados.';
      names.add(name);
      products.set(item.id, item);
    }
    const ids = new Set();
    const changes = new Map([...products.keys()].map((id) => [id, new Map()]));
    for (const row of state.movements) {
      const product = products.get(row?.productId);
      if (!row || !product || !validText(row.id, 80) || ids.has(row.id) || !validDate(row.date) || row.date < product.startDate || typeof row.time !== 'string' || row.time.length !== 5 || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(row.time) || !['entrada', 'consumo'].includes(row.type) || !validQuantity(row.quantity) || row.quantity === 0 || typeof row.cancelled !== 'boolean' || typeof row.notes !== 'string' || row.notes.length > 120 || (row.unitCost !== undefined && !validCost(row.unitCost)) || (row.cost !== undefined && !validSnapshotCost(row.cost)) || (row.source !== undefined && (row.source !== 'sale' || row.type !== 'consumo' || !validText(row.sourceId, 80))) || (row.barberId !== undefined && (row.type !== 'consumo' || row.source === 'sale' || !validText(row.barberId, 80) || !validText(row.barberName, 200))) || (row.barberName !== undefined && row.barberId === undefined)) return 'Revisá el producto, la fecha y la cantidad del movimiento.';
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

  root.TheLuxeLogic = Object.freeze({ parseAmount, salePaymentTotal, advancePaymentTotal, expensePaymentTotal, paymentTotal, transferTotal, dominantPayment, mixedTipError, balance, barberPayout, barberSettlement, barberPaymentState, isoDate, monthWeeks, currentMonthWeek, periodBounds, cutValueByPayment, summarize, dailyRevenue, inventorySummary, inventoryUnitCost, inventoryValuation, inventoryMovementCost, inventoryCostSummary, inventoryError });
  Object.assign(root, root.TheLuxeLogic);
}(globalThis));
