# 独立进程托盘气泡（避免阻塞 Hooks）
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$ni = New-Object System.Windows.Forms.NotifyIcon
$ni.Icon = [System.Drawing.SystemIcons]::Information
$ni.Visible = $true
$ni.ShowBalloonTip(
    10000,
    'Git 推送提醒',
    '若有未提交或未推送的改动，请在本机终端执行 git status → commit → git push。',
    'Info'
)
Start-Sleep -Seconds 11
$ni.Visible = $false
$ni.Dispose()
