param(
    [Parameter(Mandatory = $true)]
    [string]$Version,
    [string]$Branch = "main",
    [string]$Remote = "origin",
    [switch]$PreRelease,
    [switch]$Draft,
    [string]$NotesFile
)

$ErrorActionPreference = "Stop"

function Invoke-Checked {
    param(
        [Parameter(Mandatory = $true)]
        [scriptblock]$ScriptBlock,
        [Parameter(Mandatory = $true)]
        [string]$ErrorMessage
    )

    & $ScriptBlock
    if ($LASTEXITCODE -ne 0) {
        throw $ErrorMessage
    }
}

function Get-RepoRoot {
    $rootPath = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..") -ErrorAction SilentlyContinue
    if (-not $rootPath) {
        throw "Cannot resolve repository root from script path."
    }

    $gitDir = Join-Path $rootPath.Path ".git"
    if (-not (Test-Path -LiteralPath $gitDir)) {
        throw "Resolved path is not a git repository root: $($rootPath.Path)"
    }

    return $rootPath.Path
}

function Ensure-CleanWorkingTree {
    $status = git status --porcelain
    if ($status) {
        throw "Working tree is not clean. Please commit or stash your changes before publishing."
    }
}

function Ensure-CurrentBranch {
    param([string]$ExpectedBranch)
    $currentBranch = (git branch --show-current).Trim()
    if ($currentBranch -ne $ExpectedBranch) {
        throw "Current branch is '$currentBranch'. Please switch to '$ExpectedBranch' before publishing."
    }
}

function Ensure-CommandExists {
    param([string]$CommandName)
    if (-not (Get-Command $CommandName -ErrorAction SilentlyContinue)) {
        throw "Required command not found: $CommandName"
    }
}

function Ensure-GhAuth {
    Invoke-Checked -ScriptBlock { gh auth status } -ErrorMessage "GitHub CLI auth check failed. Please run 'gh auth login' first."
}

function Ensure-TagNotExists {
    param(
        [string]$TagName,
        [string]$RemoteName
    )

    $localTag = git tag --list $TagName
    if ($localTag) {
        throw "Tag '$TagName' already exists locally."
    }

    $remoteTag = git ls-remote --tags $RemoteName "refs/tags/$TagName"
    if ($remoteTag) {
        throw "Tag '$TagName' already exists on remote '$RemoteName'."
    }
}

function Get-ReleaseAssets {
    param(
        [string]$Root,
        [string]$VersionName
    )

    $assets = @(
        (Join-Path $Root "packages/linuxdotree-chrome-$VersionName.zip"),
        (Join-Path $Root "packages/linuxdotree-edge-$VersionName.zip"),
        (Join-Path $Root "packages/linuxdotree-firefox-$VersionName.zip")
    )

    $missing = @($assets | Where-Object { -not (Test-Path -LiteralPath $_) })
    if ($missing.Count -gt 0) {
        $list = ($missing -join "`n")
        throw "Missing release assets:`n$list"
    }

    return $assets
}

$repoRoot = Get-RepoRoot
Set-Location -LiteralPath $repoRoot

Ensure-CommandExists -CommandName "git"
Ensure-CommandExists -CommandName "gh"
Ensure-GhAuth
Ensure-CleanWorkingTree
Ensure-CurrentBranch -ExpectedBranch $Branch

$tag = if ($Version.StartsWith("v")) { $Version } else { "v$Version" }
Ensure-TagNotExists -TagName $tag -RemoteName $Remote

Write-Host "==> Fetch remote"
Invoke-Checked -ScriptBlock { git fetch $Remote } -ErrorMessage "git fetch failed."

Write-Host "==> Update $Branch (ff-only)"
Invoke-Checked -ScriptBlock { git pull --ff-only $Remote $Branch } -ErrorMessage "git pull --ff-only failed."

Write-Host "==> Build packages for $Version"
Invoke-Checked -ScriptBlock { & (Join-Path $repoRoot "build.ps1") -Version $Version } -ErrorMessage "build.ps1 failed."

$assets = Get-ReleaseAssets -Root $repoRoot -VersionName $Version

Write-Host "==> Create tag $tag"
Invoke-Checked -ScriptBlock { git tag $tag } -ErrorMessage "git tag failed."

Write-Host "==> Push branch and tag"
Invoke-Checked -ScriptBlock { git push $Remote $Branch } -ErrorMessage "git push branch failed."
Invoke-Checked -ScriptBlock { git push $Remote $tag } -ErrorMessage "git push tag failed."

Write-Host "==> Create GitHub release"
$releaseArgs = @("release", "create", $tag)
$releaseArgs += $assets
$releaseArgs += @("--title", $tag)

if ($PreRelease) {
    $releaseArgs += "--prerelease"
}
if ($Draft) {
    $releaseArgs += "--draft"
}
if ($NotesFile) {
    if (-not (Test-Path -LiteralPath $NotesFile)) {
        throw "Notes file not found: $NotesFile"
    }
    $releaseArgs += @("--notes-file", $NotesFile)
} else {
    $releaseArgs += "--generate-notes"
}

Invoke-Checked -ScriptBlock { gh @releaseArgs } -ErrorMessage "gh release create failed."

Write-Host ""
Write-Host "Release completed: $tag"
Write-Host "Assets uploaded:"
$assets | ForEach-Object { Write-Host " - $_" }
