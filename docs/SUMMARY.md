# Resumenes: Barberia y Barberos

## Alcance

El selector `summaryBarberFilter` incluye Todos los barberos (predeterminado),
Barberia y cada barbero individual. Barberia muestra solo el resumen del local;
las otras opciones muestran solo Barberos. El historico permanece visible.
En Barberia se oculta el selector de servicios sin borrar su seleccion: al volver
a Barberos se recupera. El modo se conserva al renderizar y actualizar configuracion.
La opcion local se identifica por `data-scope="shop"`, no por su valor o etiqueta,
para no confundirla con un nombre de barbero.

Barberia usa el periodo inclusivo (semana, mes o anio) y el medio de pago.
Ignora barbero y tipos de servicio, incluso si no hay servicios seleccionados:
asi no se comparan ingresos parciales contra gastos globales. Las ventas y sus
unidades se filtran por fecha y medio. No se usa la jornada activa como rango.
Barberos conserva bruto = servicios + propinas, neto = comision + propinas,
y ambos tickets por cantidad de servicios, sin ventas.

## Formulas de Barberia

- Facturado sin propinas = servicios + ventas de productos.
- Total facturado con propinas = facturado sin propinas + propinas.
- Balance = facturado sin propinas - comisiones - gastos registrados.
- Las propinas son para los barberos y no forman parte del balance del local.
- Adelantos y retiros se muestran aparte, no como gasto operativo ni otra resta del balance.
- No se restan pagos a barberos: la comision generada ya fue descontada.
- No es saldo disponible ni utilidad contable completa: no estima costos de productos, impuestos ni gastos no registrados.

Se reutiliza `summarize` sin alterar su contrato. Comisiones: importe guardado,
o porcentaje guardado, o comision predeterminada por fecha. Se acumula sin
redondear y se muestra con el formato monetario existente. Puede haber diferencias
de redondeo con pagos diarios, que redondean por barbero.

En mixtos, la propina pertenece al medio dominante (empate: efectivo). El resto
de cada medio es servicio y la comision se reparte proporcionalmente al servicio.
El filtro de medio atribuye comisiones al cobro, no al pago real al barbero.
Las columnas del medio excluido muestran cero; Total es el total filtrado.

Los retiros son `cashRegisters[fecha].withdrawal`, exclusivamente efectivo.
La caja real usa apertura, transferencias, adelantos y pagos efectivos a barberos;
el retiro modifica la siguiente apertura. Ninguno de esos datos se usa para
presentar un supuesto saldo disponible del periodo.

## Historico

Conserva filas y formulas anteriores. En Barberia usa solo periodo y medio,
sin restringir servicios ni barberos; en Barberos aplica todos los filtros.
Su Balance es margen antes de
gastos (servicios + ventas - comisiones), explicado en la ayuda del titulo. Al elegir
barbero excluye ventas, gastos y retiros; el filtro de servicio no afecta ventas,
adelantos o gastos. No debe confundirse con el balance de Barberia.

## Ayudas de la interfaz

Los botones `?` muestran solo operaciones o relaciones breves, sin parrafos,
con `data-tip` y `aria-label`, accesibles por teclado. El alcance se limita
a los filtros indispensables. La ayuda del historico conserva su formula en ambos modos.
Las etiquetas de metricas y los conteos de servicios, ventas y unidades siguen visibles.
Balance del local muestra Comisiones y Gastos operativos (los mismos gastos
registrados, como insumos), sin indicador de propinas. Las propinas permanecen
en el desglose facturado y en Barberos. Movimientos de Barberia muestra Gastos,
Adelantos y Retiros, sin explicaciones visibles, con los mismos montos y medios.
Esta limpieza no cambia calculos ni las vistas diarias de caja y movimientos.
