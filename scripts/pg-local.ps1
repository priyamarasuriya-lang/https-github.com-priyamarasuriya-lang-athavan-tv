# Manage the portable, user-mode PostgreSQL 16 used for local development.
# Usage: powershell -File scripts/pg-local.ps1 start|stop|status
param([ValidateSet('start', 'stop', 'status')][string]$Action = 'status')

$tools = Join-Path $env:USERPROFILE 'tools'
$bin = Join-Path $tools 'pgsql\bin'
$data = Join-Path $tools 'pgdata'
$log = Join-Path $tools 'pg.log'

if (-not (Test-Path (Join-Path $bin 'pg_ctl.exe'))) { throw "PostgreSQL binaries not found in $bin" }

switch ($Action) {
  'start' {
    # Redirect through cmd so the postmaster does not hold this shell's output pipes open.
    cmd /c "`"$bin\pg_ctl.exe`" -D `"$data`" -l `"$log`" -w start > nul 2>&1"
    & "$bin\pg_isready.exe" -h localhost -p 5432
  }
  'stop' { cmd /c "`"$bin\pg_ctl.exe`" -D `"$data`" -m fast -w stop > nul 2>&1"; 'stopped' }
  'status' { & "$bin\pg_isready.exe" -h localhost -p 5432 }
}
