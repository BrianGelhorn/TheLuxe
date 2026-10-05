import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));
const quote = (value) => `'${value.replaceAll("'", "''")}'`;
const installer = join(root, 'install-windows.ps1');
const windows = { skip: process.platform !== 'win32' };
function powershell(script) {
  const result = spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', timeout: 20000 });
  assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
  return result.stdout;
}

test('INSTALL-001 - Scripts compilan y cargar helpers no instala ni inicia nada', windows, () => {
  for (const file of ['install-windows.ps1', 'start-client.ps1']) {
    powershell(`$tokens=$null; $errors=$null; [System.Management.Automation.Language.Parser]::ParseFile(${quote(join(root, file))},[ref]$tokens,[ref]$errors) | Out-Null; if ($errors.Count) { throw ($errors | Out-String) }`);
  }
  powershell(`. ${quote(installer)}; if (-not (Get-Command Install-TheLuxe -ErrorAction SilentlyContinue)) { throw 'Helpers no disponibles' }`);
});

test('INSTALL-002 - Un comando fallido corta el instalador y Docker apagado se detecta sin abortar la espera', windows, () => {
  powershell(`. ${quote(installer)}; $failed=$false; try { Invoke-Checked ${quote(process.execPath)} @('-e','process.exit(7)') } catch { $failed=$_.Exception.Message -match 'codigo 7' }; if (-not $failed) { throw 'Se ignoro el fallo' }; $engine=Get-DockerEngine ${quote(process.execPath)}; if ($engine) { throw 'Se anuncio Docker disponible' }`);
});

test('INSTALL-003 - No acepta carpetas ajenas, cambios locales, otro origen o una rama distinta', windows, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'theluxe-installer-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  powershell(`. ${quote(installer)}; $failed=$false; try { Assert-CleanRepository ${quote(directory)} 'git.exe' } catch { $failed=$true }; if (-not $failed) { throw 'Acepto carpeta ajena' }`);
  await mkdir(join(directory, '.git'));
  powershell(`. ${quote(installer)}; function Invoke-Checked { param($Program,$Arguments); switch ($Arguments[-1]) { '--show-current' { return $script:branch }; 'origin' { return $script:remote }; '--porcelain' { return $script:dirty } } }; $script:branch='main'; $script:remote='https://github.com/BrianGelhorn/TheLuxe.git'; $script:dirty=''; Assert-CleanRepository ${quote(directory)} 'git.exe'; foreach ($case in @('dirty','branch','remote')) { $script:branch='main'; $script:remote='https://github.com/BrianGelhorn/TheLuxe.git'; $script:dirty=''; switch ($case) { 'dirty' { $script:dirty=' M api.mjs' }; 'branch' { $script:branch='other' }; 'remote' { $script:remote='https://github.com/other/repo.git' } }; $failed=$false; try { Assert-CleanRepository ${quote(directory)} 'git.exe' } catch { $failed=$true }; if (-not $failed) { throw "Acepto $case" } }`);
});

test('INSTALL-004 - Reejecutar no reconstruye y un volumen huerfano impide una instalacion nueva', windows, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'theluxe-installer-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(join(directory, '.git'));
  await writeFile(join(directory, 'start-client.ps1'), '# test');
  powershell(`. ${quote(installer)} -InstallPath ${quote(directory)}; $env:COMPOSE_PROJECT_NAME=''; $env:COMPOSE_FILE=''; $env:PROCESSOR_ARCHITECTURE='AMD64';
    function Get-CimInstance { param($ClassName); return [pscustomobject]@{ ProductType=1; BuildNumber=22631; Capacity=16GB } }
    function Find-Tool { param($Name,$Fallbacks); return $Name }
    function Start-LinuxDocker { param($Docker) }
    function Invoke-RestMethod { param($Uri,$TimeoutSec); return @{ commit='wrong'; ok=$true } }
    $script:calls=@(); $script:mode='existing';
    function Invoke-Checked { param($Program,$Arguments); $script:calls+=($Arguments -join ' '); if ($Program -eq 'node.exe') { return 'v24.21.0' }; switch ($Arguments[-1]) { '--show-current' { return 'main' }; 'origin' { return 'https://github.com/BrianGelhorn/TheLuxe.git' }; '--porcelain' { return }; 'HEAD' { return ('a'*40) } }; if ($Arguments -contains 'ps' -and $script:mode -eq 'existing') { return 'container-id' }; if ($Arguments -contains 'volume') { return 'old-volume' } }
    $failed=$false; try { Install-TheLuxe } catch { $failed=$_.Exception.Message -match 'verificar esta version' }; if (-not $failed) { throw 'No se verifico el despliegue existente' }; if ($script:calls -match '(^| )(build|up|clone|pull|down)( |$)') { throw 'Se altero la instalacion existente' };
    $script:mode='orphan'; $script:calls=@(); $failed=$false; try { Install-TheLuxe } catch { $failed=$_.Exception.Message -match 'volumenes previos' }; if (-not $failed) { throw 'Se adopto el volumen huerfano' }; if ($script:calls -match '(^| )(build|up|down)( |$)') { throw 'Se altero el volumen previo' }`);
});

test('INSTALL-005 - Instalacion simulada verifica servicios y tarea; repetirla no reinstala ni cambia una tarea ajena', windows, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'theluxe-installer-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(join(directory, '.git'));
  await writeFile(join(directory, 'start-client.ps1'), '# test');
  powershell(`. ${quote(installer)} -InstallPath ${quote(directory)}; $env:COMPOSE_PROJECT_NAME=''; $env:COMPOSE_FILE=''; $env:PROCESSOR_ARCHITECTURE='AMD64';
    function Get-CimInstance { param($ClassName); return [pscustomobject]@{ ProductType=1; BuildNumber=22631; Capacity=16GB } }
    function Find-Tool { param($Name,$Fallbacks); return $Name }
    function Start-LinuxDocker { param($Docker) }
    function Get-NetTCPConnection { param($State,$LocalPort,$ErrorAction); return }
    function Invoke-RestMethod { param($Uri,$TimeoutSec,$Headers); return @{ commit=('a'*40); installedCommit=('a'*40); busy=$false; ok=$true } }
    function Start-Process { param($FilePath); if ($FilePath -ne 'http://127.0.0.1:8000/') { throw 'Proceso inesperado' } }
    function New-TheLuxeShortcut { $script:shortcut=$true }
    $script:calls=@(); $script:mode='fresh'; $script:task=$null; $script:registrations=0;
    function Invoke-Checked { param($Program,$Arguments); $script:calls+=($Arguments -join ' '); if ($Program -eq 'node.exe') { return 'v24.21.0' }; switch ($Arguments[-1]) { '--show-current' { return 'main' }; 'origin' { return 'https://github.com/BrianGelhorn/TheLuxe.git' }; '--porcelain' { return }; 'HEAD' { return ('a'*40) } }; if ($Arguments -contains 'ps' -and $script:mode -eq 'existing') { return 'container-id' } }
    function Get-ScheduledTask { param($TaskName,$ErrorAction); return $script:task }
    function New-ScheduledTaskAction { param($Execute,$Argument,$WorkingDirectory); return [pscustomobject]@{ Execute=$Execute; Arguments=$Argument; WorkingDirectory=$WorkingDirectory } }
    function New-ScheduledTaskTrigger { param([switch]$AtLogOn,$User); return [pscustomobject]@{ UserId=$User; CimClass=@{ CimClassName='MSFT_TaskLogonTrigger' } } }
    function New-ScheduledTaskPrincipal { param($UserId,$LogonType,$RunLevel); return [pscustomobject]@{ UserId=$UserId } }
    function New-ScheduledTaskSettingsSet { return [pscustomobject]@{ Enabled=$true } }
    function Register-ScheduledTask { param($TaskName,$Action,$Trigger,$Principal,$Settings,$Description); $script:registrations++; $script:task=[pscustomobject]@{ Actions=@($Action); Triggers=@($Trigger); Principal=$Principal; Settings=$Settings; State='Ready' } }
    function Start-ScheduledTask { param($TaskName); $script:task.State='Running' }
    Install-TheLuxe; if ($script:registrations -ne 1 -or -not $script:shortcut -or $script:task.State -ne 'Running') { throw 'Instalacion incompleta' }; if (-not ($script:calls -match ' build ') -or -not ($script:calls -match ' up ')) { throw 'No preparo los servicios' };
    $script:mode='existing'; $script:calls=@(); Install-TheLuxe; if ($script:registrations -ne 1 -or $script:calls -match '(^| )(build|up|clone|pull|down)( |$)') { throw 'Reinstalo al repetir' };
    $script:task.Actions[0].Execute='other.exe'; $failed=$false; try { Install-TheLuxe } catch { $failed=$_.Exception.Message -match 'otra configuracion' }; if (-not $failed -or $script:registrations -ne 1) { throw 'Reemplazo una tarea ajena' }`);
});

test('INSTALL-006 - La identidad de una tarea real se compara por SID aunque Windows devuelva nombre corto', windows, () => {
  powershell(`. ${quote(installer)}; $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value; $principal=New-ScheduledTaskPrincipal -UserId $sid -LogonType Interactive -RunLevel Limited; if (-not (Test-TaskUser $principal.UserId $sid)) { throw 'No reconoce la identidad normalizada de Windows' }; if (-not (Test-TaskUser $sid $sid)) { throw 'No reconoce SID' }; if (Test-TaskUser 'S-1-5-18' $sid) { throw 'Acepto otra cuenta' }`);
});
