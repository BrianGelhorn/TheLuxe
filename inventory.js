const inventoryStorageKey = 'theluxe-inventory-v1';
const emptyInventory = () => ({ version: 2, products: [{ id: 'pomada', name: 'Pomada', saleEnabled: true, stockEnabled: false, salePrice: 12000, active: true }, { id: 'shampoo', name: 'Shampoo', saleEnabled: true, stockEnabled: false, salePrice: 9000, active: true }], movements: [] });
let inventory = emptyInventory();
let inventorySnapshot = null;
let inventoryReadError = false;
let stockEditingSnapshot = null;
const stockProductForm = document.getElementById('stockProductForm');
const stockMovementForm = document.getElementById('stockMovementForm');
const productIsSupply = (product) => product.supplyEnabled ?? product.stockEnabled;
const productUseLabel = (product) => product.saleEnabled ? productIsSupply(product) ? 'Venta e insumo' : 'Venta' : 'Insumo';

function updateStockProductCostPreview() {
  const fields = stockProductForm.elements;
  const cost = Number(fields.unitCost.value);
  const unit = fields.stockUnit.value;
  document.getElementById('stockUnitCostPreview').textContent = Number.isFinite(cost) && cost > 0
    ? `${unitMoney.format(cost)} por ${unit === 'unidades' ? 'unidad' : unit}`
    : 'Completá el costo por unidad.';
}

function updateStockMovementConversion() {
  const fields = stockMovementForm.elements;
  const product = inventory.products.find((item) => item.id === fields.stockProduct.value);
  const consumption = fields.stockType.value === 'consumo';
  document.getElementById('stockMovementBarberField').hidden = !consumption;
  fields.stockBarber.disabled = !consumption;
  document.getElementById('stockQuantityLabel').textContent = product ? `Cantidad (${product.unit})` : 'Cantidad';
  document.getElementById('stockConversionPreview').textContent = product ? `Se registra en ${product.unit}.` : '';
}

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
    const next = raw === null ? emptyInventory() : JSON.parse(raw);
    if (inventoryError(next)) throw new Error('Inventario inválido');
    const migrated = next.version === 1 ? migrateInventory(next) : next;
    if (inventoryError(migrated)) throw new Error('Inventario inválido');
    inventory = migrated;
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
  if (typeof stateApiEnabled !== 'undefined' && stateApiEnabled && stateLoaded) {
    if (stateConflict) { stockMessage('Hay un conflicto con la base de datos. No se guardó este cambio.', true); return false; }
    inventory = next;
    queueStateSave();
    return true;
  }
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
    if (typeof queueStateSave === 'function') queueStateSave();
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
  stockProductForm.elements.stockEnabled.checked = true;
  stockProductForm.elements.stockUnit.value = 'unidades';
  stockProductForm.elements.initialStock.disabled = false;
  stockProductForm.elements.stockUnit.disabled = false;
  stockProductForm.elements.unitCost.setCustomValidity('');
  stockProductForm.elements.salePrice.setCustomValidity('');
  stockProductForm.elements.saleEnabled.setCustomValidity('');
  stockMovementForm.elements.stockQuantity.setCustomValidity('');
  document.getElementById('saveStockProduct').textContent = 'Agregar producto';
  document.getElementById('cancelStockProduct').hidden = true;
  updateStockProductCostPreview();
  updateProductFields();
}

function updateProductFields() {
  const fields = stockProductForm.elements;
  const sale = fields.saleEnabled.checked;
  const existing = inventory.products.find((product) => product.id === fields.stockId.value);
  fields.stockEnabled.checked = true;
  fields.saleEnabled.setCustomValidity('');
  document.getElementById('salePriceField').hidden = !sale;
  fields.salePrice.disabled = !sale;
  [...document.querySelectorAll('#stockProductFields input')].forEach((field) => { field.disabled = false; });
  if (existing?.stockEnabled) {
    fields.initialStock.disabled = true;
  }
  updateStockProductCostPreview();
}

function migrateInventory(state) {
  const products = state.products.map((product) => ({ ...product, unitCost: product.unitCost ?? 0, saleEnabled: false, stockEnabled: true }));
  for (const sale of [{ id: 'pomada', name: 'Pomada', salePrice: 12000 }, { id: 'shampoo', name: 'Shampoo', salePrice: 9000 }]) {
    const current = products.find((product) => searchText(product.name) === searchText(sale.name));
    // A legacy ml/g stock item cannot also be sold: automatic discounts are units only.
    if (current?.unit === 'unidades') Object.assign(current, { saleEnabled: true, salePrice: sale.salePrice });
    else if (!current) {
      let id = sale.id;
      for (let suffix = 1; products.some((product) => product.id === id); suffix++) id = `${sale.id}-venta-${suffix}`;
      products.push({ ...sale, id, saleEnabled: true, stockEnabled: false, active: true });
    }
  }
  return { version: 2, products, movements: state.movements.map((row) => ({ ...row })) };
}

function saleProduct(sale) {
  if (!sale) return null;
  if (sale.productId) return inventory.products.find((product) => product.id === sale.productId) || null;
  const matches = inventory.products.filter((product) => product.name === sale.product);
  return matches.length === 1 ? matches[0] : null;
}

function saveSaleInventory(sale, previous = null) {
  const sourceId = sale?.id || previous?.id;
  const current = inventory.movements.find((row) => row.source === 'sale' && row.sourceId === sourceId);
  const product = saleProduct(sale);
  const consumes = sale && product?.stockEnabled;
  const base = consumes ? { id: current?.id || crypto.randomUUID(), productId: product.id, date: sale.date, time: sale.time, type: 'consumo', quantity: sale.quantity, notes: '', cancelled: false, source: 'sale', sourceId } : null;
  const sameConsumption = current && current.productId === base?.productId && current.date === base.date && current.quantity === base.quantity;
  const movement = base ? { ...base, ...(sameConsumption && current.cost !== undefined ? { cost: current.cost } : { cost: inventoryMovementCost(product, inventory.movements, base) }) } : current ? { ...current, cancelled: true } : null;
  const movements = current ? inventory.movements.map((row) => row.id === current.id ? movement : row) : movement ? [...inventory.movements, movement] : inventory.movements;
  return saveInventory({ ...inventory, movements });
}

function renderInventory() {
  populateSaleProducts();
  const date = workday.value;
  const barberFilter = document.getElementById('stockBarberFilter');
  const selectedBarber = barberFilter.value;
  const knownBarbers = new Map(config.barbers.map((barber) => [barber.id, barber.name]));
  for (const row of inventory.movements) if (row.barberId && !knownBarbers.has(row.barberId)) knownBarbers.set(row.barberId, row.barberName);
  barberFilter.innerHTML = '<option value="">Todos los barberos</option>' + [...knownBarbers].map(([id, name]) => `<option value="${escapeHtml(id)}">${escapeHtml(name)}</option>`).join('');
  barberFilter.value = selectedBarber;
  document.getElementById('stockBarberNote').hidden = !barberFilter.value;
  const selectedRecorder = stockMovementForm.elements.stockBarber.value;
  stockMovementForm.elements.stockBarber.innerHTML = '<option value="">Sin asignar</option>' + config.barbers.filter((barber) => barber.active).map((barber) => `<option value="${escapeHtml(barber.id)}">${escapeHtml(barber.name)}</option>`).join('');
  stockMovementForm.elements.stockBarber.value = selectedRecorder;
  const active = inventory.products.filter((product) => product.active && product.stockEnabled);
  const selected = stockMovementForm.elements.stockProduct.value;
  stockMovementForm.elements.stockProduct.innerHTML = '<option value="">Seleccionar producto</option>' + active.filter((product) => product.startDate <= date).map((product) => `<option value="${escapeHtml(product.id)}">${escapeHtml(product.name)} (${escapeHtml(product.unit)})</option>`).join('');
  stockMovementForm.elements.stockProduct.value = selected;
  updateStockMovementConversion();
  const locked = typeof dailyOperationsLocked === 'function' && dailyOperationsLocked();
  stockMovementForm.querySelector('button[type="submit"]').disabled = locked || inventoryReadError || !active.some((product) => product.startDate <= date) || !date || date > today();
  document.getElementById('saveStockProduct').disabled = locked || inventoryReadError;
  const missingPrices = inventory.products.filter((product) => product.active && product.stockEnabled && !inventoryUnitCost(product));
  document.getElementById('stockPriceWarning').hidden = missingPrices.length === 0;
  document.getElementById('stockPriceWarningText').textContent = missingPrices.length ? `${missingPrices.length} ${missingPrices.length === 1 ? 'producto no tiene' : 'productos no tienen'} costo unitario. Los valores monetarios están incompletos.` : '';
  const products = new Map(inventory.products.map((product) => [product.id, product]));
  const valuations = new Map(inventory.products.filter((product) => product.stockEnabled).map((product) => [product.id, inventoryValuation(product, inventory.movements, date)]));
  const movementCost = (row) => row.cost ?? valuations.get(row.productId)?.costs.get(row.id) ?? row.quantity * inventoryUnitCost(products.get(row.productId));
  const costs = inventoryCostSummary(inventory.products, inventory.movements, date, today());
  if (barberFilter.value) costs.consumed = inventory.movements.filter((row) => row.date === date && row.type === 'consumo' && !row.cancelled && row.barberId === barberFilter.value).reduce((sum, row) => sum + movementCost(row), 0);
  document.getElementById('stockConsumedValue').textContent = money.format(costs.consumed);
  document.getElementById('stockIncomingValue').textContent = money.format(costs.incoming);
  document.getElementById('stockCurrentValue').textContent = money.format(costs.stock);
  const stockRows = (products) => products.map((product) => {
    const day = inventorySummary(product, inventory.movements, date);
    const current = inventorySummary(product, inventory.movements, today()).stock;
    const unitCost = inventoryUnitCost(product);
    const valuation = valuations.get(product.id);
    const price = unitCost ? unitMoney.format(unitCost) : '<span class="stock-missing-price">Sin precio</span>';
    const consumed = barberFilter.value ? inventory.movements.filter((row) => row.productId === product.id && row.date === date && !row.cancelled && row.type === 'consumo' && row.barberId === barberFilter.value).reduce((sum, row) => sum + row.quantity, 0) : day.consumed;
    return `<tr><td>${escapeHtml(product.name)}<small>${escapeHtml(product.unit)}</small></td><td>${price}<small>por ${product.unit === 'unidades' ? 'unidad' : escapeHtml(product.unit)}</small></td><td class="${current === 0 ? 'stock-empty-value' : 'stock-available'}">${integer.format(current)}<small>${escapeHtml(product.unit)}${current === 0 ? ' · Sin stock' : ''}</small></td><td>${integer.format(day.incoming)}<small>${escapeHtml(product.unit)}</small></td><td>${integer.format(consumed)}<small>${escapeHtml(product.unit)}</small></td><td>${money.format(barberFilter.value ? inventory.movements.filter((row) => row.productId === product.id && row.date === date && !row.cancelled && row.type === 'consumo' && row.barberId === barberFilter.value).reduce((sum, row) => sum + movementCost(row), 0) : valuation.consumed)}</td></tr>`;
  }).join('');
  const saleProducts = active.filter((product) => product.saleEnabled);
  const supplies = active.filter((product) => !product.saleEnabled);
  document.getElementById('stockRows').innerHTML = (saleProducts.length ? '<tr class="stock-group"><th colspan="6">Productos de venta</th></tr>' + stockRows(saleProducts) : '') + (supplies.length ? '<tr class="stock-group"><th colspan="6">Insumos de barbería</th></tr>' + stockRows(supplies) : '');
  document.getElementById('stockEmpty').hidden = active.length > 0;
  const rows = inventory.movements.filter((row) => row.date === date && (!barberFilter.value || row.type === 'entrada' || row.barberId === barberFilter.value)).slice().reverse();
  document.getElementById('stockMovementRows').innerHTML = rows.map((row) => {
    const product = products.get(row.productId);
      return `<tr${row.cancelled ? ' class="stock-cancelled"' : ''}><td>${escapeHtml(row.time)}</td><td>${escapeHtml(product.name)}</td><td>${row.type === 'entrada' ? 'Reposición' : 'Consumo'}${row.source === 'sale' ? ' · Venta' : ''}${row.cancelled ? ' · Anulado' : ''}</td><td>${integer.format(row.quantity)} ${escapeHtml(product.unit)}</td><td>${escapeHtml(row.barberId ? knownBarbers.get(row.barberId) || row.barberName : 'Sin asignar')}</td><td>${escapeHtml(row.notes || '—')}</td><td>${money.format(movementCost(row))}</td><td><button class="stock-action" type="button" data-stock-toggle="${escapeHtml(row.id)}" ${inventoryReadError || locked || row.source === 'sale' ? 'disabled' : ''}>${row.source === 'sale' ? 'Desde venta' : row.cancelled ? 'Restaurar' : 'Anular'}</button></td></tr>`;
  }).join('');
  document.getElementById('stockMovementCount').textContent = String(rows.filter((row) => !row.cancelled).length);
  document.getElementById('stockMovementsEmpty').hidden = rows.length > 0;
   document.getElementById('stockConfigList').innerHTML = inventory.products.map((product) => {
      const unitCost = inventoryUnitCost(product);
      const stockDetail = product.stockEnabled ? `Stock ${integer.format(inventorySummary(product, inventory.movements, today()).stock)} ${escapeHtml(product.unit)} · ${unitCost ? `${unitMoney.format(unitCost)} por ${product.unit === 'unidades' ? 'unidad' : escapeHtml(product.unit)}` : 'Sin precio'}` : '';
      const saleDetail = product.saleEnabled ? `Precio de venta ${money.format(product.salePrice)}` : '';
      const type = productUseLabel(product);
      return `<div class="config-item${product.active ? '' : ' stock-archived'}"><span>${escapeHtml(product.name)}<small><strong class="stock-product-type">${type}</strong> · ${[saleDetail, stockDetail].filter(Boolean).join(' · ')}${product.active ? '' : ' · Archivado'}</small></span><span class="config-actions"><button type="button" data-stock-edit="${escapeHtml(product.id)}" ${inventoryReadError || locked ? 'disabled' : ''}>Editar</button><button type="button" data-stock-archive="${escapeHtml(product.id)}" ${inventoryReadError || locked ? 'disabled' : ''}>${product.active ? 'Archivar' : 'Activar'}</button></span></div>`;
    }).join('') || '<p class="stock-hint">Todavía no agregaste productos.</p>';
  const editing = inventory.products.find((product) => product.id === stockProductForm.elements.stockId.value);
  document.getElementById('stockInitialDate').textContent = editing?.stockEnabled ? `Cantidad inicial registrada el ${editing.startDate}. Los cambios se hacen con reposiciones o consumos.` : `Cantidad inicial al ${date || 'día seleccionado'}, expresada en la unidad elegida.`;
}

function initInventory(load = true) {
  if (load) loadInventory();
  updateProductFields();
  populateSelectors();
  stockProductForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const fields = stockProductForm.elements;
    fields.salePrice.disabled = !fields.saleEnabled.checked;
    updateStockProductCostPreview();
    if (typeof dailyOperationsLocked === 'function' && dailyOperationsLocked()) return;
    if (!stockProductForm.reportValidity()) return;
    const existing = inventory.products.find((product) => product.id === fields.stockId.value);
    if (!existing) fields.stockUnit.value = 'unidades';
    if (!existing?.stockEnabled && (!workday.value || workday.value > today())) return stockMessage('Elegí una jornada de hoy o anterior para registrar el stock inicial.', true);
    if (fields.stockId.value && !existing) return stockMessage('El producto ya no está disponible. Cancelá la edición y revisá el listado.', true);
    if (existing && stockEditingSnapshot && JSON.stringify(existing) !== stockEditingSnapshot) return stockMessage('El producto cambió en otra pestaña. Cancelá la edición y volvé a abrirlo antes de guardar.', true);
    const saleEnabled = fields.saleEnabled.checked;
    const supplyEnabled = fields.supplyEnabled.checked;
    const stockEnabled = true;
    if (existing?.saleEnabled && !saleEnabled && sales.some((sale) => sale.productId === existing.id || !sale.productId && sale.product === existing.name)) return stockMessage('No podés apagar venta porque tiene ventas.', true);
    fields.stockUnit.value = existing?.stockEnabled ? existing.unit : 'unidades';
    fields.saleEnabled.setCustomValidity(!saleEnabled && !supplyEnabled ? 'Elegí Venta, Insumo o ambas opciones.' : saleEnabled && fields.stockUnit.value !== 'unidades' ? 'El descuento automático solo está disponible para unidades; no convertimos ml ni g históricos.' : '');
    const unitCost = Number(fields.unitCost.value);
    const salePrice = parseAmount(fields.salePrice.value);
    fields.unitCost.setCustomValidity(Number.isFinite(unitCost) && unitCost > 0 && unitCost <= 1000000000 ? '' : 'El costo por unidad debe ser mayor que cero y de hasta 1.000.000.000.');
    fields.salePrice.setCustomValidity(!saleEnabled || Number.isSafeInteger(salePrice) && salePrice > 0 ? '' : 'El precio de venta debe ser mayor que cero.');
    if (!stockProductForm.reportValidity()) return;
    const product = {
      id: existing?.id || crypto.randomUUID(), name: fields.stockName.value.trim(),
      saleEnabled, supplyEnabled, stockEnabled, active: existing?.active ?? true,
      ...(saleEnabled ? { salePrice } : {}),
      unit: existing?.unit || 'unidades', initialStock: existing?.stockEnabled ? existing.initialStock : Number(fields.initialStock.value), ...(existing?.stockEnabled ? existing.initialUnitCost === undefined ? {} : { initialUnitCost: existing.initialUnitCost } : { initialUnitCost: unitCost }), unitCost, startDate: existing?.startDate || workday.value,
    };
    const priceChanged = existing?.stockEnabled && inventoryUnitCost(existing) !== inventoryUnitCost(product);
    const lastDate = inventory.movements.reduce((date, row) => row.productId === existing?.id && row.date > date ? row.date : date, existing?.startDate || workday.value);
    const historicalCosts = priceChanged ? inventoryValuation(existing, inventory.movements, lastDate).costs : null;
    const movements = priceChanged ? inventory.movements.map((row) => row.productId === existing.id && row.cost === undefined ? { ...row, ...(row.type === 'entrada' ? { unitCost: row.unitCost ?? inventoryUnitCost(existing) } : {}), cost: historicalCosts.get(row.id) ?? row.quantity * inventoryUnitCost(existing) } : row) : inventory.movements;
    if (priceChanged) product.initialUnitCost = existing.initialUnitCost ?? inventoryUnitCost(existing);
    const products = existing ? inventory.products.map((item) => item.id === existing.id ? product : item) : [...inventory.products, product];
    if (!saveInventory({ ...inventory, products, movements })) return;
    resetStockProductForm();
    renderInventory();
    stockMessage(existing ? 'Producto actualizado.' : 'Producto agregado.');
  });
  document.getElementById('cancelStockProduct').addEventListener('click', () => { resetStockProductForm(); renderInventory(); });
  document.getElementById('stockConfigList').addEventListener('click', (event) => {
    if (typeof dailyOperationsLocked === 'function' && dailyOperationsLocked()) return;
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
    stockProductForm.elements.saleEnabled.checked = product.saleEnabled;
    stockProductForm.elements.supplyEnabled.checked = productIsSupply(product);
    stockProductForm.elements.stockEnabled.checked = true;
    stockProductForm.elements.salePrice.value = formatAmount(product.salePrice || '');
    stockProductForm.elements.stockUnit.value = product.unit || 'unidades';
    stockProductForm.elements.initialStock.value = product.initialStock ?? 0;
    stockProductForm.elements.initialStock.disabled = true;
    stockProductForm.elements.unitCost.value = String(inventoryUnitCost(product));
    document.getElementById('saveStockProduct').textContent = 'Guardar producto';
    document.getElementById('cancelStockProduct').hidden = false;
    renderInventory();
    updateStockProductCostPreview();
    updateProductFields();
    stockProductForm.elements.stockName.focus();
  });
  ['input', 'change'].forEach((type) => stockProductForm.addEventListener(type, (event) => {
    if (['saleEnabled', 'supplyEnabled', 'stockEnabled'].includes(event.target.name)) updateProductFields();
    if (['unitCost', 'stockUnit'].includes(event.target.name)) updateStockProductCostPreview();
  }));
  stockMovementForm.addEventListener('change', updateStockMovementConversion);
  document.getElementById('stockBarberFilter').addEventListener('change', renderInventory);
  stockMovementForm.elements.stockQuantity.addEventListener('input', () => {
    stockMovementForm.elements.stockQuantity.setCustomValidity('');
    updateStockMovementConversion();
  });
  stockMovementForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (typeof dailyOperationsLocked === 'function' && dailyOperationsLocked()) return;
    if (!stockMovementForm.reportValidity()) return;
    const fields = stockMovementForm.elements;
    const product = inventory.products.find((item) => item.id === fields.stockProduct.value && item.active && item.stockEnabled);
    if (!product || !workday.value || workday.value > today()) return stockMessage('Elegí un producto activo y una jornada de hoy o anterior.', true);
    const barber = fields.stockType.value === 'consumo' && fields.stockBarber.value ? config.barbers.find((item) => item.id === fields.stockBarber.value && item.active) : null;
    if (fields.stockType.value === 'consumo' && fields.stockBarber.value && !barber) return stockMessage('Elegí un barbero activo o dejá el consumo sin asignar.', true);
    const quantity = Number(fields.stockQuantity.value);
    fields.stockQuantity.setCustomValidity(Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= 1000000000 ? '' : 'La cantidad debe ser un entero entre 1 y 1.000.000.000.');
    if (!stockMovementForm.reportValidity()) return;
    const row = { id: crypto.randomUUID(), productId: product.id, date: workday.value, time: nowTime(), type: fields.stockType.value, quantity, notes: fields.stockNotes.value.trim(), cancelled: false, ...(barber ? { barberId: barber.id, barberName: barber.name } : {}) };
    row.cost = row.type === 'entrada' ? quantity * inventoryUnitCost(product) : inventoryMovementCost(product, inventory.movements, row);
    if (row.type === 'entrada') row.unitCost = inventoryUnitCost(product);
    if (!saveInventory({ ...inventory, movements: [...inventory.movements, row] })) return;
    fields.stockQuantity.value = '1';
    fields.stockNotes.value = '';
    renderInventory();
    stockMessage(`${row.type === 'entrada' ? 'Reposición registrada' : 'Consumo registrado'}: ${integer.format(row.quantity)} ${product.unit} de ${product.name}.`);
  });
  document.getElementById('stockMovementRows').addEventListener('click', (event) => {
    if (typeof dailyOperationsLocked === 'function' && dailyOperationsLocked()) return;
    const button = event.target.closest('[data-stock-toggle]');
    if (!button) return;
    const row = inventory.movements.find((item) => item.id === button.dataset.stockToggle);
    if (!row) return;
    if (row.source === 'sale') return stockMessage('Los consumos creados por ventas se ajustan desde la venta.', true);
    const movements = inventory.movements.map((item) => item.id === row.id ? { ...item, cancelled: !item.cancelled } : item);
    if (!saveInventory({ ...inventory, movements })) return;
    renderInventory();
    stockMessage(row.cancelled ? 'Movimiento restaurado; stock actualizado.' : 'Movimiento anulado; stock actualizado. Podés restaurarlo desde el historial.');
  });
  window.addEventListener('storage', (event) => {
    if (typeof stateApiEnabled !== 'undefined' && stateApiEnabled) return; // SQLite es la fuente de verdad; localStorage conserva solo el respaldo anterior.
    if (event.key !== inventoryStorageKey && event.key !== null) return;
    if (loadInventory()) stockMessage('Inventario actualizado desde otra pestaña.');
    renderInventory();
  });
}
