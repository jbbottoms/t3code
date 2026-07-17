Option Explicit

If WScript.Arguments.Count < 3 Then
    WScript.Echo "Usage: watch-process-tree-hidden.vbs <watcher.ps1> <root-pid> <log-path> [protected-pid]"
    WScript.Quit 64
End If

Dim shell, watcherPath, rootPid, logPath, protectedPid, command, exitCode
Set shell = CreateObject("WScript.Shell")

watcherPath = WScript.Arguments(0)
rootPid = WScript.Arguments(1)
logPath = WScript.Arguments(2)

command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & watcherPath & _
    """ -RootPid " & rootPid & " -LogPath """ & logPath & """"

If WScript.Arguments.Count >= 4 Then
    protectedPid = WScript.Arguments(3)
    command = command & " -ProtectedPid " & protectedPid
End If

exitCode = shell.Run(command, 0, True)
WScript.Quit exitCode
