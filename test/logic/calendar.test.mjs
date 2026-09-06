import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadLogic, root } from '../support/logic.mjs';

const logic = loadLogic();
const bounds = (...args) => Array.from(logic.periodBounds(...args));

// TZ is set before an isolated Node process starts. Check the resolved zone rather
// than silently passing on a host that ignores TZ; never change the runner's TZ.
function inZone(zone, expression) {
  const source = `import { loadLogic } from ${JSON.stringify(new URL('test/support/logic.mjs', root).href)};
    const logic = loadLogic();
    process.stdout.write(JSON.stringify({ zone: Intl.DateTimeFormat().resolvedOptions().timeZone, value: (${expression}) }));`;
  const result = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '--eval', source], {
    cwd: fileURLToPath(root), env: { ...process.env, TZ: zone }, encoding: 'utf8', timeout: 15000,
  }));
  assert.equal(result.zone, zone, 'el proceso aislado debe respetar TZ');
  return result.value;
}

test('CAL-001 - isoDate rellena mes y dia con ceros', () => {
  assert.equal(logic.isoDate(new Date(2026, 0, 3)), '2026-01-03');
});

test('CAL-002 - isoDate conserva mes y dia de dos digitos', () => {
  assert.equal(logic.isoDate(new Date(2026, 11, 31)), '2026-12-31');
});

test('CAL-003 - isoDate conserva el dia bisiesto', () => {
  assert.equal(logic.isoDate(new Date(2024, 1, 29)), '2024-02-29');
});

test('CAL-004 - isoDate ignora la hora sin mutar Date', () => {
  const date = new Date(2026, 8, 3, 23, 59, 59, 999);
  const before = date.getTime();
  assert.equal(logic.isoDate(date), '2026-09-03');
  assert.equal(date.getTime(), before);
});

test('CAL-005 - isoDate usa fecha local al oeste de UTC', () => {
  assert.equal(inZone('America/New_York', "logic.isoDate(new Date('2026-09-03T02:00:00Z'))"), '2026-09-02');
});

test('CAL-006 - isoDate usa fecha local al este de UTC', () => {
  assert.equal(inZone('Asia/Tokyo', "logic.isoDate(new Date('2026-12-31T20:00:00Z'))"), '2027-01-01');
});

test('CAL-007 - Mes que empieza lunes puede tener cinco semanas', () => {
  assert.equal(logic.monthWeeks('2026-06'), 5);
});

test('CAL-008 - Mes que empieza martes conserva cuatro lunes', () => {
  assert.equal(logic.monthWeeks('2026-09'), 4);
});

test('CAL-009 - Mes que empieza miercoles conserva cuatro lunes', () => {
  assert.equal(logic.monthWeeks('2026-07'), 4);
});

test('CAL-010 - Mes que empieza jueves conserva cuatro lunes', () => {
  assert.equal(logic.monthWeeks('2026-01'), 4);
});

test('CAL-011 - Mes que empieza viernes conserva cuatro lunes', () => {
  assert.equal(logic.monthWeeks('2026-05'), 4);
});

test('CAL-012 - Mes que empieza sabado puede tener cinco lunes', () => {
  assert.equal(logic.monthWeeks('2026-08'), 5);
});

test('CAL-013 - Mes que empieza domingo puede tener cinco lunes', () => {
  assert.equal(logic.monthWeeks('2026-11'), 5);
});

test('CAL-014 - Febrero comun que empieza lunes tiene cuatro semanas', () => {
  assert.equal(logic.monthWeeks('2021-02'), 4);
});

test('CAL-015 - Febrero bisiesto que empieza lunes tiene cinco semanas', () => {
  assert.equal(logic.monthWeeks('2016-02'), 5);
});

test('CAL-016 - Febrero bisiesto que empieza jueves tiene cuatro semanas', () => {
  assert.equal(logic.monthWeeks('2024-02'), 4);
});

test('CAL-017 - Dia anterior al primer lunes queda en semana uno', () => {
  assert.equal(logic.currentMonthWeek('2026-07-05'), 1);
});

test('CAL-018 - Primer dia del mes queda en semana uno aunque sea martes', () => {
  assert.equal(logic.currentMonthWeek('2026-09-01'), 1);
});

test('CAL-019 - Hoy fijo anterior al primer lunes queda en semana uno', () => {
  assert.equal(logic.currentMonthWeek('2026-09-03'), 1);
});

test('CAL-020 - Primer lunes inicia semana uno', () => {
  assert.equal(logic.currentMonthWeek('2026-07-06'), 1);
});

test('CAL-021 - Primer domingo posterior sigue en semana uno', () => {
  assert.equal(logic.currentMonthWeek('2026-07-12'), 1);
});

test('CAL-022 - Segundo lunes inicia semana dos', () => {
  assert.equal(logic.currentMonthWeek('2026-07-13'), 2);
});

test('CAL-023 - Sabado de segunda semana conserva numero', () => {
  assert.equal(logic.currentMonthWeek('2026-07-18'), 2);
});

test('CAL-024 - Tercer lunes inicia semana tres', () => {
  assert.equal(logic.currentMonthWeek('2026-07-20'), 3);
});

test('CAL-025 - Cuarto lunes inicia semana cuatro', () => {
  assert.equal(logic.currentMonthWeek('2026-07-27'), 4);
});

test('CAL-026 - Ultimo dia conserva cuarta semana del mes', () => {
  assert.equal(logic.currentMonthWeek('2026-07-31'), 4);
});

test('CAL-027 - Quinto lunes inicia semana cinco', () => {
  assert.equal(logic.currentMonthWeek('2026-06-29'), 5);
});

test('CAL-028 - Veintinueve de febrero puede iniciar quinta semana', () => {
  assert.equal(logic.currentMonthWeek('2016-02-29'), 5);
});

test('CAL-029 - Nuevo mes reinicia semana aunque continue rango anterior', () => {
  assert.equal(logic.currentMonthWeek('2026-08-01'), 1);
});

test('CAL-030 - Semana predeterminada empieza en primer lunes', () => {
  assert.deepEqual(bounds('week', '2026-07'), ['2026-07-06', '2026-07-12']);
});

test('CAL-031 - Primera semana no incorpora dias anteriores al lunes', () => {
  assert.deepEqual(bounds('week', '2026-09', 1), ['2026-09-07', '2026-09-13']);
});

test('CAL-032 - Semana acepta numero textual del selector', () => {
  assert.deepEqual(bounds('week', '2026-07', '2'), ['2026-07-13', '2026-07-19']);
});

test('CAL-033 - Tercera semana termina domingo inclusivo', () => {
  assert.deepEqual(bounds('week', '2026-07', 3), ['2026-07-20', '2026-07-26']);
});

test('CAL-034 - Cuarta semana cruza al mes siguiente sin truncar', () => {
  assert.deepEqual(bounds('week', '2026-07', 4), ['2026-07-27', '2026-08-02']);
});

test('CAL-035 - Quinta semana cruza al mes siguiente sin truncar', () => {
  assert.deepEqual(bounds('week', '2026-06', 5), ['2026-06-29', '2026-07-05']);
});

test('CAL-036 - Ultima semana cruza de diciembre a enero', () => {
  assert.deepEqual(bounds('week', '2026-12', 4), ['2026-12-28', '2027-01-03']);
});

test('CAL-037 - Semana que inicia en dia bisiesto cruza a marzo', () => {
  assert.deepEqual(bounds('week', '2016-02', 5), ['2016-02-29', '2016-03-06']);
});

test('CAL-038 - Mes comun de febrero termina el veintiocho', () => {
  assert.deepEqual(bounds('month', '2026-02'), ['2026-02-01', '2026-02-28']);
});

test('CAL-039 - Mes bisiesto de febrero termina el veintinueve', () => {
  assert.deepEqual(bounds('month', '2024-02'), ['2024-02-01', '2024-02-29']);
});

test('CAL-040 - Siglo divisible por cuatrocientos es bisiesto', () => {
  assert.deepEqual(bounds('month', '2000-02'), ['2000-02-01', '2000-02-29']);
});

test('CAL-041 - Siglo no divisible por cuatrocientos no es bisiesto', () => {
  assert.deepEqual(bounds('month', '2100-02'), ['2100-02-01', '2100-02-28']);
});

test('CAL-042 - Mes de treinta dias termina en treinta', () => {
  assert.deepEqual(bounds('month', '2026-04'), ['2026-04-01', '2026-04-30']);
});

test('CAL-043 - Diciembre termina en treinta y uno del mismo anio', () => {
  assert.deepEqual(bounds('month', '2026-12'), ['2026-12-01', '2026-12-31']);
});

test('CAL-044 - Rango anual comun incluye enero y diciembre completos', () => {
  assert.deepEqual(bounds('year', '2026'), ['2026-01-01', '2026-12-31']);
});

test('CAL-045 - Rango anual bisiesto conserva extremos', () => {
  assert.deepEqual(bounds('year', '2024'), ['2024-01-01', '2024-12-31']);
});

test('CAL-046 - Rango mensual no depende de semana seleccionada', () => {
  assert.deepEqual(bounds('month', '2026-09', 5), ['2026-09-01', '2026-09-30']);
});

test('CAL-047 - Rango anual acepta anio numerico', () => {
  assert.deepEqual(bounds('year', 2026, 5), ['2026-01-01', '2026-12-31']);
});

test('CAL-048 - Zona DST de prueba cambia realmente una hora en marzo', () => {
  assert.deepEqual(inZone('America/New_York', "[new Date('2026-03-08T00:00:00').getTimezoneOffset(), new Date('2026-03-09T00:00:00').getTimezoneOffset()]"), [300, 240]);
});

test('CAL-049 - Domingo del adelanto DST sigue en semana uno', () => {
  assert.equal(inZone('America/New_York', "logic.currentMonthWeek('2026-03-08')"), 1);
});

test('CAL-050 - Lunes posterior al adelanto DST inicia semana dos', () => {
  assert.equal(inZone('America/New_York', "logic.currentMonthWeek('2026-03-09')"), 2);
});

test('CAL-051 - Segundo lunes posterior al adelanto DST inicia semana tres', () => {
  assert.equal(inZone('America/New_York', "logic.currentMonthWeek('2026-03-16')"), 3);
});

test('CAL-052 - Ultimo lunes de marzo tras DST inicia semana cinco', () => {
  assert.equal(inZone('America/New_York', "logic.currentMonthWeek('2026-03-30')"), 5);
});

test('CAL-053 - Martes posterior al adelanto DST sigue en semana dos', () => {
  assert.equal(inZone('America/New_York', "logic.currentMonthWeek('2026-03-10')"), 2);
});

test('CAL-054 - Marzo con adelanto DST conserva cinco lunes', () => {
  assert.equal(inZone('America/New_York', "logic.monthWeeks('2026-03')"), 5);
});

test('CAL-055 - Semana posterior al adelanto DST conserva lunes y domingo', () => {
  assert.deepEqual(inZone('America/New_York', "logic.periodBounds('week', '2026-03', 2)"), ['2026-03-09', '2026-03-15']);
});

test('CAL-056 - Mes con adelanto DST conserva limites civiles', () => {
  assert.deepEqual(inZone('America/New_York', "logic.periodBounds('month', '2026-03')"), ['2026-03-01', '2026-03-31']);
});

test('CAL-057 - Zona DST europea cambia una hora en octubre', () => {
  assert.deepEqual(inZone('Europe/Berlin', "[new Date('2026-10-25T00:00:00').getTimezoneOffset(), new Date('2026-10-26T00:00:00').getTimezoneOffset()]"), [-120, -60]);
});

test('CAL-058 - Domingo de retroceso DST sigue en semana tres', () => {
  assert.equal(inZone('Europe/Berlin', "logic.currentMonthWeek('2026-10-25')"), 3);
});

test('CAL-059 - Lunes posterior al retroceso DST inicia semana cuatro', () => {
  assert.equal(inZone('Europe/Berlin', "logic.currentMonthWeek('2026-10-26')"), 4);
});

test('CAL-060 - Mes con retroceso DST conserva cuatro lunes', () => {
  assert.equal(inZone('Europe/Berlin', "logic.monthWeeks('2026-10')"), 4);
});

test('CAL-061 - Ultima semana tras retroceso DST cruza mes correctamente', () => {
  assert.deepEqual(inZone('Europe/Berlin', "logic.periodBounds('week', '2026-10', 4)"), ['2026-10-26', '2026-11-01']);
});

test('CAL-062 - Lunes posterior al adelanto europeo inicia semana cinco', () => {
  assert.equal(inZone('Europe/Berlin', "logic.currentMonthWeek('2026-03-30')"), 5);
});

test('CAL-063 - Anio bisiesto conserva lunes correcto despues de DST', () => {
  assert.equal(inZone('America/New_York', "logic.currentMonthWeek('2024-03-11')"), 2);
});

test('CAL-064 - Zona DST de media hora cambia realmente treinta minutos', () => {
  assert.deepEqual(inZone('Australia/Lord_Howe', "[new Date('2029-10-07T00:00:00').getTimezoneOffset(), new Date('2029-10-08T00:00:00').getTimezoneOffset()]"), [-630, -660]);
});

test('CAL-065 - Lunes posterior al adelanto de media hora inicia semana dos', () => {
  assert.equal(inZone('Australia/Lord_Howe', "logic.currentMonthWeek('2029-10-08')"), 2);
});

test('CAL-066 - Adelanto de media hora no desplaza limites semanales', () => {
  assert.deepEqual(inZone('Australia/Lord_Howe', "logic.periodBounds('week', '2029-10', 2)"), ['2029-10-08', '2029-10-14']);
});

test('CAL-067 - isoDate conserva fecha durante hora repetida de DST', () => {
  assert.deepEqual(inZone('America/New_York', "[logic.isoDate(new Date('2026-11-01T05:30:00Z')), logic.isoDate(new Date('2026-11-01T06:30:00Z'))]"), ['2026-11-01', '2026-11-01']);
});

test('CAL-068 - isoDate conserva fecha a ambos lados del salto DST', () => {
  assert.deepEqual(inZone('America/New_York', "[logic.isoDate(new Date('2026-03-08T06:59:59Z')), logic.isoDate(new Date('2026-03-08T07:00:00Z'))]"), ['2026-03-08', '2026-03-08']);
});
