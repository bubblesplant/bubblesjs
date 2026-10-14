<#
.SYNOPSIS
实际验证当前用户的安装、恢复、重复安装及失败回滚；结束时应用棉花云朵。
故障分支只在独立测试子进程替换原生接口，不向交付安装器添加测试开关。
#>
param([ValidateSet('None', 'Apply', 'Both', 'Unknown')][string]$Failure = 'None')

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$installer = Join-Path $root '指针包/cotton-cloud/manage.ps1'
$installedBase = Join-Path $env:LOCALAPPDATA 'CottonCloudCursors'
$backupPath = Join-Path $installedBase 'backup.json'

if ($Failure -ne 'None') {
    $firstError = if ($Failure -eq 'Unknown') { 0 } else { 5 }
    $bothFail = if ($Failure -eq 'Both') { 'true' } else { 'false' }
    $native = @'
using System;
using System.Runtime.InteropServices;
namespace CottonCloud {
    public static class NativeCursor {
        private static int calls;
        private static bool failRollback = BOTH_FAIL;
        [DllImport("user32.dll", EntryPoint = "SystemParametersInfoW", ExactSpelling = true, SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool Spi(uint action, uint parameter, IntPtr data, uint flags);
        /** 首次模拟应用失败；其后按测试场景模拟或真正刷新还原后的设置。 */
        public static bool Reload(out int error) {
            calls++;
            if (calls == 1) { error = FIRST_ERROR; return false; }
            if (failRollback) { error = 87; return false; }
            bool loaded = Spi(0x0057, 0, IntPtr.Zero, 0);
            error = loaded ? 0 : Marshal.GetLastWin32Error();
            return loaded;
        }
    }
}
'@
    Add-Type -TypeDefinition $native.Replace('FIRST_ERROR', [string]$firstError).Replace('BOTH_FAIL', $bothFail)
    & $installer -Action Install
    exit $LASTEXITCODE
}

$manifest = Get-Content -LiteralPath (Join-Path (Split-Path $installer -Parent) 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$schemeName = $manifest.scheme
$valueNames = @($manifest.roles.role) + @('', 'Scheme Source')

function Read-Value {
    <# 读取未展开的值、原始注册表类型及存在性，供完整恢复比较。 #>
    param($Key, [string]$Name)
    if ($null -eq $Key -or $Key.GetValueNames() -notcontains $Name) {
        return [pscustomobject]@{ Name = $Name; Exists = $false; Kind = $null; Value = $null }
    }
    return [pscustomobject]@{ Name = $Name; Exists = $true; Kind = [string]$Key.GetValueKind($Name);
        Value = $Key.GetValue($Name, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames) }
}

function Read-Snapshot {
    <# 检查 19 个受管理的值和自有方案；原始内容只保留内存，不写入仓库证据。 #>
    $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Control Panel\Cursors')
    $schemes = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Control Panel\Cursors\Schemes')
    try {
        return [pscustomobject]@{ Version = 1; Values = @($valueNames | ForEach-Object { Read-Value $key $_ });
            Scheme = (Read-Value $schemes $schemeName) }
    } finally {
        if ($key) { $key.Dispose() }
        if ($schemes) { $schemes.Dispose() }
    }
}

function Assert-Equal {
    <# 不匹配时停止验证，避免把仅退出成功误报为配置或备份保持一致。 #>
    param($Actual, $Expected, [string]$Message)
    if ($Actual -cne $Expected) { throw $Message }
}

function Invoke-Installer {
    <# 在真实 Windows PowerShell 5.1 子进程运行安装器，记录返回值与中文输出。 #>
    param([string]$Action, [string]$ScriptPath = $installer)
    $output = @(& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $ScriptPath -Action $Action)
    $code = $LASTEXITCODE
    return [pscustomobject]@{ action = $Action; exit_code = $code; output = ($output -join "`n") }
}

function Assert-BackupUnchanged {
    <# 重复安装、恢复与失败回滚都不得覆盖用户的首次备份。 #>
    Assert-Equal (Get-FileHash -LiteralPath $backupPath -Algorithm SHA256).Hash $backupHash '首次备份发生变化。'
}

$backup = Get-Content -LiteralPath $backupPath -Raw -Encoding UTF8 | ConvertFrom-Json
$backupHash = (Get-FileHash -LiteralPath $backupPath -Algorithm SHA256).Hash
$original = $backup | ConvertTo-Json -Depth 8 -Compress
$report = [ordered]@{ date = '2026-10-14'; windows_powershell = $PSVersionTable.PSVersion.ToString();
    installer_sha256 = (Get-FileHash -LiteralPath $installer).Hash; checks = @() }

$beforeCheck = Read-Snapshot | ConvertTo-Json -Depth 8 -Compress
$check = Invoke-Installer Check
Assert-Equal $check.exit_code 0 '只读检查失败。'
Assert-Equal (Read-Snapshot | ConvertTo-Json -Depth 8 -Compress) $beforeCheck '只读检查修改了设置。'
$report.checks += [pscustomobject]@{ name = '只读校验'; passed = $true; result = $check; registry_unchanged = $true }

$restore = Invoke-Installer Restore (Join-Path $installedBase 'manage.ps1')
Assert-Equal $restore.exit_code 0 '实际恢复失败。'
Assert-Equal (Read-Snapshot | ConvertTo-Json -Depth 8 -Compress) $original '实际恢复后与首次备份不同。'
Assert-BackupUnchanged
$report.checks += [pscustomobject]@{ name = '从持久化目录实际恢复'; passed = $true; result = $restore;
    values_types_presence_and_scheme_match_backup = $true }

foreach ($scenario in @('Apply', 'Both', 'Unknown')) {
    $output = @(& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath -Failure $scenario)
    $code = $LASTEXITCODE
    $message = $output -join "`n"
    Assert-Equal $code 1 "故障场景 $scenario 未返回失败。"
    Assert-Equal (Read-Snapshot | ConvertTo-Json -Depth 8 -Compress) $original "故障场景 $scenario 未还原注册表。"
    if ($scenario -eq 'Both') {
        if ($message -notmatch '错误 5' -or $message -notmatch '错误 87' -or $message -notmatch '注册表已还原') {
            throw '回滚刷新错误遮盖了原始安装错误。'
        }
    } elseif ($scenario -eq 'Unknown') {
        if ($message -notmatch '系统未提供错误码' -or $message -notmatch '已恢复本次安装前') { throw '缺失错误码提示不准确。' }
    } elseif ($message -notmatch '错误 5' -or $message -notmatch '已恢复本次安装前') {
        throw '安装失败回滚提示不准确。'
    }
    Assert-BackupUnchanged
    $report.checks += [pscustomobject]@{ name = "模拟故障 $scenario"; passed = $true; exit_code = $code;
        output = $message; registry_matches_backup = $true; native_failure_is_simulated = $true }
}

for ($attempt = 1; $attempt -le 2; $attempt++) {
    $install = Invoke-Installer Install
    Assert-Equal $install.exit_code 0 '实际安装失败。'
    $state = Read-Snapshot
    foreach ($role in $manifest.roles) {
        $value = @($state.Values | Where-Object Name -eq $role.role)[0]
        $target = Join-Path (Join-Path $installedBase 'cursors') $role.file
        Assert-Equal $value.Value $target "角色 $($role.role) 路径错误。"
        Assert-Equal $value.Kind 'ExpandString' "角色 $($role.role) 类型错误。"
        Assert-Equal (Get-FileHash -LiteralPath $target).Hash.ToLowerInvariant() $role.sha256 "角色 $($role.role) 文件内容错误。"
    }
    Assert-Equal (@($state.Values | Where-Object Name -eq '')[0].Value) '棉花云朵' '方案名称错误。'
    Assert-Equal (@($state.Values | Where-Object Name -eq 'Scheme Source')[0].Value) 1 '方案来源错误。'
    $expectedPaths = @($manifest.roles | ForEach-Object { Join-Path (Join-Path $installedBase 'cursors') $_.file })
    Assert-Equal $state.Scheme.Value ($expectedPaths -join ',') '方案条目错误。'
    Assert-BackupUnchanged
    Assert-Equal (Get-FileHash -LiteralPath (Join-Path $installedBase 'manage.ps1')).Hash $report.installer_sha256 '部署脚本与交付脚本不同。'
    $report.checks += [pscustomobject]@{ name = "实际安装 $attempt"; passed = $true; result = $install;
        roles_and_files_verified = 17; first_backup_unchanged = $true }
}

$report.final_theme = '棉花云朵'
$report.first_backup_unchanged = $true
$report | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $root '测试证据/cloud-installer-runtime.json') -Encoding UTF8
Write-Host '真实安装、恢复、重复安装及三种失败回滚检查均通过；棉花云朵已应用，首次备份保持完整。'
