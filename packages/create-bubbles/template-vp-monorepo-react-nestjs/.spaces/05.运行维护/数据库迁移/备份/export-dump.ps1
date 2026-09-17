# 导出 vp-postgres 容器中的 postgres 库到本目录的 backup.dump
# 用法: pwsh ./export-dump.ps1
$ErrorActionPreference = 'Stop'

$ContainerName = 'vp-postgres'
$DbUser = 'postgres'
$DbName = 'postgres'
$DumpName = 'backup.dump'
$ContainerPath = "/tmp/$DumpName"
$HostPath = Join-Path $PSScriptRoot $DumpName

# 1. 确认容器正在运行
$status = docker inspect -f '{{.State.Running}}' $ContainerName 2>$null
if ($status -ne 'true') {
  throw "容器 $ContainerName 未运行，请先执行: docker compose up -d postgres"
}

# 2. 容器内用 pg_dump 生成 custom 格式备份（不用 stdout 重定向，避免跨环境产生空文件/编码损坏）
docker exec $ContainerName pg_dump -U $DbUser -d $DbName -Fc -f $ContainerPath
if ($LASTEXITCODE -ne 0) {
  throw 'pg_dump 执行失败'
}

# 3. 从容器拷出到脚本所在目录（覆盖旧备份）
docker cp "${ContainerName}:$ContainerPath" "$HostPath"
if ($LASTEXITCODE -ne 0) {
  throw 'docker cp 导出失败'
}

# 4. 清理容器内临时文件
docker exec $ContainerName rm -f $ContainerPath | Out-Null

$sizeKb = [math]::Round((Get-Item $HostPath).Length / 1KB, 1)
Write-Host "导出完成: $HostPath ($sizeKb KB)"
