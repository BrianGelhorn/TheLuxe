const inventoryStorageKey = 'theluxe-inventory-v1';
let inventory = { version: 1, products: [], movements: [] };
let inventorySnapshot = null;
let inventoryReadError = false;
let stockEditingSnapshot = null;
const stockProductForm = document.getElementById('stockProductForm');
const stockMovementForm = document.getElementById('stockMovementForm');

function stockMessage(message, error = false) {
  ['stockMessage', 'stockConfigMessage'].forEach((id) => {
    const element = document.getElementById(id);
    element.textContent = message;
    element.hidden = !message;
    element.classList.toggle('error', error);
  });
}

function loadInventory() {
  try {
    const raw = localStorage.getItem(inventoryStorageKey);
    const next = raw === null ? { version: 1, products: [], movements: [] } : JSON.parse(raw);
    if (inventoryError(next)) throw new Error('Inventario inválido');
    inventory = next;
    inventorySnapshot = raw;
    inventoryReadError = false;
    return true;
  } catch {
    inventoryReadError = true;
    stockMessage('No se pudo leer el inventario local. No se sobrescribió ningún dato. Revisá el almacenamiento del navegador y recargá la página.', true);
    return false;
  }
}

function saveInventory(next) {
  if (inventoryReadError) return false;
  const error = inventoryError(next);
  if (error) { stockMessage(error, true); return false; }
  try {
    if (localStorage.getItem(inventoryStorageKey) !== inventorySnapshot) {
      if (loadInventory()) stockMessage('El inventario cambió en otra pestaña. Se actualizó la vista; revisá los datos y volvé a guardar.', true);
      renderInventory();
      return false;
    }
    const raw = JSON.stringify(next);
    localStorage.setItem(inventoryStorageKey, raw);
    inventorySnapshot = raw;
    inventory = next;
    return true;
  } catch {
    stockMessage('No se pudo guardar. No se aplicó el cambio: revisá el espacio o los permisos de almacenamiento del navegador.', true);
    return false;
  }
}

function resetStockProductForm() {
  stockEditingSnapshot = null;
  stockProductForm.reset();
  stockProductForm.elements.stockId.value = '';
  stockProductForm.elements.initialStock.disabled = false;
  stockProductForm.elements.stockUnit.disabled = false;
  document.getElementById('saveStockProduct').textContent = 'Agregar producto';
  document.getElementById('cancelStockProduct').hidden = true;
}

function renderInventory() {
  const date = workday.value;
  const active = inventory.products.filter((product) => product.active);
  const selected = stockMovementForm.elements.stockProduct.value;
  stockMovementForm.elements.stockProduct.innerHTML = '<option value="">Seleccionar producto</option>' + active.filter((product) => product.startDate <= date).map((product) => `<option value="${escapeHtml(product.id)}">${escapeHtml(product.name)} (${escapeHtml(product.unit)})</option>`).join('');
  stockMovementForm.elements.stockProduct.value = selected;
  stockMovementForm.querySelector('button[type="submit"]').disabled = inventoryReadError || !active.some((product) => product.startDate <= date) || !date || date > today();
  document.getElementById('saveStockProduct').disabled = inventoryReadError;
  document.getElementById('stockRows').innerHTML = active.map((product) => {
    const day = inventorySummary(product, inventory.movements, date);
    const current = inventorySummary(product, inventory.movements, today()).stock;
    return `<tr><td>${escapeHtml(product.name)}<small>${escapeHtml(product.unit)}</small></td><td class="${current === 0 ? 'stock-empty-value' : 'stock-available'}">${integer.format(current)}${current === 0 ? '<small>Sin stock</small>' : ''}</td><td>${integer.format(day.incoming)}</td><td>${integer.format(day.consumed)}</td></tr>`;
  }).join('');
  document.getElementById('stockEmpty').hidden = active.length > 0;
  const rows = inventory.movements.filter((row) => row.date === date).slice().reverse();
  const products = new Map(inventory.products.map((product) => [product.id, product]));
  document.getElementById('stockMovementRows').innerHTML = rows.map((row) => {
    const product = products.get(row.productId);
    return `<tr${row.cancelled ? ' class="stock-cancelled"' : ''}><td>${escapeHtml(row.time)}</td><td>${escapeHtml(product.name)}</td><td>${row.type === 'entrada' ? 'Ingreso' : 'Consumo'}${row.cancelled ? ' · Anulado' : ''}</td><td>${integer.format(row.quantity)} ${escapeHtml(product.unit)}</td><td>${escapeHtml(row.notes || '—')}</td><td><button class="stock-action" type="button" data-stock-toggle="${escapeHtml(row.id)}" ${inventoryReadError ? 'disabled' : ''}>${row.cancelled ? 'Restaurar' : 'Anular'}</button></td></tr>`;
  }).join('');
  document.getElementById('stockMovementCount').textContent = String(rows.filter((row) => !row.cancelled).length);
  document.getElementById('stockMovementsEmpty').hidden = rows.length > 0;
  document.getElementById('stockConfigList').innerHTML = inventory.products.map((product) => `<div class="config-item${product.active ? '' : ' stock-archived'}"><span>${escapeHtml(product.name)}<small>${integer.format(inventorySummary(product, inventory.movements, today()).stock)} ${escapeHtml(product.unit)}${product.active ? '' : ' · Archivado'}</small></span><span class="config-actions"><button type="button" data-stock-edit="${escapeHtml(product.id)}" ${inventoryReadError ? 'disabled' : ''}>Editar</button><button type="button" data-stock-archive="${escapeHtml(product.id)}" ${inventoryReadError ? 'disabled' : ''}>${product.active ? 'Archivar' : 'Activar'}</button></span></div>`).join('') || '<p class="stock-hint">Todavía no agregaste productos para controlar.</p>';
  const editing = inventory.products.find((product) => product.id === stockProductForm.elements.stockId.value);
  document.getElementById('stockInitialDate').textContent = editing ? `Stock inicial registrado el ${editing.startDate}. Para cambiar existencias, cargá un ingreso o consumo.` : `Stock inicial al ${date || 'día seleccionado'}. Cantidades enteras en la unidad elegida.`;
}

function initInventory() {
  loadInventory();
  stockProductForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!stockProductForm.reportValidity()) return;
    const fields = stockProductForm.elements;
    const existing = inventory.products.find((product) => product.id === fields.stockId.value);
    if (!existing && (!workday.value || workday.value > today())) return stockMessage('Elegí una jornada de hoy o anterior para registrar el stock inicial.', true);
    if (fields.stockId.value && !existing) return stockMessage('El producto ya no está disponible. Cancelá la edición y revisá el listado.', true);
    if (existing && stockEditingSnapshot && JSON.stringify(existing) !== stockEditingSnapshot) return stockMessage('El producto cambió en otra pestaña. Cancelá la edición y volvé a abrirlo antes de guardar.', true);
    const product = {
      id: existing?.id || crypto.randomUUID(), name: fields.stockName.value.trim(),
      unit: existing?.unit || fields.stockUnit.value,
      initialStock: existing?.initialStock ?? Number(fields.initialStock.value),
      startDate: existing?.startDate || workday.value, active: existing?.active ?? true,
    };
    const products = existing ? inventory.products.map((item) => item.id === existing.id ? product : item) : [...inventory.products, product];
    if (!saveInventory({ ...inventory, products })) return;
    resetStockProductForm();
    renderInventory();
    stockMessage(existing ? 'Producto actualizado.' : 'Producto agregado al control de stock.');
  });
  document.getElementById('cancelStockProduct').addEventListener('click', () => { resetStockProductForm(); renderInventory(); });
  document.getElementById('stockConfigList').addEventListener('click', (event) => {
    const button = event.target.closest('[data-stock-edit], [data-stock-archive]');
    if (!button) return;
    const product = inventory.products.find((item) => item.id === (button.dataset.stockEdit || button.dataset.stockArchive));
    if (!product) return;
    if (button.dataset.stockArchive) {
      const products = inventory.products.map((item) => item.id === product.id ? { ...item, active: !item.active } : item);
      if (!saveInventory({ ...inventory, products })) return;
      if (stockProductForm.elements.stockId.value === product.id) resetStockProductForm();
      renderInventory();
      return stockMessage(product.active ? 'Producto archivado. El stock y su historial se conservaron.' : 'Producto activado.');
    }
    stockProductForm.elements.stockId.value = product.id;
    stockEditingSnapshot = JSON.stringify(product);
    stockProductForm.elements.stockName.value = product.name;
    stockProductForm.elements.stockUnit.value = product.unit;
    stockProductForm.elements.stockUnit.disabled = true;
    stockProductForm.elements.initialStock.value = product.initialStock;
    stockProductForm.elements.initialStock.disabled = true;
    document.getElementById('saveStockProduct').textContent = 'Guardar nombre';
    document.getElementById('cancelStockProduct').hidden = false;
    renderInventory();
    stockProductForm.elements.stockName.focus();
  });
  stockMovementForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!stockMovementForm.reportValidity()) return;
    const fields = stockMovementForm.elements;
    const product = inventory.products.find((item) => item.id === fields.stockProduct.value && item.active);
    if (!product || !workday.value || workday.value > today()) return stockMessage('Elegí un producto activo y una jornada de hoy o anterior.', true);
    const row = { id: crypto.randomUUID(), productId: product.id, date: workday.value, time: nowTime(), type: fields.stockType.value, quantity: Number(fields.stockQuantity.value), notes: fields.stockNotes.value.trim(), cancelled: false };
    if (!saveInventory({ ...inventory, movements: [...inventory.movements, row] })) return;
    fields.stockQuantity.value = '1';
    fields.stockNotes.value = '';
    renderInventory();
    stockMessage(`${row.type === 'entrada' ? 'Ingreso' : 'Consumo'} registrado: ${integer.format(row.quantity)} ${product.unit} de ${product.name}.`);
  });
  document.getElementById('stockMovementRows').addEventListener('click', (event) => {
    const button = event.target.closest('[data-stock-toggle]');
    if (!button) return;
    const row = inventory.movements.find((item) => item.id === button.dataset.stockToggle);
    if (!row) return;
    const movements = inventory.movements.map((item) => item.id === row.id ? { ...item, cancelled: !item.cancelled } : item);
    if (!saveInventory({ ...inventory, movements })) return;
    renderInventory();
    stockMessage(row.cancelled ? 'Movimiento restaurado; stock actualizado.' : 'Movimiento anulado; stock actualizado. Podés restaurarlo desde el historial.');
  });
  window.addEventListener('storage', (event) => {
    if (event.key !== inventoryStorageKey && event.key !== null) return;
    if (loadInventory()) stockMessage('Inventario actualizado desde otra pestaña.');
    renderInventory();
  });
}
