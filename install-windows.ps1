#Requires -Version 5.1
[CmdletBinding()]
param([string]$InstallPath = "$env:LOCALAPPDATA\TheLuxe\theluxe-client")

$ErrorActionPreference = 'Stop'

function Invoke-Checked {
    param([string]$Program, [string[]]$Arguments)
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Program fallo (codigo $LASTEXITCODE). No se completo la instalacion." }
}

function Find-Tool {
    param([string]$Name, [string[]]$Fallbacks)
    $command = Get-Command $Name -CommandType Application -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
    foreach ($path in $Fallbacks) { if (Test-Path -LiteralPath $path) { return $path } }
    return $null
}

function Assert-CleanRepository {
    param([string]$Path, [string]$Git)
    if (-not (Test-Path -LiteralPath (Join-Path $Path '.git'))) { throw 'La carpeta ya existe y no es una instalacion Git. No se modifico.' }
    $branch = Invoke-Checked $Git @('-C', $Path, 'branch', '--show-current')
    $remote = Invoke-Checked $Git @('-C', $Path, 'remote', 'get-url', 'origin')
    $dirty = Invoke-Checked $Git @('-C', $Path, 'status', '--porcelain')
    if ($branch -ne 'main' -or $remote -notmatch '^https://github\.com/BrianGelhorn/TheLuxe(?:\.git)?$' -or $dirty) {
        throw 'La carpeta debe ser una copia limpia de main de TheLuxe. No se modifico.'
    }
}

function Get-DockerEngine {
    param([string]$Docker)
    # PowerShell 5.1 trata stderr nativo como errores; una demora de Docker no es fatal aun.
    $ErrorActionPreference = 'Continue'
    $engine = & $Docker info --format '{{.OSType}}' 2>$null
    if ($LASTEXITCODE -eq 0) { return $engine }
    return $null
}

function Start-LinuxDocker {
    param([string]$Docker)
    $engine = Get-DockerEngine $Docker
    if (-not $engine) {
        $desktop = Find-Tool 'Docker Desktop.exe' @("$env:ProgramFiles\Docker\Docker\Docker Desktop.exe", "$env:LOCALAPPDATA\Programs\DockerDesktop\Docker Desktop.exe")
        if (-not $desktop) { throw 'No se encontro Docker Desktop.' }
        Start-Process -FilePath $desktop
        'Esperando Docker Desktop. Acepta su licencia si aparece el dialogo.' | Out-Host
        for ($attempt = 0; $attempt -lt 90; $attempt++) {
            Start-Sleep -Seconds 2
            $engine = Get-DockerEngine $Docker
            if ($engine) { break }
        }
    }
    if (-not $engine) { throw 'Docker no arranco. Revisa virtualizacion y WSL 2. Si falta WSL, ejecuta como administrador: wsl --install --no-distribution. Reinicia y repite la instalacion.' }
    if ($engine -ne 'linux') { throw 'Selecciona Linux containers en Docker Desktop y vuelve a ejecutar.' }
}

function New-TheLuxeShortcut {
    $shortcut = Join-Path ([Environment]::GetFolderPath('Desktop')) 'TheLuxe.url'
    if (Test-Path -LiteralPath $shortcut) {
        if ([IO.File]::ReadAllText($shortcut) -notmatch '(?m)^URL=http://127\.0\.0\.1:8000/\r?$') { throw 'El acceso directo TheLuxe.url ya existe con otro destino. No se reemplazo.' }
        return
    }
    [IO.File]::WriteAllText($shortcut, "[InternetShortcut]`r`nURL=http://127.0.0.1:8000/`r`n")
}

function Test-TaskUser {
    param([string]$UserId, [string]$Sid)
    if ($UserId -eq $Sid) { return $true }
    try { return ([Security.Principal.NTAccount]$UserId).Translate([Security.Principal.SecurityIdentifier]).Value -eq $Sid }
    catch { return $false }
}

function Install-TheLuxe {
    $os = Get-CimInstance Win32_OperatingSystem
    if ($os.ProductType -ne 1 -or [int]$os.BuildNumber -lt 22631 -or $env:PROCESSOR_ARCHITECTURE -ne 'AMD64') {
        throw 'Este instalador requiere Windows 11 x64 compatible con Docker Desktop. No admite Windows Server ni ARM.'
    }
    $ram = (Get-CimInstance Win32_PhysicalMemory | Measure-Object -Property Capacity -Sum).Sum
    if ($ram -lt 8GB) { throw 'Docker Desktop requiere al menos 8 GB de RAM.' }
    if ($env:COMPOSE_PROJECT_NAME -or $env:COMPOSE_FILE) { throw 'Quita COMPOSE_PROJECT_NAME y COMPOSE_FILE de esta sesion antes de instalar.' }
    $InstallPath = [IO.Path]::GetFullPath($InstallPath)
    $tools = @(
        @{ Name = 'git.exe'; Package = 'Git.Git'; Paths = @("$env:ProgramFiles\Git\cmd\git.exe") },
        @{ Name = 'node.exe'; Package = 'OpenJS.NodeJS.LTS'; Paths = @("$env:ProgramFiles\nodejs\node.exe") },
        @{ Name = 'docker.exe'; Package = 'Docker.DockerDesktop'; Paths = @("$env:ProgramFiles\Docker\Docker\resources\bin\docker.exe", "$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin\docker.exe") }
    )
    foreach ($tool in $tools) {
        if (-not (Find-Tool $tool.Name $tool.Paths)) {
            $winget = Find-Tool 'winget.exe' @()
            if (-not $winget) { throw 'Instala App Installer (winget) desde Microsoft Store y vuelve a ejecutar este archivo.' }
            "Se instalara $($tool.Package) con winget. Revisa los avisos, licencias y solicitudes de permisos."
            Invoke-Checked $winget @('install', '--id', $tool.Package, '--exact', '--source', 'winget', '--interactive')
            $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
            if (-not (Find-Tool $tool.Name $tool.Paths)) { throw "Reinicia Windows y vuelve a ejecutar este archivo: falta $($tool.Name)." }
        }
    }
    $git = Find-Tool $tools[0].Name $tools[0].Paths
    $node = Find-Tool $tools[1].Name $tools[1].Paths
    $docker = Find-Tool $tools[2].Name $tools[2].Paths
    $nodeVersion = Invoke-Checked $node @('--version')
    if ($nodeVersion -notmatch '^v(\d+)\.' -or [int]$Matches[1] -lt 24) { throw 'Node debe ser version 24 o superior. Actualizalo y vuelve a ejecutar.' }

    Start-LinuxDocker $docker
    Invoke-Checked $docker @('compose', 'version')

    if (Test-Path -LiteralPath $InstallPath) { Assert-CleanRepository $InstallPath $git }
    else {
        $parent = Split-Path -Parent $InstallPath
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
        Invoke-Checked $git @('clone', '--branch', 'main', '--single-branch', 'https://github.com/BrianGelhorn/TheLuxe.git', $InstallPath)
    }
    $runner = Join-Path $InstallPath 'start-client.ps1'
    if (-not (Test-Path -LiteralPath $runner)) { throw 'Esta copia no incluye start-client.ps1. Actualiza su codigo fuera de horario antes de instalar el inicio automatico.' }
    $commit = Invoke-Checked $git @('-C', $InstallPath, 'rev-parse', 'HEAD')
    $compose = @('compose', '--project-directory', $InstallPath, '-f', (Join-Path $InstallPath 'compose.yaml'))
    $containers = @(Invoke-Checked $docker ($compose + @('ps', '-a', '-q')))
    if ($containers.Count -eq 0) {
        # No adoptar silenciosamente un volumen de una instalacion anterior.
        $project = (Split-Path -Leaf $InstallPath).ToLower() -replace '[^a-z0-9_-]', ''
        $volumes = @(Invoke-Checked $docker @('volume', 'ls', '--quiet', '--filter', "label=com.docker.compose.project=$project"))
        if ($volumes.Count -gt 0) { throw 'Hay volumenes previos sin contenedores. Se requiere revisar esa instalacion antes de continuar; no se borraron datos.' }
        if (Get-NetTCPConnection -State Listen -LocalPort 8000,8001 -ErrorAction SilentlyContinue) { throw 'Los puertos 8000/8001 estan ocupados. No se modifico la otra instalacion.' }
        Invoke-Checked $docker ($compose + @('build', '--build-arg', "SOURCE_COMMIT=$commit", 'api', 'web'))
        Invoke-Checked $docker ($compose + @('up', '-d', '--wait', '--wait-timeout', '120', 'api', 'web'))
    } else {
        # Reejecutar configura el arranque; no hace git pull ni reconstruye ni restaura la base.
        Invoke-Checked $docker ($compose + @('start', 'api', 'web'))
    }
    $version = Invoke-RestMethod 'http://127.0.0.1:8000/version.json' -TimeoutSec 10
    $health = Invoke-RestMethod 'http://127.0.0.1:8000/api/health' -TimeoutSec 10
    if ($version.commit -ne $commit -or $health.ok -ne $true) { throw 'No se pudo verificar esta version. Revisa Docker o usa el actualizador existente; no se reemplazo la base.' }

    $identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $taskName = 'TheLuxe - inicio local'
    $powershell = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
    $arguments = "-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$runner`""
    $existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($existing -and ($existing.Actions.Count -ne 1 -or $existing.Actions.Execute -ne $powershell -or $existing.Actions.Arguments -ne $arguments -or $existing.Actions.WorkingDirectory -ne $InstallPath -or -not (Test-TaskUser $existing.Principal.UserId $sid) -or $existing.Triggers.Count -ne 1 -or $existing.Triggers[0].CimClass.CimClassName -ne 'MSFT_TaskLogonTrigger' -or -not (Test-TaskUser $existing.Triggers[0].UserId $sid) -or -not $existing.Settings.Enabled)) {
        throw 'La tarea TheLuxe tiene otra configuracion o usuario. No se reemplazo.'
    }
    if (-not $existing) {
        $action = New-ScheduledTaskAction -Execute $powershell -Argument $arguments -WorkingDirectory $InstallPath
        $trigger = New-ScheduledTaskTrigger -AtLogOn -User $identity
        $principal = New-ScheduledTaskPrincipal -UserId $sid -LogonType Interactive -RunLevel Limited
        $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
        Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Inicia Docker, TheLuxe y el actualizador/backups del usuario al iniciar sesion.' | Out-Null
    }
    if ((Get-ScheduledTask -TaskName $taskName).State -ne 'Running') {
        if (Get-NetTCPConnection -State Listen -LocalPort 8001 -ErrorAction SilentlyContinue) { throw 'Ya hay un actualizador manual en 8001. Cerralo y vuelve a ejecutar para iniciar la tarea.' }
        Start-ScheduledTask -TaskName $taskName
    }
    $ready = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        try {
            $status = Invoke-RestMethod 'http://127.0.0.1:8001/status' -Headers @{ Origin = 'http://127.0.0.1:8000' } -TimeoutSec 5
            if ($status.busy -or $status.installedCommit -eq $commit) { $ready = $true; break }
        } catch { Start-Sleep -Seconds 2 }
    }
    if (-not $ready) { throw "La tarea no pudo iniciar el actualizador. Revisa $env:LOCALAPPDATA\TheLuxe\logs\startup.log." }
    New-TheLuxeShortcut
    'Instalacion verificada. Inicio automatico al iniciar sesion, no antes de iniciar sesion.'
    'Los datos se guardan en Docker; los backups locales se activan despues del primer guardado en la app. Configura ademas una copia fuera de la PC.'
    Start-Process 'http://127.0.0.1:8000/'
}

if ($MyInvocation.InvocationName -ne '.') { Install-TheLuxe }
