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
- **Barbero:** Trabajador al cual se asignan los servicios realizados.
- **Servicio:** Prestación realizada por un barbero, como corte, barba o color.
- **Corte:** Término utilizado operativamente por el cliente para referirse al
  registro de un servicio realizado.
- **Jornada:** Día de trabajo sobre el cual se registran operaciones.
- **Medio de pago:** Forma mediante la cual se cobra una operación. En este caso puede ser en efectivo, Mercado Pago o ambos.
- **Caja teórica:** Importe que debería existir según las operaciones registradas.
- **Caja real:** Importe efectivamente contabilizado al cerrar la jornada.
- **Usuario:** Persona autorizada para utilizar el sistema.
- **Venta:** venta de un producto, separada de los servicios realizados.
- **Adelanto de caja:** dinero retirado de la caja y entregado anticipadamente a un barbero, que luego deberá descontarse de su liquidación.

## 1.4 Referencias

Por definir

# 2. Descripción general

## 2.1 Perspectiva del producto

The Luxe será un sistema nuevo destinado a sustituir progresivamente las
planillas de Excel utilizadas para registrar y consolidar la actividad de la
barbería.

El producto, en su primera versión inicial, va a funcionar exclusivamente en el navegador y
guardará los datos en una base de datos PostgreSQL local.

La base de datos contendrá todos los datos de caja diarios, así como información de barberos e información
sobre los servicios que la misma brinde.
Esta base de datos realizará periódicamente copias de seguridad locales de los mismos.

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

Sin requerir que el usuario abra una vista individual, cada corte deberá mostrar:

- Hora.
- Tipo de servicio.
- Precio.
- Medio de pago.
- Propina, cuando corresponda.
- Nota adicional, cuando corresponda.

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

#### IU-003 — Gestión de ventas y adelantos

El sistema deberá proporcionar una interfaz única para consultar y gestionar las ventas y los adelantos correspondientes a la jornada seleccionada.

La interfaz deberá diferenciar visualmente ambos tipos de operación y permitir al usuario acceder a las funciones de registro, modificación y eliminación.


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

##### Comportamiento general

La interfaz deberá:

- Mantener visible la jornada actualmente seleccionada.
- Diferenciar claramente las ventas de los adelantos.
- Mostrar mensajes cuando existan datos obligatorios faltantes o inválidos.
- Permitir cancelar una carga o modificación sin guardar cambios.
- Solicitar confirmación antes de eliminar una venta o un adelanto.
- Actualizar la información y los totales afectados después de cada operación.


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

El sistema deberá permitir al usuario modificar los datos de una venta previamente registrada.

Antes de guardar la modificación, el sistema deberá validar los nuevos datos y recalcular el importe total de la venta.

Después de confirmar la modificación, el sistema deberá actualizar los totales de la jornada y del medio de pago correspondiente.

### RF-008 — Eliminar una venta

El sistema deberá permitir al usuario eliminar una venta previamente registrada.

Antes de realizar la eliminación, el sistema deberá solicitar confirmación al usuario.

Una vez confirmada, el sistema deberá eliminar la venta y recalcular los totales de la jornada y del medio de pago correspondiente.

### RF-009 — Registrar un adelanto de caja

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

El sistema deberá permitir al usuario modificar los datos de un adelanto previamente registrado.

Después de confirmar la modificación, el sistema deberá actualizar la salida de caja, el total de adelantos del barbero y su liquidación correspondiente.

### RF-011 — Eliminar un adelanto de caja

El sistema deberá permitir al usuario eliminar un adelanto previamente registrado.

Antes de realizar la eliminación, el sistema deberá solicitar confirmación al usuario.

Una vez confirmada, el sistema deberá eliminar el adelanto y recalcular:

- Las salidas de caja de la jornada.
- Los totales de caja afectados.
- El total de adelantos del barbero.
- La liquidación correspondiente al barbero.

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
