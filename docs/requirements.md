# Especificación de Requisitos de Software
## Sistema de gestión de barbería The Luxe

Versión: 0.2
Fecha: 18/07/2026
Estado: Borrador
Autor: Brian Gelhorn

## Historial de versiones

| Versión | Fecha | Autor | Descripción |
|---------|-------|-------|-------------|
| 0.1 | 13/07/2026 | Brian Gelhorn | Creación inicial maqueta|
| 0.2 | 18/07/2026 | Brian Gelhorn | Primera version estable | 

# 1. Introducción

## 1.1 Propósito

El documento actual va a definir y especificar los requisitos funcionales y no funcionales del sistema de gestión de barbería The Luxe.

El documento está dirigido a los dueños de la barbería The Luxe.

## 1.2 Alcance

El sistema permitirá registrar y consultar las operaciones diarias de la
barbería, incluyendo servicios realizados, ventas, barberos, importes, medios de pago,
propinas y movimientos de caja como retiros o anticipos.

El sistema buscará reemplazar el uso de planillas independientes de Excel y
facilitar la visualización general de la jornada, el control de caja y el pago a los 
barberos.

En su primera versión, el sistema estará orientado exclusivamente a la gestión interna de la
barbería. No incluirá reservas de turnos para clientes ni comercio electrónico.

## 1.3 Definiciones, siglas y abreviaturas

- **RF:** Requisito funcional.
- **RNF:** Requisito no funcional.
- **IU:** Requisito de interfaz de usuario.
- **RLD:** Requisito lógico de la base de datos.
- **Barbero:** Trabajador al cual se asignan los servicios realizados.
- **Servicio:** Prestación realizada por un barbero, como corte, barba o color.
- **Producto:** Artículo ofrecido por la barbería para su venta.
- **Corte:** Término utilizado operativamente por el cliente para referirse al
  registro de un servicio realizado.
- **Jornada:** Día de trabajo sobre el cual se registran operaciones.
- **Propina:** Importe adicional entregado voluntariamente al barbero, separado
  del precio del servicio.
- **Medio de pago:** Forma mediante la cual se cobra una operación. En este caso puede ser en efectivo, Mercado Pago o ambos.
- **Pago combinado:** Operación abonada parcialmente en efectivo y parcialmente
  mediante Mercado Pago.
- **Caja teórica:** Importe que debería existir según las operaciones registradas.
- **Caja real:** Importe efectivamente contabilizado al cerrar la jornada.
- **Usuario:** Persona autorizada para utilizar el sistema.
- **Venta:** venta de un producto, separada de los servicios realizados.
- **Adelanto de caja:** dinero retirado de la caja y entregado anticipadamente a un barbero, que luego deberá descontarse de su liquidación.
- **Salida de caja:** Dinero retirado durante una jornada para afrontar gastos de
  la barbería, como la compra de insumos. No se asocia a la liquidación de un
  barbero y debe registrarse por separado de los adelantos.
- **Comisión:** Porcentaje del precio de los servicios que corresponde al
  barbero que los realizó. El sistema utiliza un único porcentaje general para
  todos los barberos y no incluye propinas, ventas ni adelantos.
- **Liquidación:** Cálculo del importe que corresponde pagar a un barbero según
  sus comisiones, propinas y adelantos registrados.
- **Período:** Rango de fechas semanal, mensual o anual utilizado para agrupar y
  consultar la información de las jornadas.
- **Resumen general:** Consolidación de cortes, ingresos, ventas, propinas,
  adelantos, medios de pago y balance dentro de un período.
- **Balance:** Resultado económico calculado a partir de los ingresos y las
  salidas registradas en el período seleccionado.

## 1.4 Referencias

Por definir

# 2. Descripción general

## 2.1 Perspectiva del producto

The Luxe será un sistema nuevo destinado a sustituir progresivamente las
planillas de Excel utilizadas para registrar y consolidar la actividad de la
barbería.

La versión actual funcionará exclusivamente en el navegador y mantendrá los datos
solo en memoria durante la sesión abierta. Al cerrar o recargar la aplicación, las
operaciones y configuraciones cargadas deberán descartarse.

La persistencia en PostgreSQL y las copias de seguridad locales quedan fuera del
alcance de esta versión.

## 2.2 Funciones del producto 

El sistema ofrecerá las siguientes funciones principales:

- Registrar los servicios realizados durante una jornada.
- Organizar los servicios según el barbero que los realizó.
- Consultar simultáneamente la actividad diaria de varios barberos.
- Registrar servicios y permitir la modificación o eliminación de los mismos.
- Registrar importes, medios de pago y propinas.
- Calcular totales diarios.
- Consultar reportes generales y por barbero.
- Administrar barberos, servicios, precios y comisiones.
- Registrar y controlar movimientos de caja.
- Registrar, modificar y eliminar ventas de productos.
- Registrar, modificar y eliminar adelantos entregados a los barberos.
- Incorporar las ventas y los adelantos en los cálculos correspondientes de caja.
- Considerar los adelantos al calcular la liquidación de cada barbero.

## 2.3 Características de los usuarios

### Propietario o encargado

Será el usuario principal del sistema. Necesitará consultar la actividad
general de la barbería, controlar la caja, revisar reportes y modificar la
configuración.

Se espera que posea experiencia con la operativa de la barbería.

### Operador

Podrá registrar servicios durante la jornada. 
Podrá registrar tanto ventas como servicios y adelantos hechos por los barberos.

## 2.4 Restricciones

- La interfaz deberá poder utilizarse desde una computadora de escritorio. El
uso a través de un dispositivo móvil se encuentra pendiente de confirmación.
- El sistema deberá presentar importes expresados en pesos argentinos.
- El idioma principal de la interfaz será español.
- El sistema funcionará de forma local sin acceso desde internet al mismo.

## 2.5 Suposiciones y dependencias

### Suposiciones

- Se supone que cada servicio será asignado a un único barbero.
- Se supone que la persona que registre un corte conocerá su medio de pago.

### Dependencias


# 3. Requisitos específicos

## 3.1 Requisitos de interfaces externas
### 3.1.1 Interfaz de usuario

#### IU-001 — Visualización de servicios por barbero en panel diario.

El sistema deberá presentar los barberos de la jornada en una vista conjunta,
en forma de columnas contiguas sobre una única fila horizontal, similar a una
tabla de Excel, sin apilarlas verticalmente ni requerir que el usuario abra una
pantalla individual para cada barbero. Cuando las columnas excedan el ancho
disponible, el panel deberá permitir el desplazamiento horizontal.

El sistema deberá mostrar cada corte directamente dentro del sector
correspondiente al barbero que lo realizó.

Cada columna debe tener un boton para poder adicionar un corte para cada barbero.

En una resolución de escritorio de 1366x768, la interfaz deberá mostrar
simultáneamente al menos cinco barberos.

La interfaz deberá mostrar de manera general un resumen de:

- Total en la caja (efectivo).
- Total en Mercado Pago.
- Cantidad de cortes.

En la parte superior del Panel Diario, antes del resumen y de las columnas de
barberos, la interfaz deberá mostrar la sección **Apertura de jornada**.

Esta sección deberá solicitar:

- Caja inicial en Efectivo.
- Caja inicial en Mercado Pago.

La apertura deberá ser la primera operación de la jornada. Mientras no se hayan
guardado ambos importes iniciales, el sistema no deberá permitir registrar
cortes, ventas, adelantos ni salidas de caja.

Después de guardar, la interfaz deberá indicar que la jornada fue iniciada,
habilitar las acciones de registro y utilizar los importes como base para calcular
las cajas teóricas. Los valores iniciales deberán permanecer visibles y podrán
corregirse desde el mismo Panel Diario.

Una vez iniciada la jornada, el sistema deberá ocultar el formulario de apertura
para evitar modificaciones accidentales. En su lugar deberá mostrar un resumen
compacto de las cajas iniciales y una acción **Editar caja inicial**. El formulario
solo deberá volver a mostrarse cuando el usuario seleccione dicha acción.

El Panel Diario deberá incluir una acción **Cambiar comisión** que abra un diálogo
para modificar el porcentaje general aplicable a los nuevos cortes, sin necesidad
de ingresar a la interfaz de Configuración.

Sin requerir que el usuario abra una vista individual, cada corte deberá mostrar:

- Hora.
- Tipo de servicio.
- Precio.
- Medio de pago.
- Propina, cuando corresponda.
- Nota adicional, cuando corresponda.

Debajo de cada columna se debe mostrar un resumen del barbero que incluya:
- Cantidad de cortes.
- Total facturado de .cortes (Sin contar comisión ni adelantos).
- Total de propinas.
- Total adelantado.
- Total despues de comisión y adelantos.

A su vez esta interfaz debe tener un boton para poder acceder a la interfaz IU-005.

#### IU-001.1 — Formulario para registrar un corte

El sistema deberá mostrar un formulario para registrar un corte al seleccionar la acción de agregar ubicada en la columna de un barbero.

El formulario deberá mostrar el barbero seleccionado y asociarlo automáticamente al nuevo corte. El usuario deberá poder ingresar:

- Hora del servicio.
- Tipo de servicio.
- Precio del servicio.
- Propina, cuando corresponda.
- Medio de pago.
- Importes abonados en efectivo y Mercado Pago cuando el pago sea combinado.
- Nota adicional, cuando corresponda.

El formulario deberá validar los campos obligatorios y los importes ingresados.
Cuando el medio de pago sea combinado, la suma de efectivo y Mercado Pago deberá coincidir con el precio del servicio más la propina.

La interfaz deberá permitir guardar el corte o cancelar la operación sin realizar cambios. Después de guardar, el corte deberá aparecer en la columna del barbero y deberán actualizarse los totales de la jornada.

#### IU-001.2 — Acceso al detalle de un corte

Al seleccionar un corte en el panel diario, el sistema deberá mostrar sus datos
completos y las acciones disponibles para su modificación o eliminación.

La forma de presentación del detalle —ventana emergente, panel lateral u otro
mecanismo— se encuentra pendiente de definición.

#### IU-003 — Gestión de ventas, adelantos y salidas de caja

El sistema deberá proporcionar una interfaz única para consultar y gestionar las
ventas, los adelantos y las salidas de caja correspondientes a la jornada
seleccionada.

La interfaz deberá diferenciar visualmente los tres tipos de operación y permitir
al usuario acceder a las funciones de registro, modificación y eliminación.

La interfaz deberá:

- Presentar las ventas, los adelantos y las salidas de caja en tres secciones separadas dentro de una
  misma vista.
- Mostrar únicamente las operaciones de la jornada seleccionada.
- Utilizar un listado tabular para cada tipo de operación.
- Incluir una acción visible para agregar una venta y otra para agregar un
  adelanto.
- Incluir una acción visible para registrar una salida de caja.
- Abrir los formularios de alta y modificación mediante diálogos, manteniendo
  visible la interfaz de origen detrás de estos.
- Mostrar el detalle completo al seleccionar una venta o un adelanto del listado.
- Incluir dentro del detalle las acciones para modificar o eliminar la operación.
- Solicitar confirmación antes de eliminar una venta o un adelanto.
- Solicitar confirmación antes de eliminar una salida de caja.
- Actualizar los listados y recalcular los totales después de registrar,
  modificar o eliminar una operación, sin recargar la página.
- Mostrar en cada sección un resumen de los importes correspondientes a Efectivo
  y Mercado Pago para la jornada seleccionada.

El listado de ventas deberá mostrar:

- Hora.
- Producto.
- Cantidad.
- Precio unitario.
- Importe total.
- Medio de pago.
- Notas, cuando existan.

El listado de adelantos deberá mostrar:

- Hora.
- Barbero destinatario.
- Importe.
- Medio utilizado para entregar el dinero.
- Motivo o descripción, cuando corresponda.

El listado de salidas de caja deberá mostrar:

- Hora.
- Motivo o descripción.
- Importe.
- Medio utilizado para retirar el dinero.

##### Resumen de ventas

La sección de ventas deberá mostrar un resumen de las entradas de caja generadas
por las ventas de la jornada seleccionada. El resumen deberá incluir:

- Total ingresado mediante Efectivo.
- Total ingresado mediante Mercado Pago.
- Total general ingresado por ventas.

Cuando una venta utilice más de un medio de pago, cada importe deberá sumarse al
medio correspondiente y el total general deberá representar la suma completa de
la operación.

##### Resumen de adelantos

La sección de adelantos deberá mostrar un resumen de las salidas de caja generadas
por los adelantos de la jornada seleccionada. El resumen deberá incluir:

- Total retirado de Efectivo.
- Total retirado mediante Mercado Pago.
- Total general entregado como adelantos.

Los importes del resumen de adelantos deberán identificarse visualmente como
salidas de caja y descontarse del saldo del medio utilizado. No deberán
contabilizarse como ingresos ni reducir el total bruto generado por las ventas.

##### Resumen de salidas de caja

La sección de salidas de caja deberá mostrar un resumen de los gastos registrados
durante la jornada seleccionada. El resumen deberá incluir:

- Total retirado de Efectivo.
- Total retirado mediante Mercado Pago.
- Total general correspondiente a salidas de caja.

Las salidas deberán descontarse del saldo del medio utilizado y del balance de la
jornada. No deberán contabilizarse como adelantos ni afectar la liquidación de
ningún barbero.


#### IU-003.1 — Formulario para registrar un adelanto

El sistema deberá mostrar un formulario para registrar un adelanto entregado a
un barbero. El usuario deberá poder ingresar:

- Hora del adelanto.
- Barbero destinatario.
- Importe.
- Medio utilizado para entregar el dinero.
- Motivo o descripción, cuando corresponda.

El formulario deberá indicar que el adelanto será registrado como una salida de
caja y quedará asociado al barbero seleccionado. La hora, el barbero, el importe
y el medio de entrega deberán ser obligatorios; el importe deberá ser mayor que
cero.

La interfaz deberá permitir guardar el adelanto o cancelar la operación sin
realizar cambios. Después de guardar, deberá mostrar el adelanto en la jornada
seleccionada y actualizar los totales afectados.

#### IU-003.2 — Formulario para registrar una venta

El sistema deberá mostrar un formulario para registrar una venta de productos.
El usuario deberá poder ingresar:

- Hora de la venta.
- Producto vendido.
- Cantidad.
- Precio unitario.
- Medio de pago.
- Notas, cuando existan.

La hora, el producto, la cantidad, el precio unitario y el medio de pago deberán
ser obligatorios. La cantidad deberá ser un número entero mayor que cero y el
precio unitario deberá ser mayor que cero.

El formulario deberá calcular y mostrar el importe total de la venta antes de
confirmar la operación. La interfaz deberá permitir guardar la venta o cancelar
la operación sin realizar cambios. Después de guardar, deberá mostrar la venta
en la jornada seleccionada y actualizar los totales afectados.

#### IU-003.3 — Formulario para registrar una salida de caja

El sistema deberá mostrar un formulario para registrar una salida de caja durante
la jornada seleccionada. El usuario deberá poder ingresar:

- Hora de la salida.
- Motivo o descripción.
- Importe.
- Medio utilizado para retirar el dinero.

La hora, el motivo, el importe y el medio de salida deberán ser obligatorios. El
importe deberá ser mayor que cero.

La interfaz deberá indicar que la operación será registrada como un gasto de la
jornada y que no corresponde a un adelanto para un barbero. El usuario deberá
poder guardar la salida o cancelar la operación sin realizar cambios.

Después de guardar, la salida deberá aparecer en la jornada seleccionada y el
sistema deberá actualizar el saldo del medio utilizado y el balance general.

##### Comportamiento general

La interfaz deberá:

- Mantener visible la jornada actualmente seleccionada.
- Diferenciar claramente las ventas, los adelantos y las salidas de caja.
- Mostrar mensajes cuando existan datos obligatorios faltantes o inválidos.
- Permitir cancelar una carga o modificación sin guardar cambios.
- Solicitar confirmación antes de eliminar una venta, un adelanto o una salida de
  caja.
- Actualizar la información y los totales afectados después de cada operación.

#### IU-004 — Resumen general de jornadas

El sistema deberá proporcionar una interfaz para consultar de forma consolidada
los resúmenes diarios de la barbería.

La interfaz deberá permitir seleccionar uno de los siguientes períodos:

- Semanal.
- Mensual.
- Anual.

El usuario deberá poder elegir la semana, el mes o el año que desea consultar,
según el período seleccionado. La interfaz deberá indicar claramente el rango de
fechas incluido en el resumen.

Para el período seleccionado, el sistema deberá mostrar como mínimo:

- Cantidad total de cortes realizados.
- Ingresos por servicios.
- Ingresos por ventas.
- Propinas registradas.
- Adelantos entregados.
- Salidas de caja registradas.
- Totales por medio de pago.
- Balance general del período.

##### Resumen de facturación

El resumen deberá mostrar:

- Total facturado por servicios.
- Total facturado por ventas de productos.
- Total general facturado.
- Total de propinas.
- Total de comisiones generadas.
- Cantidad de cortes realizados.
- Cantidad de ventas registradas.

##### Resumen de caja

Para cada medio —Efectivo y Mercado Pago— la interfaz deberá mostrar:

- Caja inicial del período.
- Entradas generadas por servicios.
- Entradas generadas por ventas.
- Propinas ingresadas.
- Adelantos entregados.
- Salidas de caja por gastos.
- Caja teórica resultante.
- Caja real registrada.
- Diferencia entre la caja teórica y la caja real.

La caja teórica deberá calcularse sumando a la caja inicial todas las entradas y
restando los adelantos y las salidas de caja. Los importes de Efectivo y Mercado
Pago deberán calcularse y mostrarse por separado.

##### Resumen de movimientos

La interfaz deberá mostrar únicamente los siguientes totales consolidados:

- Total de entradas de caja.
- Total de adelantos.
- Total de salidas de caja por gastos.
- Balance neto del período.

Las ventas y los servicios deberán contabilizarse como entradas. Los adelantos y
las salidas de caja deberán contabilizarse como salidas, pero mantenerse
separados dentro del resumen.

La interfaz también deberá mostrar un resumen individual de cada barbero con
actividad dentro del período seleccionado. Para cada barbero deberá informar:

- Cantidad de cortes realizados.
- Ingresos generados por servicios.
- Propinas registradas.
- Adelantos recibidos.
- Balance correspondiente al período.

El resumen por barbero deberá actualizarse junto con el resumen general al
cambiar el período o la fecha seleccionada.

En la vista semanal, la información deberá presentarse separada por día. En la
vista mensual, deberá permitir consultar los resúmenes diarios correspondientes
al mes seleccionado. En la vista anual, la información deberá presentarse
separada por mes.

Al ingresar a la interfaz de Resúmenes, el sistema deberá seleccionar por defecto
el período semanal, el mes actual y el número de semana correspondiente a la
fecha actual.

Cada fila del resumen por día deberá mostrar la comisión total generada durante
esa jornada.

Cada división del período deberá mostrar sus propios totales y permitir acceder
al resumen diario correspondiente cuando exista ese nivel de detalle.

Cuando no existan movimientos para el período seleccionado, la interfaz deberá
mostrar un mensaje informativo en lugar de valores o secciones vacías.

Al cambiar el período o la fecha seleccionada, el sistema deberá actualizar el
resumen sin modificar los datos registrados.

#### IU-005 — Configuración

El sistema deberá proporcionar una interfaz de configuración para administrar
los servicios, los productos destinados a la venta, los barberos y la comisión
general aplicada al trabajo de los barberos.

##### IU-005.1 — Configuración de servicios

La interfaz deberá mostrar los servicios disponibles y permitir registrar,
modificar o eliminar cada servicio con los siguientes datos:

- Nombre del servicio.
- Precio.

Las acciones de registrar y modificar deberán abrir un diálogo con el formulario
correspondiente. El usuario deberá poder guardar los cambios o cerrar el diálogo
sin modificar la configuración.

El nombre deberá ser obligatorio y el precio deberá ser un importe mayor que
cero. Los servicios configurados deberán estar disponibles al registrar o
modificar un corte.

##### IU-005.2 — Configuración de productos

La interfaz deberá mostrar los productos disponibles para la venta y permitir
registrar, modificar o eliminar cada producto con los siguientes datos:

- Nombre del producto.
- Precio unitario de venta.

Las acciones de registrar y modificar deberán abrir un diálogo con el formulario
correspondiente. El usuario deberá poder guardar los cambios o cerrar el diálogo
sin modificar la configuración.

El nombre deberá ser obligatorio y el precio deberá ser un importe mayor que
cero. Los productos configurados deberán estar disponibles al registrar o
modificar una venta.

##### IU-005.3 — Configuración de barberos

La interfaz deberá mostrar los barberos registrados y permitir agregar,
modificar o eliminar cada barbero. Para cada barbero se deberá registrar como
mínimo su nombre.

Las acciones de agregar y modificar deberán abrir un diálogo con el formulario
correspondiente. El usuario deberá poder guardar los cambios o cerrar el diálogo
sin modificar la configuración.

Los barberos configurados deberán estar disponibles en el panel diario, en el
registro de cortes, en el registro de adelantos y en los resúmenes por período.

##### IU-005.4 — Configuración de comisión

La interfaz deberá permitir establecer un único porcentaje de comisión general.
Este porcentaje deberá aplicarse de igual manera a todos los barberos y no se
configurará individualmente para cada uno.

El porcentaje deberá poder modificarse desde Configuración y desde la acción
disponible en el Panel Diario.

La comisión deberá editarse directamente dentro de la interfaz de configuración,
sin abrir un diálogo adicional.

La comisión deberá aceptar un valor entre 0 % y 100 %. Cuando el porcentaje sea
modificado, el sistema deberá utilizar el nuevo valor en los cálculos posteriores
sin alterar los importes ya registrados.

##### Comportamiento general

La interfaz deberá:

- Validar los campos obligatorios y los valores ingresados.
- Permitir guardar los cambios o cancelar la operación.
- Solicitar confirmación antes de eliminar un servicio, producto o barbero.
- Informar cuando un elemento no pueda eliminarse por estar asociado a
  operaciones registradas.
- Actualizar las opciones disponibles después de guardar una configuración.


## 3.2 Requisitos funcionales

### RF-001 — Consultar el panel diario

- **Estado:** Implementado
- **Version de software:** v0.1.0

El sistema deberá permitir al usuario consultar la actividad correspondiente
a una jornada determinada desde un panel general.

El panel deberá incluir los barberos asociados a la jornada, sus cortes
registrados, la cantidad de cortes y los totales correspondientes.

### RF-002 — Consultar los cortes agrupados por barbero

- **Estado:** Implementado
- **Version de software:** v0.1.0

El sistema deberá agrupar los cortes de la jornada según el barbero que los
realizó.

Para cada corte, el sistema deberá proporcionar la hora, el servicio realizado,
el precio, el medio de pago, la propina y las notas registradas.

### RF-003 — Registrar un corte para un barbero

- **Estado:** Implementado
- **Version de software:** v0.1.0

El sistema deberá permitir registrar un nuevo corte desde el sector
correspondiente a un barbero en el panel diario.

El sistema deberá asociar automáticamente el nuevo corte con el barbero desde
el cual se inició el registro, sin requerir que el usuario vuelva a seleccionarlo.

El sistema deberá registrar la hora, el servicio, el precio, la propina cuando
corresponda, el medio de pago y las notas opcionales.

Cuando el medio de pago sea combinado, deberá registrar los importes abonados en
efectivo y Mercado Pago. La suma de ambos deberá coincidir con el precio del
servicio más la propina antes de permitir guardar el corte.

### RF-004 — Modificar un corte

- **Estado:** Implementado
- **Version de software:** v0.1.0

El sistema deberá permitir modificar los datos de un corte previamente
registrado.

Después de confirmar la modificación, el sistema deberá actualizar el corte
y recalcular los totales afectados.

### RF-005 — Eliminar un corte

- **Estado:** Implementado
- **Version de software:** v0.1.0

El sistema deberá permitir eliminar un corte previamente registrado.

Antes de realizar la eliminación, el sistema deberá solicitar confirmación
al usuario. Una vez confirmada, deberá eliminar el corte y recalcular los
totales afectados.

### RF-006 — Registrar una venta

- **Estado:** Implementado
- **Version de software:** v0.2.0

El sistema deberá permitir al usuario registrar una venta de productos durante una jornada.

Para cada venta, el sistema deberá registrar como mínimo:

- Fecha.
- Hora.
- Producto vendido.
- Cantidad.
- Precio unitario.
- Importe total.
- Medio de pago.
- Notas, cuando existan.

El sistema deberá calcular el importe total de la venta multiplicando la cantidad por el precio unitario.

Después de confirmar la operación, el sistema deberá incorporar el importe de la venta a los totales de la jornada y al medio de pago correspondiente.

Por defecto la cantidad va a ser de una unidad.

### RF-007 — Modificar una venta

- **Estado:** Implementado
- **Version de software:** v0.2.0

El sistema deberá permitir al usuario modificar los datos de una venta previamente registrada.

Antes de guardar la modificación, el sistema deberá validar los nuevos datos y recalcular el importe total de la venta.

Después de confirmar la modificación, el sistema deberá actualizar los totales de la jornada y del medio de pago correspondiente.

### RF-008 — Eliminar una venta

- **Estado:** Implementado
- **Version de software:** v0.2.0

El sistema deberá permitir al usuario eliminar una venta previamente registrada.

Antes de realizar la eliminación, el sistema deberá solicitar confirmación al usuario.

Una vez confirmada, el sistema deberá eliminar la venta y recalcular los totales de la jornada y del medio de pago correspondiente.

### RF-009 — Registrar un adelanto de caja

- **Estado:** Implementado
- **Version de software:** v0.2.0

El sistema deberá permitir al usuario registrar un adelanto entregado a un barbero durante una jornada.

Para cada adelanto, el sistema deberá registrar como mínimo:

- Fecha.
- Hora.
- Barbero destinatario.
- Importe.
- Medio utilizado para entregar el dinero.
- Motivo o descripción, cuando corresponda.

Después de confirmar la operación, el sistema deberá:

- Asociar el adelanto al barbero seleccionado.
- Registrar el adelanto como una salida de caja.
- Incorporar el importe al total de adelantos del barbero.
- Actualizar los totales de caja afectados.
- Considerar el adelanto en la liquidación posterior del barbero.

### RF-010 — Modificar un adelanto de caja

- **Estado:** Implementado
- **Version de software:** v0.2.0

El sistema deberá permitir al usuario modificar los datos de un adelanto previamente registrado.

Después de confirmar la modificación, el sistema deberá actualizar la salida de caja, el total de adelantos del barbero y su liquidación correspondiente.

### RF-011 — Eliminar un adelanto de caja

- **Estado:** Implementado
- **Version de software:** v0.2.0

El sistema deberá permitir al usuario eliminar un adelanto previamente registrado.

Antes de realizar la eliminación, el sistema deberá solicitar confirmación al usuario.

Una vez confirmada, el sistema deberá eliminar el adelanto y recalcular:

- Las salidas de caja de la jornada.
- Los totales de caja afectados.
- El total de adelantos del barbero.
- La liquidación correspondiente al barbero.

### RF-012 — Consultar resúmenes por período

- **Estado:** Implementado
- **Version de software:** v0.2.0

El sistema deberá permitir consultar la información consolidada de las jornadas
por período semanal, mensual o anual.

El usuario deberá poder seleccionar el período y una fecha de referencia. El
sistema deberá determinar el rango de fechas correspondiente y calcular:

- Cantidad de cortes realizados.
- Ingresos por servicios.
- Ingresos por ventas.
- Total general facturado.
- Propinas registradas.
- Comisiones generadas.
- Adelantos entregados.
- Salidas de caja registradas.
- Cajas iniciales de Efectivo y Mercado Pago.
- Cajas teóricas de Efectivo y Mercado Pago.
- Cajas reales de Efectivo y Mercado Pago.
- Diferencias entre las cajas teóricas y las cajas reales.
- Totales por medio de pago.
- Balance general del período.

El sistema deberá presentar los datos mediante totales consolidados y no deberá
listar las ventas, los adelantos ni las salidas de caja individuales dentro del
resumen general.

La vista semanal deberá separar la información por día; la vista mensual deberá
permitir consultar los resúmenes diarios del mes; y la vista anual deberá separar
la información por mes.

Al abrir la interfaz, el sistema deberá mostrar por defecto la semana actual. El
desglose diario deberá incluir la comisión total correspondiente a cada jornada.

### RF-013 — Consultar resúmenes por barbero

- **Estado:** Implementado
- **Version de software:** v0.2.0

El sistema deberá mostrar, dentro del período seleccionado, un resumen para cada
barbero que haya registrado actividad.

Para cada barbero deberá calcular la cantidad de cortes, los ingresos generados
por servicios, las propinas, los adelantos y el balance correspondiente.

Los totales por barbero deberán obtenerse de las mismas operaciones utilizadas
para calcular el resumen general del período.

### RF-014 — Administrar servicios

- **Estado:** Implementado
- **Version de software:** v0.2.0

El sistema deberá permitir registrar, modificar y eliminar servicios indicando
su nombre y precio.

El nombre deberá ser obligatorio y el precio deberá ser mayor que cero. Los
servicios configurados deberán estar disponibles en el formulario de cortes.

Un servicio asociado a cortes registrados no deberá eliminarse si la operación
compromete la conservación del historial.

### RF-015 — Administrar productos

- **Estado:** Implementado
- **Version de software:** v0.2.0

El sistema deberá permitir registrar, modificar y eliminar productos indicando
su nombre y precio unitario de venta.

El nombre deberá ser obligatorio y el precio deberá ser mayor que cero. Los
productos configurados deberán estar disponibles en el formulario de ventas.

Un producto asociado a ventas registradas no deberá eliminarse si la operación
compromete la conservación del historial.

### RF-016 — Administrar barberos

- **Estado:** Implementado
- **Version de software:** v0.2.0

El sistema deberá permitir registrar, modificar y eliminar barberos. El nombre
del barbero deberá ser obligatorio.

Los barberos configurados deberán estar disponibles en el panel diario, los
formularios de cortes y adelantos, y los resúmenes por período.

Un barbero asociado a operaciones registradas no deberá eliminarse si la
operación compromete la conservación del historial.

### RF-017 — Configurar la comisión general

- **Estado:** Implementado
- **Version de software:** v0.2.0

El sistema deberá permitir establecer un único porcentaje de comisión general,
aplicable por igual a todos los barberos.

El porcentaje deberá poder modificarse desde Configuración y desde el Panel
Diario.

El porcentaje deberá encontrarse entre 0 % y 100 %. La comisión deberá calcularse
sobre el precio de los servicios realizados por cada barbero; no deberá incluir
propinas, ventas ni adelantos.

Cuando el porcentaje sea modificado, el nuevo valor deberá aplicarse a las
operaciones posteriores sin alterar las comisiones previamente registradas.

### RF-018 — Registrar una salida de caja

- **Estado:** Implementado
- **Version de software:** v0.2.0

El sistema deberá permitir registrar una salida de caja asociada a la jornada
seleccionada.

Para cada salida deberá registrar la fecha, la hora, el motivo o descripción, el
importe y el medio utilizado para retirar el dinero.

Después de confirmar la operación, el sistema deberá descontar el importe del
saldo del medio utilizado, incorporarlo al total de salidas de caja y actualizar
el balance de la jornada.

### RF-019 — Modificar una salida de caja

- **Estado:** Implementado
- **Version de software:** v0.2.0

El sistema deberá permitir modificar una salida de caja previamente registrada.
Antes de guardar, deberá validar los nuevos datos y el importe.

Después de confirmar la modificación, el sistema deberá actualizar los saldos,
el total de salidas y el balance de la jornada.

### RF-020 — Eliminar una salida de caja

- **Estado:** Implementado
- **Version de software:** v0.2.0

El sistema deberá permitir eliminar una salida de caja previamente registrada.
Antes de eliminarla, deberá solicitar confirmación al usuario.

Después de confirmar la eliminación, el sistema deberá recalcular los saldos, el
total de salidas de caja y el balance de la jornada.

### RF-021 — Iniciar una jornada

- **Estado:** Implementado
- **Version de software:** v0.2.0

El sistema deberá solicitar la caja inicial de Efectivo y la caja inicial de
Mercado Pago desde el Panel Diario.

El sistema no deberá permitir registrar cortes, ventas, adelantos ni salidas de
caja hasta que la jornada haya sido iniciada.

Después de guardar la apertura, deberá habilitar las operaciones de la jornada y
utilizar los importes iniciales como base para calcular las cajas teóricas.

El formulario de apertura deberá quedar oculto después de iniciar la jornada. El
sistema deberá mostrar los importes guardados y permitir su modificación mediante
una acción explícita de edición.

## 3.3 Requisitos de rendimiento

### RNF-REN-001 — Tiempo de actualización del panel diario

- **Estado:** Pendiente
- **Version de software:** -

Después de registrar, modificar o eliminar un corte, el sistema deberá
actualizar la información del panel diario y sus totales dentro del tiempo
máximo definido para el proyecto.

**Valor pendiente:** Tiempo máximo aceptable definido por el cliente.

### RNF-REN-002 — Capacidad de una jornada

- **Estado:** Pendiente
- **Version de software:** -

El sistema deberá permitir consultar una jornada con al menos X
cortes registrados sin superar el tiempo de respuesta establecido.

**Valor pendiente:** Valor X definido por el cliente.

## 3.4 Requisitos lógicos de la base de datos

### RLD-001 — Información de los cortes

- **Estado:** Pendiente
- **Version de software:** -

El sistema deberá conservar, como mínimo, la siguiente información de cada
corte:

- Identificador único.
- Fecha.
- Hora.
- Barbero responsable.
- Servicio realizado.
- Precio cobrado.
- Medio de pago.
- Importe de la propina, cuando corresponda.
- Notas, cuando existan.
- Fecha y hora de creación.
- Fecha y hora de última modificación.

### RLD-002 — Relación entre cortes y barberos

- **Estado:** Pendiente
- **Version de software:** -

Cada corte deberá estar asociado a un único barbero.

Un barbero podrá estar asociado a múltiples cortes.

### RLD-003 — Relación entre cortes y servicios

- **Estado:** Pendiente
- **Version de software:** -

Cada corte deberá registrar un único tipo de servicio.

Un mismo tipo de servicio podrá aparecer en múltiples cortes.

### RLD-004 — Información de las ventas

El sistema deberá guardar, como mínimo, la siguiente información de cada venta:

- Identificador único.
- Fecha.
- Hora.
- Producto.
- Cantidad.
- Precio unitario.
- Importe total.
- Medio de pago.
- Notas, cuando existan.
- Fecha y hora de creación.
- Fecha y hora de última modificación.

### RLD-005 — Información de los adelantos

El sistema deberá conservar, como mínimo, la siguiente información de cada adelanto:

- Identificador único.
- Fecha.
- Hora.
- Barbero destinatario.
- Importe.
- Medio utilizado para la entrega.
- Motivo o descripción.
- Notas, cuando existan.
- Estado de liquidación.
- Fecha y hora de creación.
- Fecha y hora de última modificación.

### RLD-006 — Información de los servicios

El sistema deberá conservar, como mínimo, la siguiente información de cada
servicio:

- Identificador único.
- Nombre.
- Precio vigente.
- Fecha y hora de creación.
- Fecha y hora de última modificación.

### RLD-007 — Información de los productos

El sistema deberá conservar, como mínimo, la siguiente información de cada
producto:

- Identificador único.
- Nombre.
- Precio unitario de venta vigente.
- Fecha y hora de creación.
- Fecha y hora de última modificación.

### RLD-008 — Información de los barberos

El sistema deberá conservar, como mínimo, la siguiente información de cada
barbero:

- Identificador único.
- Nombre.
- Fecha y hora de creación.
- Fecha y hora de última modificación.

### RLD-009 — Información de la comisión

El sistema deberá conservar el porcentaje de comisión general vigente y su fecha
de modificación.

Cada corte deberá conservar el porcentaje de comisión aplicado y el importe de
comisión resultante para mantener la consistencia de los cálculos históricos.

### RLD-010 — Información de las salidas de caja

El sistema deberá conservar, como mínimo, la siguiente información de cada salida
de caja:

- Identificador único.
- Fecha.
- Hora.
- Motivo o descripción.
- Importe.
- Medio utilizado para retirar el dinero.
- Fecha y hora de creación.
- Fecha y hora de última modificación.

### RLD-011 — Información de apertura y cierre de jornada

El sistema deberá conservar para cada jornada:

- Caja inicial en Efectivo.
- Caja inicial en Mercado Pago.
- Estado de apertura de la jornada.
- Caja real en Efectivo, cuando se registre el cierre.
- Caja real en Mercado Pago, cuando se registre el cierre.
- Fecha y hora de apertura.
- Fecha y hora de última modificación.

## 3.5 Restricciones de diseño

### RD-001 — Tipo de aplicación

- **Estado:** Implementado
- **Version de software:** v0.1.0

El sistema deberá proporcionar una interfaz web accesible mediante un
navegador.

### RD-002 — Idioma

La interfaz de usuario deberá presentarse en español.

### RD-003 — Moneda

Los importes monetarios deberán presentarse en pesos argentinos.

## 3.6 Atributos del sistema

### RNF-SEG-001 — Confirmación de eliminación

- **Estado:** Implementado
- **Version de software:** v0.1.0

El sistema deberá solicitar confirmación antes de eliminar un corte.

### RNF-FIA-001 — Integridad del registro

El sistema no deberá almacenar parcialmente un corte.

Si se produce un error durante el registro, la operación deberá cancelarse sin
guardar información incompleta.

### RNF-FIA-002 — Consistencia de los totales

Después de registrar, modificar o eliminar un corte, los totales mostrados
deberán corresponder a los cortes almacenados.

### RNF-POR-001 — Compatibilidad con navegadores

El sistema deberá funcionar en los navegadores de escritorio definidos para
el proyecto.

## 3.7 Otros requisitos

### RO-001 — Documentación para el usuario

El sistema deberá entregarse acompañado por instrucciones para realizar las
operaciones principales.
