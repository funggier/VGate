param(
  [Parameter(Mandatory=$true)][string]$Action,
  [string]$ExePath,
  [string]$FilePath,
  [string]$KeysJson,
  [string]$MouseJson,
  [string]$OutputPath
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class VGateClipStudioNative {
    public const uint INPUT_MOUSE = 0;
    public const uint INPUT_KEYBOARD = 1;
    public const uint KEYEVENTF_KEYUP = 0x0002;
    public const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
    public const uint MOUSEEVENTF_LEFTUP = 0x0004;
    public const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
    public const uint MOUSEEVENTF_RIGHTUP = 0x0010;
    public const uint MOUSEEVENTF_MIDDLEDOWN = 0x0020;
    public const uint MOUSEEVENTF_MIDDLEUP = 0x0040;
    public const uint MOUSEEVENTF_WHEEL = 0x0800;
    public const uint GA_ROOT = 2;

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct POINT {
        public int X;
        public int Y;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct INPUT {
        public uint type;
        public InputUnion U;
    }

    [StructLayout(LayoutKind.Explicit)]
    public struct InputUnion {
        [FieldOffset(0)] public MOUSEINPUT mi;
        [FieldOffset(0)] public KEYBDINPUT ki;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct MOUSEINPUT {
        public int dx;
        public int dy;
        public uint mouseData;
        public uint dwFlags;
        public uint time;
        public UIntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct KEYBDINPUT {
        public ushort wVk;
        public ushort wScan;
        public uint dwFlags;
        public uint time;
        public UIntPtr dwExtraInfo;
    }

    [DllImport("user32.dll", SetLastError=true)]
    public static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

    [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern IntPtr SetFocus(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
    [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool attach);
    [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT point);
    [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr hWnd, uint flags);
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();

    public static uint SendKey(ushort vk, bool keyUp) {
        var input = new INPUT();
        input.type = INPUT_KEYBOARD;
        input.U.ki.wVk = vk;
        input.U.ki.wScan = 0;
        input.U.ki.dwFlags = keyUp ? KEYEVENTF_KEYUP : 0;
        return SendInput(1, new INPUT[] { input }, Marshal.SizeOf(typeof(INPUT)));
    }

    public static uint SendMouse(uint flags, uint data) {
        var input = new INPUT();
        input.type = INPUT_MOUSE;
        input.U.mi.dwFlags = flags;
        input.U.mi.mouseData = data;
        return SendInput(1, new INPUT[] { input }, Marshal.SizeOf(typeof(INPUT)));
    }
}
'@

try { [VGateClipStudioNative]::SetProcessDPIAware() | Out-Null } catch {}

function Write-JsonResult([object]$Value) {
  $Value | ConvertTo-Json -Depth 8 -Compress
}

function Convert-HwndString([IntPtr]$Hwnd) {
  if ($Hwnd -eq [IntPtr]::Zero) { return $null }
  return ('0x{0:X}' -f $Hwnd.ToInt64())
}

function Get-ClipProcess {
  $processes = @(Get-Process -Name 'CLIPStudioPaint' -ErrorAction SilentlyContinue | Sort-Object StartTime)
  if ($processes.Count -eq 0) { return $null }
  $main = $processes | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
  if ($null -ne $main) { return $main }
  return $processes | Select-Object -First 1
}

function Get-Rect([IntPtr]$Hwnd) {
  $r = New-Object VGateClipStudioNative+RECT
  if (-not [VGateClipStudioNative]::GetWindowRect($Hwnd, [ref]$r)) {
    throw 'Unable to read CLIP STUDIO PAINT window rectangle.'
  }
  [pscustomobject]@{
    x = [int]$r.Left
    y = [int]$r.Top
    width = [int]($r.Right - $r.Left)
    height = [int]($r.Bottom - $r.Top)
    right = [int]$r.Right
    bottom = [int]$r.Bottom
  }
}

function Require-Window {
  $p = Get-ClipProcess
  if ($null -eq $p) { throw 'CLIP STUDIO PAINT is not running.' }
  $hwnd = [IntPtr]$p.MainWindowHandle
  if ($hwnd -eq [IntPtr]::Zero -or -not [VGateClipStudioNative]::IsWindow($hwnd)) {
    throw 'CLIP STUDIO PAINT has no valid main window yet.'
  }

  [uint32]$ownerPid = 0
  [void][VGateClipStudioNative]::GetWindowThreadProcessId($hwnd, [ref]$ownerPid)
  if ([int]$ownerPid -ne [int]$p.Id) {
    throw ('CLIP STUDIO PAINT window identity mismatch. expected_pid={0} actual_pid={1}' -f $p.Id, $ownerPid)
  }

  [pscustomobject]@{
    Process = $p
    Hwnd = $hwnd
    Rect = (Get-Rect $hwnd)
  }
}

function Acquire-ForegroundWindow {
  $w = Require-Window
  if ([VGateClipStudioNative]::IsIconic($w.Hwnd)) {
    [void][VGateClipStudioNative]::ShowWindowAsync($w.Hwnd, 9)
    Start-Sleep -Milliseconds 120
    $w = Require-Window
  }

  $foreground = [VGateClipStudioNative]::GetForegroundWindow()
  if ($foreground -ne $w.Hwnd) {
    [uint32]$ignoredPid = 0
    $targetThread = [VGateClipStudioNative]::GetWindowThreadProcessId($w.Hwnd, [ref]$ignoredPid)
    $currentThread = [VGateClipStudioNative]::GetCurrentThreadId()
    $foregroundThread = if ($foreground -eq [IntPtr]::Zero) {
      0
    } else {
      [VGateClipStudioNative]::GetWindowThreadProcessId($foreground, [ref]$ignoredPid)
    }

    $attachedForeground = $false
    $attachedTarget = $false
    try {
      if ($foregroundThread -ne 0 -and $foregroundThread -ne $currentThread) {
        $attachedForeground = [VGateClipStudioNative]::AttachThreadInput($currentThread, $foregroundThread, $true)
      }
      if ($targetThread -ne 0 -and $targetThread -ne $currentThread) {
        $attachedTarget = [VGateClipStudioNative]::AttachThreadInput($currentThread, $targetThread, $true)
      }

      [void][VGateClipStudioNative]::BringWindowToTop($w.Hwnd)
      [void][VGateClipStudioNative]::SetForegroundWindow($w.Hwnd)
      [void][VGateClipStudioNative]::SetFocus($w.Hwnd)
    } finally {
      if ($attachedTarget) {
        [void][VGateClipStudioNative]::AttachThreadInput($currentThread, $targetThread, $false)
      }
      if ($attachedForeground) {
        [void][VGateClipStudioNative]::AttachThreadInput($currentThread, $foregroundThread, $false)
      }
    }
    Start-Sleep -Milliseconds 120
  }

  $actual = [VGateClipStudioNative]::GetForegroundWindow()
  if ($actual -ne $w.Hwnd) {
    throw ('FOREGROUND_NOT_ACQUIRED target={0} actual={1}' -f (Convert-HwndString $w.Hwnd), (Convert-HwndString $actual))
  }

  return $w
}

function Get-Status {
  $installed = $false
  $version = $null
  $productName = $null
  if ($ExePath -and (Test-Path -LiteralPath $ExePath -PathType Leaf)) {
    $installed = $true
    $vi = (Get-Item -LiteralPath $ExePath).VersionInfo
    $version = $vi.ProductVersion
    $productName = $vi.ProductName
  }

  $p = Get-ClipProcess
  if ($null -eq $p) {
    return [pscustomobject]@{
      installed = $installed
      executablePath = $ExePath
      productName = $productName
      productVersion = $version
      running = $false
      pid = $null
      hwnd = $null
      title = $null
      foreground = $false
      minimized = $false
      maximized = $false
      window = $null
    }
  }

  $hwnd = [IntPtr]$p.MainWindowHandle
  $validWindow = ($hwnd -ne [IntPtr]::Zero -and [VGateClipStudioNative]::IsWindow($hwnd))
  $rect = $null
  if ($validWindow) {
    try { $rect = Get-Rect $hwnd } catch {}
  }

  [pscustomobject]@{
    installed = $installed
    executablePath = $ExePath
    productName = $productName
    productVersion = $version
    running = $true
    pid = $p.Id
    hwnd = if ($validWindow) { Convert-HwndString $hwnd } else { $null }
    title = $p.MainWindowTitle
    foreground = if ($validWindow) { [VGateClipStudioNative]::GetForegroundWindow() -eq $hwnd } else { $false }
    minimized = if ($validWindow) { [VGateClipStudioNative]::IsIconic($hwnd) } else { $false }
    maximized = if ($validWindow) { [VGateClipStudioNative]::IsZoomed($hwnd) } else { $false }
    window = $rect
  }
}

function Get-VirtualKey([string]$Name) {
  $u = $Name.Trim().ToUpperInvariant()
  if ($u.Length -eq 1) {
    $c = [int][char]$u
    if (($c -ge 0x30 -and $c -le 0x39) -or ($c -ge 0x41 -and $c -le 0x5A)) {
      return [uint16]$c
    }
  }

  $map = @{
    'CTRL' = 0x11; 'CONTROL' = 0x11; 'SHIFT' = 0x10; 'ALT' = 0x12;
    'ESC' = 0x1B; 'ESCAPE' = 0x1B; 'ENTER' = 0x0D; 'TAB' = 0x09;
    'SPACE' = 0x20; 'BACKSPACE' = 0x08; 'DELETE' = 0x2E;
    'HOME' = 0x24; 'END' = 0x23; 'PAGEUP' = 0x21; 'PAGEDOWN' = 0x22;
    'LEFT' = 0x25; 'UP' = 0x26; 'RIGHT' = 0x27; 'DOWN' = 0x28;
    'INSERT' = 0x2D;
    'F1' = 0x70; 'F2' = 0x71; 'F3' = 0x72; 'F4' = 0x73;
    'F5' = 0x74; 'F6' = 0x75; 'F7' = 0x76; 'F8' = 0x77;
    'F9' = 0x78; 'F10' = 0x79; 'F11' = 0x7A; 'F12' = 0x7B
  }
  if (-not $map.ContainsKey($u)) { throw "Unsupported key: $Name" }
  return [uint16]$map[$u]
}

function Send-Keys([object]$Keys) {
  if ($Keys.Count -lt 1 -or $Keys.Count -gt 8) {
    throw 'Key sequence must contain 1 to 8 keys.'
  }

  $w = Acquire-ForegroundWindow
  $codes = @($Keys | ForEach-Object { Get-VirtualKey ([string]$_) })
  $sent = 0

  foreach ($vk in $codes) {
    $n = [VGateClipStudioNative]::SendKey([uint16]$vk, $false)
    if ($n -ne 1) { throw 'SEND_INPUT_FAILED key_down' }
    $sent += $n
  }
  for ($i = $codes.Count - 1; $i -ge 0; $i--) {
    $n = [VGateClipStudioNative]::SendKey([uint16]$codes[$i], $true)
    if ($n -ne 1) { throw 'SEND_INPUT_FAILED key_up' }
    $sent += $n
  }

  [pscustomobject]@{
    ok = $true
    pid = $w.Process.Id
    hwnd = Convert-HwndString $w.Hwnd
    foreground = $true
    sentInputs = [int]$sent
    keys = @($Keys | ForEach-Object { ([string]$_).ToUpperInvariant() })
  }
}

function Assert-PointInside([object]$Rect, [int]$X, [int]$Y) {
  if ($X -lt $Rect.x -or $X -ge $Rect.right -or $Y -lt $Rect.y -or $Y -ge $Rect.bottom) {
    throw 'Mouse coordinates are outside the CLIP STUDIO PAINT main window.'
  }
}

function Assert-PointTarget([IntPtr]$ExpectedHwnd, [int]$X, [int]$Y) {
  $point = New-Object VGateClipStudioNative+POINT
  $point.X = $X
  $point.Y = $Y
  $atPoint = [VGateClipStudioNative]::WindowFromPoint($point)
  if ($atPoint -eq [IntPtr]::Zero) {
    throw "No window exists at mouse coordinates x=$X y=$Y."
  }
  $root = [VGateClipStudioNative]::GetAncestor($atPoint, [VGateClipStudioNative]::GA_ROOT)
  if ($root -eq [IntPtr]::Zero) { $root = $atPoint }
  if ($root -ne $ExpectedHwnd) {
    throw ('POINT_WINDOW_MISMATCH expected_hwnd={0} actual_hwnd={1} x={2} y={3}' -f (Convert-HwndString $ExpectedHwnd), (Convert-HwndString $root), $X, $Y)
  }
}

try {
  switch ($Action.ToLowerInvariant()) {
    'status' {
      Write-JsonResult (Get-Status)
      break
    }

    'launch' {
      if (-not $ExePath -or -not (Test-Path -LiteralPath $ExePath -PathType Leaf)) {
        throw "Configured CLIP STUDIO PAINT executable does not exist: $ExePath"
      }

      $before = Get-ClipProcess
      if ($null -eq $before) {
        Start-Process -FilePath $ExePath | Out-Null
        for ($i = 0; $i -lt 150; $i++) {
          Start-Sleep -Milliseconds 100
          $candidate = Get-ClipProcess
          if ($null -ne $candidate -and $candidate.MainWindowHandle -ne 0) { break }
        }
      }

      $status = Get-Status
      if (-not $status.running) { throw 'CLIP STUDIO PAINT did not start.' }
      $status | Add-Member -NotePropertyName alreadyRunning -NotePropertyValue ($null -ne $before)
      Write-JsonResult $status
      break
    }

    'focus' {
      $w = Acquire-ForegroundWindow
      Write-JsonResult ([pscustomobject]@{
        ok = $true
        pid = $w.Process.Id
        hwnd = Convert-HwndString $w.Hwnd
        foreground = $true
        minimized = [VGateClipStudioNative]::IsIconic($w.Hwnd)
        maximized = [VGateClipStudioNative]::IsZoomed($w.Hwnd)
        window = $w.Rect
      })
      break
    }

    'open' {
      if (-not $FilePath -or -not (Test-Path -LiteralPath $FilePath -PathType Leaf)) {
        throw "File does not exist: $FilePath"
      }
      if (-not $ExePath -or -not (Test-Path -LiteralPath $ExePath -PathType Leaf)) {
        throw "Configured CLIP STUDIO PAINT executable does not exist: $ExePath"
      }

      Start-Process -FilePath $ExePath -ArgumentList @('"' + $FilePath + '"') | Out-Null
      Start-Sleep -Milliseconds 600
      $status = Get-Status
      Write-JsonResult ([pscustomobject]@{
        ok = $true
        filePath = $FilePath
        running = $status.running
        pid = $status.pid
        hwnd = $status.hwnd
        title = $status.title
      })
      break
    }

    'keys' {
      if (-not $KeysJson) { throw 'KeysJson is required.' }
      $keys = ConvertFrom-Json -InputObject $KeysJson
      Write-JsonResult (Send-Keys $keys)
      break
    }

    'mouse-click' {
      if (-not $MouseJson) { throw 'MouseJson is required.' }
      $m = $MouseJson | ConvertFrom-Json
      $x = [int]$m.x
      $y = [int]$m.y
      $button = if ($m.button) { ([string]$m.button).ToLowerInvariant() } else { 'left' }
      $clicks = if ($m.clicks) { [int]$m.clicks } else { 1 }
      if ($clicks -lt 1 -or $clicks -gt 3) { throw 'clicks must be between 1 and 3.' }

      $w = Acquire-ForegroundWindow
      Assert-PointInside $w.Rect $x $y
      if (-not [VGateClipStudioNative]::SetCursorPos($x, $y)) { throw 'SET_CURSOR_FAILED' }
      Assert-PointTarget $w.Hwnd $x $y

      switch ($button) {
        'left' { $down = [VGateClipStudioNative]::MOUSEEVENTF_LEFTDOWN; $up = [VGateClipStudioNative]::MOUSEEVENTF_LEFTUP }
        'right' { $down = [VGateClipStudioNative]::MOUSEEVENTF_RIGHTDOWN; $up = [VGateClipStudioNative]::MOUSEEVENTF_RIGHTUP }
        'middle' { $down = [VGateClipStudioNative]::MOUSEEVENTF_MIDDLEDOWN; $up = [VGateClipStudioNative]::MOUSEEVENTF_MIDDLEUP }
        default { throw "Unsupported mouse button: $button" }
      }

      $sent = 0
      for ($i = 0; $i -lt $clicks; $i++) {
        $n = [VGateClipStudioNative]::SendMouse([uint32]$down, 0)
        if ($n -ne 1) { throw 'SEND_INPUT_FAILED mouse_down' }
        $sent += $n
        $n = [VGateClipStudioNative]::SendMouse([uint32]$up, 0)
        if ($n -ne 1) { throw 'SEND_INPUT_FAILED mouse_up' }
        $sent += $n
        if ($i + 1 -lt $clicks) { Start-Sleep -Milliseconds 80 }
      }

      Write-JsonResult ([pscustomobject]@{
        ok = $true
        pid = $w.Process.Id
        hwnd = Convert-HwndString $w.Hwnd
        x = $x
        y = $y
        button = $button
        clicks = $clicks
        sentInputs = [int]$sent
      })
      break
    }

    'mouse-scroll' {
      if (-not $MouseJson) { throw 'MouseJson is required.' }
      $m = $MouseJson | ConvertFrom-Json
      $x = [int]$m.x
      $y = [int]$m.y
      $delta = [int]$m.delta
      if ($delta -lt -12000 -or $delta -gt 12000) { throw 'delta is outside supported range.' }

      $w = Acquire-ForegroundWindow
      Assert-PointInside $w.Rect $x $y
      if (-not [VGateClipStudioNative]::SetCursorPos($x, $y)) { throw 'SET_CURSOR_FAILED' }
      Assert-PointTarget $w.Hwnd $x $y
      $sent = [VGateClipStudioNative]::SendMouse([VGateClipStudioNative]::MOUSEEVENTF_WHEEL, [uint32]$delta)
      if ($sent -ne 1) { throw 'SEND_INPUT_FAILED mouse_scroll' }

      Write-JsonResult ([pscustomobject]@{
        ok = $true
        pid = $w.Process.Id
        hwnd = Convert-HwndString $w.Hwnd
        x = $x
        y = $y
        delta = $delta
        sentInputs = [int]$sent
      })
      break
    }

    'capture' {
      if (-not $OutputPath) { throw 'OutputPath is required.' }
      $w = Require-Window
      Start-Sleep -Milliseconds 80

      Add-Type -AssemblyName System.Drawing
      $parent = Split-Path -Parent $OutputPath
      if ($parent) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }

      $bitmap = New-Object System.Drawing.Bitmap($w.Rect.width, $w.Rect.height)
      $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
      try {
        $graphics.CopyFromScreen($w.Rect.x, $w.Rect.y, 0, 0, $bitmap.Size)
        $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
      } finally {
        $graphics.Dispose()
        $bitmap.Dispose()
      }

      $item = Get-Item -LiteralPath $OutputPath
      $hash = (Get-FileHash -LiteralPath $OutputPath -Algorithm SHA256).Hash.ToLowerInvariant()
      Write-JsonResult ([pscustomobject]@{
        ok = $true
        outputPath = $OutputPath
        width = $w.Rect.width
        height = $w.Rect.height
        bytes = $item.Length
        sha256 = $hash
        pid = $w.Process.Id
        hwnd = Convert-HwndString $w.Hwnd
        foreground = [VGateClipStudioNative]::GetForegroundWindow() -eq $w.Hwnd
      })
      break
    }

    default {
      throw "Unknown Clip Studio helper action: $Action"
    }
  }
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}