# Einmalige Einrichtung für das Release-Paket (Windows).
# Node.js ist schon im Paket. Hier kommen Claude Code (für den Chat), Git (braucht Claude Code
# unter Windows), die Anmeldung bei Claude und eine Verknüpfung auf dem Desktop dazu.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Step($text) { Write-Host ""; Write-Host "==> $text" -ForegroundColor Cyan }
function Have($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function Refresh-Path {
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
              [Environment]::GetEnvironmentVariable('Path', 'User') + ';' +
              "$env:USERPROFILE\.local\bin;$env:ProgramFiles\Git\cmd"
}

try {
  Write-Host 'Labreporthelp wird eingerichtet. Das passiert nur beim ersten Start.' -ForegroundColor Green
  Refresh-Path

  Step 'Git prüfen (braucht Claude Code unter Windows)'
  if (-not (Have 'git')) {
    if (Have 'winget') {
      Write-Host 'Git wird installiert (kann ein paar Minuten dauern) ...'
      winget install -e --id Git.Git --silent --accept-source-agreements --accept-package-agreements
      Refresh-Path
    }
    if (Have 'git') { Write-Host 'Git ist installiert.' }
    else {
      Write-Host 'Git konnte nicht automatisch installiert werden.' -ForegroundColor Yellow
      Write-Host 'Bitte von https://git-scm.com/download/win installieren (alles mit "Next" bestätigen)'
      Write-Host 'und danach "Labreporthelp starten.bat" noch einmal doppelklicken.'
      Start-Process 'https://git-scm.com/download/win'
      exit 1
    }
  } else { Write-Host 'Git ist da.' }

  Step 'Claude Code prüfen (für den Chat über dein Claude-Abo)'
  if (-not (Have 'claude')) {
    Write-Host 'Claude Code wird installiert ...'
    Invoke-RestMethod https://claude.ai/install.ps1 | Invoke-Expression
    Refresh-Path
  }
  if (-not (Have 'claude')) { throw 'Claude Code konnte nicht installiert werden. Ist der Laptop mit dem Internet verbunden?' }
  Write-Host "Claude Code $(claude --version) ist da."

  Step 'Bei Claude anmelden'
  $loggedIn = $false
  try { $loggedIn = ((claude auth status --json 2>$null) | ConvertFrom-Json).loggedIn } catch {}
  if ($loggedIn) { Write-Host 'Du bist schon angemeldet.' }
  else {
    Write-Host 'Gleich öffnet sich der Browser. Melde dich mit deinem Claude-Konto an (Pro oder Max).'
    claude auth login
  }

  Step 'Verknüpfung auf dem Desktop anlegen'
  $desktop = [Environment]::GetFolderPath('Desktop')
  $shell = New-Object -ComObject WScript.Shell
  $link = $shell.CreateShortcut((Join-Path $desktop 'Labreporthelp.lnk'))
  $link.TargetPath = Join-Path $root 'Labreporthelp starten.bat'
  $link.WorkingDirectory = $root
  $link.IconLocation = (Join-Path $root 'node\node.exe') + ',0'
  $link.Description = 'Labreporthelp starten'
  $link.Save()
  Write-Host 'Auf dem Desktop liegt jetzt "Labreporthelp".'

  Set-Content -Path (Join-Path $root '.eingerichtet') -Value (Get-Date -Format s)
  Write-Host ""
  Write-Host 'Einrichtung fertig!' -ForegroundColor Green
}
catch {
  Write-Host ""
  Write-Host "Fehler: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host 'Bitte ein Foto dieses Fensters an Claude schicken.'
  exit 1
}
