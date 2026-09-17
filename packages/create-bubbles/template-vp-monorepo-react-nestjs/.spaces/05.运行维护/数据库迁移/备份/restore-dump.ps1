# 从本目录的 backup.dump 恢复数据到 vp-postgres 容器中的 postgres 库
# 用法: pwsh ./restore-dump.ps1         （有确认提示）
#       pwsh ./restore-dump.ps1 -Force  （跳过确认，用于自动化）
param(
  [switch]$Force
)

$ErrorActionPreference = 'Stop'

$ContainerName = 'vp-postgres'
$DbUser = 'postgres'
$DbName = 'postgres'
$DumpName = 'backup.dump'
$ContainerPath = "/tmp/$DumpName"
$HostPath = Join-Path $PSScriptRoot $DumpName

# 1. 前置检查
if (-not (Test-Path $HostPath)) {
  throw "备份文件不存在: $HostPath"
}

$status = docker inspect -f '{{.State.Running}}' $ContainerName 2>$null
if ($status -ne 'true') {
  throw "容器 $ContainerName 未运行，请先执行: docker compose up -d postgres"
}

# 2. 恢复会 DROP 并重建备份中的所有对象，要求显式确认
if (-not $Force) {
  $answer = Read-Host "将用 $DumpName 覆盖 $ContainerName 中的 $DbName 库，输入 YES 确认"
  if ($answer -ne 'YES') {
    Write-Host '已取消'
    exit 1
  }
}

# 3. 拷进容器（不用 stdin 重定向，避免跨环境文件损坏）
docker cp "$HostPath" "${ContainerName}:$ContainerPath"
if ($LASTEXITCODE -ne 0) {
  throw 'docker cp 导入失败'
}

try {
  # 4. --clean --if-exists: 先删除备份中存在的旧对象
  #    --no-owner:        忽略属主差异，统一归属连接用户
  #    --single-transaction: 整体一个事务，失败自动回滚，不会留下半恢复状态
  docker exec $ContainerName pg_restore -U $DbUser -d $DbName `
    --clean --if-exists --no-owner --single-transaction $ContainerPath
  if ($LASTEXITCODE -ne 0) {
    throw 'pg_restore 执行失败'
  }
}
finally {
  # 5. 无论成功失败都清理容器内临时文件
  docker exec $ContainerName rm -f $ContainerPath | Out-Null
}

Write-Host "恢复完成: $DumpName -> $ContainerName/$DbName"
