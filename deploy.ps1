param(
  [string]$Message = ""
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path ".git")) {
  throw "Current directory is not a Git repository."
}

$branch = (git rev-parse --abbrev-ref HEAD).Trim()
if (-not $branch) {
  $branch = "main"
}

git add -A
git diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
  Write-Host "No changes to commit."
  exit 0
}

if ([string]::IsNullOrWhiteSpace($Message)) {
  $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  $Message = "update: $ts"
}

git commit -m $Message
git push origin $branch

Write-Host ""
Write-Host "Publish complete. GitHub Pages usually updates in 1-3 minutes."
