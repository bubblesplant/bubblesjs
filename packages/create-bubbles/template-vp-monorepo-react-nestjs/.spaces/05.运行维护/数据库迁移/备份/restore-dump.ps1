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

# 2. 恢复会删除并重建整个 postgres 库，要求显式确认
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
  # 4. 删除旧库之前先验证备份格式，避免无效文件造成数据丢失
  docker exec $ContainerName pg_restore --list $ContainerPath | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw '备份文件无效，未删除目标数据库'
  }

  # 5. 从维护库 template1 连接，断开占用 postgres 的会话后完整重建数据库
  docker exec $ContainerName dropdb -U $DbUser --maintenance-db=template1 --force --if-exists $DbName
  if ($LASTEXITCODE -ne 0) {
    throw '删除旧数据库失败，未执行恢复'
  }

  docker exec $ContainerName createdb -U $DbUser --maintenance-db=template1 $DbName
  if ($LASTEXITCODE -ne 0) {
    throw '创建空数据库失败，请修复后重新执行恢复'
  }

  # 6. --single-transaction 保证导入失败时不会留下部分备份对象；旧库已被删除
  #    --no-owner 使恢复对象归属当前连接用户
  docker exec $ContainerName pg_restore -U $DbUser -d $DbName `
    --no-owner --single-transaction --exit-on-error $ContainerPath
  if ($LASTEXITCODE -ne 0) {
    throw 'pg_restore 执行失败，目标数据库为空，请修复后重新执行恢复'
  }
}
finally {
  # 7. 无论成功失败都清理容器内临时文件
  docker exec $ContainerName rm -f $ContainerPath | Out-Null
}

Write-Host "恢复完成: $DumpName -> $ContainerName/$DbName"
