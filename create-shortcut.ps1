$ws = New-Object -ComObject WScript.Shell
$shortcut = $ws.CreateShortcut("$env:USERPROFILE\Desktop\ClipboardWorkbench.lnk")
$shortcut.TargetPath = "D:\Claude code\clipboard-workbench\src-tauri\target\release\clipboard-workbench.exe"
$shortcut.WorkingDirectory = "D:\Claude code\clipboard-workbench\src-tauri\target\release"
$shortcut.Description = "Clipboard Workbench"
$shortcut.Save()
Write-Output "Shortcut created on Desktop"
