import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

export const root = new URL('../../', import.meta.url);
export const read = (file) => readFileSync(new URL(file, root), 'utf8');
export const scripts = ['logic.js', 'reports.js', 'dialogs.js', 'inventory.js', 'script.js'];

export function loadLogic() {
  const context = {};
  vm.runInNewContext(read('logic.js'), context, { filename: fileURLToPath(new URL('logic.js', root)) });
  return context.TheLuxeLogic;
}

export function financialFixture() {
  return {
    cuts: [
      { id: 'a', date: '2026-09-03', time: '10:00', barber: 'Mateo', service: 'Barba', payment: 'Efectivo', amount: 1000, tip: 200, commissionAmount: 500, commissionRate: 50 },
      { id: 'b', date: '2026-09-03', time: '11:00', barber: 'Lucas', service: 'Barba', payment: 'Mercado Pago', amount: 2000, tip: 0, commissionAmount: 1000, commissionRate: 50 },
      { id: 'c', date: '2026-09-03', time: '12:00', barber: 'Mateo', service: 'Barba', payment: 'Ambos', amount: 900, tip: 100, cashAmount: 600, mpAmount: 400, commissionAmount: 450, commissionRate: 50 },
    ],
    sales: [{ id: 's1', date: '2026-09-03', time: '10:00', product: 'Pomada', quantity: 1, unitPrice: 500, payment: 'Efectivo', total: 500 }, { id: 's2', date: '2026-09-03', time: '11:00', product: 'Shampoo', quantity: 1, unitPrice: 700, payment: 'Mercado Pago', total: 700 }],
    advances: [{ id: 'a1', date: '2026-09-03', time: '09:00', barber: 'Mateo', payment: 'Efectivo', amount: 300, reason: 'Adelanto' }, { id: 'a2', date: '2026-09-03', time: '09:30', barber: 'Lucas', payment: 'Mercado Pago', amount: 100, reason: 'Adelanto' }],
    expenses: [{ id: 'e1', date: '2026-09-03', time: '09:00', payment: 'Efectivo', amount: 50, reason: 'Limpieza' }, { id: 'e2', date: '2026-09-03', time: '09:30', payment: 'Mercado Pago', amount: 200, reason: 'Alquiler' }],
    transfers: [{ id: 't1', date: '2026-09-03', time: '13:00', from: 'Efectivo', to: 'Mercado Pago', amount: 100, description: 'Cambio' }],
  };
}
