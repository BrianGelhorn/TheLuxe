function updateSaleTotal() {
  const quantity = Number(saleForm.elements.quantity.value || 0);
  const unitPrice = parseAmount(saleForm.elements.unitPrice.value);
  document.getElementById('saleTotalPreview').textContent = money.format(quantity * unitPrice);
}

function openSaleDialog(id = null) {
  saleForm.reset();
  saleForm.elements.unitPrice.setCustomValidity('');
  editingSaleId = id;
  const sale = sales.find((item) => item.id === id);
  saleForm.elements.time.value = sale?.time || nowTime();
  saleForm.elements.product.value = sale?.product || '';
  saleForm.elements.quantity.value = sale?.quantity || 1;
  saleForm.elements.unitPrice.value = sale ? formatAmount(sale.unitPrice) : '';
  saleForm.elements.payment.value = sale?.payment || 'Efectivo';
  saleForm.elements.notes.value = sale?.notes || '';
  document.getElementById('saleFormMode').textContent = sale ? 'MODIFICAR VENTA' : 'NUEVA VENTA';
  updateSaleTotal();
  saleDetailDialog.close();
  saleDialog.showModal();
}

function openSaleDetail(id) {
  const sale = sales.find((item) => item.id === id);
  if (!sale) return;
  selectedSaleId = id;
  document.getElementById('saleDetailTitle').textContent = sale.product;
  document.getElementById('saleDetail').innerHTML = [
    ['Hora', sale.time], ['Producto', sale.product], ['Cantidad', sale.quantity],
    ['Precio unitario', money.format(sale.unitPrice)], ['Importe total', money.format(sale.total)],
    ['Medio de pago', sale.payment], ['Notas', sale.notes || 'Sin notas'],
  ].map(([label, value]) => `<div><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`).join('');
  saleDetailDialog.showModal();
}

function openAdvanceDialog(id = null) {
  advanceForm.reset();
  editingAdvanceId = id;
  const advance = advances.find((item) => item.id === id);
  advanceForm.elements.time.value = advance?.time || nowTime();
  advanceForm.elements.barber.value = advance?.barber || '';
  advanceForm.elements.amount.value = advance ? formatAmount(advance.amount) : '';
  advanceForm.elements.payment.value = advance?.payment || 'Efectivo';
  advanceForm.elements.reason.value = advance?.reason || '';
  document.getElementById('advanceFormMode').textContent = advance ? 'MODIFICAR ADELANTO' : 'NUEVO ADELANTO';
  advanceDetailDialog.close();
  advanceDialog.showModal();
}

function openAdvanceDetail(id) {
  const advance = advances.find((item) => item.id === id);
  if (!advance) return;
  selectedAdvanceId = id;
  document.getElementById('advanceDetailTitle').textContent = `Adelanto de ${advance.barber}`;
  document.getElementById('advanceDetail').innerHTML = [
    ['Hora', advance.time], ['Barbero', advance.barber], ['Importe', money.format(advance.amount)],
    ['Medio de entrega', advance.payment], ['Motivo', advance.reason || 'Sin descripción'],
  ].map(([label, value]) => `<div><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`).join('');
  advanceDetailDialog.showModal();
}

function openExpenseDialog(id = null) {
  expenseForm.reset();
  editingExpenseId = id;
  const expense = expenses.find((item) => item.id === id);
  expenseForm.elements.time.value = expense?.time || nowTime();
  expenseForm.elements.amount.value = expense ? formatAmount(expense.amount) : '';
  expenseForm.elements.payment.value = expense?.payment || 'Efectivo';
  expenseForm.elements.reason.value = expense?.reason || '';
  document.getElementById('expenseFormMode').textContent = expense ? 'MODIFICAR SALIDA' : 'NUEVA SALIDA';
  expenseDetailDialog.close();
  expenseDialog.showModal();
}

function openExpenseDetail(id) {
  const expense = expenses.find((item) => item.id === id);
  if (!expense) return;
  selectedExpenseId = id;
  document.getElementById('expenseDetailTitle').textContent = expense.reason;
  document.getElementById('expenseDetail').innerHTML = [['Hora', expense.time], ['Motivo', expense.reason], ['Importe', money.format(expense.amount)], ['Medio de salida', expense.payment]].map(([label, value]) => `<div><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`).join('');
  expenseDetailDialog.showModal();
}
