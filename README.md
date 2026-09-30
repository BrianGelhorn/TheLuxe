# The Luxe — instalación local

La aplicación se sirve en Docker **solo en esta PC**. El actualizador corre fuera del contenedor: nunca se expone el socket de Docker al navegador.

## Instalar en Windows

Requiere Docker Desktop iniciado, Git y Node.js 24. Usá una **copia limpia de `main`**, separada del directorio donde desarrollás:

```powershell
git clone https://github.com/BrianGelhorn/TheLuxe.git C:\TheLuxe
```

Desde `C:\TheLuxe`, construí e iniciá la aplicación:

```powershell
$env:SOURCE_COMMIT = git rev-parse HEAD
docker compose build --build-arg "SOURCE_COMMIT=$env:SOURCE_COMMIT" web
docker compose up -d web
node host-updater.mjs
```

Dejá `node host-updater.mjs` ejecutándose. Para iniciarlo automáticamente con Windows, configurá el Programador de tareas para ejecutar `node C:\TheLuxe\host-updater.mjs` al iniciar sesión, después de Docker Desktop. No lo ejecutes desde un repositorio con cambios locales: el actualizador se negará a modificarlos.

Abrí **http://127.0.0.1:8000/**. En Configuración, pulsá **Buscar** para consultar `main`, **Actualizar** para instalar y, una vez que Docker sirva la versión nueva, **Recargar**. Si el repositorio es privado, configurá el acceso de Git a GitHub en la PC; no pongas tokens en la web.

## Publicar cambios

El desarrollador revisa y publica sus cambios con un commit y `git push origin main`. La PC del cliente no necesita comandos para instalar esa versión: usa los botones de Configuración. Si GitHub, Docker Desktop o el actualizador no están disponibles, se muestra un error. Si falla el reinicio del contenedor, habrá que revisar Docker en esa PC.

**Límite actual:** las ventas y los datos financieros viven solo durante la sesión del navegador. Recargar tras una actualización los pierde. El inventario permanece en el almacenamiento del navegador de `127.0.0.1:8000`; no cambies a `localhost:8000` sin migrarlo. La API y la base de datos aún no están implementadas.
