#Requires -Version 5.1
[CmdletBinding()]
param(
    [string]$InstallPath = (Join-Path $env:ProgramData 'TheLuxeNative'),
    [string]$DatabaseBackupPath
)

$ErrorActionPreference = 'Stop'
$script:NativeTaskName = 'TheLuxe Native'
$script:NativeOrigin = 'https://github.com/BrianGelhorn/TheLuxe.git'
$script:LocalServiceSid = 'S-1-5-19'

function Invoke-Checked {
    param([string]$Program, [string[]]$Arguments)
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Program fallo (codigo $LASTEXITCODE). No se completo la instalacion." }
}

function Find-MachineTool {
    param([string]$Path)
    if (Test-Path -LiteralPath $Path) { return $Path }
    return $null
}

function Test-IsAdministrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    return (New-Object Security.Principal.WindowsPrincipal($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Invoke-ReviewedElevatedInstaller {
    param([string]$Path, [string]$BackupPath)
    $tempDirectory = Join-Path $env:TEMP ('theluxe-native-' + [guid]::NewGuid().ToString())
    New-Item -ItemType Directory -Path $tempDirectory -Force | Out-Null
    $temp = Join-Path $tempDirectory 'install-native.ps1'
    Copy-Item -LiteralPath $PSCommandPath -Destination $temp -Force
    $tokens = $null; $errors = $null
    [Management.Automation.Language.Parser]::ParseFile($temp, [ref]$tokens, [ref]$errors) | Out-Null
    if ($errors.Count) { throw 'La copia temporal StageCode no pudo analizarse.' }
    $arguments = @('-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"{0}"' -f $temp), '-InstallPath', ('"{0}"' -f $Path))
    if ($BackupPath) { $arguments += @('-DatabaseBackupPath', ('"{0}"' -f $BackupPath)) }
    $process = Start-Process -FilePath "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -Verb RunAs -Wait -PassThru -ArgumentList $arguments
    Remove-Item -LiteralPath $tempDirectory -Recurse -Force -ErrorAction SilentlyContinue
    if ($process.ExitCode -ne 0) { throw "La elevacion UAC no completo la instalacion (codigo $($process.ExitCode))." }
}

function Get-NativeMarkerPath { param([string]$InstallHome) Join-Path $InstallHome '.theluxe-native.json' }
function Get-NativeMarker {
    param([string]$InstallHome)
    $marker = Get-NativeMarkerPath $InstallHome
    if (-not (Test-Path -LiteralPath $marker)) { return $null }
    try { return (Get-Content -LiteralPath $marker -Raw | ConvertFrom-Json) }
    catch { throw 'El marcador de instalacion nativa no es valido. No se modifico.' }
}
function Assert-NativeHome {
    param([string]$InstallHome, [switch]$Existing)
    if (-not (Test-Path -LiteralPath $InstallHome)) { if ($Existing) { throw 'No existe la instalacion nativa.' }; return }
    $marker = Get-NativeMarker $InstallHome
    if (-not $marker -or $marker.type -ne 'Native' -or $marker.origin -ne $script:NativeOrigin -or [IO.Path]::GetFullPath([string]$marker.installPath) -ne $InstallHome) {
        throw 'La carpeta de destino no pertenece a TheLuxe Native. No se adopto ni modifico.'
    }
}
function Write-NativeMarker {
    param([string]$InstallHome)
    @{ type = 'Native'; installPath = $InstallHome; origin = $script:NativeOrigin } | ConvertTo-Json | Set-Content -LiteralPath (Get-NativeMarkerPath $InstallHome) -Encoding UTF8
}
function Assert-CleanNativeRepository {
    param([string]$InstallHome, [string]$Git)
    $repo = Join-Path $InstallHome 'repo'
    if (-not (Test-Path -LiteralPath (Join-Path $repo '.git'))) { throw 'Falta el repositorio nativo administrado.' }
    $branch = Invoke-Checked $Git @('-C', $repo, 'branch', '--show-current')
    $origin = Invoke-Checked $Git @('-C', $repo, 'remote', 'get-url', 'origin')
    $dirty = Invoke-Checked $Git @('-C', $repo, 'status', '--porcelain')
    if ($branch -ne 'main' -or $origin -notmatch '^https://github\.com/BrianGelhorn/TheLuxe(?:\.git)?$' -or $dirty) { throw 'El repositorio nativo debe ser main limpio con el origen oficial. No se modifico.' }
}
function Assert-NativeFiles {
    param([string]$Repo)
    foreach ($file in 'native-host.mjs', 'native-deployment.mjs', 'start-native.ps1') {
        if (-not (Test-Path -LiteralPath (Join-Path $Repo $file))) { throw "La version descargada aun no publica $file; no se instalo una tarea incompleta." }
    }
}
function Test-TaskUser {
    param([string]$UserId, [string]$Sid)
    if ($UserId -eq $Sid) { return $true }
    try { return ([Security.Principal.NTAccount]$UserId).Translate([Security.Principal.SecurityIdentifier]).Value -eq $Sid }
    catch { return $false }
}
function Test-TaskDuration {
    param($Value, [TimeSpan]$Expected)
    $iso = if ($Expected -eq [TimeSpan]::Zero) { 'PT0S' } else { 'PT1M' }
    return [string]$Value -in @([string]$Expected, $iso) -or $Value -eq $Expected
}
function Test-NativeTask {
    param($Task, [string]$InstallHome, [string]$Node, [string]$Git)
    if (-not $Task) { return $false }
    $runner = Join-Path $InstallHome 'start-native.ps1'
    $expectedArguments = "-NoLogo -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File `"$runner`" -Home `"$InstallHome`" -Node `"$Node`" -Git `"$Git`""
    return $Task.Actions.Count -eq 1 -and $Task.Actions[0].Execute -eq "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -and $Task.Actions[0].Arguments -eq $expectedArguments -and $Task.Actions[0].WorkingDirectory -eq $InstallHome -and (Test-TaskUser $Task.Principal.UserId $script:LocalServiceSid) -and [string]$Task.Principal.LogonType -eq 'ServiceAccount' -and [string]$Task.Principal.RunLevel -eq 'Limited' -and $Task.Triggers.Count -eq 1 -and $Task.Triggers[0].CimClass.CimClassName -eq 'MSFT_TaskBootTrigger' -and $Task.Settings.Enabled -and $Task.Settings.RestartCount -eq 3 -and [string]$Task.Settings.MultipleInstances -eq 'IgnoreNew' -and -not $Task.Settings.DisallowStartIfOnBatteries -and -not $Task.Settings.StopIfGoingOnBatteries -and (Test-TaskDuration $Task.Settings.ExecutionTimeLimit ([TimeSpan]::Zero)) -and (Test-TaskDuration $Task.Settings.RestartInterval (New-TimeSpan -Minutes 1))
}
function Assert-TaskIsOurs {
    param($Task, [string]$InstallHome, [string]$Node, [string]$Git)
    if ($Task -and -not (Test-NativeTask $Task $InstallHome $Node $Git)) { throw 'La tarea TheLuxe Native pertenece a otra configuracion. No se reemplazo.' }
}
function Assert-NativePorts {
    param([switch]$AllowRunningTask)
    $listeners = @(Get-NetTCPConnection -State Listen -LocalPort 8000,8001 -ErrorAction SilentlyContinue)
    if ($listeners.Count -and -not $AllowRunningTask) { throw 'Los puertos 8000/8001 ya estan ocupados por otra aplicacion. No se mataron procesos.' }
}
function Assert-NoDockerTask {
    $docker = @(Get-ScheduledTask -ErrorAction SilentlyContinue | Where-Object { $_.State -eq 'Running' -and $_.TaskName -match 'Docker' })
    if ($docker.Count) { throw 'Hay una tarea Docker activa. Detenla y confirma que los puertos estan libres; Docker no se desinstalo ni modifico.' }
}
function Wait-NativeStartup {
    param([string]$Commit)
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        try {
            $version = Invoke-RestMethod 'http://127.0.0.1:8000/version.json' -TimeoutSec 3
            $health = Invoke-RestMethod 'http://127.0.0.1:8000/api/health' -TimeoutSec 3
            if ($version.commit -eq $Commit -and $health.ok -eq $true) {
                $options = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:8001/status' -Method Options -Headers @{ Origin = 'http://127.0.0.1:8000'; 'Access-Control-Request-Method' = 'GET' } -TimeoutSec 3
                if ($options.StatusCode -ne 204 -or $options.Headers['Access-Control-Allow-Origin'] -ne 'http://127.0.0.1:8000') { throw 'El actualizador no protege correctamente su origen local.' }
                try { Invoke-RestMethod 'http://127.0.0.1:8001/status' -Headers @{ Origin = 'http://127.0.0.1:8000' } -TimeoutSec 3 | Out-Null }
                catch { Write-Warning 'El actualizador local respondió sin estado remoto verificable (por ejemplo, GitHub no disponible).' }
                return
            }
        } catch {}
        Start-Sleep -Seconds 2
    }
    throw 'La tarea no inicio la version esperada en el tiempo limite. Revisa los logs nativos.'
}
function Set-NativeAcl {
    param([string]$InstallHome)
    # No hay ACL de Users: la tarea solo necesita atravesar el raiz y modificar sus cuatro directorios.
    Invoke-Checked 'icacls.exe' @($InstallHome, '/inheritance:r', '/remove:g', '*S-1-1-0', '*S-1-5-32-545', '/grant:r', '*S-1-5-32-544:(OI)(CI)F', '*S-1-5-18:(OI)(CI)F', '*S-1-5-19:(OI)(CI)RX')
    foreach ($name in 'repo', 'releases', 'data', 'logs') {
        $path = Join-Path $InstallHome $name
        if (Test-Path -LiteralPath $path) { Invoke-Checked 'icacls.exe' @($path, '/grant:r', '*S-1-5-32-544:(OI)(CI)F', '*S-1-5-18:(OI)(CI)F', '*S-1-5-19:(OI)(CI)M') }
    }
}
function New-NativeShortcut {
    $shortcut = Join-Path ([Environment]::GetFolderPath('CommonDesktopDirectory')) 'TheLuxe Native.url'
    if (Test-Path -LiteralPath $shortcut) {
        if ((Get-Content -LiteralPath $shortcut -Raw) -notmatch '(?m)^URL=http://127\.0\.0\.1:8000/\r?$') { throw 'El acceso directo TheLuxe Native.url ya existe con otro destino. No se reemplazo.' }
        return
    }
    [IO.File]::WriteAllText($shortcut, "[InternetShortcut]`r`nURL=http://127.0.0.1:8000/`r`n")
}
function Assert-LocalDirectory {
    param([string]$Path)
    if (Test-Path -LiteralPath $Path) {
        $item = Get-Item -LiteralPath $Path -Force
        if (-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'La ruta de instalacion no puede ser un enlace, junction ni archivo.' }
    }
}
function Read-ActiveCommit {
    param([string]$Node, [string]$InstallHome)
    $active = Join-Path $InstallHome 'data\active.json'
    if (-not (Test-Path -LiteralPath $active)) { return $null }
    $code = "const fs=require('fs');const x=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));if(!/^[a-f0-9]{40}$/.test(x.commit))process.exit(2);process.stdout.write(x.commit)"
    return (Invoke-Checked $Node @('-e', $code, $active)).Trim()
}
function Install-TheLuxeNative {
    $installHome = [IO.Path]::GetFullPath($InstallPath)
    Assert-LocalDirectory $installHome
    if (Test-Path -LiteralPath $installHome) { Assert-NativeHome $installHome -Existing; if ($DatabaseBackupPath) { throw 'La importacion solo se permite en una primera instalacion sin destino existente.' } }
    $expectedNode = "$env:ProgramFiles\nodejs\node.exe"; $expectedGit = "$env:ProgramFiles\Git\cmd\git.exe"
    $preexistingTask = Get-ScheduledTask -TaskName $script:NativeTaskName -ErrorAction SilentlyContinue
    if ($preexistingTask) { Assert-TaskIsOurs $preexistingTask $installHome $expectedNode $expectedGit }
    if (-not (Test-Path -LiteralPath $installHome)) { Assert-NoDockerTask; Assert-NativePorts }
    $os = Get-CimInstance Win32_OperatingSystem
    if ($os.ProductType -ne 1 -or [int]$os.BuildNumber -lt 19045 -or $env:PROCESSOR_ARCHITECTURE -ne 'AMD64') { throw 'Requiere Windows cliente x64 compatible (Windows 10 19045 o Windows 11); no admite Server ni ARM.' }
    if ([int]$os.BuildNumber -eq 19045) { Write-Warning 'Windows 10 19045 puede requerir ESU o estar fuera de soporte; el instalador no puede comprobar su cobertura.' }
    $git = Find-MachineTool "$env:ProgramFiles\Git\cmd\git.exe"
    $node = Find-MachineTool "$env:ProgramFiles\nodejs\node.exe"
    if (-not $git -or -not $node) {
        $winget = Get-Command winget.exe -CommandType Application -ErrorAction SilentlyContinue
        if (-not $winget) { throw 'Falta Git o Node de ambito maquina y winget no esta disponible.' }
        if (-not $git) { Invoke-Checked $winget.Source @('install', '--id', 'Git.Git', '--exact', '--scope', 'machine', '--interactive') }
        if (-not $node) { Invoke-Checked $winget.Source @('install', '--id', 'OpenJS.NodeJS.LTS', '--exact', '--scope', 'machine', '--interactive') }
        $git = Find-MachineTool "$env:ProgramFiles\Git\cmd\git.exe"; $node = Find-MachineTool "$env:ProgramFiles\nodejs\node.exe"
        if (-not $git -or -not $node) { throw 'Git y Node deben instalarse en Program Files para LocalService. Reabre el instalador despues de completar sus licencias.' }
    }
    $version = Invoke-Checked $node @('--version')
    if ($version -notmatch '^v(\d+)\.' -or [int]$Matches[1] -lt 24) { throw 'Node 24 o superior en Program Files es obligatorio.' }
    $existing = Test-Path -LiteralPath $installHome
    if (-not $existing) { New-Item -ItemType Directory -Path $installHome -Force | Out-Null; Set-NativeAcl $installHome; Write-NativeMarker $installHome }
    $task = Get-ScheduledTask -TaskName $script:NativeTaskName -ErrorAction SilentlyContinue
    Assert-TaskIsOurs $task $installHome $node $git
    Assert-NativePorts -AllowRunningTask:($task -and $task.State -eq 'Running')
    foreach ($dir in 'releases', 'data', 'logs', 'data\backups') { Assert-LocalDirectory (Join-Path $installHome $dir); New-Item -ItemType Directory -Path (Join-Path $installHome $dir) -Force | Out-Null }
    Set-NativeAcl $installHome
    $repo = Join-Path $installHome 'repo'
    if (Test-Path -LiteralPath $repo) { Assert-LocalDirectory $repo; Assert-CleanNativeRepository $installHome $git }
    else { Invoke-Checked $git @('clone', '--branch', 'main', '--single-branch', $script:NativeOrigin, $repo) }
    Assert-NativeFiles $repo
    $runner = Join-Path $repo 'start-native.ps1'
    if (-not (Test-Path -LiteralPath $runner)) { throw 'Falta start-native.ps1 en el repositorio; no se instalo una tarea incompleta.' }
    if (-not (Test-Path -LiteralPath (Join-Path $installHome 'start-native.ps1'))) { Copy-Item -LiteralPath $runner -Destination (Join-Path $installHome 'start-native.ps1') }
    $active = Read-ActiveCommit $node $installHome
    if ($DatabaseBackupPath -and -not $active) {
        if (Test-Path -LiteralPath (Join-Path $installHome 'data\theluxe.sqlite')) { throw 'Solo se puede importar una copia en la primera instalacion sin base de datos.' }
        Invoke-Checked $node @((Join-Path $repo 'native-deployment.mjs'), 'import', $installHome, $DatabaseBackupPath)
    }
    if (-not $active) {
        $commit = (Invoke-Checked $git @('-C', $repo, 'rev-parse', 'HEAD')).Trim()
        Invoke-Checked $node @((Join-Path $repo 'native-deployment.mjs'), 'prepare', $installHome, $repo, $commit)
        $active = Read-ActiveCommit $node $installHome
    }
    if (-not $active) { throw 'prepare no creo data\active.json; no se registro la tarea.' }
    Set-NativeAcl $installHome
    $runner = Join-Path $installHome 'start-native.ps1'
    $arguments = "-NoLogo -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File `"$runner`" -Home `"$installHome`" -Node `"$node`" -Git `"$git`""
    $action = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -Argument $arguments -WorkingDirectory $installHome
    $trigger = New-ScheduledTaskTrigger -AtStartup
    $principal = New-ScheduledTaskPrincipal -UserId $script:LocalServiceSid -LogonType ServiceAccount -RunLevel Limited
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
    if (-not $task) { Register-ScheduledTask -TaskName $script:NativeTaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Inicia TheLuxe Native como LocalService al arrancar Windows.' | Out-Null }
    if (-not $task -or $task.State -ne 'Running') { Start-ScheduledTask -TaskName $script:NativeTaskName }
    Wait-NativeStartup $active
    New-NativeShortcut
    "TheLuxe Native listo: http://127.0.0.1:8000/; datos: $installHome\data. La tarea '$script:NativeTaskName' arranca como LocalService al iniciar Windows (no es un servicio SCM). Verificacion local completada; no se reinicio Windows."
}

if ($MyInvocation.InvocationName -ne '.') {
    if (-not (Test-IsAdministrator)) { Invoke-ReviewedElevatedInstaller $InstallPath $DatabaseBackupPath }
    else { Install-TheLuxeNative }
}
