#Requires -Version 5.1
$ErrorActionPreference = 'Stop'
try {
    # Resuelve herramientas y comprueba errores igual que el instalador, sin ejecutarlo.
    . (Join-Path $PSScriptRoot 'install-windows.ps1')
    $logs = Join-Path $env:LOCALAPPDATA 'TheLuxe\logs'
    New-Item -ItemType Directory -Path $logs -Force | Out-Null
    $log = Join-Path $logs 'startup.log'
    if (Test-Path -LiteralPath $log) { Move-Item -LiteralPath $log -Destination (Join-Path $logs 'startup.previous.log') -Force }
    Start-Transcript -Path $log -Force | Out-Null
    if ($env:COMPOSE_PROJECT_NAME -or $env:COMPOSE_FILE) { throw 'Configuracion externa de Compose incompatible con la instalacion.' }
    $docker = Find-Tool 'docker.exe' @("$env:ProgramFiles\Docker\Docker\resources\bin\docker.exe", "$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin\docker.exe")
    $node = Find-Tool 'node.exe' @("$env:ProgramFiles\nodejs\node.exe")
    if (-not $docker -or -not $node) { throw 'No se encontro Docker o Node. Vuelve a ejecutar el instalador.' }
    Start-LinuxDocker $docker
    # Solo arranca contenedores existentes: no reconstruye ni actualiza durante la jornada.
    Invoke-Checked $docker @('compose', '--project-directory', $PSScriptRoot, '-f', (Join-Path $PSScriptRoot 'compose.yaml'), 'start', 'api', 'web')
    if (Get-NetTCPConnection -State Listen -LocalPort 8001 -ErrorAction SilentlyContinue) { throw '8001 ocupado: cierra el actualizador manual antes de iniciar la tarea.' }
    Invoke-Checked $node @((Join-Path $PSScriptRoot 'host-updater.mjs'))
} catch {
    Write-Error -Message $_ -ErrorAction Continue
    exit 1
} finally {
    Stop-Transcript -ErrorAction SilentlyContinue | Out-Null
}
