import assert from 'node:assert/strict';
import test from 'node:test';
import { loadLogic } from '../support/logic.mjs';

const logic = loadLogic();
const product = (changes = {}) => ({ id: 'navajas', name: 'Navajas', unit: 'unidades', initialStock: 10, startDate: '2026-09-01', active: true, ...changes });
const movement = (changes = {}) => ({ id: 'mov-1', productId: 'navajas', date: '2026-09-03', time: '10:00', type: 'entrada', quantity: 1, notes: '', cancelled: false, ...changes });
const fixture = () => ({ version: 1, products: [product()], movements: [movement()] });
const summary = (item, rows, date) => structuredClone(logic.inventorySummary(item, rows, date));

// Every field starts from a newly validated fixture, so an unrelated error cannot mask it.
function checkField(collection, field, value, valid) {
  const state = fixture();
  assert.equal(logic.inventoryError(state), '');
  state[collection][0][field] = value;
  if (collection === 'products' && field === 'id') state.movements[0].productId = value;
  if (valid) assert.equal(logic.inventoryError(state), '');
  else assert.match(logic.inventoryError(state), collection === 'products' ? /stock inicial del producto/ : /cantidad del movimiento/);
}

test('STK-001 - Acepta inventario vacio de version uno', () => {
  assert.equal(logic.inventoryError({ version: 1, products: [], movements: [] }), '');
});

test('STK-002 - Acepta producto y movimiento completos', () => {
  assert.equal(logic.inventoryError(fixture()), '');
});

test('STK-003 - Rechaza estado nulo', () => {
  assert.match(logic.inventoryError(null), /formato/);
});

test('STK-004 - Rechaza estado ausente', () => {
  assert.match(logic.inventoryError(undefined), /formato/);
});

test('STK-005 - Rechaza objeto sin estructura', () => {
  assert.match(logic.inventoryError({}), /formato/);
});

test('STK-006 - Rechaza version futura sin otros errores', () => {
  assert.match(logic.inventoryError({ ...fixture(), version: 2 }), /formato/);
});

test('STK-007 - Rechaza version textual sin coercion', () => {
  assert.match(logic.inventoryError({ ...fixture(), version: '1' }), /formato/);
});

test('STK-008 - Rechaza version ausente', () => {
  const state = fixture();
  delete state.version;
  assert.match(logic.inventoryError(state), /formato/);
});

test('STK-009 - Rechaza productos que no son una lista', () => {
  assert.match(logic.inventoryError({ ...fixture(), products: {} }), /formato/);
});

test('STK-010 - Rechaza movimientos que no son una lista', () => {
  assert.match(logic.inventoryError({ ...fixture(), movements: {} }), /formato/);
});

test('STK-011 - Rechaza producto nulo', () => {
  assert.match(logic.inventoryError({ version: 1, products: [null], movements: [] }), /producto/);
});

test('STK-012 - Rechaza movimiento nulo', () => {
  assert.match(logic.inventoryError({ ...fixture(), movements: [null] }), /movimiento/);
});

test('STK-013 - Acepta ID de producto de un caracter', () => {
  assert.equal(logic.inventoryError({ version: 1, products: [product({ id: 'a' })], movements: [] }), '');
});

test('STK-014 - Acepta ID de producto de ochenta caracteres', () => {
  const id = 'a'.repeat(80);
  assert.equal(logic.inventoryError({ version: 1, products: [product({ id })], movements: [movement({ productId: id })] }), '');
});

test('STK-015 - Rechaza ID de producto vacio', () => {
  checkField('products', 'id', '', false);
});

test('STK-016 - Rechaza ID de producto solo con espacios', () => {
  checkField('products', 'id', ' \t ', false);
});

test('STK-017 - Rechaza ID de producto de ochenta y un caracteres', () => {
  checkField('products', 'id', 'a'.repeat(81), false);
});

test('STK-018 - Rechaza ID de producto numerico', () => {
  checkField('products', 'id', 123, false);
});

test('STK-019 - Rechaza ID de producto ausente', () => {
  checkField('products', 'id', undefined, false);
});

test('STK-020 - Rechaza ID duplicado aunque los nombres difieran', () => {
  const state = fixture();
  state.products.push(product({ name: 'Guantes' }));
  assert.match(logic.inventoryError(state), /producto/);
});

test('STK-021 - Acepta nombre de un caracter', () => {
  checkField('products', 'name', 'N', true);
});

test('STK-022 - Acepta nombre de ochenta caracteres', () => {
  checkField('products', 'name', 'N'.repeat(80), true);
});

test('STK-023 - Rechaza nombre vacio', () => {
  checkField('products', 'name', '', false);
});

test('STK-024 - Rechaza nombre solo con espacios', () => {
  checkField('products', 'name', ' \t\n ', false);
});

test('STK-025 - Rechaza nombre de ochenta y un caracteres', () => {
  checkField('products', 'name', 'N'.repeat(81), false);
});

test('STK-026 - Rechaza nombre no textual', () => {
  checkField('products', 'name', 123, false);
});

test('STK-027 - Rechaza nombre ausente', () => {
  checkField('products', 'name', undefined, false);
});

test('STK-028 - Rechaza nombre duplicado exacto', () => {
  const state = fixture();
  state.products.push(product({ id: 'otro' }));
  assert.match(logic.inventoryError(state), /Ya existe/);
});

test('STK-029 - Rechaza nombre duplicado por mayusculas', () => {
  const state = fixture();
  state.products.push(product({ id: 'otro', name: 'NAVAJAS' }));
  assert.match(logic.inventoryError(state), /Ya existe/);
});

test('STK-030 - Rechaza nombre duplicado por espacios externos', () => {
  const state = fixture();
  state.products.push(product({ id: 'otro', name: ' Navajas ' }));
  assert.match(logic.inventoryError(state), /Ya existe/);
});

test('STK-031 - Rechaza nombre duplicado por acento compuesto', () => {
  const state = fixture();
  state.products.push(product({ id: 'otro', name: 'N\u00e1vajas' }));
  assert.match(logic.inventoryError(state), /Ya existe/);
});

test('STK-032 - Rechaza nombre duplicado por acento descompuesto', () => {
  const state = fixture();
  state.products.push(product({ id: 'otro', name: 'Na\u0301vajas' }));
  assert.match(logic.inventoryError(state), /Ya existe/);
});

test('STK-033 - Rechaza nombre duplicado entre archivados', () => {
  const state = fixture();
  state.products[0].active = false;
  state.products.push(product({ id: 'otro', name: ' N\u00c1VAJAS ', active: false }));
  assert.match(logic.inventoryError(state), /archivados/);
});

test('STK-034 - Acepta nombres distintos que comparten prefijo', () => {
  const state = fixture();
  state.products.push(product({ id: 'otro', name: 'Navajas grandes' }));
  assert.equal(logic.inventoryError(state), '');
});

test('STK-035 - Acepta unidad unidades', () => {
  checkField('products', 'unit', 'unidades', true);
});

test('STK-036 - Acepta unidad mililitros', () => {
  checkField('products', 'unit', 'ml', true);
});

test('STK-037 - Acepta unidad gramos', () => {
  checkField('products', 'unit', 'g', true);
});

test('STK-038 - Rechaza unidad desconocida', () => {
  checkField('products', 'unit', 'kg', false);
});

test('STK-039 - Rechaza unidad con mayusculas', () => {
  checkField('products', 'unit', 'ML', false);
});

test('STK-040 - Rechaza unidad no textual', () => {
  checkField('products', 'unit', ['ml'], false);
});

test('STK-041 - Rechaza unidad ausente', () => {
  checkField('products', 'unit', undefined, false);
});

test('STK-042 - Acepta stock inicial cero', () => {
  checkField('products', 'initialStock', 0, true);
});

test('STK-043 - Acepta stock inicial maximo', () => {
  checkField('products', 'initialStock', 1000000000, true);
});

test('STK-044 - Rechaza stock inicial negativo', () => {
  checkField('products', 'initialStock', -1, false);
});

test('STK-045 - Rechaza stock inicial fraccionario', () => {
  checkField('products', 'initialStock', 0.5, false);
});

test('STK-046 - Rechaza stock inicial sobre el maximo', () => {
  checkField('products', 'initialStock', 1000000001, false);
});

test('STK-047 - Rechaza stock inicial textual', () => {
  checkField('products', 'initialStock', '10', false);
});

test('STK-048 - Rechaza stock inicial NaN', () => {
  checkField('products', 'initialStock', NaN, false);
});

test('STK-049 - Rechaza stock inicial infinito', () => {
  checkField('products', 'initialStock', Infinity, false);
});

test('STK-050 - Rechaza stock inicial entero inseguro', () => {
  checkField('products', 'initialStock', Number.MAX_SAFE_INTEGER + 1, false);
});

test('STK-051 - Rechaza stock inicial booleano', () => {
  checkField('products', 'initialStock', false, false);
});

test('STK-052 - Rechaza stock inicial ausente', () => {
  checkField('products', 'initialStock', undefined, false);
});

test('STK-053 - Acepta inicio igual a la fecha del movimiento', () => {
  checkField('products', 'startDate', '2026-09-03', true);
});

test('STK-054 - Acepta inicio el veintinueve de febrero bisiesto', () => {
  checkField('products', 'startDate', '2024-02-29', true);
});

test('STK-055 - Rechaza inicio en febrero no bisiesto', () => {
  checkField('products', 'startDate', '2025-02-29', false);
});

test('STK-056 - Rechaza inicio en dia inexistente', () => {
  checkField('products', 'startDate', '2026-04-31', false);
});

test('STK-057 - Rechaza inicio en mes inexistente', () => {
  checkField('products', 'startDate', '2025-13-01', false);
});

test('STK-058 - Rechaza inicio sin ceros de relleno', () => {
  checkField('products', 'startDate', '2026-9-1', false);
});

test('STK-059 - Rechaza inicio con hora adicional', () => {
  checkField('products', 'startDate', '2026-09-01T00:00:00', false);
});

test('STK-060 - Rechaza inicio con salto de linea final', () => {
  checkField('products', 'startDate', '2026-09-01\n', false);
});

test('STK-061 - Rechaza inicio no textual', () => {
  checkField('products', 'startDate', ['2026-09-01'], false);
});

test('STK-062 - Rechaza inicio ausente', () => {
  checkField('products', 'startDate', undefined, false);
});

test('STK-063 - Acepta producto activo', () => {
  checkField('products', 'active', true, true);
});

test('STK-064 - Acepta producto archivado con historial', () => {
  checkField('products', 'active', false, true);
});

test('STK-065 - Rechaza activo textual', () => {
  checkField('products', 'active', 'true', false);
});

test('STK-066 - Rechaza activo numerico', () => {
  checkField('products', 'active', 1, false);
});

test('STK-067 - Rechaza activo ausente', () => {
  checkField('products', 'active', undefined, false);
});

test('STK-068 - Acepta ID de movimiento de un caracter', () => {
  checkField('movements', 'id', 'm', true);
});

test('STK-069 - Acepta ID de movimiento de ochenta caracteres', () => {
  checkField('movements', 'id', 'm'.repeat(80), true);
});

test('STK-070 - Rechaza ID de movimiento vacio', () => {
  checkField('movements', 'id', '', false);
});

test('STK-071 - Rechaza ID de movimiento solo con espacios', () => {
  checkField('movements', 'id', ' \t ', false);
});

test('STK-072 - Rechaza ID de movimiento demasiado largo', () => {
  checkField('movements', 'id', 'm'.repeat(81), false);
});

test('STK-073 - Rechaza ID de movimiento numerico', () => {
  checkField('movements', 'id', 1, false);
});

test('STK-074 - Rechaza ID de movimiento ausente', () => {
  checkField('movements', 'id', undefined, false);
});

test('STK-075 - Rechaza ID de movimiento duplicado', () => {
  const state = fixture();
  state.movements.push(movement({ quantity: 2 }));
  assert.match(logic.inventoryError(state), /movimiento/);
});

test('STK-076 - Rechaza ID duplicado aunque el original este anulado', () => {
  const state = fixture();
  state.movements[0].cancelled = true;
  state.movements.push(movement({ date: '2026-09-04' }));
  assert.match(logic.inventoryError(state), /movimiento/);
});

test('STK-077 - Rechaza ID duplicado entre productos diferentes', () => {
  const state = fixture();
  state.products.push(product({ id: 'guantes', name: 'Guantes' }));
  state.movements.push(movement({ productId: 'guantes' }));
  assert.match(logic.inventoryError(state), /movimiento/);
});

test('STK-078 - Acepta referencia exacta a producto existente', () => {
  checkField('movements', 'productId', 'navajas', true);
});

test('STK-079 - Rechaza referencia a producto inexistente', () => {
  checkField('movements', 'productId', 'otro', false);
});

test('STK-080 - Rechaza referencia a producto con otra capitalizacion', () => {
  checkField('movements', 'productId', 'NAVAJAS', false);
});

test('STK-081 - Rechaza referencia a producto no textual', () => {
  checkField('movements', 'productId', ['navajas'], false);
});

test('STK-082 - Rechaza referencia a producto ausente', () => {
  checkField('movements', 'productId', undefined, false);
});

test('STK-083 - Acepta movimiento en la fecha inicial', () => {
  checkField('movements', 'date', '2026-09-01', true);
});

test('STK-084 - Rechaza movimiento un dia antes del inicio', () => {
  checkField('movements', 'date', '2026-08-31', false);
});

test('STK-085 - Acepta movimiento en febrero bisiesto', () => {
  const state = fixture();
  state.products[0].startDate = '2024-02-01';
  state.movements[0].date = '2024-02-29';
  assert.equal(logic.inventoryError(state), '');
});

test('STK-086 - Rechaza movimiento en febrero no bisiesto', () => {
  checkField('movements', 'date', '2027-02-29', false);
});

test('STK-087 - Rechaza movimiento en dia inexistente', () => {
  checkField('movements', 'date', '2026-09-31', false);
});

test('STK-088 - Rechaza movimiento en mes inexistente', () => {
  checkField('movements', 'date', '2026-13-01', false);
});

test('STK-089 - Rechaza fecha de movimiento sin relleno', () => {
  checkField('movements', 'date', '2026-9-3', false);
});

test('STK-090 - Rechaza fecha de movimiento con hora', () => {
  checkField('movements', 'date', '2026-09-03T10:00:00', false);
});

test('STK-091 - Rechaza fecha de movimiento con salto final', () => {
  checkField('movements', 'date', '2026-09-03\n', false);
});

test('STK-092 - Rechaza fecha de movimiento no textual', () => {
  checkField('movements', 'date', ['2026-09-03'], false);
});

test('STK-093 - Rechaza fecha de movimiento ausente', () => {
  checkField('movements', 'date', undefined, false);
});

test('STK-094 - Acepta hora minima medianoche', () => {
  checkField('movements', 'time', '00:00', true);
});

test('STK-095 - Acepta hora maxima del dia', () => {
  checkField('movements', 'time', '23:59', true);
});

test('STK-096 - Rechaza hora veinticuatro', () => {
  checkField('movements', 'time', '24:00', false);
});

test('STK-097 - Rechaza minuto sesenta', () => {
  checkField('movements', 'time', '10:60', false);
});

test('STK-098 - Rechaza hora sin cero inicial', () => {
  checkField('movements', 'time', '9:00', false);
});

test('STK-099 - Rechaza minuto sin cero inicial', () => {
  checkField('movements', 'time', '10:0', false);
});

test('STK-100 - Rechaza hora con segundos', () => {
  checkField('movements', 'time', '10:00:00', false);
});

test('STK-101 - Rechaza hora con espacio inicial', () => {
  checkField('movements', 'time', ' 10:00', false);
});

test('STK-102 - Rechaza hora con espacio final', () => {
  checkField('movements', 'time', '10:00 ', false);
});

test('STK-103 - Rechaza hora con salto de linea final', () => {
  checkField('movements', 'time', '10:00\n', false);
});

test('STK-104 - Rechaza hora con retorno de carro final', () => {
  checkField('movements', 'time', '10:00\r', false);
});

test('STK-105 - Rechaza hora como lista aunque convierta a texto valido', () => {
  checkField('movements', 'time', ['10:00'], false);
});

test('STK-106 - Rechaza hora como objeto String', () => {
  checkField('movements', 'time', new String('10:00'), false);
});

test('STK-107 - Rechaza hora numerica', () => {
  checkField('movements', 'time', 1000, false);
});

test('STK-108 - Rechaza hora ausente', () => {
  checkField('movements', 'time', undefined, false);
});

test('STK-109 - Rechaza hora simbolo sin lanzar excepcion', () => {
  checkField('movements', 'time', Symbol('10:00'), false);
});

test('STK-110 - Acepta tipo entrada', () => {
  checkField('movements', 'type', 'entrada', true);
});

test('STK-111 - Acepta tipo consumo', () => {
  checkField('movements', 'type', 'consumo', true);
});

test('STK-112 - Rechaza tipo desconocido', () => {
  checkField('movements', 'type', 'ajuste', false);
});

test('STK-113 - Rechaza tipo con mayusculas', () => {
  checkField('movements', 'type', 'Entrada', false);
});

test('STK-114 - Rechaza tipo no textual', () => {
  checkField('movements', 'type', ['entrada'], false);
});

test('STK-115 - Rechaza tipo ausente', () => {
  checkField('movements', 'type', undefined, false);
});

test('STK-116 - Acepta cantidad minima uno', () => {
  checkField('movements', 'quantity', 1, true);
});

test('STK-117 - Acepta cantidad maxima de ingreso', () => {
  checkField('movements', 'quantity', 1000000000, true);
});

test('STK-118 - Rechaza cantidad cero', () => {
  checkField('movements', 'quantity', 0, false);
});

test('STK-119 - Rechaza cantidad negativa', () => {
  checkField('movements', 'quantity', -1, false);
});

test('STK-120 - Rechaza cantidad fraccionaria', () => {
  checkField('movements', 'quantity', 1.5, false);
});

test('STK-121 - Rechaza cantidad sobre el maximo', () => {
  checkField('movements', 'quantity', 1000000001, false);
});

test('STK-122 - Rechaza cantidad textual', () => {
  checkField('movements', 'quantity', '1', false);
});

test('STK-123 - Rechaza cantidad NaN', () => {
  checkField('movements', 'quantity', NaN, false);
});

test('STK-124 - Rechaza cantidad infinita', () => {
  checkField('movements', 'quantity', Infinity, false);
});

test('STK-125 - Rechaza cantidad entera insegura', () => {
  checkField('movements', 'quantity', Number.MAX_SAFE_INTEGER + 1, false);
});

test('STK-126 - Rechaza cantidad booleana', () => {
  checkField('movements', 'quantity', true, false);
});

test('STK-127 - Rechaza cantidad ausente', () => {
  checkField('movements', 'quantity', undefined, false);
});

test('STK-128 - Acepta nota vacia', () => {
  checkField('movements', 'notes', '', true);
});

test('STK-129 - Acepta nota de ciento veinte caracteres', () => {
  checkField('movements', 'notes', 'n'.repeat(120), true);
});

test('STK-130 - Rechaza nota de ciento veintiun caracteres', () => {
  checkField('movements', 'notes', 'n'.repeat(121), false);
});

test('STK-131 - Rechaza nota numerica', () => {
  checkField('movements', 'notes', 123, false);
});

test('STK-132 - Rechaza nota nula', () => {
  checkField('movements', 'notes', null, false);
});

test('STK-133 - Rechaza nota ausente', () => {
  checkField('movements', 'notes', undefined, false);
});

test('STK-134 - Acepta movimiento no anulado', () => {
  checkField('movements', 'cancelled', false, true);
});

test('STK-135 - Acepta movimiento anulado', () => {
  checkField('movements', 'cancelled', true, true);
});

test('STK-136 - Rechaza anulacion textual', () => {
  checkField('movements', 'cancelled', 'false', false);
});

test('STK-137 - Rechaza anulacion numerica', () => {
  checkField('movements', 'cancelled', 0, false);
});

test('STK-138 - Rechaza anulacion ausente', () => {
  checkField('movements', 'cancelled', undefined, false);
});

test('STK-139 - Valida cantidad incluso en movimiento anulado', () => {
  const state = fixture();
  state.movements[0].cancelled = true;
  assert.equal(logic.inventoryError(state), '');
  state.movements[0].quantity = 0;
  assert.match(logic.inventoryError(state), /movimiento/);
});

test('STK-140 - Valida referencia incluso en movimiento anulado', () => {
  const state = fixture();
  state.movements[0].cancelled = true;
  assert.equal(logic.inventoryError(state), '');
  state.movements[0].productId = 'inexistente';
  assert.match(logic.inventoryError(state), /movimiento/);
});

test('STK-141 - Valida fecha inicial incluso en movimiento anulado', () => {
  const state = fixture();
  state.movements[0].cancelled = true;
  assert.equal(logic.inventoryError(state), '');
  state.movements[0].date = '2026-08-31';
  assert.match(logic.inventoryError(state), /movimiento/);
});

test('STK-142 - Stock es cero antes de la fecha inicial', () => {
  assert.deepEqual(summary(product(), [movement()], '2026-08-31'), { stock: 0, incoming: 0, consumed: 0 });
});

test('STK-143 - Stock inicial entra exactamente en su fecha', () => {
  assert.deepEqual(summary(product(), [], '2026-09-01'), { stock: 10, incoming: 0, consumed: 0 });
});

test('STK-144 - Stock inicial persiste sin movimientos posteriores', () => {
  assert.deepEqual(summary(product(), [], '2027-01-01'), { stock: 10, incoming: 0, consumed: 0 });
});

test('STK-145 - Stock inicial cero no se reemplaza por otro valor', () => {
  assert.deepEqual(summary(product({ initialStock: 0 }), [], '2026-09-03'), { stock: 0, incoming: 0, consumed: 0 });
});

test('STK-146 - Suma cada ingreso del dia', () => {
  const rows = [movement({ quantity: 2 }), movement({ id: 'mov-2', quantity: 3 })];
  assert.deepEqual(summary(product(), rows, '2026-09-03'), { stock: 15, incoming: 5, consumed: 0 });
});

test('STK-147 - Resta cada consumo del dia', () => {
  const rows = [movement({ type: 'consumo', quantity: 2 }), movement({ id: 'mov-2', type: 'consumo', quantity: 3 })];
  assert.deepEqual(summary(product(), rows, '2026-09-03'), { stock: 5, incoming: 0, consumed: 5 });
});

test('STK-148 - Separa ingresos y consumos sin compensar contadores', () => {
  const rows = [movement({ quantity: 8 }), movement({ id: 'mov-2', type: 'consumo', quantity: 3 })];
  assert.deepEqual(summary(product(), rows, '2026-09-03'), { stock: 15, incoming: 8, consumed: 3 });
});

test('STK-149 - Ingreso anterior afecta stock pero no ingreso diario', () => {
  assert.deepEqual(summary(product(), [movement({ date: '2026-09-02', quantity: 8 })], '2026-09-03'), { stock: 18, incoming: 0, consumed: 0 });
});

test('STK-150 - Consumo anterior afecta stock pero no consumo diario', () => {
  assert.deepEqual(summary(product(), [movement({ date: '2026-09-02', type: 'consumo', quantity: 4 })], '2026-09-03'), { stock: 6, incoming: 0, consumed: 0 });
});

test('STK-151 - Ignora ingreso futuro', () => {
  assert.deepEqual(summary(product(), [movement({ date: '2026-09-04', quantity: 8 })], '2026-09-03'), { stock: 10, incoming: 0, consumed: 0 });
});

test('STK-152 - Ignora consumo futuro', () => {
  assert.deepEqual(summary(product(), [movement({ date: '2026-09-04', type: 'consumo', quantity: 4 })], '2026-09-03'), { stock: 10, incoming: 0, consumed: 0 });
});

test('STK-153 - Ignora ingreso anulado del dia', () => {
  assert.deepEqual(summary(product(), [movement({ cancelled: true, quantity: 8 })], '2026-09-03'), { stock: 10, incoming: 0, consumed: 0 });
});

test('STK-154 - Ignora consumo anulado del dia', () => {
  assert.deepEqual(summary(product(), [movement({ cancelled: true, type: 'consumo', quantity: 4 })], '2026-09-03'), { stock: 10, incoming: 0, consumed: 0 });
});

test('STK-155 - Ignora ingreso anulado anterior', () => {
  assert.deepEqual(summary(product(), [movement({ cancelled: true, date: '2026-09-02', quantity: 8 })], '2026-09-03'), { stock: 10, incoming: 0, consumed: 0 });
});

test('STK-156 - Ignora consumo anulado anterior', () => {
  assert.deepEqual(summary(product(), [movement({ cancelled: true, date: '2026-09-02', type: 'consumo', quantity: 4 })], '2026-09-03'), { stock: 10, incoming: 0, consumed: 0 });
});

test('STK-157 - Ignora ingreso de otro producto', () => {
  assert.deepEqual(summary(product(), [movement({ productId: 'otro', quantity: 8 })], '2026-09-03'), { stock: 10, incoming: 0, consumed: 0 });
});

test('STK-158 - Ignora consumo de otro producto', () => {
  assert.deepEqual(summary(product(), [movement({ productId: 'otro', type: 'consumo', quantity: 4 })], '2026-09-03'), { stock: 10, incoming: 0, consumed: 0 });
});

test('STK-159 - Calcula stock de producto archivado sin borrar historial', () => {
  assert.deepEqual(summary(product({ active: false }), [movement({ type: 'consumo', quantity: 4 })], '2026-09-03'), { stock: 6, incoming: 0, consumed: 4 });
});

test('STK-160 - Consumo exacto deja stock cero', () => {
  const state = fixture();
  state.movements = [movement({ type: 'consumo', quantity: 10 })];
  assert.equal(logic.inventoryError(state), '');
  assert.deepEqual(summary(state.products[0], state.movements, '2026-09-03'), { stock: 0, incoming: 0, consumed: 10 });
});

test('STK-161 - Rechaza consumo una unidad sobre el disponible', () => {
  const state = fixture();
  state.movements = [movement({ type: 'consumo', quantity: 11 })];
  assert.match(logic.inventoryError(state), /Stock insuficiente de Navajas.*2026-09-03/);
});

test('STK-162 - No oculta stock negativo al resumir historial invalido', () => {
  assert.deepEqual(summary(product(), [movement({ type: 'consumo', quantity: 11 })], '2026-09-03'), { stock: -1, incoming: 0, consumed: 11 });
});

test('STK-163 - Stock inicial no se vuelve a sumar cada jornada', () => {
  const rows = [movement({ date: '2026-09-01', type: 'consumo', quantity: 4 }), movement({ id: 'mov-2', date: '2026-09-02', quantity: 8 }), movement({ id: 'mov-3', date: '2026-09-02', type: 'consumo', quantity: 3 })];
  assert.deepEqual(summary(product(), rows, '2026-09-02'), { stock: 11, incoming: 8, consumed: 3 });
});

test('STK-164 - Resumen no depende del orden del arreglo', () => {
  const rows = [movement({ date: '2026-09-01', quantity: 8 }), movement({ id: 'mov-2', type: 'consumo', quantity: 12 })];
  assert.deepEqual(summary(product(), rows, '2026-09-03'), { stock: 6, incoming: 0, consumed: 12 });
  assert.deepEqual(summary(product(), rows.toReversed(), '2026-09-03'), { stock: 6, incoming: 0, consumed: 12 });
});

test('STK-165 - Valida jornadas en orden cronologico y no de insercion', () => {
  const state = fixture();
  state.movements = [movement({ type: 'consumo', quantity: 20 }), movement({ id: 'mov-2', date: '2026-09-01', quantity: 10 })];
  assert.equal(logic.inventoryError(state), '');
});

test('STK-166 - Ingreso futuro no repara saldo negativo pasado', () => {
  const state = fixture();
  state.movements = [movement({ quantity: 10 }), movement({ id: 'mov-2', date: '2026-09-02', type: 'consumo', quantity: 11 })];
  assert.match(logic.inventoryError(state), /2026-09-02/);
});

test('STK-167 - Compensa movimientos del mismo dia aunque consumo llegue primero', () => {
  const state = fixture();
  state.products[0].initialStock = 0;
  state.movements = [movement({ type: 'consumo', quantity: 5, time: '08:00' }), movement({ id: 'mov-2', quantity: 5, time: '18:00' })];
  assert.equal(logic.inventoryError(state), '', 'el disponible se valida por jornada, no por hora');
  assert.deepEqual(summary(state.products[0], state.movements, '2026-09-03'), { stock: 0, incoming: 5, consumed: 5 });
});

test('STK-168 - Compensa movimientos del mismo dia con ingreso primero', () => {
  const state = fixture();
  state.products[0].initialStock = 0;
  state.movements = [movement({ quantity: 5 }), movement({ id: 'mov-2', type: 'consumo', quantity: 5 })];
  assert.equal(logic.inventoryError(state), '');
});

test('STK-169 - Rechaza saldo diario negativo despues de varios ingresos', () => {
  const state = fixture();
  state.movements = [movement({ quantity: 2 }), movement({ id: 'mov-2', quantity: 3 }), movement({ id: 'mov-3', type: 'consumo', quantity: 16 })];
  assert.match(logic.inventoryError(state), /2026-09-03/);
});

test('STK-170 - Anular ingreso rechaza deuda en jornada posterior', () => {
  const state = fixture();
  state.movements = [movement({ date: '2026-09-01', quantity: 10 }), movement({ id: 'mov-2', date: '2026-09-02', type: 'consumo', quantity: 20 })];
  assert.equal(logic.inventoryError(state), '');
  state.movements[0].cancelled = true;
  assert.match(logic.inventoryError(state), /2026-09-02/);
});

test('STK-171 - Consumo retroactivo rechaza deuda en jornada posterior', () => {
  const state = fixture();
  state.movements = [movement({ date: '2026-09-01', quantity: 10 }), movement({ id: 'mov-2', date: '2026-09-02', type: 'consumo', quantity: 20 })];
  assert.equal(logic.inventoryError(state), '');
  state.movements.push(movement({ id: 'mov-3', date: '2026-09-01', type: 'consumo', quantity: 1 }));
  assert.match(logic.inventoryError(state), /2026-09-02/);
});

test('STK-172 - Anular consumo devuelve disponible a jornadas posteriores', () => {
  const state = fixture();
  state.movements = [movement({ date: '2026-09-01', type: 'consumo', quantity: 10, cancelled: true }), movement({ id: 'mov-2', type: 'consumo', quantity: 10 })];
  assert.equal(logic.inventoryError(state), '');
  assert.equal(summary(state.products[0], state.movements, '2026-09-03').stock, 0);
});

test('STK-173 - Restaurar consumo rechaza deuda posterior', () => {
  const state = fixture();
  state.movements = [movement({ date: '2026-09-01', type: 'consumo', quantity: 10, cancelled: true }), movement({ id: 'mov-2', type: 'consumo', quantity: 10 })];
  assert.equal(logic.inventoryError(state), '');
  state.movements[0].cancelled = false;
  assert.match(logic.inventoryError(state), /2026-09-03/);
});

test('STK-174 - Restaurar ingreso incrementa stock sin duplicarlo', () => {
  const state = fixture();
  state.movements[0].cancelled = true;
  assert.equal(summary(state.products[0], state.movements, '2026-09-03').stock, 10);
  state.movements[0].cancelled = false;
  assert.equal(logic.inventoryError(state), '');
  assert.equal(summary(state.products[0], state.movements, '2026-09-03').stock, 11);
});

test('STK-175 - Stock de otro producto no financia consumo', () => {
  const state = fixture();
  state.products.push(product({ id: 'guantes', name: 'Guantes', initialStock: 1000 }));
  state.movements = [movement({ productId: 'guantes', quantity: 100 }), movement({ id: 'mov-2', type: 'consumo', quantity: 11 })];
  assert.match(logic.inventoryError(state), /Stock insuficiente de Navajas/);
});

test('STK-176 - Verifica tambien deuda del segundo producto', () => {
  const state = fixture();
  state.products.push(product({ id: 'guantes', name: 'Guantes', initialStock: 0 }));
  state.movements.push(movement({ id: 'mov-2', productId: 'guantes', type: 'consumo' }));
  assert.match(logic.inventoryError(state), /Stock insuficiente de Guantes/);
});

test('STK-177 - Archivar producto no oculta historial negativo', () => {
  const state = fixture();
  state.products[0].active = false;
  state.movements = [movement({ type: 'consumo', quantity: 11 })];
  assert.match(logic.inventoryError(state), /insuficiente/);
});

test('STK-178 - Rechaza primer dia negativo aunque el cierre final sea positivo', () => {
  const state = fixture();
  state.movements = [movement({ date: '2026-09-01', type: 'consumo', quantity: 11 }), movement({ id: 'mov-2', date: '2026-09-02', quantity: 20 }), movement({ id: 'mov-3', type: 'consumo', quantity: 1 })];
  assert.match(logic.inventoryError(state), /2026-09-01/);
});

test('STK-179 - Valida tambien consumo futuro en historial persistido', () => {
  const state = fixture();
  state.movements = [movement({ date: '2099-01-01', type: 'consumo', quantity: 11 })];
  assert.match(logic.inventoryError(state), /2099-01-01/);
});

test('STK-180 - Limite por cantidad no limita stock acumulado valido', () => {
  const state = fixture();
  state.products[0].initialStock = 1000000000;
  state.movements[0].quantity = 1000000000;
  assert.equal(logic.inventoryError(state), '');
  assert.equal(summary(state.products[0], state.movements, '2026-09-03').stock, 2000000000);
});

test('STK-181 - Acepta consumo maximo con disponible suficiente', () => {
  const state = fixture();
  state.products[0].initialStock = 1000000000;
  state.movements = [movement({ type: 'consumo', quantity: 1000000000 })];
  assert.equal(logic.inventoryError(state), '');
  assert.equal(summary(state.products[0], state.movements, '2026-09-03').stock, 0);
});

test('STK-182 - Validar y resumir no mutan productos ni orden del historial', () => {
  const state = fixture();
  state.movements.push(movement({ id: 'mov-2', date: '2026-09-01', type: 'consumo', quantity: 2 }));
  const before = structuredClone(state);
  state.products.forEach(Object.freeze);
  state.movements.forEach(Object.freeze);
  Object.freeze(state.products);
  Object.freeze(state.movements);
  Object.freeze(state);
  assert.equal(logic.inventoryError(state), '');
  assert.deepEqual(summary(state.products[0], state.movements, '2026-09-03'), { stock: 9, incoming: 1, consumed: 0 });
  assert.deepEqual(state, before);
});
