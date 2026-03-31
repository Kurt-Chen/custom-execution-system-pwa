param(
  [Parameter(Mandatory = $true)]
  [string]$RepoName,
  [switch]$Private
)

$ErrorActionPreference = "Stop"

function Assert-Command($name) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    throw "未找到命令: $name。请先安装后重试。"
  }
}

Assert-Command git
Assert-Command gh

Write-Host "1) 检查 GitHub 登录状态..."
try {
  gh auth status | Out-Null
} catch {
  Write-Host "未登录 GitHub，正在打开浏览器登录..."
  gh auth login -w
}

if (-not (Test-Path ".git")) {
  Write-Host "2) 初始化 git 仓库..."
  git init -b main | Out-Null
}

Write-Host "3) 提交本地变更..."
git add -A
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
  $msg = @"
chore: prepare pwa for github pages

Add PWA manifest, service worker, icons and deployment helper script.
"@
  git commit -m $msg
}

Write-Host "4) 创建远程仓库并推送..."
$visibility = "--public"
if ($Private) { $visibility = "--private" }

$owner = gh api user --jq .login
$repoFull = "$owner/$RepoName"

# 若远程不存在则创建；存在则继续
try {
  gh repo view $repoFull | Out-Null
  Write-Host "仓库已存在: $repoFull"
} catch {
  gh repo create $repoFull $visibility --source . --remote origin --push
}

if (-not (git remote | Select-String "^origin$")) {
  git remote add origin "https://github.com/$repoFull.git"
}

git branch -M main
git push -u origin main

Write-Host "5) 开启 GitHub Pages..."
try {
  gh api -X POST "repos/$repoFull/pages" -f "source[branch]=main" -f "source[path]=/"
} catch {
  # 已存在时更新配置
  gh api -X PUT "repos/$repoFull/pages" -f "source[branch]=main" -f "source[path]=/"
}

$url = "https://$owner.github.io/$RepoName/"
Write-Host ""
Write-Host "完成！固定访问地址：$url"
Write-Host "若首次 1-3 分钟未生效，请稍后刷新。"
