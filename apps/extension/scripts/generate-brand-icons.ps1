$ErrorActionPreference = 'Stop'

# Keep the companion visually aligned with the installed desktop product.
$sourcePath = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..\desktop\src\renderer\public\app-icon.png')).Path
$outputDirectory = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\public\icon')).Path

Add-Type -AssemblyName System.Drawing
$sourceImage = [System.Drawing.Image]::FromFile($sourcePath)

try {
  foreach ($size in @(16, 32, 48, 128)) {
    $bitmap = New-Object System.Drawing.Bitmap($size, $size)
    try {
      $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
      try {
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $graphics.DrawImage($sourceImage, 0, 0, $size, $size)
      }
      finally {
        $graphics.Dispose()
      }

      $targetPath = Join-Path $outputDirectory "$size.png"
      $bitmap.Save($targetPath, [System.Drawing.Imaging.ImageFormat]::Png)
    }
    finally {
      $bitmap.Dispose()
    }
  }
}
finally {
  $sourceImage.Dispose()
}
