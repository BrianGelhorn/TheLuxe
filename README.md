# The Luxe — instalación local

La aplicación y su API SQLite se ejecutan en Docker **solo en esta PC**. La API se accede desde la web por `/api/`, sin un puerto propio publicado. El actualizador corre fuera del contenedor: nunca se expone el socket de Docker al navegador.

## Instalar en Windows

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

El desarrollador revisa y publica sus cambios con un commit y `git push origin main`. Después de la primera migración a la API, la PC del cliente no necesita comandos para instalar versiones posteriores: usa los botones de Configuración. Si GitHub, Docker Desktop o el actualizador no están disponibles, se muestra un error. Si falla el reinicio del contenedor, habrá que revisar Docker en esa PC.

El estado completo (configuración, cortes, ventas, adelantos, gastos, transferencias, apertura/cierre, pagos e inventario) se guarda en SQLite dentro del volumen de Docker `data`. Reiniciar o reconstruir contenedores **no** elimina el volumen. **No uses `docker compose down -v`**: borra la base. En la primera instalación, el inventario anterior de `localStorage` se importa desde el mismo navegador y origen `127.0.0.1:8000`; mantené ese origen hasta completar la importación. Las finanzas antiguas que el prototipo descartaba en cada recarga no se pueden recuperar.

Si se corta la conexión durante un guardado, la app muestra el error y conserva una copia **provisional** de los cambios pendientes en ese navegador hasta que SQLite confirme el guardado. Reintentá antes de cerrar. Si otra pestaña cambió la base, se bloquea el guardado para no pisarla: conservá esa pestaña y resolvé el conflicto manualmente; no borres el almacenamiento del navegador mientras queden cambios pendientes.

## API

`GET /api/state` lee un estado consistente y su `revision`. `PUT /api/state` con `{ "revision": 1, "state": { ... } }` guarda **todo junto**, necesario para operaciones como venta + descuento de stock. La API devuelve la nueva revisión o `409` si alguien actualizó la base antes. También están disponibles `GET` y `PUT` con `{ "revision", "data" }` para cada recurso: `/api/config`, `/api/services`, `/api/barbers`, `/api/expense-categories`, `/api/commissions`, `/api/cuts`, `/api/sales`, `/api/advances`, `/api/expenses`, `/api/transfers`, `/api/opening-adjustments`, `/api/cash-registers`, `/api/barber-payments`, `/api/inventory`, `/api/products` y `/api/stock-movements`. Cada `PUT` reemplaza la colección completa indicada, no un registro individual; para cambios relacionados usá `/api/state`. `GET /api/health` verifica la base. El estado completo se vuelve a enviar en cada escritura, con límite de 16 MiB: si el historial crece hasta ese tamaño habrá que pasar a escrituras por registro. No hay cuentas ni acceso remoto: no publiques el puerto 8000 fuera de la PC.

Para hacer una copia de seguridad consistente, detené brevemente la API, copiá el archivo y volvé a iniciarla desde la carpeta de instalación:

```powershell
docker compose stop api
docker compose cp api:/data/theluxe.sqlite "$env:USERPROFILE\theluxe-backup.sqlite"
docker compose start api
```

Guardá esa copia fuera de la PC. Si se pierde el volumen, Docker no puede reconstruir los datos.
