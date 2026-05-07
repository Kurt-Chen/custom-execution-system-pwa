# Composer 会话结束：关闭窗口或用户关闭会话时弹托盘提示记住 git push
$raw = [Console]::In.ReadToEnd()
if ([string]::IsNullOrWhiteSpace($raw)) { exit 0 }
try {
    $j = $raw | ConvertFrom-Json
} catch {
    exit 0
}
$r = $j.reason
if ($r -ne 'window_close' -and $r -ne 'user_close') {
    exit 0
}

$notify = Join-Path $PSScriptRoot 'git-push-reminder-notify.ps1'
if (-not (Test-Path -LiteralPath $notify)) { exit 0 }

Start-Process -FilePath 'powershell.exe' -ArgumentList @(
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-STA',
    '-File', $notify
) -WindowStyle Hidden

exit 0
