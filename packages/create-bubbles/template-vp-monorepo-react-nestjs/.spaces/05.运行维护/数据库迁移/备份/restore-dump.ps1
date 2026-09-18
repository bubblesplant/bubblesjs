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

# 2. 恢复会清空整个业务 schema 后重建，要求显式确认
if (-not $Force) {
  $answer = Read-Host "将清空 $ContainerName/$DbName 的 public、drizzle schema（含备份之外的对象），并用 $DumpName 恢复，输入 YES 确认"
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
  # 4. 先清空备份覆盖的 schema，保证恢复结果与备份完全一致。
  #    不能依赖 pg_restore --clean：它的 DROP 顺序只包含备份内的对象，当目标库比备份新
  #    （存在备份中没有的表或外键，如 company_member_invitations）时，外键会挡住主键的
  #    DROP 而导致恢复失败。备份不含任何 EXTENSION，CASCADE 不会误删扩展。
  #    pg_dump 不导出 public schema 本身，清空后需手动重建；drizzle schema 由恢复过程重建。
  docker exec $ContainerName psql -U $DbUser -d $DbName -v ON_ERROR_STOP=1 `
    -c 'DROP SCHEMA IF EXISTS public CASCADE;' `
    -c 'CREATE SCHEMA public;' `
    -c 'DROP SCHEMA IF EXISTS drizzle CASCADE;'
  if ($LASTEXITCODE -ne 0) {
    throw '清空目标 schema 失败'
  }

  # 5. --no-owner:          忽略属主差异，统一归属连接用户
  #    --single-transaction: 整体一个事务，失败自动回滚，不会留下半恢复状态
  docker exec $ContainerName pg_restore -U $DbUser -d $DbName `
    --no-owner --single-transaction $ContainerPath
  if ($LASTEXITCODE -ne 0) {
    throw 'pg_restore 执行失败'
  }
}
finally {
  # 6. 无论成功失败都清理容器内临时文件
  docker exec $ContainerName rm -f $ContainerPath | Out-Null
}

Write-Host "恢复完成: $DumpName -> $ContainerName/$DbName"
