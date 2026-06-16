# Builds a clean, store-ready extension zip WITHOUT needing Node/web-ext.
# Only the files the extension actually loads are included (no website pages,
# prompt notes, or multi-MB source images). The manifest sits at the zip root.
#
# Entries are written with FORWARD SLASHES. Windows PowerShell's Compress-Archive
# writes backslashes, which violates the ZIP spec and makes browsers reject the
# package as corrupt / fail to find files in subfolders — so we build the archive
# by hand instead.
#
# Usage:   powershell -ExecutionPolicy Bypass -File build-extension.ps1
# Output:  web-ext-artifacts/xenon-<version>.zip

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$manifest = Get-Content (Join-Path $root "manifest.json") -Raw | ConvertFrom-Json
$version = $manifest.version

# Files / folders the extension actually loads.
$include = @(
	"manifest.json",
	"background.js",
	"popup",
	"assets/images/icon-16.png",
	"assets/images/icon-32.png",
	"assets/images/icon-48.png",
	"assets/images/icon-128.png",
	"assets/fonts"
)

# Expand folders to their files, build a list of (absolutePath, zipEntryName).
$entries = @()
foreach ($item in $include) {
	$src = Join-Path $root $item
	if (-not (Test-Path $src)) {
		Write-Warning "skip (missing): $item"
		continue
	}
	if (Test-Path $src -PathType Container) {
		Get-ChildItem $src -Recurse -File | ForEach-Object {
			$rel = $_.FullName.Substring($root.Length + 1) -replace '\\', '/'
			$entries += [pscustomobject]@{ Path = $_.FullName; Name = $rel }
		}
	} else {
		$rel = (Resolve-Path $src).Path.Substring($root.Length + 1) -replace '\\', '/'
		$entries += [pscustomobject]@{ Path = $src; Name = $rel }
	}
}

$outDir = Join-Path $root "web-ext-artifacts"
if (-not (Test-Path $outDir)) {
	New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}
$out = Join-Path $outDir ("xenon-" + $version + ".zip")
if (Test-Path $out) {
	Remove-Item $out -Force
}

$zip = [System.IO.Compression.ZipFile]::Open($out, [System.IO.Compression.ZipArchiveMode]::Create)
try {
	foreach ($e in $entries) {
		[System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
			$zip, $e.Path, $e.Name,
			[System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
	}
} finally {
	$zip.Dispose()
}

$size = [Math]::Round((Get-Item $out).Length / 1KB, 1)
Write-Output "Built $out ($size KB, $($entries.Count) files)"
