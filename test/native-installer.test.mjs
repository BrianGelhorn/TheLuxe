import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));
const installer = join(root, 'install-native.ps1');
const runner = join(root, 'start-native.ps1');
const q = value => `'${value.replaceAll("'", "''")}'`;
const windows = { skip: process.platform !== 'win32' };
function ps(script) {
  const result = spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', timeout: 20000 });
  assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
  return result;
}

test('NATIVE-001 - scripts parse, runner forwards output and exit code', windows, async t => {
  for (const file of [installer, runner]) ps(`$t=$null;$e=$null;[Management.Automation.Language.Parser]::ParseFile(${q(file)},[ref]$t,[ref]$e)|Out-Null;if($e.Count){throw($e|Out-String)}`);
  const home = await mkdtemp(join(tmpdir(), 'theluxe-runner-')); t.after(() => rm(home, { recursive: true, force: true }));
  await mkdir(join(home, 'repo'), { recursive: true });
  await writeFile(join(home, 'repo', 'native-host.mjs'), "console.log('runner-ok'); console.error('expected diagnostic'); process.exit(0)");
  for (const expected of [0, 7]) {
    const result = spawnSync('powershell.exe', ['-NoProfile', '-File', runner, '-Home', home, '-Node', process.execPath, '-Git', process.execPath], { encoding: 'utf8' });
    assert.equal(result.status, expected, result.stderr);
    assert.match((await (await import('node:fs/promises')).readFile(join(home, 'logs', 'native-current.log'))).toString('utf16le'), /runner-ok/);
    if (!expected) await writeFile(join(home, 'repo', 'native-host.mjs'), "console.log('runner-ok'); process.exit(7)");
  }
});

test('NATIVE-002 - foreign root/task are rejected before winget or writes', windows, async t => {
  const home = await mkdtemp(join(tmpdir(), 'theluxe-native-')); t.after(() => rm(home, { recursive: true, force: true }));
  await writeFile(join(home, 'foreign.sqlite'), 'keep');
  ps(`. ${q(installer)} -InstallPath ${q(home)}; function Get-Command { throw 'winget touched' }; $bad=$false;try{Install-TheLuxeNative}catch{$bad=$_.Exception.Message -match 'no pertenece'};if(-not $bad){throw 'foreign root accepted'};if(-not(Test-Path ${q(join(home, 'foreign.sqlite'))})){throw 'foreign data changed'}`);
  ps(`. ${q(installer)}; $task=[pscustomobject]@{Actions=@([pscustomobject]@{Execute='other'});Triggers=@();Principal=[pscustomobject]@{UserId='x';LogonType='Interactive';RunLevel='Highest'};Settings=[pscustomobject]@{Enabled=$true}}; $bad=$false;try{Assert-TaskIsOurs $task 'C:\\x' 'node' 'git'}catch{$bad=$true};if(-not $bad){throw 'foreign task accepted'}`);
});

test('NATIVE-003 - simulated first and interrupted installs are resumable without data overwrite', windows, async t => {
  const parent = await mkdtemp(join(tmpdir(), 'theluxe-native-')); const home = join(parent, 'install'); t.after(() => rm(parent, { recursive: true, force: true }));
  const mock = `. ${q(installer)} -InstallPath ${q(home)}; $env:ProgramFiles='C:\\Program Files'; function Find-MachineTool($p){$p}; function Get-CimInstance{[pscustomobject]@{ProductType=1;BuildNumber=22631}}; function Invoke-Checked($p,$a){if($a[-1]-eq '--version'){return 'v24.1.0'};if($a -contains 'clone'){New-Item -ItemType Directory -Force -Path (Join-Path $script:h 'repo\\.git')|Out-Null;foreach($f in 'native-host.mjs','native-deployment.mjs','start-native.ps1'){New-Item -ItemType File -Force -Path (Join-Path $script:h ('repo\\'+$f))|Out-Null};return ''};if($a -contains 'prepare'){Set-Content -LiteralPath (Join-Path $script:h 'data\\active.json') -Value ('{"commit":"'+('a'*40)+'"}');return ''};if($a[-1]-eq 'HEAD'){return ('a'*40)};if($a -contains '--show-current'){return 'main'};if($a -contains 'origin'){return 'https://github.com/BrianGelhorn/TheLuxe.git'};if($a[0]-eq '-e'){return ('a'*40)};return ''}; function Get-NetTCPConnection{}; function Get-ScheduledTask{if($args){$script:task}else{@()}}; function New-ScheduledTaskAction($Execute,$Argument,$WorkingDirectory){[pscustomobject]@{Execute=$Execute;Arguments=$Argument;WorkingDirectory=$WorkingDirectory}}; function New-ScheduledTaskTrigger{[pscustomobject]@{CimClass=@{CimClassName='MSFT_TaskBootTrigger'}}}; function New-ScheduledTaskPrincipal($UserId,$LogonType,$RunLevel){[pscustomobject]@{UserId=$UserId;LogonType=$LogonType;RunLevel=$RunLevel}}; function New-ScheduledTaskSettingsSet{[pscustomobject]@{Enabled=$true;RestartCount=3;MultipleInstances='IgnoreNew';AllowStartIfOnBatteries=$true;StopIfGoingOnBatteries=$false;ExecutionTimeLimit='PT0S';RestartInterval='PT1M'}}; function Register-ScheduledTask($TaskName,$Action,$Trigger,$Principal,$Settings){$script:task=[pscustomobject]@{Actions=@($Action);Triggers=@($Trigger);Principal=$Principal;Settings=$Settings;State='Ready'};$script:n++}; function Start-ScheduledTask{$script:task.State='Running'}; function Invoke-RestMethod($Uri){if($Uri-match'version'){@{commit=('a'*40)}}elseif($Uri-match'health'){@{ok=$true}}else{@{}}}; function Invoke-WebRequest{[pscustomobject]@{StatusCode=204;Headers=@{'Access-Control-Allow-Origin'='http://127.0.0.1:8000'}}}; function Set-NativeAcl{}; function New-NativeShortcut{}; $script:h=${q(home)};$script:n=0;Install-TheLuxeNative;if($script:n-ne 1){throw 'not registered'};$before=$script:n;Install-TheLuxeNative;if($script:n-ne $before){throw 'repeat modified task'}`;
  ps(mock);
});

test('NATIVE-004 - UAC failure is not success and task identity accepts LocalService name', windows, () => {
  ps(`. ${q(installer)}; $env:TEMP=[IO.Path]::GetTempPath(); function Start-Process{[pscustomobject]@{ExitCode=1}}; $bad=$false;try{Invoke-ReviewedElevatedInstaller 'C:\\x' $null}catch{$bad=$true};if(-not $bad){throw 'UAC failure accepted'}; if(-not(Test-TaskUser 'NT AUTHORITY\\LOCAL SERVICE' 'S-1-5-19')){throw 'LocalService name rejected'}`);
});

test('NATIVE-005 - la tarea real de Windows coincide con la cuenta y reglas del instalador', windows, () => {
  ps(String.raw`. ${q(installer)}; $h='C:\ProgramData\TheLuxeNative'; $n='C:\Program Files\nodejs\node.exe'; $g='C:\Program Files\Git\cmd\git.exe'; $a='-NoLogo -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File "{0}\start-native.ps1" -Home "{0}" -Node "{1}" -Git "{2}"' -f $h,$n,$g; $action=New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -Argument $a -WorkingDirectory $h; $principal=New-ScheduledTaskPrincipal -UserId 'S-1-5-19' -LogonType ServiceAccount -RunLevel Limited; $trigger=New-ScheduledTaskTrigger -AtStartup; $settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries; $task=[pscustomobject]@{Actions=@($action);Principal=$principal;Triggers=@($trigger);Settings=$settings}; if(-not(Test-NativeTask $task $h $n $g)){throw 'La tarea real no coincide'}; $settings.DisallowStartIfOnBatteries=$true; if(Test-NativeTask $task $h $n $g){throw 'Se acepto bloqueo de bateria'}`);
});
