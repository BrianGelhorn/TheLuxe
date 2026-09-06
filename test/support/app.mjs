import assert from 'node:assert/strict';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { read, root, scripts, financialFixture } from './logic.mjs';

// Real HTML/forms/events, without network or layout. Only browser APIs absent in
// jsdom (modal presentation, scrolling, cloning) and nondeterminism are replaced.
export function createApp(t, { clean = true, storage = {}, now = '2026-09-03T12:00:00' } = {}) {
  const dom = new JSDOM(read('index.html'), { url: 'http://127.0.0.1:8000/', runScripts: 'outside-only' });
  t?.after(() => dom.window.close());
  const { window } = dom;
  const context = dom.getInternalVMContext();
  const errors = [];
  const alerts = [];
  const confirmations = [];
  let accepted = true;
  let sequence = 0;
  const NativeDate = window.Date;
  const timestamp = new NativeDate(now).getTime();
  window.Date = class extends NativeDate {
    constructor(...args) { super(...(args.length ? args : [timestamp])); }
    static now() { return timestamp; }
  };
  window.structuredClone = structuredClone;
  window.crypto.randomUUID = () => `test-id-${++sequence}`;
  window.alert = (message) => alerts.push(message);
  window.confirm = (message) => { confirmations.push(message); return accepted; };
  window.HTMLElement.prototype.scrollIntoView = function () {};
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new window.Event('close')); };
  window.addEventListener('error', (event) => { errors.push(event.error); event.preventDefault(); });
  for (const [key, value] of Object.entries(storage)) window.localStorage.setItem(key, value);
  const run = (source) => vm.runInContext(source, context);
  const checkErrors = () => { if (errors.length) throw errors.shift(); };
  for (const file of scripts) new vm.Script(read(file), { filename: fileURLToPath(new URL(file, root)) }).runInContext(context);
  checkErrors();
  const element = (id) => {
    const node = window.document.getElementById(id);
    assert.ok(node, `Missing element #${id}`);
    return node;
  };
  const query = (selector) => {
    const node = window.document.querySelector(selector);
    assert.ok(node, `Missing selector ${selector}`);
    return node;
  };
  const seed = (values) => {
    window.__seed = structuredClone(values);
    for (const key of Object.keys(values)) {
      assert.match(key, /^[a-zA-Z_$][\w$]*$/);
      run(`${key} = __seed.${key}`);
    }
    delete window.__seed;
  };
  const setForm = (id, values) => {
    const fields = element(id).elements;
    for (const [name, value] of Object.entries(values)) {
      assert.ok(fields.namedItem(name), `Missing field ${id}.${name}`);
      fields.namedItem(name).value = String(value);
    }
  };
  const emit = (target, type, init = {}) => {
    const node = typeof target === 'string' ? query(target) : target;
    const Event = /^(click|mousedown|mouseup)$/.test(type) ? window.MouseEvent : type.startsWith('key') ? window.KeyboardEvent : window.Event;
    const result = node.dispatchEvent(new Event(type, { bubbles: true, cancelable: true, ...init }));
    checkErrors();
    return result;
  };
  if (clean) {
    seed({ entries: [], sales: [], advances: [], expenses: [], transfers: [], openingAdjustments: [], barberPayments: {}, cashRegisters: { '2026-09-03': { opened: true, initialCash: 0, initialMp: 0 } } });
    run('render()');
  }
  return {
    window, run, element, query, seed, setForm, emit, alerts, confirmations,
    snapshot: (expression) => structuredClone(run(expression)),
    render: () => { run('render()'); checkErrors(); },
    money: (value) => run(`money.format(${Number(value)})`),
    confirm: (value) => { accepted = value; },
    click: (selector) => { query(selector).click(); checkErrors(); },
    input: (selector, value) => { const node = query(selector); node.value = String(value); emit(node, 'input'); },
    submit: (id, values) => {
      if (values) setForm(id, values);
      const node = element(id);
      if (!node.checkValidity()) return false;
      emit(node, 'submit');
      return true;
    },
    financialFixture: () => {
      const data = financialFixture();
      seed({ entries: data.cuts, sales: data.sales, advances: data.advances, expenses: data.expenses, transfers: data.transfers, cashRegisters: { '2026-09-03': { opened: true, initialCash: 1000, initialMp: 2000 } } });
      run('render()');
      return data;
    },
  };
}
