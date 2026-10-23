import { isDeepStrictEqual } from 'node:util';

const lists = [
  ['entries', 'Corte'], ['sales', 'Venta'], ['advances', 'Adelanto'], ['expenses', 'Gasto'],
  ['transfers', 'Transferencia'], ['openingAdjustments', 'Ajuste de apertura'],
  ['config.services', 'Servicio'], ['config.barbers', 'Barbero'], ['config.expenseCategories', 'Categoría'],
  ['inventory.products', 'Producto'], ['inventory.movements', 'Movimiento de stock'],
];
const at = (state, path) => path.split('.').reduce((value, key) => value[key], state);
const own = (object, key) => Object.hasOwn(object, key);
const set = (object, key, value) => Object.defineProperty(object, key, { value, enumerable: true, configurable: true, writable: true });
const keyFor = (path, id) => JSON.stringify([path, id]);
const amount = row => row.total ?? row.amount ?? row.paidAmount ?? row.salePrice ?? row.price ?? null;
const signature = (path, row) => {
  const fields = path === 'entries' ? ['date', 'time', 'barber', 'service']
    : path === 'sales' ? ['date', 'time', 'productId', 'quantity', 'total']
      : ['advances', 'expenses', 'transfers'].includes(path) ? ['date', 'time', 'barber', 'amount', 'payment', 'reason', 'from', 'to']
        : path.startsWith('config.') || path === 'inventory.products' ? ['name']
          : path === 'inventory.movements' && row.source === 'sale' ? ['source', 'sourceId', 'cancelled'] : null;
  return fields ? JSON.stringify(fields.map(field => row[field] ?? null)) : null;
};

export function recoveryPlan(current, pending) {
  const items = [];
  const warnings = [];
  function item(path, id, label, incoming, saved) {
    if (saved !== undefined && isDeepStrictEqual(saved, incoming)) return;
    const row = { key: keyFor(path, id), path, id, label, incoming, current: saved ?? null,
      status: saved === undefined ? 'missing' : 'conflict', date: incoming.date || '',
      detail: incoming.barber || incoming.product || incoming.name || incoming.reason || incoming.description || '',
      amount: amount(incoming), requires: [], reason: saved === undefined ? 'Solo en la copia' : 'Se conserva lo guardado' };
    items.push(row);
    return row;
  }
  for (const [path, label] of lists) {
    const saved = at(current, path);
    const byId = new Map(saved.map(row => [row.id, row]));
    const incomingById = new Map(at(pending, path).map(row => [row.id, row]));
    const signatures = new Map();
    for (const row of saved) {
      const sign = signature(path, row);
      if (!signatures.has(sign)) signatures.set(sign, []);
      signatures.get(sign).push(row);
    }
    for (const incoming of incomingById.values()) {
      const row = item(path, incoming.id, label, incoming, byId.get(incoming.id));
      // Two legitimate operations can share barber and time. A record already
      // recovered from this very copy must not block the other operation.
      const match = signatures.get(signature(path, incoming))?.find(saved => !isDeepStrictEqual(incomingById.get(saved.id), saved));
      if (row?.status === 'missing' && match && signature(path, incoming) !== null) {
        row.status = 'conflict'; row.current = match; row.reason = 'Posible duplicado: revisar lo cargado a mano';
      }
    }
  }
  for (const [date, incoming] of Object.entries(pending.cashRegisters)) {
    const row = item('cashRegisters', date, 'Caja', incoming, own(current.cashRegisters, date) ? current.cashRegisters[date] : undefined);
    if (row) { row.date = date; row.detail = 'Apertura y cierre'; }
  }
  for (const [date, payments] of Object.entries(pending.barberPayments)) {
    for (const [barber, incoming] of Object.entries(payments)) {
      const saved = current.barberPayments[date];
      const value = typeof incoming === 'string' ? { status: incoming } : incoming;
      const row = item('barberPayments', JSON.stringify([date, barber]), 'Pago a barbero', value,
        saved && own(saved, barber) ? (typeof saved[barber] === 'string' ? { status: saved[barber] } : saved[barber]) : undefined);
      if (row) { row.date = date; row.detail = barber; row.payment = { date, barber }; }
    }
  }
  const byKey = new Map(items.map(row => [row.key, row]));
  function requireRow(row, path, id, exists) {
    if (exists) return;
    const dependency = byKey.get(keyFor(path, id));
    if (dependency?.status === 'missing') row.requires.push(dependency.key);
    else { row.status = 'conflict'; row.reason = 'Falta un dato relacionado en la base; requiere revisión'; }
  }
  for (const row of items.filter(row => row.status === 'missing')) {
    const incoming = row.incoming;
    if (['entries', 'advances', 'barberPayments'].includes(row.path)) {
      const name = row.path === 'barberPayments' ? row.detail : incoming.barber;
      const barber = pending.config.barbers.find(barber => barber.name === name);
      requireRow(row, 'config.barbers', barber?.id, current.config.barbers.some(barber => barber.name === name && barber.active));
    }
    if (['entries', 'sales', 'advances', 'expenses', 'transfers', 'openingAdjustments', 'barberPayments'].includes(row.path)) {
      requireRow(row, 'cashRegisters', row.date, Boolean(current.cashRegisters[row.date]));
    }
    if (['sales', 'inventory.movements'].includes(row.path)) {
      requireRow(row, 'inventory.products', incoming.productId, current.inventory.products.some(product => product.id === incoming.productId));
    }
    if (row.path === 'inventory.movements' && incoming.source === 'sale' && !incoming.cancelled) {
      requireRow(row, 'sales', incoming.sourceId, current.sales.some(sale => sale.id === incoming.sourceId));
    }
    if (row.path === 'sales') {
      for (const movement of pending.inventory.movements.filter(movement => movement.source === 'sale' && !movement.cancelled && movement.sourceId === incoming.id)) {
        requireRow(row, 'inventory.movements', movement.id, current.inventory.movements.some(saved => saved.id === movement.id && isDeepStrictEqual(saved, movement)));
      }
    }
    if (row.path === 'barberPayments') {
      for (const related of items.filter(related => ['entries', 'advances'].includes(related.path) && related.date === row.date && related.incoming.barber === row.detail)) {
        if (related.status === 'missing') row.requires.push(related.key);
        else { row.status = 'conflict'; row.reason = 'Hay operaciones del barbero con diferencias; revisar el pago'; }
      }
    }
  }
  // Propagate a blocked dependency through related sales, stock and payments.
  let changed;
  do {
    changed = false;
    for (const row of items.filter(row => row.status === 'missing')) {
      if (row.requires.some(key => byKey.get(key)?.status !== 'missing')) {
        row.status = 'conflict'; row.reason = 'Un dato relacionado necesita revisión'; changed = true;
      }
    }
  } while (changed);
  if (current.config.commission !== pending.config.commission || !isDeepStrictEqual(current.config.commissionHistory, pending.config.commissionHistory)) {
    warnings.push('La comisión general de la copia difiere. Se conserva la configuración guardada.');
  }
  if (items.some(row => row.path === 'cashRegisters' && row.status === 'conflict')) {
    warnings.push('Hay aperturas o cierres distintos. Se mantienen los saldos guardados; revisá las diferencias de caja después de recuperar las operaciones.');
  }
  return { items, warnings, recoverable: items.filter(row => row.status === 'missing').length, conflicts: items.filter(row => row.status === 'conflict').length };
}

export function mergeRecovery(current, plan, selected) {
  if (!Array.isArray(selected) || !selected.length || new Set(selected).size !== selected.length) throw new Error('Selección inválida');
  const allowed = new Map(plan.items.filter(row => row.status === 'missing').map(row => [row.key, row]));
  const selection = new Set(selected);
  if (selected.some(key => !allowed.has(key))) throw new Error('La selección incluye registros que cambiaron o ya están guardados');
  if (selected.some(key => allowed.get(key).requires.some(required => !selection.has(required)))) throw new Error('Seleccioná también los datos relacionados');
  const state = structuredClone(current);
  const added = {};
  for (const key of selected) {
    const row = allowed.get(key);
    const value = structuredClone(row.incoming);
    if (row.path === 'cashRegisters') set(state.cashRegisters, row.id, value);
    else if (row.path === 'barberPayments') {
      const { date, barber } = row.payment;
      if (!own(state.barberPayments, date)) set(state.barberPayments, date, {});
      set(state.barberPayments[date], barber, value);
    } else at(state, row.path).push(value);
    added[row.label] = (added[row.label] || 0) + 1;
  }
  return { state, added };
}
