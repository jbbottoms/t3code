[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$CommandLine,

    [string]$Name = "process",

    [string]$WorkingDirectory = (Get-Location).Path,

    [string]$LogDirectory = (Join-Path (Get-Location).Path "release-kai\process-watchdog"),

    [ValidateRange(1, 60)]
    [int]$PollSeconds = 5,

    [ValidateRange(1, 86400)]
    [int]$WarnAfterSeconds = 120,

    [ValidateRange(1, 86400)]
    [int]$HangAfterSeconds = 300,

    [ValidateRange(1, 20)]
    [int]$ConsecutiveHangSamples = 3,

    [int[]]$ProtectedPid = @(),

    [switch]$TerminateProbableHang
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$watcherPath = Join-Path $PSScriptRoot "watch-process-tree.ps1"
if (-not (Test-Path -LiteralPath $watcherPath -PathType Leaf)) {
    throw "Process watcher not found: $watcherPath"
}
if (-not (Test-Path -LiteralPath $WorkingDirectory -PathType Container)) {
    throw "Working directory not found: $WorkingDirectory"
}

[void](New-Item -ItemType Directory -Force -Path $LogDirectory)
$safeName = ($Name -replace "[^A-Za-z0-9._-]", "-").Trim("-")
if (-not $safeName) {
    $safeName = "process"
}
$stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssfffZ")
$prefix = Join-Path $LogDirectory "$stamp-$safeName"
$stdoutPath = "$prefix.stdout.log"
$stderrPath = "$prefix.stderr.log"
$watchdogPath = "$prefix.watchdog.ndjson"

$process = Start-Process `
    -FilePath $env:ComSpec `
    -ArgumentList @("/d", "/s", "/c", $CommandLine) `
    -WorkingDirectory $WorkingDirectory `
    -NoNewWindow `
    -PassThru `
    -RedirectStandardOutput $stdoutPath `
    -RedirectStandardError $stderrPath

Write-Output (@{
    event = "watched_process_started"
    name = $Name
    rootPid = $process.Id
    commandLine = $CommandLine
    workingDirectory = (Resolve-Path -LiteralPath $WorkingDirectory).Path
    stdoutPath = $stdoutPath
    stderrPath = $stderrPath
    watchdogPath = $watchdogPath
} | ConvertTo-Json -Compress)

$watcherArguments = @{
    RootPid = $process.Id
    LogPath = $watchdogPath
    ProgressPath = @($stdoutPath, $stderrPath)
    PollSeconds = $PollSeconds
    WarnAfterSeconds = $WarnAfterSeconds
    HangAfterSeconds = $HangAfterSeconds
    ConsecutiveHangSamples = $ConsecutiveHangSamples
    ProtectedPid = $ProtectedPid
}
if ($TerminateProbableHang) {
    $watcherArguments.TerminateProbableHang = $true
}

& $watcherPath @watcherArguments

$process.Refresh()
if (-not $process.HasExited) {
    $process.WaitForExit()
}
$exitCode = $process.ExitCode

Write-Output (@{
    event = "watched_process_exited"
    name = $Name
    rootPid = $process.Id
    exitCode = $exitCode
    stdoutPath = $stdoutPath
    stderrPath = $stderrPath
    watchdogPath = $watchdogPath
} | ConvertTo-Json -Compress)

if (Test-Path -LiteralPath $stdoutPath) {
    Get-Content -LiteralPath $stdoutPath
}
if (Test-Path -LiteralPath $stderrPath) {
    # The child exit code is authoritative. Several healthy tools write
    # progress banners to stderr, so replay it without manufacturing a red
    # PowerShell error record around successful output.
    Get-Content -LiteralPath $stderrPath | Write-Output
}

exit $exitCode
