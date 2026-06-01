param(
    [switch]$Installer
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

Write-Host "Installing/syncing dependencies..."
uv sync --group dev

Write-Host "Building Windows executable with PyInstaller..."
uv run --group dev pyinstaller --clean --noconfirm packaging/BioToolBackend.spec

Write-Host ""
Write-Host "Executable folder:"
Write-Host "  $Root\dist\BioToolBackend"
Write-Host "Run:"
Write-Host "  $Root\dist\BioToolBackend\BioToolBackend.exe"

if ($Installer) {
    $iscc = Get-Command ISCC.exe -ErrorAction SilentlyContinue
    if (-not $iscc) {
        Write-Host ""
        Write-Host "Inno Setup ISCC.exe was not found. Install Inno Setup, then run:"
        Write-Host "  ISCC.exe packaging\installer.iss"
        exit 0
    }

    Write-Host "Building installer with Inno Setup..."
    & $iscc.Source "packaging\installer.iss"
    Write-Host "Installer:"
    Write-Host "  $Root\dist\installer\BioToolBackendSetup.exe"
}
