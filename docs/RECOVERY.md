# Copias pendientes: revisión y recuperación

## Comportamiento

El aviso busca las claves `theluxe-pending-state-v1` y `theluxe-pending-state-v1:<identificador>` en el mismo origen y perfil de navegador. Incluye copias de sesiones anteriores, no solo la de la pestaña actual. Si al iniciar hay una copia anterior distinta de una base existente, la aplicación carga la base y preserva el borrador bajo su clave; las operaciones nuevas usan otra clave para no pisarlo.

El diálogo muestra cada registro faltante o diferente, con fecha, importe, detalle y comparación entre lo guardado y la copia. Permite elegir faltantes y mantener pendientes los demás. Los registros idénticos no se duplican. Los registros existentes con diferencias, configuraciones vigentes y cajas ya guardadas se conservan. Una coincidencia de barbero/hora con otro identificador exige revisión, salvo que el otro registro pertenezca a la misma copia y ya se haya recuperado, lo que permite recuperar en pasos separados operaciones legítimas de la misma hora.

Las dependencias de ventas/stock y pagos/operaciones se verifican también en el servidor. El servidor reconstruye la selección desde los datos originales y la base actual: no acepta un estado combinado arbitrario enviado por el cliente. Revisa formato, relaciones de inventario, comisiones y restricciones financieras mediante las mismas validaciones que los guardados normales.

## Guardado y respaldo

- `POST /api/recovery/preview`: compara `{raw}` con una lectura consistente de la base y devuelve revisión, registros y dependencias; no escribe.
- `POST /api/recovery/apply`: recibe `{raw,revision,selected,requestId}`. Dentro de `BEGIN IMMEDIATE`, comprueba la revisión, vuelve a comparar y validar, inserta el respaldo completo y actualiza el estado. Un fallo revierte ambas escrituras.
- El identificador de solicitud y el hash del contenido permiten reintentar el mismo pedido después de perder una respuesta sin duplicar la operación. Reutilizar el identificador para otra selección se rechaza. Un reintento devuelve la base actual, incluso si hubo operaciones posteriores al primer guardado.
- `POST /api/recovery/archive`: conserva el texto original, incluso si está dañado, y el estado actual en `recovery_history`. No cambia la revisión financiera ni agrega operaciones. El navegador retira la copia local únicamente después del acuse y si su contenido no cambió.
- `GET /api/recovery/history` y `GET /api/recovery/history/:id`: permiten consultar copias revisadas y descargar el estado previo, el texto pendiente original y la selección. Las copias no se eliminan automáticamente. El historial se incluye en los respaldos SQLite normales.

La copia local se conserva después de recuperar, incluso cuando la recuperación es parcial. El cliente decide cuándo archivarla. Las copias archivadas se pueden volver a abrir para compararlas otra vez con la base actual. Si el almacenamiento o el host fallan, se muestra el error sin borrar la copia.

## Verificaciones automatizadas

`npm run test:recovery` ejecuta 27 pruebas específicas y exige 99% de líneas, 90% de ramas y 90% de funciones en los dos módulos nuevos. Último resultado: **27 aprobadas; 100% de líneas, 92,66% de ramas y 96,04% de funciones**.

Los casos `REC-001` a `REC-012` verifican combinación, conservación de registros, detección de duplicados, dependencias, catálogos/aperturas, selección parcial, control de revisión, copia dañada, archivo recuperable, idempotencia, rollback ante fallo real de SQLite y dos cortes del mismo barbero/hora recuperados en pasos separados.

Los casos `RECUI-001` a `RECUI-015` usan HTML y formularios reales con jsdom y la API SQLite: aviso de otra ventana, vista de comparación, selección y dependencias, recuperación, historial, archivo confirmado, cambios concurrentes del borrador y de la base, pérdida del acuse, respuesta incorrecta, descargas, HTML escapado, borrador propio en conflicto, almacenamiento inaccesible errores del host y archivo de una copia sin alterar otros cambios pendientes de la ventana.

## Demostración en navegador

Se usaron copias separadas de la base y de un borrador pendiente de una jornada anterior. Desde la UI se incorporaron cortes, ventas, adelantos, pagos y movimientos de stock que faltaban, manteniendo el cierre posterior y las operaciones de las jornadas siguientes. Se comprobó la confirmación, el respaldo, el archivo y la revisión posterior de la copia archivada en un navegador real. Los archivos originales permanecieron intactos.

Las capturas de la demostración y las bases privadas están en `output/`, que no se publica en Git. La demostración es una instalación de prueba; no modifica la PC del cliente.

## Límites

Se incorpora lo que contiene la copia. No se inventan operaciones, pagos, ni saldos faltantes. Los cierres pueden mostrar diferencias al recuperar cobros o pagos y deben revisarse en la jornada. Las diferencias sobre registros ya existentes se muestran y se conservan; esta versión no reemplaza automáticamente ediciones o configuraciones actuales con valores antiguos.

La revisión necesita una base inicializada y un borrador con inventario versión 2 válido para recuperar. Copias incompatibles o dañadas se pueden exportar y archivar para revisión manual. El historial es local a la base y no sustituye un respaldo fuera de la PC.
