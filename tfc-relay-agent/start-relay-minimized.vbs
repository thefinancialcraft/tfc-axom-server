Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
ScriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = ScriptDir

' Window Style 7 = Minimized in Windows Taskbar
' Runs in background without popping up or stealing focus, but visually accessible from Taskbar anytime!
WshShell.Run "cmd /k start-relay-visible.bat", 7, False
