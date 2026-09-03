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
      const total = Number(cut.amount) + Number(cut.tip || 0);
      const paid = Number(type === 'Efectivo' ? cut.cashAmount : cut.mpAmount);
      return sum + (total ? paid * Number(cut[field] || 0) / total : 0);
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
    const commissionCuts = cuts.map((cut) => ({ ...cut, commission: Number(cut.commissionAmount ?? Number(cut.amount) * commissionAt(cut.date) / 100) }));
    const commission = payment === 'Ambas' ? commissionCuts.reduce((sum, cut) => sum + cut.commission, 0) : cutValueByPayment(commissionCuts, payment, 'commission');
    const cutCount = payment === 'Ambas' ? cuts.length : cuts.filter((cut) => dominantPayment(cut) === payment).length;
    return {
      cuts: cutCount, saleCount: sales.length, services, sales: salesTotal, tips, commission, advances: advancesTotal, expenses: expensesTotal,
      invoiced: services + salesTotal, balance: services + salesTotal - commission,
      cash: paymentTotal(cuts, 'Efectivo') + salePaymentTotal(sales, 'Efectivo') - advancePaymentTotal(advances, 'Efectivo') - expensePaymentTotal(expenses, 'Efectivo'),
      mp: paymentTotal(cuts, 'Mercado Pago') + salePaymentTotal(sales, 'Mercado Pago') - advancePaymentTotal(advances, 'Mercado Pago') - expensePaymentTotal(expenses, 'Mercado Pago'),
    };
  }

  root.TheLuxeLogic = Object.freeze({ parseAmount, salePaymentTotal, advancePaymentTotal, expensePaymentTotal, paymentTotal, transferTotal, dominantPayment, balance, barberPayout, barberPaymentState, isoDate, monthWeeks, currentMonthWeek, periodBounds, cutValueByPayment, summarize });
  Object.assign(root, root.TheLuxeLogic);
}(globalThis));
