$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$AppDir = Resolve-Path -LiteralPath (Join-Path $ScriptDir '..')

function New-RoundedPath {
  param(
    [System.Drawing.RectangleF]$Rectangle,
    [float]$Radius
  )
  $Diameter = $Radius * 2
  $Path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $Path.AddArc($Rectangle.X, $Rectangle.Y, $Diameter, $Diameter, 180, 90)
  $Path.AddArc($Rectangle.Right - $Diameter, $Rectangle.Y, $Diameter, $Diameter, 270, 90)
  $Path.AddArc($Rectangle.Right - $Diameter, $Rectangle.Bottom - $Diameter, $Diameter, $Diameter, 0, 90)
  $Path.AddArc($Rectangle.X, $Rectangle.Bottom - $Diameter, $Diameter, $Diameter, 90, 90)
  $Path.CloseFigure()
  return $Path
}

function New-FengshaIcon {
  param([int]$Size)

  $Bitmap = [System.Drawing.Bitmap]::new($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $Graphics = [System.Drawing.Graphics]::FromImage($Bitmap)
  $Graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $Graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $Graphics.Clear([System.Drawing.Color]::Transparent)

  $Scale = $Size / 1024.0
  $Background = New-RoundedPath ([System.Drawing.RectangleF]::new(34 * $Scale, 34 * $Scale, 956 * $Scale, 956 * $Scale)) (210 * $Scale)
  $Graphics.FillPath([System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 27, 25, 20)), $Background)

  $GlowBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    [System.Drawing.PointF]::new(150 * $Scale, 150 * $Scale),
    [System.Drawing.PointF]::new(860 * $Scale, 900 * $Scale),
    [System.Drawing.Color]::FromArgb(255, 252, 193, 57),
    [System.Drawing.Color]::FromArgb(255, 226, 126, 20)
  )
  $BookLeft = @(
    [System.Drawing.PointF]::new(192 * $Scale, 282 * $Scale),
    [System.Drawing.PointF]::new(480 * $Scale, 350 * $Scale),
    [System.Drawing.PointF]::new(480 * $Scale, 770 * $Scale),
    [System.Drawing.PointF]::new(192 * $Scale, 700 * $Scale)
  )
  $BookRight = @(
    [System.Drawing.PointF]::new(544 * $Scale, 350 * $Scale),
    [System.Drawing.PointF]::new(832 * $Scale, 282 * $Scale),
    [System.Drawing.PointF]::new(832 * $Scale, 700 * $Scale),
    [System.Drawing.PointF]::new(544 * $Scale, 770 * $Scale)
  )
  $Graphics.FillPolygon($GlowBrush, $BookLeft)
  $Graphics.FillPolygon($GlowBrush, $BookRight)

  $InkBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 27, 25, 20))
  $Play = @(
    [System.Drawing.PointF]::new(415 * $Scale, 410 * $Scale),
    [System.Drawing.PointF]::new(415 * $Scale, 650 * $Scale),
    [System.Drawing.PointF]::new(650 * $Scale, 530 * $Scale)
  )
  $Graphics.FillPolygon($InkBrush, $Play)

  $Pen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(150, 27, 25, 20), 18 * $Scale)
  $Pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $Pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $Graphics.DrawLine($Pen, 250 * $Scale, 635 * $Scale, 355 * $Scale, 660 * $Scale)
  $Graphics.DrawLine($Pen, 670 * $Scale, 660 * $Scale, 775 * $Scale, 635 * $Scale)

  $Pen.Dispose()
  $InkBrush.Dispose()
  $GlowBrush.Dispose()
  $Background.Dispose()
  $Graphics.Dispose()
  return $Bitmap
}

$LargeIcon = New-FengshaIcon 1024
$PngTargets = @(
  (Join-Path $AppDir 'build\icon.png'),
  (Join-Path $AppDir 'resources\icon.png'),
  (Join-Path $AppDir 'src\renderer\public\app-icon.png'),
  (Join-Path $AppDir 'src\renderer\src\assets\app-icon.png')
)
foreach ($Target in $PngTargets) {
  $LargeIcon.Save($Target, [System.Drawing.Imaging.ImageFormat]::Png)
}
$LargeIcon.Dispose()

$TrayIcon = New-FengshaIcon 64
$TrayIcon.Save((Join-Path $AppDir 'resources\tray-icon.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$TrayIcon.Dispose()

$WindowsIcon = New-FengshaIcon 256
$Handle = $WindowsIcon.GetHicon()
$Icon = [System.Drawing.Icon]::FromHandle($Handle)
$Stream = [System.IO.File]::Create((Join-Path $AppDir 'build\icon.ico'))
$Icon.Save($Stream)
$Stream.Dispose()
$Icon.Dispose()
$WindowsIcon.Dispose()

Write-Output 'Generated Fengsha brand PNG and ICO assets.'
