param(
  [string]$TemplatePath = (Join-Path $PSScriptRoot '..\..\..\..\..\template-nestjs'),
  [switch]$CheckOnly
)

$ErrorActionPreference = 'Stop'
$taskTemplate = (Resolve-Path -LiteralPath $TemplatePath).Path
$taskScratchParent = 'C:\Users\Administrator\Documents\Codex\scratch-tests'
$taskScratch = Join-Path $taskScratchParent ('nestjs-template-' + [guid]::NewGuid().ToString('N'))
$taskEvidence = Join-Path $PSScriptRoot '..\测试证据'
$taskExcluded = @('.git', 'node_modules', '.pnpm-store', '.codegraph', '.cache', 'dist', 'coverage', '.vite', '.swc', 'project-name')

function Copy-ValidationProject {
  <# 直接复制模板中的项目文件，不跟随符号链接或携带本地依赖。 #>
  param([string]$Source, [string]$Destination)
  New-Item -ItemType Directory -Path $Destination -Force | Out-Null
  foreach ($taskEntry in Get-ChildItem -LiteralPath $Source -Force) {
    if (($taskEntry.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { continue }
    if ($taskEntry.Name -in $taskExcluded) { continue }
    $taskTarget = Join-Path $Destination $taskEntry.Name
    if ($taskEntry.PSIsContainer) {
      Copy-ValidationProject -Source $taskEntry.FullName -Destination $taskTarget
    } else {
      if ($taskEntry.Name -eq '_gitignore') { $taskTarget = Join-Path $Destination '.gitignore' }
      Copy-Item -LiteralPath $taskEntry.FullName -Destination $taskTarget
    }
  }
}

function Invoke-ValidationStep {
  <# 顺序执行项目真实命令，将完整日志保存在当前功能的正式测试证据目录。 #>
  param([string]$Name, [string[]]$Arguments)
  $taskLog = Join-Path $taskEvidence ($Name + '.log')
  Write-Output "START $Name"
  & pnpm @Arguments 2>&1 | Tee-Object -FilePath $taskLog | Out-Null
  $taskExitCode = $LASTEXITCODE
  Write-Output "END $Name exit=$taskExitCode"
  if ($taskExitCode -ne 0) {
    Get-Content -LiteralPath $taskLog -Tail 65 | Write-Output
    throw "验证失败：$Name（退出码 $taskExitCode）"
  }
}

try {
  New-Item -ItemType Directory -Path $taskScratchParent, $taskEvidence -Force | Out-Null
  Copy-ValidationProject -Source $taskTemplate -Destination $taskScratch
  Push-Location -LiteralPath $taskScratch
  try {
    Invoke-ValidationStep -Name 'install' -Arguments @('install', '--reporter=append-only')
    if ($CheckOnly) {
      Invoke-ValidationStep -Name 'check' -Arguments @('run', 'check')
      Write-Output 'PASS independent format, lint and type check'
    } else {
      Invoke-ValidationStep -Name 'typecheck' -Arguments @('run', 'typecheck')
      Invoke-ValidationStep -Name 'test' -Arguments @('test')
      Invoke-ValidationStep -Name 'build' -Arguments @('run', 'build')
      if (-not (Test-Path -LiteralPath 'dist\modules\upload\hash\sha256.worker.cjs')) {
        throw '构建结果缺少哈希 Worker 资产'
      }
      Write-Output 'PASS independent install, typecheck, tests, build and worker asset'
    }
    Copy-Item -LiteralPath 'pnpm-lock.yaml' -Destination (Join-Path $taskTemplate 'pnpm-lock.yaml')
  } finally {
    Pop-Location
  }
} finally {
  if (Test-Path -LiteralPath $taskScratch) {
    $taskResolvedScratch = (Resolve-Path -LiteralPath $taskScratch).Path
    $taskResolvedParent = (Resolve-Path -LiteralPath $taskScratchParent).Path.TrimEnd('\') + '\'
    if (-not $taskResolvedScratch.StartsWith($taskResolvedParent, [StringComparison]::OrdinalIgnoreCase) -or
        $taskResolvedScratch -ne [IO.Path]::GetFullPath($taskScratch)) {
      throw "拒绝清理非本次临时项目路径：$taskResolvedScratch"
    }
    try {
      Remove-Item -LiteralPath $taskResolvedScratch -Recurse -Force
      Write-Output "CLEANED $taskResolvedScratch"
    } catch {
      Write-Output "CLEANUP_FAILED $taskResolvedScratch：$($_.Exception.Message)"
      throw
    }
  }
}
