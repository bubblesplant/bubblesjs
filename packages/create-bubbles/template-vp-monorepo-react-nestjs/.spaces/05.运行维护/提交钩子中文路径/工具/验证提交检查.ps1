param(
  [string]$RepoRoot = (git rev-parse --show-toplevel)
)

$ErrorActionPreference = 'Stop'
$featureRoot = Split-Path -Parent $PSScriptRoot
$evidenceRoot = Join-Path $featureRoot '测试证据'
$bundlePath = Join-Path $RepoRoot 'node_modules\vite-plus\dist\staged\bin.js'
$scratchBase = 'C:\Users\Administrator\Documents\Codex\scratch-tests'
$scratchRoot = Join-Path $scratchBase ('staged-utf8-' + [Guid]::NewGuid().ToString('N'))
$report = [ordered]@{ date = '2026-11-04'; normalStaging = $false; realIntentRejected = $false; cleaned = $false }

# 捕获实际 staged CLI 的诊断信息，并保留预期失败场景的退出码。
function Invoke-StagedProbe {
  $savedPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    $probeOutput = & node $bundlePath staged --cwd $scratchRoot --debug 2>&1
    $probeExitCode = $LASTEXITCODE
    return @{ exitCode = $probeExitCode; output = ($probeOutput -join "`n") }
  } finally {
    $ErrorActionPreference = $savedPreference
  }
}

# 只对本次临时仓库执行 Git 设置及暂存操作，命令失败时停止测试。
function Invoke-TestGit {
  param([string[]]$GitArguments)
  & git -C $scratchRoot @GitArguments
  if ($LASTEXITCODE -ne 0) { throw "临时仓库 Git 命令失败：$GitArguments" }
}

try {
  New-Item -ItemType Directory -Path $scratchRoot, $evidenceRoot -Force | Out-Null
  Invoke-TestGit -GitArguments @('init', '--quiet')
  Invoke-TestGit -GitArguments @('-c', 'user.name=Codex Regression', '-c', 'user.email=regression@example.invalid', '-c', 'commit.gpgsign=false', '-c', "core.hooksPath=$scratchRoot/unused-hooks", 'commit', '--allow-empty', '--quiet', '-m', 'regression baseline')
  Set-Content -LiteralPath (Join-Path $scratchRoot 'package.json') -Value '{"name":"staged-utf8-regression","private":true,"type":"module"}' -Encoding utf8
  Set-Content -LiteralPath (Join-Path $scratchRoot 'vite.config.mjs') -Value "export default { staged: { '*': 'git --version' } }" -Encoding utf8
  $sampleDirectory = Join-Path $scratchRoot '测试证据'
  New-Item -ItemType Directory -Path $sampleDirectory -Force | Out-Null
  $normalPath = '测试证据/已暂存.txt'
  Set-Content -LiteralPath (Join-Path $scratchRoot $normalPath) -Value 'utf8 regression sample' -Encoding utf8
  Invoke-TestGit -GitArguments @('add', '--', $normalPath)

  $normalResult = Invoke-StagedProbe
  Set-Content -LiteralPath (Join-Path $evidenceRoot '正常中文路径检查.log') -Value $normalResult.output -Encoding utf8
  if ($normalResult.exitCode -ne 0 -or $normalResult.output -notmatch 'Detected 0 files staged with') {
    throw "正常中文路径检查失败：$($normalResult.output)"
  }
  $report.normalStaging = $true

  $intentPath = '测试证据/未暂存.txt'
  Set-Content -LiteralPath (Join-Path $scratchRoot $intentPath) -Value 'intent-to-add regression sample' -Encoding utf8
  Invoke-TestGit -GitArguments @('add', '--intent-to-add', '--', $intentPath)
  $intentResult = Invoke-StagedProbe
  Set-Content -LiteralPath (Join-Path $evidenceRoot '真实待添加拦截.log') -Value $intentResult.output -Encoding utf8
  if ($intentResult.exitCode -ne 1 -or $intentResult.output -notmatch 'lint-staged refused to run' -or -not $intentResult.output.Contains($intentPath)) {
    throw "真实 intent-to-add 文件未被正确拦截：$($intentResult.output)"
  }
  $report.realIntentRejected = $true
} finally {
  if (Test-Path -LiteralPath $scratchRoot) {
    $resolvedScratchRoot = [IO.Path]::GetFullPath($scratchRoot)
    $resolvedScratchBase = [IO.Path]::GetFullPath($scratchBase)
    if ([IO.Path]::GetDirectoryName($resolvedScratchRoot) -ne $resolvedScratchBase -or [IO.Path]::GetFileName($resolvedScratchRoot) -notlike 'staged-utf8-*') {
      throw "拒绝清理未通过路径核对的目录：$resolvedScratchRoot"
    }
    if ((Get-Item -LiteralPath $resolvedScratchRoot -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) {
      throw "拒绝跟随临时目录链接：$resolvedScratchRoot"
    }
    Remove-Item -LiteralPath $resolvedScratchRoot -Recurse -Force
    $report.cleaned = -not (Test-Path -LiteralPath $resolvedScratchRoot)
  }
  New-Item -ItemType Directory -Path $evidenceRoot -Force | Out-Null
  $report | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $evidenceRoot '提交检查回归.json') -Encoding utf8
}
$report | ConvertTo-Json
