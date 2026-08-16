# 安装 dsh-codex-pet 插件到 web profile（在普通终端运行；自动在必要时安装 pnpm）
# 用法：  powershell -ExecutionPolicy Bypass -File scripts\install-plugin.ps1
param(
  [string]$ProfileName = "web",
  [string]$PackagePath = (Join-Path $PSScriptRoot "..\packages\dsh-codex-pet")
)
$ErrorActionPreference = "Stop"

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  Write-Host "[dsh-codex-pet] pnpm 未安装，正在全局安装..."
  npm install -g pnpm
  if ($LASTEXITCODE -ne 0) { throw "pnpm 安装失败" }
}

Write-Host "[dsh-codex-pet] 安装插件到 profile '$ProfileName' ..."
dsh plugin --profile $ProfileName add "file:$($PackagePath | Convert-Path)"
if ($LASTEXITCODE -ne 0) { throw "dsh plugin add 失败" }

Write-Host ""
Write-Host "[dsh-codex-pet] 安装完成。请执行最后两步："
Write-Host "  1) 重启 DSH Web GUI（关闭当前 dsh web 进程后重新启动），使新插件进入 __DSH_BOOT__ 图"
Write-Host "  2) 刷新 http://127.0.0.1:3080"
Write-Host "验证：GET /api/pets/health 返回 {ok:true}；在 设置 → 宠物图库 上传你自己的宠物 zip（格式见 docs/asset-spec.md）后左下角出现宠物浮层"
