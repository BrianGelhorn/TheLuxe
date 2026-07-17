# Especificación de Requisitos de Software
## Sistema de gestión de barbería The Luxe

Versión: 0.1
Fecha: 13/07/2026
Estado: Borrador
Autor: Brian Gelhorn

## Historial de versiones

| Versión | Fecha | Autor | Descripción |
|---------|-------|-------|-------------|
| 0.1 | 13/07/2026 | Brian Gelhorn | Creación inicial |

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
- **Medio de pago:** Forma mediante la cual se cobra una operación. En este caso puede
  ser en efectivo o Mercado Pago.
- **Caja teórica:** Importe que debería existir según las operaciones registradas.
- **Caja real:** Importe efectivamente contabilizado al cerrar la jornada.
- **Usuario:** Persona autorizada para utilizar el sistema.

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

## 2.3 Características de los usuarios

### Propietario o encargado

Será el usuario principal del sistema. Necesitará consultar la actividad
general de la barbería, controlar la caja, revisar reportes y modificar la
configuración.

Se espera que posea experiencia con la operativa de la barbería.

### Operador

Podrá registrar servicios durante la jornada. 
Podrá registrar tanto ventas como servicios hechos por los barberos.

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

#### IU-001 — Visualización del panel diario

El sistema deberá presentar los barberos de la jornada en una vista conjunta,
sin requerir que el usuario abra una pantalla individual para cada barbero.

En una resolución de escritorio de 1366x768, la interfaz deberá mostrar
simultáneamente al menos cinco barberos.

El sistema deberá mostrar cada corte directamente dentro del sector
correspondiente al barbero que lo realizó.

Sin requerir que el usuario abra una vista individual, cada corte deberá mostrar:

- Hora.
- Tipo de servicio.
- Precio.
- Medio de pago.
- Propina, cuando corresponda.

#### IU-002 — Acceso al detalle de un corte

Al seleccionar un corte en el panel diario, el sistema deberá mostrar sus datos
completos y las acciones disponibles para su modificación o eliminación.

La forma de presentación del detalle —ventana emergente, panel lateral u otro
mecanismo— se encuentra pendiente de definición.

## 3.2 Requisitos funcionales

### RF-001 — Consultar el panel diario

El sistema deberá permitir al usuario consultar la actividad correspondiente
a una jornada determinada desde un panel general.

El panel deberá incluir los barberos asociados a la jornada, sus cortes
registrados, la cantidad de cortes y los totales correspondientes.

### RF-002 — Consultar los cortes agrupados por barbero

El sistema deberá agrupar los cortes de la jornada según el barbero que los
realizó.

Para cada corte, el sistema deberá proporcionar la hora, el servicio realizado,
el precio, el medio de pago, la propina y las notas registradas.

### RF-003 — Registrar un corte para un barbero

El sistema deberá permitir registrar un nuevo corte desde el sector
correspondiente a un barbero en el panel diario.

El sistema deberá asociar automáticamente el nuevo corte con el barbero desde
el cual se inició el registro, sin requerir que el usuario vuelva a seleccionarlo.

### RF-004 — Modificar un corte

El sistema deberá permitir modificar los datos de un corte previamente
registrado.

Después de confirmar la modificación, el sistema deberá actualizar el corte
y recalcular los totales afectados.

### RF-005 — Eliminar un corte

El sistema deberá permitir eliminar un corte previamente registrado.

Antes de realizar la eliminación, el sistema deberá solicitar confirmación
al usuario. Una vez confirmada, deberá eliminar el corte y recalcular los
totales afectados.

## 3.3 Requisitos de rendimiento

### RNF-REN-001 — Tiempo de actualización del panel diario

Después de registrar, modificar o eliminar un corte, el sistema deberá
actualizar la información del panel diario y sus totales dentro del tiempo
máximo definido para el proyecto.

**Valor pendiente:** Tiempo máximo aceptable definido por el cliente.

### RNF-REN-002 — Capacidad de una jornada

El sistema deberá permitir consultar una jornada con al menos X
cortes registrados sin superar el tiempo de respuesta establecido.

**Valor pendiente:** Valor X definido por el cliente.

## 3.4 Requisitos lógicos de la base de datos

### RLD-001 — Información de los cortes

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

Cada corte deberá estar asociado a un único barbero.

Un barbero podrá estar asociado a múltiples cortes.

### RLD-003 — Relación entre cortes y servicios

Cada corte deberá registrar un único tipo de servicio.

Un mismo tipo de servicio podrá aparecer en múltiples cortes.

## 3.5 Restricciones de diseño

### RD-001 — Tipo de aplicación

El sistema deberá proporcionar una interfaz web accesible mediante un
navegador.

### RD-002 — Idioma

La interfaz de usuario deberá presentarse en español.

### RD-003 — Moneda

Los importes monetarios deberán presentarse en pesos argentinos.

## 3.6 Atributos del sistema

### RNF-SEG-001 — Confirmación de eliminación

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
