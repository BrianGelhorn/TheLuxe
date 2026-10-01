import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import './logic.js';

// ponytail: snapshot completo hasta 16 MiB; particionar por registros si el historial supera este techo.
const MAX_BODY = 16 * 1024 * 1024;
const stateKeys = ['config', 'entries', 'sales', 'advances', 'expenses', 'transfers', 'openingAdjustments', 'cashRegisters', 'barberPayments', 'inventory'];
const resources = {
  config: ['config'], cuts: ['entries'], sales: ['sales'], advances: ['advances'], expenses: ['expenses'],
  transfers: ['transfers'], 'opening-adjustments': ['openingAdjustments'], 'cash-registers': ['cashRegisters'],
  'barber-payments': ['barberPayments'], inventory: ['inventory'], services: ['config', 'services'],
  barbers: ['config', 'barbers'], 'expense-categories': ['config', 'expenseCategories'],
  commissions: ['config', 'commissionHistory'], products: ['inventory', 'products'], 'stock-movements': ['inventory', 'movements'],
};

const own = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const revision = (value) => Number.isSafeInteger(value) && value >= 0;
const jsonSafe = (value) => {
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'string') return value.length <= 1_000;
  if (typeof value === 'number') return Number.isFinite(value) && Math.abs(value) <= 1_000_000_000;
  if (Array.isArray(value)) return value.length <= 100_000 && value.every(jsonSafe);
  return value && typeof value === 'object' && Object.keys(value).every((key) => key.length <= 100) && Object.values(value).every(jsonSafe);
};
const text = (value, max = 120) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const optionalText = (value, max = 120) => value === undefined || (typeof value === 'string' && value.length <= max);
const amount = (value, required = true) => !required && value === undefined || typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1_000_000_000;
const positive = (value) => amount(value) && value > 0;
const date = (value, zero = false) => (zero && value === '0000-01-01') || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value);
const time = (value) => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
const id = (value) => text(value, 80);
const payment = (value, mixed = true) => ['Efectivo', 'Mercado Pago', ...(mixed ? ['Ambos'] : [])].includes(value);
const status = (value) => ['No pago', 'Efectivo', 'Mercado Pago', 'Mixto'].includes(value);
const unique = (list) => new Set(list.map((item) => item?.id)).size === list.length;
const base = (row) => row && typeof row === 'object' && !Array.isArray(row) && id(row.id) && date(row.date) && time(row.time);
const split = (row) => amount(row.cashAmount, false) && amount(row.mpAmount, false);
const cut = (row) => base(row) && text(row.barber, 100) && text(row.service, 100) && positive(row.amount) && payment(row.payment) && amount(row.tip, false) && split(row)
  && (row.payment !== 'Ambos' || amount(row.cashAmount) && amount(row.mpAmount) && row.cashAmount + row.mpAmount === row.amount + (row.tip || 0))
  && amount(row.commissionRate, false) && (row.commissionRate === undefined || row.commissionRate <= 100) && amount(row.commissionAmount, false) && optionalText(row.notes, 120);
const sale = (row) => base(row) && id(row.productId) && text(row.product, 100) && Number.isSafeInteger(row.quantity) && row.quantity > 0 && row.quantity <= 1_000_000_000
  && positive(row.unitPrice) && row.total === row.quantity * row.unitPrice && payment(row.payment) && split(row)
  && (row.payment !== 'Ambos' || amount(row.cashAmount) && amount(row.mpAmount) && row.cashAmount + row.mpAmount === row.total);
const advance = (row) => base(row) && text(row.barber, 100) && positive(row.amount) && payment(row.payment, false) && optionalText(row.reason, 500);
const expense = (row) => base(row) && positive(row.amount) && payment(row.payment, false) && optionalText(row.reason, 500) && optionalText(row.category, 80);
const transfer = (row) => base(row) && payment(row.from, false) && payment(row.to, false) && row.from !== row.to && positive(row.amount) && optionalText(row.description, 120);
const adjustment = (row) => base(row) && payment(row.medium, false) && amount(row.previous) && amount(row.current) && text(row.description, 120);
const catalog = (list, priced = false, barber = false) => Array.isArray(list) && unique(list) && list.every((item) => item && typeof item === 'object' && id(item.id) && text(item.name, 80)
  && (!priced || positive(item.price)) && (!barber || typeof item.active === 'boolean'));
const config = (value) => value && typeof value === 'object' && !Array.isArray(value) && catalog(value.services, true) && catalog(value.barbers, false, true)
  && catalog(value.expenseCategories) && amount(value.commission) && value.commission <= 100 && (value.commissionHistory === undefined || Array.isArray(value.commissionHistory) && value.commissionHistory.every((item) => item && typeof item === 'object' && date(item.date, true) && amount(item.rate) && item.rate <= 100));
const registers = (value) => value && typeof value === 'object' && !Array.isArray(value) && Object.entries(value).every(([key, row]) => date(key) && row && typeof row === 'object' && !Array.isArray(row)
  && ['initialCash', 'initialMp', 'realCash', 'realMp', 'withdrawal', 'withdrawalMp', 'commissionRate'].every((field) => amount(row[field], false)) && (row.commissionRate === undefined || row.commissionRate <= 100)
  && (row.initialCash !== undefined || row.initialMp !== undefined || Object.keys(row).length === 1 && row.commissionRate !== undefined) && (row.opened === undefined || typeof row.opened === 'boolean') && (row.autoOpened === undefined || typeof row.autoOpened === 'boolean')
  && (row.inheritedFrom === undefined || date(row.inheritedFrom)) && ['openedAt', 'updatedAt', 'closedAt'].every((field) => row[field] === undefined || typeof row[field] === 'string' && row[field].length <= 40));
const draftAmount = (value) => value === '' || amount(value);
const payments = (value) => value && typeof value === 'object' && !Array.isArray(value) && Object.entries(value).every(([day, rows]) => date(day) && rows && typeof rows === 'object' && !Array.isArray(rows)
  && Object.entries(rows).every(([barber, row]) => text(barber, 100) && (typeof row === 'string' ? status(row) : row && typeof row === 'object' && status(row.status || 'No pago') && draftAmount(row.cashAmount ?? '') && draftAmount(row.mpAmount ?? '') && (row.paidAmount === undefined || Number.isSafeInteger(row.paidAmount) && amount(row.paidAmount)))));
const saleStockConsistent = (state) => {
  const products = new Map(state.inventory.products.map((product) => [product.id, product]));
  const sales = new Map(state.sales.map((item) => [item.id, item]));
  const active = state.inventory.movements.filter((row) => row.source === 'sale' && !row.cancelled);
  return state.sales.every((item) => {
    const product = products.get(item.productId);
    const movements = active.filter((row) => row.sourceId === item.id);
    // ponytail: ventas anteriores a activar stock no tienen movimiento; exigir snapshot del stock al vender para validarlas estrictamente.
    return product && movements.length <= 1 && (movements.length === 0
      || movements[0].productId === item.productId && movements[0].date === item.date && movements[0].quantity === item.quantity);
  }) && active.every((row) => sales.has(row.sourceId));
};
const validState = (state) => own(state, stateKeys) && jsonSafe(state) && config(state.config) && Array.isArray(state.entries) && unique(state.entries) && state.entries.every(cut)
  && Array.isArray(state.sales) && unique(state.sales) && state.sales.every(sale) && Array.isArray(state.advances) && unique(state.advances) && state.advances.every(advance)
  && Array.isArray(state.expenses) && unique(state.expenses) && state.expenses.every(expense) && Array.isArray(state.transfers) && unique(state.transfers) && state.transfers.every(transfer)
  && Array.isArray(state.openingAdjustments) && unique(state.openingAdjustments) && state.openingAdjustments.every(adjustment) && registers(state.cashRegisters) && payments(state.barberPayments)
  && !globalThis.TheLuxeLogic.inventoryError(state.inventory) && saleStockConsistent(state);
const valueAt = (state, path) => path.reduce((value, key) => value?.[key], state);
const setAt = (state, path, value) => {
  let target = state;
  for (const key of path.slice(0, -1)) target = target[key];
  target[path.at(-1)] = value;
};
const validResource = (path, data) => ({ entries: () => Array.isArray(data) && unique(data) && data.every(cut), sales: () => Array.isArray(data) && unique(data) && data.every(sale), advances: () => Array.isArray(data) && unique(data) && data.every(advance), expenses: () => Array.isArray(data) && unique(data) && data.every(expense), transfers: () => Array.isArray(data) && unique(data) && data.every(transfer), openingAdjustments: () => Array.isArray(data) && unique(data) && data.every(adjustment), cashRegisters: () => registers(data), barberPayments: () => payments(data), inventory: () => data && typeof data === 'object' && !Array.isArray(data), config: () => config(data), services: () => catalog(data, true), barbers: () => catalog(data, false, true), expenseCategories: () => catalog(data), commissionHistory: () => Array.isArray(data) && data.every((item) => item && typeof item === 'object' && date(item.date, true) && amount(item.rate) && item.rate <= 100), products: () => Array.isArray(data), movements: () => Array.isArray(data) })[path.at(-1)]();

function response(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function body(req) {
  return new Promise((resolve, reject) => {
    if (Number(req.headers['content-length']) > MAX_BODY) { req.resume(); return reject(new Error('Payload too large')); }
    let size = 0;
    let tooLarge = false;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) tooLarge = true;
      else chunks.push(chunk);
    });
    req.on('end', () => {
      if (tooLarge) return reject(new Error('Payload too large'));
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new Error('Malformed JSON')); }
    });
    req.on('error', reject);
  });
}

export function createApi({ databasePath } = {}) {
  const db = new DatabaseSync(databasePath || process.env.DB_PATH || '/data/theluxe.sqlite');
  db.exec('CREATE TABLE IF NOT EXISTS api_state (id INTEGER PRIMARY KEY CHECK (id = 1), revision INTEGER NOT NULL, state TEXT NOT NULL)');
  const select = db.prepare('SELECT revision, state FROM api_state WHERE id = 1');
  const insert = db.prepare('INSERT INTO api_state (id, revision, state) VALUES (1, 1, ?)');
  const update = db.prepare('UPDATE api_state SET revision = revision + 1, state = ? WHERE id = 1 AND revision = ?');
  const read = () => {
    const row = select.get();
    if (!row) return null;
    try {
      const state = JSON.parse(row.state);
      if (!validState(state)) throw new Error('Stored state is invalid');
      return { revision: row.revision, state };
    } catch { throw new Error('Stored state is corrupt'); }
  };
  const replace = (expected, state) => {
    if (!validState(state)) return 'invalid';
    const current = read();
    if (!current) {
      if (expected !== 0) return 'conflict';
      try { insert.run(JSON.stringify(state)); return 1; } catch { return 'conflict'; }
    }
    if (current.revision !== expected || update.run(JSON.stringify(state), expected).changes !== 1) return 'conflict';
    return expected + 1;
  };
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/api/health') { read(); return response(res, 200, { ok: true }); }
      if (!url.pathname.startsWith('/api/')) return response(res, 404, { error: 'Not found' });
      if (!['GET', 'PUT'].includes(req.method)) return response(res, 405, { error: 'Method not allowed' });
      if (req.method === 'PUT') {
        if (req.headers.origin && req.headers.origin !== 'http://127.0.0.1:8000') return response(res, 403, { error: 'Forbidden origin' });
        if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) return response(res, 415, { error: 'Content-Type must be application/json' });
      }
      if (url.pathname === '/api/state') {
        if (req.method === 'GET') {
          const current = read();
          return response(res, 200, current || { revision: 0, state: null });
        }
        const payload = await body(req);
        if (!own(payload, ['revision', 'state']) || !revision(payload.revision) || !validState(payload.state)) return response(res, 400, { error: 'Invalid state payload' });
        const result = replace(payload.revision, payload.state);
        return result === 'invalid' ? response(res, 400, { error: 'Invalid state payload' }) : result === 'conflict'
          ? response(res, 409, { error: 'Revision conflict' }) : response(res, 200, { revision: result });
      }
      const name = url.pathname.slice(5);
      const path = resources[name];
      if (!path) return response(res, 404, { error: 'Not found' });
      const current = read();
      if (req.method === 'GET') return response(res, 200, { revision: current?.revision || 0, data: current ? valueAt(current.state, path) : null });
      const payload = await body(req);
      if (!own(payload, ['revision', 'data']) || !revision(payload.revision) || !jsonSafe(payload.data) || !validResource(path, payload.data)) return response(res, 400, { error: 'Invalid resource payload' });
      if (!current) return response(res, 409, { error: 'State is not initialized' });
      const next = structuredClone(current.state);
      setAt(next, path, payload.data);
      if (!validState(next)) return response(res, 400, { error: 'Invalid resource data' });
      const result = replace(payload.revision, next);
      return result === 'conflict' ? response(res, 409, { error: 'Revision conflict' }) : response(res, 200, { revision: result });
    } catch (error) {
      const clientError = ['Payload too large', 'Malformed JSON'].includes(error.message);
      return response(res, error.message === 'Payload too large' ? 413 : clientError ? 400 : 500, { error: clientError || error.message === 'Stored state is corrupt' ? error.message : 'Request failed' });
    }
  });
  server.on('close', () => db.close());
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createApi({ databasePath: process.env.DB_PATH || '/data/theluxe.sqlite' }).listen(3000, '0.0.0.0');
}
