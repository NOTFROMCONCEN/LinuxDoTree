param(
    [string]$Version = "1.2.4-beta.13"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$srcRoot = Join-Path $root "src"
$commonRoot = Join-Path $srcRoot "common"
$manifestRoot = Join-Path $srcRoot "manifests"
$distRoot = Join-Path $root "dist"
$packagesRoot = Join-Path $root "packages"
$scriptsRoot = Join-Path $root "scripts"

$targets = @("chrome", "edge", "firefox")

function Get-ManifestVersion {
    param([string]$VersionName)

    if ($VersionName -match '^(\d+)\.(\d+)\.(\d+)-beta\.(\d+)$') {
        return "$($Matches[1]).$($Matches[2]).$($Matches[3]).$($Matches[4])"
    }

    if ($VersionName -match '^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:\.(\d+))?$') {
        $parts = @($Matches[1], $Matches[2], $Matches[3], $Matches[4]) | Where-Object { $_ -ne "" -and $null -ne $_ }
        return ($parts -join ".")
    }

    throw "Unsupported version format: $VersionName. Use formats like 1.2.4 or 1.2.4-beta.2"
}

function Ensure-Dir {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) {
        New-Item -ItemType Directory -Path $Path | Out-Null
    }
}

Ensure-Dir -Path $distRoot
Ensure-Dir -Path $packagesRoot

$manifestVersion = Get-ManifestVersion -VersionName $Version

$iconScript = Join-Path $scriptsRoot "Generate-Icons.ps1"
if (Test-Path -LiteralPath $iconScript) {
    & $iconScript
}

foreach ($target in $targets) {
    $targetDist = Join-Path $distRoot $target

    if (Test-Path -LiteralPath $targetDist) {
        Remove-Item -LiteralPath $targetDist -Recurse -Force
    }

    Ensure-Dir -Path $targetDist

    Copy-Item -Path (Join-Path $commonRoot "*") -Destination $targetDist -Recurse -Force

    $manifestTemplatePath = Join-Path $manifestRoot "$target.json"
    $manifestContent = Get-Content -LiteralPath $manifestTemplatePath -Raw
    $manifestContent = $manifestContent.Replace("__VERSION__", $manifestVersion)
    $manifestContent = $manifestContent.Replace("__VERSION_NAME__", $Version)
    Set-Content -LiteralPath (Join-Path $targetDist "manifest.json") -Value $manifestContent -Encoding UTF8

    $zipPath = Join-Path $packagesRoot "linuxdotree-$target-$Version.zip"
    if (Test-Path -LiteralPath $zipPath) {
        Remove-Item -LiteralPath $zipPath -Force
    }

    Compress-Archive -Path (Join-Path $targetDist "*") -DestinationPath $zipPath -Force
}

Write-Host "Build completed for version $Version"
Write-Host "Manifest version: $manifestVersion"
Write-Host "Dist: $distRoot"
Write-Host "Packages: $packagesRoot"
