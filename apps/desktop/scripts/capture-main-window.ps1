param(
  [Parameter(Mandatory = $true)]
  [string]$ProcessName,
  [Parameter(Mandatory = $true)]
  [string]$OutputPath
)

$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class CaptureWindowApi {
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }

  [DllImport("user32.dll")]
  public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);

  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdcBlt, uint flags);

  [DllImport("user32.dll")]
  public static extern bool ShowWindow(IntPtr hWnd, int command);

  [DllImport("user32.dll")]
  public static extern bool SetProcessDpiAwarenessContext(IntPtr dpiContext);
}
'@

# PowerShell is DPI-unaware by default on many Windows installations. Without
# opting in before querying the window bounds, GetWindowRect returns virtualized
# coordinates while PrintWindow renders physical pixels, cropping high-DPI apps.
[CaptureWindowApi]::SetProcessDpiAwarenessContext([IntPtr](-4)) | Out-Null
Add-Type -AssemblyName System.Drawing

$Process = Get-Process -Name $ProcessName -ErrorAction Stop |
  Where-Object { $_.MainWindowHandle -ne 0 } |
  Select-Object -First 1
if (-not $Process) {
  throw "No visible window found for process $ProcessName"
}

[CaptureWindowApi]::ShowWindow($Process.MainWindowHandle, 9) | Out-Null
Start-Sleep -Milliseconds 300
$Rect = [CaptureWindowApi+RECT]::new()
if (-not [CaptureWindowApi]::GetWindowRect($Process.MainWindowHandle, [ref]$Rect)) {
  throw 'Could not read the application window bounds.'
}

$Width = $Rect.Right - $Rect.Left
$Height = $Rect.Bottom - $Rect.Top
$Bitmap = [System.Drawing.Bitmap]::new($Width, $Height)
$Graphics = [System.Drawing.Graphics]::FromImage($Bitmap)
$DeviceContext = $Graphics.GetHdc()
$Captured = [CaptureWindowApi]::PrintWindow($Process.MainWindowHandle, $DeviceContext, 2)
$Graphics.ReleaseHdc($DeviceContext)
if (-not $Captured) {
  $Graphics.CopyFromScreen($Rect.Left, $Rect.Top, 0, 0, $Bitmap.Size)
}
$Parent = Split-Path -Parent $OutputPath
[System.IO.Directory]::CreateDirectory($Parent) | Out-Null
$Bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
$Graphics.Dispose()
$Bitmap.Dispose()
Write-Output $OutputPath
