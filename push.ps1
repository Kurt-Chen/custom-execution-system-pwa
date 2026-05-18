# 一键提交并推送（在项目根目录执行）:
#   powershell -ExecutionPolicy Bypass -File .\push.ps1
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()

function Invoke-Git {
  param([Parameter(Mandatory = $true)][string[]]$Args)
  & git @Args
  if ($LASTEXITCODE -ne 0) {
    throw "git $($Args -join ' ') failed (exit $LASTEXITCODE)"
  }
}

Write-Host ">> git status" -ForegroundColor Cyan
Invoke-Git @("status")

$porcelain = git status --porcelain
if ($porcelain) {
  Write-Host ">> git add" -ForegroundColor Cyan
  Invoke-Git @("add", "-A")

  Write-Host ">> git commit" -ForegroundColor Cyan
  $msg = @"
feat(ui): deep time fold, weekly plan sort and input polish

- Deep time: collapsible stats (total centered), compact grid
- Weekly plan: sort by deadline nearest-first; stronger input border, red placeholder
- Task row: single-line title, deadline and menu on the right
"@
  Invoke-Git @("commit", "-m", $msg.Trim())
}

Write-Host ">> git pull --rebase origin main" -ForegroundColor Cyan
Invoke-Git @("pull", "--rebase", "origin", "main")

Write-Host ">> git push origin main" -ForegroundColor Cyan
Invoke-Git @("push", "origin", "main")

Write-Host ">> done" -ForegroundColor Green
