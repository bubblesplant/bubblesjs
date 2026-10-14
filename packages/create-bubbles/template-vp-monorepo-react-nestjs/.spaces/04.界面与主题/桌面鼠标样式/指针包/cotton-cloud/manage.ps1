<#
.SYNOPSIS
安装或恢复当前用户的棉花云朵指针；Check 只验证文件，不写入磁盘或注册表。
#>
param([ValidateSet('Install', 'Restore', 'Check')][string]$Action = 'Check')

$ErrorActionPreference = 'Stop'
$basePath = Join-Path $env:LOCALAPPDATA 'CottonCloudCursors'
$backupPath = Join-Path $basePath 'backup.json'
$schemeName = 'Cotton Cloud (Custom)'
$cursorKeyName = 'Control Panel\Cursors'
$registryRoot = [Microsoft.Win32.Registry]::CurrentUser
$registryValueKind = [Microsoft.Win32.RegistryValueKind]

function Read-RegistryValue {
    <# 保存值是否存在、原始类型和未展开的路径，使恢复不会把缺失值变成空字符串。 #>
    param([Microsoft.Win32.RegistryKey]$Key, [string]$Name)
    if ($null -eq $Key -or $Key.GetValueNames() -notcontains $Name) {
        return [pscustomobject]@{ Name = $Name; Exists = $false; Kind = $null; Value = $null }
    }
    return [pscustomobject]@{
        Name = $Name
        Exists = $true
        Kind = [string]$Key.GetValueKind($Name)
        Value = $Key.GetValue($Name, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
    }
}

function Write-RegistryValue {
    <# 按备份中的存在性和类型恢复单个值，保留所有不属于该指针包的设置。 #>
    param([Microsoft.Win32.RegistryKey]$Key, $Saved)
    if ($Saved.Exists) {
        $kind = [Microsoft.Win32.RegistryValueKind][Enum]::Parse([Microsoft.Win32.RegistryValueKind], $Saved.Kind)
        $value = $Saved.Value
        if ($kind -eq [Microsoft.Win32.RegistryValueKind]::DWord) { $value = [int]$value }
        if ($kind -eq [Microsoft.Win32.RegistryValueKind]::QWord) { $value = [long]$value }
        $Key.SetValue([string]$Saved.Name, $value, $kind)
    } else {
        $Key.DeleteValue([string]$Saved.Name, $false)
    }
}

function Refresh-Cursors {
    <# 从已持久化的注册表重新加载指针，不附加配置写入标志；原生错误码在调用后立即捕获。 #>
    if (-not ('CottonCloud.NativeCursor' -as [type])) {
        Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
namespace CottonCloud {
    public static class NativeCursor {
        [DllImport("user32.dll", EntryPoint = "SystemParametersInfoW", ExactSpelling = true, SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool SystemParametersInfoW(uint action, uint parameter, IntPtr data, uint flags);

        [DllImport("kernel32.dll", EntryPoint = "SetLastError", ExactSpelling = true)]
        private static extern void SetLastError(uint error);

        /** 重新加载当前用户指针，并在任何托管调用前保存 Windows 错误码。 */
        public static bool Reload(out int error) {
            SetLastError(0);
            bool loaded = SystemParametersInfoW(0x0057, 0, IntPtr.Zero, 0);
            error = loaded ? 0 : Marshal.GetLastWin32Error();
            return loaded;
        }
    }
}
'@
    }
    $nativeError = 0
    if (-not [CottonCloud.NativeCursor]::Reload([ref]$nativeError)) {
        if ($nativeError -eq 0) {
            throw 'Windows 未能刷新鼠标指针，系统未提供错误码。'
        }
        $reason = [ComponentModel.Win32Exception]::new($nativeError).Message
        throw "Windows 未能刷新鼠标指针（错误 $nativeError）：$reason"
    }
}

function Restore-SavedSettings {
    <# 只还原角色、方案名称和包自有方案条目；调用者分别处理注册表恢复与即时刷新错误。 #>
    param($Saved)
    $key = $registryRoot.CreateSubKey($cursorKeyName)
    $schemes = $registryRoot.CreateSubKey("$cursorKeyName\Schemes")
    try {
        foreach ($entry in $Saved.Values) { Write-RegistryValue -Key $key -Saved $entry }
        Write-RegistryValue -Key $schemes -Saved $Saved.Scheme
    } finally {
        $schemes.Dispose()
        $key.Dispose()
    }
}

try {
    if ($Action -eq 'Restore') {
        if (-not (Test-Path -LiteralPath $backupPath -PathType Leaf)) {
            throw '尚未找到安装前的备份；当前鼠标设置没有改动。'
        }
        $saved = Get-Content -LiteralPath $backupPath -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($saved.Version -ne 1 -or $saved.Scheme.Name -ne $schemeName) { throw '备份格式不匹配。' }
        Restore-SavedSettings -Saved $saved
        try {
            Refresh-Cursors
        } catch {
            throw "原鼠标配置已还原，但未能立即刷新：$($_.Exception.Message)"
        }
        Write-Host '已恢复安装前的鼠标样式。备份保留，可再次恢复。' -ForegroundColor Green
        exit 0
    }

    $manifest = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $expectedRoles = @('Arrow', 'Help', 'AppStarting', 'Wait', 'Crosshair', 'IBeam', 'NWPen', 'No',
        'SizeNS', 'SizeWE', 'SizeNWSE', 'SizeNESW', 'SizeAll', 'UpArrow', 'Hand', 'Pin', 'Person')
    if ($manifest.version -ne 1 -or $manifest.scheme -ne $schemeName -or $manifest.roles.Count -ne 17) {
        throw '指针包清单不完整。'
    }
    $cursorSource = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'cursors'))
    for ($i = 0; $i -lt $expectedRoles.Count; $i++) {
        $item = $manifest.roles[$i]
        if ($item.role -ne $expectedRoles[$i] -or [IO.Path]::GetFileName($item.file) -ne $item.file) {
            throw '指针角色或文件名不正确。'
        }
        $filePath = Join-Path $cursorSource $item.file
        if (-not (Test-Path -LiteralPath $filePath -PathType Leaf)) { throw "缺少指针：$($item.file)" }
        $actualHash = (Get-FileHash -LiteralPath $filePath -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($actualHash -ne $item.sha256) { throw "指针文件校验失败：$($item.file)" }
    }
    if ($Action -eq 'Check') {
        Write-Host '检查通过：17 个角色文件完整，SHA256 全部匹配；未修改鼠标设置。'
        exit 0
    }

    # 保存安装前当前状态；重复安装保留首次备份，并单独保存本次失败时的回滚状态。
    $key = $registryRoot.OpenSubKey($cursorKeyName, $false)
    $schemes = $registryRoot.OpenSubKey("$cursorKeyName\Schemes", $false)
    try {
        $values = @($expectedRoles + @('', 'Scheme Source') | ForEach-Object { Read-RegistryValue -Key $key -Name $_ })
        $current = [pscustomobject]@{ Version = 1; Values = $values; Scheme = (Read-RegistryValue -Key $schemes -Name $schemeName) }
    } finally {
        if ($schemes) { $schemes.Dispose() }
        if ($key) { $key.Dispose() }
    }
    [IO.Directory]::CreateDirectory($basePath) | Out-Null
    if (-not (Test-Path -LiteralPath $backupPath)) {
        $current | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $backupPath -Encoding UTF8
    } else {
        $existingBackup = Get-Content -LiteralPath $backupPath -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($existingBackup.Version -ne 1 -or $existingBackup.Scheme.Name -ne $schemeName) { throw '已有备份格式不匹配，停止安装。' }
    }
    $targetDir = Join-Path $basePath 'cursors'
    [IO.Directory]::CreateDirectory($targetDir) | Out-Null
    foreach ($item in $manifest.roles) {
        Copy-Item -LiteralPath (Join-Path $cursorSource $item.file) -Destination (Join-Path $targetDir $item.file) -Force
    }
    Copy-Item -LiteralPath $PSCommandPath -Destination (Join-Path $basePath 'manage.ps1') -Force
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot '恢复原鼠标.cmd') -Destination (Join-Path $basePath '恢复原鼠标.cmd') -Force
    $key = $registryRoot.CreateSubKey($cursorKeyName)
    $schemes = $registryRoot.CreateSubKey("$cursorKeyName\Schemes")
    $applyError = $null
    try {
        $paths = @()
        foreach ($item in $manifest.roles) {
            $path = Join-Path $targetDir $item.file
            $key.SetValue([string]$item.role, $path, $registryValueKind::ExpandString)
            $paths += $path
        }
        $key.SetValue('', '棉花云朵', $registryValueKind::String)
        $key.SetValue('Scheme Source', 1, $registryValueKind::DWord)
        $schemes.SetValue($schemeName, ($paths -join ','), $registryValueKind::String)
        Refresh-Cursors
    } catch {
        $applyError = $_
    } finally {
        $schemes.Dispose()
        $key.Dispose()
    }
    if ($applyError) {
        $installMessage = $applyError.Exception.Message
        try {
            Restore-SavedSettings -Saved $current
        } catch {
            throw "安装失败：$installMessage；原配置还原也失败：$($_.Exception.Message)。首次备份保留在 $backupPath"
        }
        try {
            Refresh-Cursors
        } catch {
            throw "安装失败：$installMessage；注册表已还原，但原鼠标未能立即刷新：$($_.Exception.Message)"
        }
        throw "安装失败，已恢复本次安装前的设置：$installMessage"
    }
    Write-Host '棉花云朵已安装并应用。' -ForegroundColor Green
    Write-Host "恢复入口：$(Join-Path $basePath '恢复原鼠标.cmd')"
} catch {
    Write-Host "操作未完成：$($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
