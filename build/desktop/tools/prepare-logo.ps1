# Turns the generated logo artwork into the icon assets used by the app.
#
# The artwork is a rounded-square badge on a transparent background. Exporting it
# as JPG flattened that transparency to solid black, so this script recovers the
# alpha channel from the black matte (observed = alpha * original), writes every
# icon size, and inlines the 96px version into the page as base64.
#
# Keep this file ASCII-only: Windows PowerShell 5.1 reads .ps1 files as ANSI
# unless they carry a UTF-8 BOM, which would corrupt non-ASCII text.
[CmdletBinding()]
param(
  [string]$Source,
  [string]$AssetDir,
  [string]$HtmlPath,
  [double]$AlphaReference = 100,
  [double]$OpaqueAt = 0.90,
  [double]$TransparentBelow = 0.12
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$desktopDir = Split-Path -Parent $PSScriptRoot
if (-not $Source) { $Source = Join-Path $desktopDir 'assets\logo-source.jpg' }
if (-not $AssetDir) { $AssetDir = Join-Path $desktopDir 'assets' }
if (-not $HtmlPath) { $HtmlPath = Join-Path $desktopDir '..\..\index.html' }

function Convert-ToArgbBitmap {
  param([string]$Path)
  $source = [System.Drawing.Bitmap]::FromFile($Path)
  try {
    $bitmap = New-Object System.Drawing.Bitmap($source.Width, $source.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
      $graphics.DrawImage($source, (New-Object System.Drawing.Rectangle(0, 0, $source.Width, $source.Height)))
    } finally { $graphics.Dispose() }
    return $bitmap
  } finally { $source.Dispose() }
}

function Set-BlackMatteAlpha {
  param([System.Drawing.Bitmap]$Bitmap, [double]$Reference, [double]$OpaqueAt, [double]$TransparentBelow)
  $rect = New-Object System.Drawing.Rectangle(0, 0, $Bitmap.Width, $Bitmap.Height)
  $data = $Bitmap.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadWrite, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  try {
    $count = $data.Stride * $Bitmap.Height
    $buffer = New-Object byte[] $count
    [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $buffer, 0, $count)

    for ($i = 0; $i -lt $count; $i += 4) {
      $blue = $buffer[$i]; $green = $buffer[$i + 1]; $red = $buffer[$i + 2]
      $luma = 0.299 * $red + 0.587 * $green + 0.114 * $blue
      $ratio = $luma / $Reference

      if ($ratio -ge $OpaqueAt) { $buffer[$i + 3] = 255; continue }
      if ($ratio -le $TransparentBelow) { $buffer[$i + 3] = 0; continue }

      $buffer[$i + 3] = [byte][Math]::Round($ratio * 255)
      $scale = 1.0 / $ratio
      $buffer[$i] = [byte][Math]::Min(255, [int]($blue * $scale))
      $buffer[$i + 1] = [byte][Math]::Min(255, [int]($green * $scale))
      $buffer[$i + 2] = [byte][Math]::Min(255, [int]($red * $scale))
    }

    [System.Runtime.InteropServices.Marshal]::Copy($buffer, 0, $data.Scan0, $count)
  } finally { $Bitmap.UnlockBits($data) }
}

function Save-Resized {
  param([System.Drawing.Bitmap]$Source, [int]$Size, [string]$Path)
  $target = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($target)
  try {
    $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.DrawImage($Source, (New-Object System.Drawing.Rectangle(0, 0, $Size, $Size)))
  } finally { $graphics.Dispose() }
  $target.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $target.Dispose()
}

function Update-HtmlBrandLogo {
  param([string]$HtmlPath, [string]$PngPath)
  $base64 = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($PngPath))
  $html = [System.IO.File]::ReadAllText($HtmlPath)
  $pattern = '(<img id="brandLogo"[^>]*src="data:image/png;base64,)[^"]*(")'
  if ($html -notmatch $pattern) { throw 'brandLogo image tag not found in the page' }
  $updated = [System.Text.RegularExpressions.Regex]::Replace($html, $pattern, ('${1}' + $base64 + '${2}'))
  [System.IO.File]::WriteAllText($HtmlPath, $updated, (New-Object System.Text.UTF8Encoding($false)))
  return $base64.Length
}

New-Item -ItemType Directory -Force -Path $AssetDir | Out-Null

$bitmap = Convert-ToArgbBitmap -Path $Source
try {
  Set-BlackMatteAlpha -Bitmap $bitmap -Reference $AlphaReference -OpaqueAt $OpaqueAt -TransparentBelow $TransparentBelow

  $logoPath = Join-Path $AssetDir 'logo.png'
  $bitmap.Save($logoPath, [System.Drawing.Imaging.ImageFormat]::Png)

  foreach ($size in 16, 24, 32, 48, 64, 128, 200) {
    Save-Resized -Source $bitmap -Size $size -Path (Join-Path $AssetDir ("icon-{0}.png" -f $size))
  }

  $brandPath = Join-Path $AssetDir 'brand-96.png'
  Save-Resized -Source $bitmap -Size 96 -Path $brandPath

  $base64Length = Update-HtmlBrandLogo -HtmlPath $HtmlPath -PngPath $brandPath
} finally { $bitmap.Dispose() }

Write-Output ("icon png files: {0}" -f (Get-ChildItem $AssetDir -Filter '*.png' | Measure-Object).Count)
Write-Output ("inlined into the page: {0} base64 characters" -f $base64Length)
