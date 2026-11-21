#requires -Version 7.0
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$courseDirectory = Split-Path -Parent $PSScriptRoot
$evidencePath = Join-Path $courseDirectory '测试证据\课程验证.json'
$testBase = 'C:\Users\Administrator\Documents\Codex\scratch-tests'
$taskDirectory = Join-Path $testBase ('agent-course-' + [guid]::NewGuid().ToString('N'))
$originalLocation = Get-Location
$resolvedBase = [System.IO.Path]::GetFullPath($testBase).TrimEnd('\')
$resolvedTask = [System.IO.Path]::GetFullPath($taskDirectory)

try {
  New-Item -ItemType Directory -Path $resolvedTask -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot '验证依赖.json') -Destination (Join-Path $resolvedTask 'package.json')
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot '验证课程.mjs') -Destination (Join-Path $resolvedTask 'verify.mjs')
  Set-Location -LiteralPath $resolvedTask
  & vp install --ignore-scripts
  if ($LASTEXITCODE -ne 0) { throw '隔离依赖安装失败' }
  & vp node verify.mjs $courseDirectory $evidencePath
  if ($LASTEXITCODE -ne 0) { throw '课程验证未全部通过，请查看测试证据' }
} finally {
  Set-Location -LiteralPath $originalLocation.Path
  if (Test-Path -LiteralPath $resolvedTask) {
    $actual = (Get-Item -LiteralPath $resolvedTask -Force).FullName
    if (-not $actual.StartsWith($resolvedBase + '\', [System.StringComparison]::OrdinalIgnoreCase) -or $actual -ne $resolvedTask) {
      throw "拒绝清理：路径不在本次测试子目录：$actual"
    }
    if ((Get-Item -LiteralPath $actual -Force).Attributes.HasFlag([System.IO.FileAttributes]::ReparsePoint)) {
      throw "拒绝清理：测试根目录是链接：$actual"
    }
    # PowerShell 7 的 Remove-Item 不递归进入目录符号链接的目标。
    Remove-Item -LiteralPath $actual -Recurse -Force -ErrorAction Stop
    Write-Output "已清理本次测试目录：$actual"
  }
}

