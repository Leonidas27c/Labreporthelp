# Labreporthelp einrichten (Windows). Wird von install.bat gestartet.
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)

function Step($text) { Write-Host ""; Write-Host "==> $text" -ForegroundColor Cyan }
function Have($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function Refresh-Path {
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
              [Environment]::GetEnvironmentVariable('Path', 'User') + ';' +
              "$env:USERPROFILE\.local\bin;$env:ProgramFiles\nodejs;$env:ProgramFiles\Git\cmd"
}

try {
  Refresh-Path

  Step 'Node.js prüfen'
  if (-not (Have 'node')) {
    if (Have 'winget') {
      Write-Host 'Node.js wird installiert (kann ein paar Minuten dauern) ...'
      winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
      Refresh-Path
    }
    if (-not (Have 'node')) {
      Write-Host 'Node.js konnte nicht automatisch installiert werden.' -ForegroundColor Yellow
      Write-Host 'Bitte von https://nodejs.org die Version "LTS" installieren und install.bat noch einmal starten.'
      Start-Process 'https://nodejs.org'
      exit 1
    }
  }
  Write-Host "Node.js $(node --version) ist da."

  Step 'Git prüfen (braucht Claude Code unter Windows)'
  if (-not (Have 'git')) {
    if (Have 'winget') {
      Write-Host 'Git wird installiert (kann ein paar Minuten dauern) ...'
      winget install -e --id Git.Git --silent --accept-source-agreements --accept-package-agreements
      Refresh-Path
    }
    if (Have 'git') { Write-Host 'Git ist installiert.' }
    else {
      Write-Host 'Git konnte nicht automatisch installiert werden. Ohne Git funktioniert der Chat über Claude Code nicht.' -ForegroundColor Yellow
      Write-Host 'Bitte von https://git-scm.com/download/win installieren (alles mit "Next" bestätigen) und install.bat noch einmal starten.'
      Start-Process 'https://git-scm.com/download/win'
    }
  } else { Write-Host 'Git ist da.' }

  Step 'Claude Code prüfen (für den Chat über dein Claude-Abo)'
  if (-not (Have 'claude')) {
    Write-Host 'Claude Code wird installiert ...'
    Invoke-RestMethod https://claude.ai/install.ps1 | Invoke-Expression
    Refresh-Path
  }
  if (Have 'claude') { Write-Host "Claude Code $(claude --version) ist da." }
  else { Write-Host 'Claude Code wurde nicht gefunden. Der Chat funktioniert erst nach der Installation (siehe README).' -ForegroundColor Yellow }

  Step 'Bausteine installieren (npm install)'
  npm install --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw 'npm install ist fehlgeschlagen.' }

  Step 'Programm vorbereiten (npm run build)'
  npm run build
  if ($LASTEXITCODE -ne 0) { throw 'npm run build ist fehlgeschlagen.' }

  if (Have 'claude') {
    Step 'Bei Claude anmelden'
    $loggedIn = $false
    try { $loggedIn = ((claude auth status --json 2>$null) | ConvertFrom-Json).loggedIn } catch {}
    if ($loggedIn) { Write-Host 'Du bist schon angemeldet.' }
    else {
      Write-Host 'Gleich öffnet sich der Browser. Melde dich mit deinem Claude-Konto an (Pro oder Max).'
      claude auth login
    }
  }

  Step 'Verknüpfung auf dem Desktop anlegen'
  $desktop = [Environment]::GetFolderPath('Desktop')
  $shell = New-Object -ComObject WScript.Shell
  $link = $shell.CreateShortcut((Join-Path $desktop 'Labreporthelp.lnk'))
  $link.TargetPath = (Resolve-Path 'start.bat').Path
  $link.WorkingDirectory = (Get-Location).Path
  $link.Description = 'Labreporthelp starten'
  $link.Save()
  Write-Host 'Auf dem Desktop liegt jetzt "Labreporthelp".'

  Write-Host ""
  Write-Host 'Fertig! Starte Labreporthelp mit start.bat oder über die Verknüpfung auf dem Desktop.' -ForegroundColor Green
}
catch {
  Write-Host ""
  Write-Host "Fehler: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host 'Bitte ein Foto dieses Fensters an Claude schicken.'
  exit 1
}
