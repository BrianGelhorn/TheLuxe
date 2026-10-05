# The Luxe — instalación local

La instalación **nativa** ejecuta la web, la API SQLite y el actualizador con Node.js, **solo en esta PC**, sin Docker, WSL ni máquina virtual. La variante Docker anterior se conserva para instalaciones existentes; no se migra ni se elimina su base automáticamente.

## Instalación nativa — recomendada para el cliente

Requiere Windows x64 compatible con Node.js 24 o superior, Git para Windows en `Program Files`, Internet para instalar/actualizar y permisos de administrador para configurar el arranque. **No exige 8 GB de RAM**: una PC de 4 GB no queda descartada por el instalador, pero su rendimiento debe comprobarse con Windows, el navegador y las otras aplicaciones reales. Windows 10 build 19045 se admite técnicamente; hay que confirmar su cobertura de seguridad/ESU, no basta con que la app arranque.

Una vez publicada esta versión, pegá en PowerShell:

```powershell
$installer = Join-Path $env:TEMP 'theluxe-install-native.ps1'; Invoke-WebRequest -UseBasicParsing 'https://raw.githubusercontent.com/BrianGelhorn/TheLuxe/main/install-native.ps1' -OutFile $installer; if ($?) { powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installer }
```

El comando descarga código del repositorio: ejecutalo solo si confiás en él, o descargá y revisá el archivo antes. El instalador pide elevación UAC e instala Git/Node faltantes mediante winget, con sus avisos de licencia y permisos. Si winget no está disponible, instalá **App Installer** desde Microsoft Store o instalá Git y Node LTS manualmente para todos los usuarios, y repetí el comando. No instala Docker ni dependencias npm; no acepta licencias ni reinicia Windows por vos.

### Arranque y ubicación de datos

La tarea **TheLuxe Native** del Programador de tareas se configura **al arrancar Windows**, con la cuenta integrada `LocalService`, sin guardar una contraseña y sin requerir login. Mantiene Node en ejecución, reintenta hasta tres veces si el proceso falla y no impone un límite de horas ni de batería. Es una **tarea con cuenta de servicio**, no un servicio de `Services.msc`. Los archivos financieros solo tienen acceso de archivo para administradores, SYSTEM y LocalService; el navegador accede a la API local.

| Ubicación predeterminada | Contenido |
| --- | --- |
| `%ProgramData%\TheLuxeNative\repo` | Copia administrada de `main` |
| `%ProgramData%\TheLuxeNative\releases` | Versiones de código, separadas de los datos |
| `%ProgramData%\TheLuxeNative\data\theluxe.sqlite` | Base SQLite |
| `%ProgramData%\TheLuxeNative\data\backups` | Copias SQLite diarias y previas a actualizar |
| `%ProgramData%\TheLuxeNative\logs` | `native-current.log` y el arranque anterior |

Abrí **http://127.0.0.1:8000/** o el acceso directo **TheLuxe Native**. La instalación comienza con su propia base, sin operaciones de prueba. Web/API y actualizador escuchan solo en loopback (`8000`/`8001`); no expongas los puertos en la red ni en Internet: no hay autenticación de usuarios.

Las copias diarias se comprueban al iniciar y cada hora, una por fecha después de inicializar la base. Cuando existe una copia válida de hoy, se eliminan las copias automáticas anteriores a los últimos **14 días calendario, incluido hoy**, sin tocar copias manuales. Si falla el respaldo o la limpieza, queda el diagnóstico en los logs. Una PC apagada no genera copias retrospectivas. **Definí también una copia fuera de la PC**: el instalador no configura USB/nube, y un respaldo local no cubre robo o rotura del disco.

El instalador puede repetirse para completar etapas pendientes sin borrar la base o reemplazar el puntero activo. Rechaza carpetas/tareas ajenas, enlaces y puertos ocupados por otra instalación. No hace `git pull`, no fuerza cierres de otras apps y no desinstala Docker. Usá la ubicación predeterminada: LocalService no puede ejecutar código desde el perfil privado de otro usuario.

### Fixes y recuperación nativos

El desarrollador verifica y publica a `main`; el cliente usa **Buscar → Actualizar → Recargar**, fuera de horario y sin cambios pendientes. El actualizador prepara y comprueba la versión antes de detener la app, respalda SQLite y verifica que no hubo escrituras entre el respaldo y la detención. Mantiene el archivo de datos fuera del código y conserva la versión activa y la anterior tras una actualización correcta. Si falla el candidato, vuelve al código anterior **sin reemplazar SQLite**: las operaciones nuevas no se pisan con el respaldo.

Los cambios al coordinador del host requieren reiniciar la tarea fuera de horario con PowerShell elevado:

```powershell
Stop-ScheduledTask -TaskName 'TheLuxe Native'
Start-ScheduledTask -TaskName 'TheLuxe Native'
```

El ejecutor `start-native.ps1` queda copiado fuera del repo para el arranque; si se modifica ese archivo, requiere intervención de mantenimiento para actualizar su copia protegida. El botón no promete actualizar componentes del host en memoria ni migraciones destructivas de esquema. Si el rollback del código no puede leer una base de una versión futura incompatible, conservá también el estado actual antes de decidir restaurar la copia previa.

Para una restauración manual, detené la tarea, comprobá que no haya procesos nativos escuchando y respaldá también la base actual antes de reemplazarla. Copiá el respaldo elegido sobre `data\theluxe.sqlite` y volvé a iniciar la tarea; la restauración reemplaza datos y requiere revisar qué operaciones perdería. No uses el instalador para sobrescribir una base existente.

### Migrar desde Docker (explícito, no automático)

Si ya hay datos en Docker, primero cerrá la jornada, confirmá los guardados y creá una copia consistente deteniendo sus contenedores desde **esa carpeta de instalación**:

```powershell
docker compose stop web api
docker compose cp api:/data/theluxe.sqlite "$env:USERPROFILE\theluxe-migracion.sqlite"
```

Conservá el volumen y la copia original. Cerrá el actualizador Docker anterior para liberar `8001`; **no uses `docker compose down -v`**. Ejecutá el instalador nativo elevado, solo con un destino nuevo, indicando la copia:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\install-native.ps1" -DatabaseBackupPath "$env:USERPROFILE\theluxe-migracion.sqlite"
```

La importación crea y verifica otra copia de SQLite sin modificar el archivo fuente ni sobrescribir una base destino. Comprobá versión, operaciones y un nuevo respaldo antes de dejar de usar Docker. No operes a la vez en ambas instalaciones: sus bases divergirían. Para volver atrás, detené la tarea nativa antes de arrancar Docker; su volumen no contiene operaciones posteriores hechas en la base nativa.

**Antes de entregar:** comprobá en la notebook que arranque tras reiniciar y antes del login, que una operación guardada sobreviva, que exista un respaldo verificable y que pueda recuperarse en un entorno descartable. Hay pruebas reales de procesos, persistencia y rollback; también se ensayó una tarea real con LocalService en ProgramData, verificando web/API/actualizador/backup y liberación de puertos al detenerla. Eso no sustituye la verificación del reinicio físico ni del rendimiento en la PC del cliente.

## Variante Docker — instalación anterior

Esta alternativa requiere Docker Desktop. La API se accede por `/api/` detrás de la web; nunca se expone el socket Docker al navegador. Las siguientes instrucciones son para mantener una instalación Docker, **no** para el instalador nativo.

### Instalador asistido (Windows 11 x64)

`install-windows.ps1` instala las herramientas faltantes con **winget**, clona `main` en `%LOCALAPPDATA%\TheLuxe\theluxe-client`, construye los contenedores, verifica la versión y la API, registra una tarea del usuario al iniciar sesión y crea un acceso directo en el escritorio. No hace falta instalar dependencias npm en el cliente. Requiere Internet para instalar y actualizar; la operación diaria usa la base local.

Descargá y revisá `install-windows.ps1` de esta versión del repositorio, guardalo fuera de la carpeta de instalación y ejecutalo desde PowerShell **con el usuario de Windows que usará la app**:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\install-windows.ps1"
```

Para descargarlo y ejecutarlo en un comando **una vez publicada esta versión**, desde PowerShell:

```powershell
$installer = Join-Path $env:TEMP 'theluxe-install-windows.ps1'; Invoke-WebRequest -UseBasicParsing 'https://raw.githubusercontent.com/BrianGelhorn/TheLuxe/main/install-windows.ps1' -OutFile $installer; if ($?) { powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installer }
```

El comando ejecuta código descargado de `main`: usalo solo si confiás en el repositorio. Podés descargar el archivo primero y revisarlo antes de ejecutar. Los instaladores pueden pedir permisos; Docker Desktop requiere aceptar sus términos y una PC compatible (virtualización, WSL 2 y al menos 8 GB RAM). No instala Windows, no activa virtualización en BIOS, no acepta licencias en tu nombre ni reinicia la PC. Si falta WSL, ejecutá `wsl --install --no-distribution` como administrador, reiniciá y repetí el comando. Si falta winget, instalá **App Installer** desde Microsoft Store. Si Windows impide registrar la tarea, repetí con PowerShell elevado bajo **el mismo usuario**, no con la cuenta de otro administrador.

Es reejecutable sin borrar datos: una copia existente debe ser un repositorio limpio de `main`, no se hace `git pull` ni se reconstruyen sus contenedores al repetirlo. Si su versión difiere, usá el actualizador fuera de horario. Si detecta un volumen anterior sin contenedores o puertos ocupados por otra instalación, se detiene para revisión. No muevas ni renombres la carpeta instalada: Compose identifica su volumen por esa ubicación. Un fallo puede dejar herramientas o contenedores instalados; el script informa el fallo, no elimina el estado anterior para empezar de cero.

La tarea **TheLuxe - inicio local** ejecuta `start-client.ps1` al iniciar sesión, arranca Docker y los contenedores existentes y mantiene el actualizador/backups. No actualiza automáticamente durante el arranque. Registra diagnóstico en `%LOCALAPPDATA%\TheLuxe\logs\startup.log` y conserva el arranque anterior en `startup.previous.log`. Reintenta hasta tres veces si falla el proceso; si Docker/WSL siguen fallando, necesita intervención. No funciona antes de iniciar sesión. Los respaldos comienzan tras el primer guardado en la app: una base aún sin inicializar no cuenta como copia diaria.

**Antes de entregar:** reiniciá Windows y comprobá web/API/actualizador, guardá una operación de prueba en una instalación descartable y verificá su persistencia, revisá el respaldo diario y definí una copia externa (USB o nube) con recuperación ensayada. El instalador no configura un destino externo ni afirma éxito de esa protección. No se ha verificado aún en una PC Windows limpia del cliente.

### Instalación manual

Requiere Docker Desktop iniciado, Git y Node.js 24. Usá una **copia limpia de `main`**, separada del directorio donde desarrollás:

```powershell
git clone https://github.com/BrianGelhorn/TheLuxe.git C:\TheLuxe
```

Desde `C:\TheLuxe`, construí e iniciá la aplicación:

```powershell
$env:SOURCE_COMMIT = git rev-parse HEAD
docker compose build --build-arg "SOURCE_COMMIT=$env:SOURCE_COMMIT" api web
docker compose up -d api web
node host-updater.mjs
```

Dejá `node host-updater.mjs` ejecutándose. Para iniciarlo automáticamente con Windows, configurá el Programador de tareas para ejecutar `node C:\TheLuxe\host-updater.mjs` al iniciar sesión, después de Docker Desktop. No lo ejecutes desde un repositorio con cambios locales: el actualizador se negará a modificarlos.
Si una versión modifica `host-updater.mjs`, reiniciá el proceso Node: el proceso que ya estaba corriendo no carga automáticamente el código nuevo. Para instalar por primera vez la versión con respaldo previo, cerrá el actualizador anterior y, desde la **copia limpia de instalación**, ejecutá `git pull --ff-only origin main` y `node host-updater.mjs`. Esto actualiza el código del host **sin reiniciar aún la web**; después usá Buscar → Actualizar → Recargar en la app. No lo hagas en el repositorio de desarrollo con cambios locales.

Abrí **http://127.0.0.1:8000/**. En Configuración, pulsá **Buscar** para consultar `main`, **Actualizar** para instalar y, una vez que Docker sirva la versión nueva, **Recargar**. Si el repositorio es privado, configurá el acceso de Git a GitHub en la PC; no pongas tokens en la web.

### Primera migración desde la versión sin API

El actualizador **ya iniciado** en la versión anterior solo conoce el contenedor `web`: aunque descargue este código, no puede iniciar `api` hasta que reinicies el proceso. Hacé **una vez** estos pasos en la copia limpia del cliente, en lugar de usar el botón Actualizar para esta migración:

1. Cerrá el proceso anterior `node host-updater.mjs`. Cerrá la jornada y comprobá que no haya cambios pendientes; las finanzas anteriores no estaban guardadas y se perderán al recargar.
2. Desde la carpeta de instalación ejecutá:

```powershell
git pull --ff-only origin main
$env:SOURCE_COMMIT = git rev-parse HEAD
docker compose build --build-arg "SOURCE_COMMIT=$env:SOURCE_COMMIT" api web
docker compose up -d api web
node host-updater.mjs
```

3. Recargá `http://127.0.0.1:8000/`. Desde entonces los botones actualizarán los dos contenedores y conservarán la base.

## Publicar cambios

El desarrollador revisa y publica sus cambios con un commit y `git push origin main`. Para cambios de web/API, la PC del cliente usa los botones de Configuración. Si cambia `host-updater.mjs` o los scripts de arranque, hay que actualizar el código de la copia limpia fuera de horario y reiniciar la tarea **TheLuxe - inicio local** (o el proceso Node manual); el botón no recarga el proceso del host. Si GitHub, Docker Desktop o el actualizador no están disponibles, se muestra un error. Si falla el reinicio del contenedor, habrá que revisar Docker en esa PC.

El estado completo (configuración, cortes, ventas, adelantos, gastos, transferencias, apertura/cierre, pagos e inventario) se guarda en SQLite dentro del volumen de Docker `data`. Reiniciar o reconstruir contenedores **no** elimina el volumen. **No uses `docker compose down -v`**: borra la base. En la primera instalación, el inventario anterior de `localStorage` se importa desde el mismo navegador y origen `127.0.0.1:8000`; mantené ese origen hasta completar la importación. Las finanzas antiguas que el prototipo descartaba en cada recarga no se pueden recuperar.

Si se corta la conexión durante un guardado, la app muestra el error y conserva una copia **provisional** de los cambios pendientes en ese navegador hasta que SQLite confirme el guardado. Reintentá antes de cerrar. Si otra pestaña cambió la base, se bloquea el guardado para no pisarla: conservá esa pestaña y resolvé el conflicto manualmente; no borres el almacenamiento del navegador mientras queden cambios pendientes.

Si aparece un conflicto entre pestañas, **Descargar copia sin guardar** conserva el borrador en un archivo JSON; **Usar versión de la base de datos** descarta ese borrador solo después de confirmarlo y vuelve a leer la base. No se combinan automáticamente operaciones diferentes: revisá el archivo y cargá manualmente las que falten.

## API

`GET /api/state` lee un estado consistente y su `revision`. `PUT /api/state` con `{ "revision": 1, "state": { ... } }` guarda **todo junto**, necesario para operaciones como venta + descuento de stock. La API devuelve la nueva revisión o `409` si alguien actualizó la base antes. También están disponibles `GET` y `PUT` con `{ "revision", "data" }` para cada recurso: `/api/config`, `/api/services`, `/api/barbers`, `/api/expense-categories`, `/api/commissions`, `/api/cuts`, `/api/sales`, `/api/advances`, `/api/expenses`, `/api/transfers`, `/api/opening-adjustments`, `/api/cash-registers`, `/api/barber-payments`, `/api/inventory`, `/api/products` y `/api/stock-movements`. Cada `PUT` reemplaza la colección completa indicada, no un registro individual; para cambios relacionados usá `/api/state`. `GET /api/health` verifica la base. El estado completo se vuelve a enviar en cada escritura, con límite de 16 MiB: si el historial crece hasta ese tamaño habrá que pasar a escrituras por registro. No hay cuentas ni acceso remoto: no publiques el puerto 8000 fuera de la PC.

Para hacer una copia de seguridad consistente, detené brevemente la API, copiá el archivo y volvé a iniciarla desde la carpeta de instalación:

```powershell
docker compose stop api
docker compose cp api:/data/theluxe.sqlite "$env:USERPROFILE\theluxe-backup.sqlite"
docker compose start api
```

Guardá esa copia fuera de la PC. Si se pierde el volumen, Docker no puede reconstruir los datos.

Mientras `node host-updater.mjs` esté ejecutándose y Docker permita acceder a la API, se guarda **una copia diaria** de la base en `%LOCALAPPDATA%\TheLuxe\backups\theluxe-daily-AAAA-MM-DD.sqlite`. Comprueba al iniciar y cada hora: si ya existe la del día, no crea otra; si Docker está apagado o falla la copia, registra el error en la consola y reintenta en la siguiente comprobación. No recupera días en que la PC estuvo apagada. Cuando hay una copia válida del día, elimina las copias **automáticas** diarias y previas a actualizaciones anteriores a los últimos 14 días calendario (incluido hoy); no toca archivos manuales o desconocidos. Si la copia del día está dañada, no elimina las anteriores y registra el error para revisarlo. Si falla la limpieza, lo registra para volver a intentarlo en la siguiente comprobación. Las copias quedan en esta misma PC: guardá alguna también fuera de ella. El actualizador debe reiniciarse para incorporar este cambio.

Antes de cada actualización con el botón, el actualizador guarda además una copia consistente en `%LOCALAPPDATA%\TheLuxe\backups`. Si falla el despliegue, solo restaura automáticamente SQLite cuando su revisión no cambió desde la copia: **jamás pisa ventas nuevas**. Si la revisión cambió, informa la ruta del backup y necesita revisión manual. Para recuperar una copia después de respaldar también el estado actual y comprobar que nadie esté operando:

```powershell
docker compose stop web api
docker compose cp "C:\ruta\a\la-copia.sqlite" api:/data/theluxe.sqlite
docker compose up -d api web
```
