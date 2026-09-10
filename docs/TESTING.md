# Pruebas de The Luxe

## Resultado

Verificado con Node 24.13.0: **703 tests aprobados, 0 fallos, 0 omitidos**.

La explicacion minima de **cada test** esta en [TESTS.md](TESTS.md): una linea por ID, agrupada por archivo.

| Codigo medido | Lineas | Ramas | Funciones |
| --- | ---: | ---: | ---: |
| `logic.js` | 100% | 100% | 100% |
| `inventory.js` | 100% | 100% | 100% |
| `reports.js` | 100% | 100% | 100% |
| `dialogs.js` | 100% | 96.67% | 100% |
| `script.js` | 100% | 94.91% | 99.54% |
| **Total** | **100%** | **97.12%** | **99.72%** |

Cobertura V8 de esos cinco archivos de produccion, no de helpers ni dependencias. El build y sus respuestas HTTP tienen tests separados. La cobertura puede variar al modificar codigo o actualizar Node.

## Ejecutar

Requiere **Node 24 o posterior** y npm. La dependencia de desarrollo `jsdom` esta fijada con lockfile.

```sh
npm ci
npm test
npm run test:coverage
npm run build
npm run test:docs
```

- `npm test`: ejecuta todos los archivos `test/**/*.test.mjs`.
- `npm run test:coverage`: ejecuta todo y exige al menos 99% lineas, 96% ramas y 99% funciones globales.
- `npm run build`: ejecuta tests primero; solo construye si pasan.
- `npm run test:docs`: vuelve a ejecutar la suite y regenera el indice desde los casos realmente ejecutados, incluidos los parametrizados.
- GitHub Actions instala con `npm ci` y comprueba build y cobertura en Node 24.

Un modulo o un test por ID:

```sh
node --test test/app/commission.test.mjs
node --test --test-name-pattern="COM-006" test/app/commission.test.mjs
node --test --test-reporter=./test/support/failures-reporter.mjs "test/**/*.test.mjs"
```

## Organizacion

| Archivo o carpeta | Responsabilidad |
| --- | --- |
| `test/logic/finance.test.mjs` | Parseo, cobros, ventas, adelantos, gastos, transferencias y asignacion por medio. |
| `test/logic/commissions.test.mjs` | Snapshots, tasas, propinas, redondeo y estados del pago. |
| `test/logic/revenue.test.mjs` | Resumen, facturacion y neto con resultados exactos. |
| `test/logic/invariants.test.mjs` | Conservacion de dinero, reversibilidad y escenarios reproducibles. |
| `test/logic/calendar.test.mjs` | Semanas, meses, bisiestos y cambios de horario en procesos aislados. |
| `test/logic/inventory.test.mjs` | Cada campo del validador y cada suma/resta de stock. |
| `test/app/bootstrap.test.mjs` | Arranque completo y limites de persistencia. |
| `test/app/transactions.test.mjs` | Alta, edicion, cancelacion, validacion y borrado de movimientos. |
| `test/app/payments.test.mjs` | Pagos reales por evento, saldos, foco, cursor y caja. |
| `test/app/cash-register.test.mjs` | Apertura, ajustes, cierre, herencia y transferencias. |
| `test/app/commission.test.mjs` | Cambio diario aplicado a todos los cortes y aislamiento de fechas. |
| `test/app/configuration.test.mjs` | Catalogos, referencias, restricciones y filtros. |
| `test/app/reports.test.mjs` | Filtros, periodos, agrupaciones y totales mostrados. |
| `test/app/navigation.test.mjs` | Navegacion, accesibilidad, orden y dialogos. |
| `test/app/inventory.test.mjs` | Formularios, persistencia, conflictos y eventos de otras pestanas. |
| `test/page.test.mjs` | Contratos de HTML, IDs, campos, recursos y orden de carga. |
| `test/build.test.mjs` | Build real, recursos, GET, HEAD, 404 y 405. |
| `test/support/logic.mjs` | VM aislada y fixture financiero comun. |
| `test/support/app.mjs` | HTML y eventos reales en jsdom, reloj fijo y limpieza por test. |

Los tests de logica son unitarios. Los de `app` combinan unidades y regresiones de integracion: cargan los scripts completos con el HTML real, no extraen handlers con expresiones regulares. Los tests HTTP prueban el artefacto generado, sin desplegarlo.

## Oraculos

No se obtiene el resultado esperado llamando al mismo calculo que se intenta probar. Los casos financieros usan importes literales y las invariantes usan un libro de movimientos independiente con semillas fijas.

Fixture comun:

```text
Servicios = 1.000 + 2.000 + 900 = 3.900
Propinas = 200 + 0 + 100 = 300
Ventas = 500 + 700 = 1.200
Cobrado = 3.900 + 300 + 1.200 = 5.400
Facturado comercial (logica de caja/historico) = 3.900 + 1.200 = 5.100
Facturado total de Resumenes (bruto con propinas, sin ventas) = 3.900 + 300 = 4.200
Comision al 50% = 500 + 1.000 + 450 = 1.950
Comision (ingreso neto del barbero) = 1.950 + 300 = 2.250
Balance historico = facturado comercial 5.100 - comision 1.950 = 3.150
Ticket promedio bruto = 4.200 / 3 servicios = 1.400
Ticket promedio neto = 2.250 / 3 servicios = 750

Efectivo = 1.000 apertura + 1.800 cobros + 500 ventas
           - 300 adelantos - 50 gastos - 100 transferidos = 2.850
MP = 2.000 apertura + 2.400 cobros + 700 ventas
     - 100 adelantos - 200 gastos + 100 recibidos = 4.900
```

## Reglas fijadas

- El override diario actualiza importe y tasa de todos los cortes de esa fecha, incluidos los anteriores. Los nuevos usan esa tasa. La fecha siguiente usa el default.
- Cambiar el default no recalcula snapshots historicos; el override diario explicito si lo hace.
- Las propinas no generan comision, pero si forman parte del facturado total (bruto) del resumen. Las ventas no generan comision de cortes.
- En Resumenes, ventas no integran el bruto ni el denominador de ninguno de los tickets, con todos los barberos o uno seleccionado. Sin servicios ambos tickets son cero, incluso si hay ventas.
- El desglose del facturado solo muestra Servicios y Propinas. No hay tarjetas independientes de Recaudado por servicios, Recaudado por ventas, Propinas ni Balance; se conservan Adelantos, Salidas de caja y Retiros totales.
- La tabla historica diaria/mensual conserva ventas, propinas, comisiones sin propinas y balance comercial. Las pruebas verifican esos importes por fila y la ausencia de los elementos eliminados.
- El redondeo de comision se hace despues de sumar, no corte por corte. Cada pago de barbero se redondea por barbero; no se supone que sumar esos redondeos sea igual a redondear una suma global.
- Mixto descuenta exactamente los importes ingresados, aun parciales o excedidos. No pago ignora los importes retenidos.
- Efectivo/MP de un clic representan el total actualmente mostrado para ese barbero; no son una fotografia inmutable de una transferencia bancaria.
- Se conserva la regla actual del panel: pago mostrado = comision + propinas, sin deducir adelantos en ese importe. Los adelantos se descuentan aparte de caja. Cambiar esa liquidacion requiere definir otra regla de negocio.
- Balance comercial = facturado menos comision; saldo disponible incluye apertura, movimientos y pagos. Son indicadores distintos.
- Las semanas empiezan en el primer lunes del mes. Los dias anteriores se asignan al selector de semana 1, cuyo rango comienza en ese lunes.
- Las finanzas son de sesion; inventario persiste localmente. Vender un producto no consume stock automaticamente.

## Fallos corregidos

- Comisiones discrepantes entre pago, contadores y reporte; override diario incompleto.
- Pagos a barberos omitidos en saldos y validacion de transferencias.
- Apertura automatica que perdia el override y herencias desactualizadas al corregir un cierre.
- Division por cero textual, transferencia al mismo medio y semanas desplazadas por DST.
- Tipo de hora invalido en inventario y borradores que pisaban cambios de otra pestana.
- Totales que concatenaban strings, referencia de reporte vacia y filtros que se reiniciaban.
- Errores de formulario que persistian al corregir, ceros mixtos perdidos al editar y pagina actual sin valor ARIA.
- Eliminacion de barbero con pago registrado y rutas heredadas del prototipo servidas como recursos.

## Limites

Ninguna suite garantiza que nunca aparezca un bug. Estos tests prueban reglas y casos concretos, no todas las combinaciones posibles.

`jsdom` no dibuja: no certifica estilos, recortes, responsive, geometria de arrastre, backdrop nativo, accesibilidad completa ni comportamiento tactil. Se sustituyen solo presentacion modal, scroll, reloj, UUID, confirmaciones y APIs ausentes; calculos, formularios, eventos y almacenamiento se ejecutan.

`parseAmount` es un formateador de pesos enteros, no un validador universal. Los tests respetan la validacion de cada formulario; no afirman soporte para importes decimales, negativos o infinitos en todos los puntos de entrada. Tampoco agregan funcionalidades pendientes como persistencia financiera o liquidacion neta de adelantos.
