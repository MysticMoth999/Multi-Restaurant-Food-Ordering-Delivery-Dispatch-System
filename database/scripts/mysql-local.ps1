param([ValidateSet('start','stop','status')][string]$Action='start')
$ErrorActionPreference='Stop'
# MYSQL_BIN overrides the bin folder; otherwise use the newest installed MySQL Server 8.x.
$mysqlBin=$env:MYSQL_BIN
if(-not $mysqlBin) {
    $found=Get-ChildItem 'C:/Program Files/MySQL' -Directory -Filter 'MySQL Server 8*' -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
    $mysqlBin=if($found){Join-Path $found.FullName 'bin'}else{'C:/Program Files/MySQL/MySQL Server 8.0/bin'}
}
if($Action -ne 'status' -and -not (Test-Path -LiteralPath (Join-Path $mysqlBin 'mysqld.exe'))){throw "mysqld.exe not found in $mysqlBin. Install MySQL Server 8 or set MYSQL_BIN."}
$dataPath=Join-Path $env:LOCALAPPDATA 'GoMealM3/mysql8'
$port=3307
$pidPath=Join-Path $dataPath 'gomeal.pid'
function Test-LocalMySqlPort {
    $probe = New-Object System.Net.Sockets.TcpClient
    try {
        $pending = $probe.ConnectAsync('127.0.0.1', $port)
        return ($pending.Wait(1000) -and $probe.Connected)
    } catch { return $false } finally { $probe.Dispose() }
}
if($Action -eq 'status') {
    if(Test-LocalMySqlPort) { Write-Output 'Local MySQL TCP port 127.0.0.1:3307 is reachable.' }
    else { Write-Output 'Local MySQL TCP port 127.0.0.1:3307 is not reachable.' }
    exit
}
if($Action -eq 'stop') {
    if(-not (Test-Path -LiteralPath $pidPath)){throw 'No managed local MySQL PID file. Use MySQL shutdown with the correct credentials.'}
    $mysqlPid=[int](Get-Content -LiteralPath $pidPath)
    $process=Get-Process -Id $mysqlPid -ErrorAction Stop
    if($process.ProcessName -ne 'mysqld'){throw 'PID does not belong to mysqld; refuse to stop it.'}
    # Windows mysqladmin shutdown is preferred for a clean shutdown.
    & "$mysqlBin/mysqladmin.exe" --protocol=TCP --host=127.0.0.1 --port=$port --user=root --skip-password shutdown
    exit $LASTEXITCODE
}
if(Test-LocalMySqlPort){Write-Output 'Port 3307 is already listening. Verify it is the intended local instance.';exit}
New-Item -ItemType Directory -Force -Path $dataPath | Out-Null
if(-not (Test-Path -LiteralPath (Join-Path $dataPath 'mysql'))) {
    & "$mysqlBin/mysqld.exe" --no-defaults --initialize-insecure "--datadir=$dataPath" --console
    if($LASTEXITCODE -ne 0){throw 'MySQL initialization failed'}
}
$process=Start-Process -FilePath "$mysqlBin/mysqld.exe" -WorkingDirectory $dataPath -WindowStyle Hidden -PassThru `
    -ArgumentList @('--no-defaults',"--datadir=$dataPath",'--port=3307','--bind-address=127.0.0.1','--mysqlx=OFF','--skip-log-bin','--standalone',"--pid-file=$pidPath",'--console') `
    -RedirectStandardError (Join-Path $dataPath 'server.err') -RedirectStandardOutput (Join-Path $dataPath 'server.out')
Write-Output "Started isolated local MySQL PID $($process.Id), port 3307. See README for one-time schema/account setup."
