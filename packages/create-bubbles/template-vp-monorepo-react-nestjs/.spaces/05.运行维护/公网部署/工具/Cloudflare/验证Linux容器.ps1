$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../../../..'))
$evidence = Join-Path $projectRoot '.spaces/05.运行维护/公网部署/测试证据/Cloudflare'
$scratchBase = 'C:\Users\Administrator\Documents\Codex\scratch-tests'
$testId = 'cloudflare-project-check-' + [guid]::NewGuid().ToString('N')
$scratch = Join-Path $scratchBase $testId
$containerName = 'codex-' + $testId
$containerCreated = $false
$checkExit = 1

try {
    New-Item -ItemType Directory -Path (Join-Path $scratch 'app/shared') -Force | Out-Null
    New-Item -ItemType Directory -Path $evidence -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $projectRoot 'apps/server/dist') -Destination (Join-Path $scratch 'app/dist') -Recurse
    Copy-Item -LiteralPath (Join-Path $projectRoot 'packages/shared/dist') -Destination (Join-Path $scratch 'app/shared/dist') -Recurse
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot '运行依赖探针.cjs') -Destination (Join-Path $scratch 'app/runtime-probe.cjs')
    & node (Join-Path $PSScriptRoot '运行依赖探针.cjs') prepare $projectRoot $scratch *> (Join-Path $evidence 'Linux依赖清单.json')
    if ($LASTEXITCODE -ne 0) { throw '生成隔离工程失败；未打印配置值。' }

    $containerCreated = $true
    & docker run --rm --name $containerName --env-file (Join-Path $scratch 'runtime.env') --mount "type=bind,source=$(Join-Path $scratch 'app'),target=/app" --workdir /app node:24-alpine sh -c 'npm install --omit=dev --no-audit --no-fund --cache /tmp/codex-npm-cache && node runtime-probe.cjs' *> (Join-Path $evidence 'Linux容器运行.log')
    $checkExit = $LASTEXITCODE
    if (Test-Path -LiteralPath (Join-Path $scratch 'app/result.json')) {
        Copy-Item -LiteralPath (Join-Path $scratch 'app/result.json') -Destination (Join-Path $evidence 'Linux容器验证.json')
    }
    Get-Content -LiteralPath (Join-Path $evidence 'Linux容器运行.log') -Tail 18
} finally {
    if ($containerCreated) {
        $existingContainer = & docker ps -aq --filter "name=^/$containerName$"
        if ($existingContainer) { & docker rm -f $containerName | Out-Null }
    }
    $resolvedBase = [IO.Path]::GetFullPath($scratchBase).TrimEnd('\') + '\'
    $resolvedScratch = [IO.Path]::GetFullPath($scratch)
    if (-not $resolvedScratch.StartsWith($resolvedBase, [StringComparison]::OrdinalIgnoreCase) -or
        (Split-Path $resolvedScratch -Leaf) -ne $testId) { throw '拒绝清理：路径未通过本次测试目录校验。' }
    try {
        if (Test-Path -LiteralPath $resolvedScratch) {
            # PowerShell 7 原生命令删除目录树；不跟随目录链接删除其目标。
            Remove-Item -LiteralPath $resolvedScratch -Recurse -Force -ErrorAction Stop
        }
        @{ scratchPath = $resolvedScratch; removed = -not (Test-Path -LiteralPath $resolvedScratch); containerName = $containerName } |
            ConvertTo-Json | Set-Content -LiteralPath (Join-Path $evidence '临时目录清理.json') -Encoding utf8
    } catch {
        @{ scratchPath = $resolvedScratch; removed = $false; reason = $_.Exception.Message } |
            ConvertTo-Json | Set-Content -LiteralPath (Join-Path $evidence '临时目录清理.json') -Encoding utf8
        throw
    }
}
exit $checkExit
