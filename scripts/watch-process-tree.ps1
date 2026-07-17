[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateRange(1, 2147483647)]
    [int]$RootPid,

    [Parameter(Mandatory = $true)]
    [string]$LogPath,

    [string[]]$ProgressPath = @(),

    [ValidateRange(1, 60)]
    [int]$PollSeconds = 5,

    [ValidateRange(1, 86400)]
    [int]$WarnAfterSeconds = 120,

    [ValidateRange(1, 86400)]
    [int]$HangAfterSeconds = 300,

    [ValidateRange(1, 20)]
    [int]$ConsecutiveHangSamples = 3,

    [ValidateRange(0.001, 60.0)]
    [double]$MinimumCpuProgressSeconds = 0.05,

    [ValidateRange(5, 3600)]
    [int]$HeartbeatSeconds = 60,

    [int[]]$ProtectedPid = @(),

    [switch]$TerminateProbableHang,

    [switch]$SnapshotOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ($HangAfterSeconds -lt $WarnAfterSeconds) {
    throw "HangAfterSeconds must be greater than or equal to WarnAfterSeconds."
}

if ($TerminateProbableHang -and $ProtectedPid -contains $RootPid) {
    throw "RootPid $RootPid is protected and cannot be terminated."
}

$logDirectory = Split-Path -Parent $LogPath
if ($logDirectory) {
    [void](New-Item -ItemType Directory -Force -Path $logDirectory)
}

function Write-WatchdogEvent {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Event,

        [Parameter(Mandatory = $true)]
        [hashtable]$Data
    )

    $payload = [ordered]@{
        timestamp = (Get-Date).ToUniversalTime().ToString("o")
        event = $Event
        rootPid = $RootPid
    }
    foreach ($entry in $Data.GetEnumerator()) {
        $payload[$entry.Key] = $entry.Value
    }

    $line = $payload | ConvertTo-Json -Compress -Depth 8
    Add-Content -LiteralPath $LogPath -Value $line -Encoding utf8
    Write-Output $line
}

function Get-ProcessTreeRows {
    param([int]$TreeRootPid)

    $allProcesses = @(Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name, CommandLine)
    $byParent = @{}
    foreach ($processRow in $allProcesses) {
        $parent = [int]$processRow.ParentProcessId
        if (-not $byParent.ContainsKey($parent)) {
            $byParent[$parent] = [System.Collections.Generic.List[object]]::new()
        }
        $byParent[$parent].Add($processRow)
    }

    $root = $allProcesses | Where-Object { [int]$_.ProcessId -eq $TreeRootPid } | Select-Object -First 1
    if (-not $root) {
        return @()
    }

    $rows = [System.Collections.Generic.List[object]]::new()
    $queue = [System.Collections.Generic.Queue[object]]::new()
    $queue.Enqueue($root)
    while ($queue.Count -gt 0) {
        $current = $queue.Dequeue()
        $rows.Add($current)
        $currentProcessId = [int]$current.ProcessId
        if ($byParent.ContainsKey($currentProcessId)) {
            foreach ($child in $byParent[$currentProcessId]) {
                $queue.Enqueue($child)
            }
        }
    }

    return @($rows)
}

function Get-ProgressFileState {
    $states = [System.Collections.Generic.List[object]]::new()
    foreach ($path in $ProgressPath) {
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
            $states.Add([ordered]@{
                path = $path
                exists = $false
                length = 0
                lastWriteUtc = $null
            })
            continue
        }

        $item = Get-Item -LiteralPath $path
        $states.Add([ordered]@{
            path = $item.FullName
            exists = $true
            length = [long]$item.Length
            lastWriteUtc = $item.LastWriteTimeUtc.ToString("o")
        })
    }
    return @($states)
}

function Get-WatchdogSample {
    $rows = @(Get-ProcessTreeRows -TreeRootPid $RootPid)
    if ($rows.Count -eq 0) {
        return [ordered]@{
            rootAlive = $false
            processCount = 0
            pids = @()
            processNames = @()
            totalCpuSeconds = 0.0
            workingSetMb = 0.0
            treeSignature = ""
            progressFiles = @(Get-ProgressFileState)
            progressSignature = ""
        }
    }

    $totalCpuSeconds = 0.0
    $workingSetBytes = 0L
    $liveRows = [System.Collections.Generic.List[object]]::new()
    foreach ($row in $rows) {
        $process = Get-Process -Id ([int]$row.ProcessId) -ErrorAction SilentlyContinue
        if (-not $process) {
            continue
        }
        $totalCpuSeconds += [double]$process.CPU
        $workingSetBytes += [long]$process.WorkingSet64
        $liveRows.Add($row)
    }

    $pids = @($liveRows | ForEach-Object { [int]$_.ProcessId } | Sort-Object)
    $processNames = @($liveRows | ForEach-Object { [string]$_.Name } | Sort-Object -Unique)
    $files = @(Get-ProgressFileState)
    $fileSignature = ($files | ForEach-Object {
        "{0}|{1}|{2}|{3}" -f $_.path, $_.exists, $_.length, $_.lastWriteUtc
    }) -join ";"

    return [ordered]@{
        rootAlive = $true
        processCount = $pids.Count
        pids = $pids
        processNames = $processNames
        totalCpuSeconds = [Math]::Round($totalCpuSeconds, 3)
        workingSetMb = [Math]::Round($workingSetBytes / 1MB, 1)
        treeSignature = ($pids -join ",")
        progressFiles = $files
        progressSignature = $fileSignature
    }
}

function Stop-ConfirmedProcessTree {
    param([int[]]$TreePids)

    # Refresh immediately before termination so children spawned since the
    # confirming sample are included. Get-ProcessTreeRows is breadth-first;
    # reversing it gives us leaves before parents and prevents orphaning the
    # exact workers the watchdog is meant to contain.
    $currentRows = @(Get-ProcessTreeRows -TreeRootPid $RootPid)
    $currentPids = @($currentRows | ForEach-Object { [int]$_.ProcessId })
    $allTreePids = @($TreePids + $currentPids | Sort-Object -Unique)
    $protectedHits = @($allTreePids | Where-Object { $ProtectedPid -contains $_ })
    if ($protectedHits.Count -gt 0) {
        Write-WatchdogEvent -Event "termination_blocked" -Data @{
            reason = "protected_pid_in_tree"
            protectedPids = $protectedHits
            treePids = $allTreePids
        }
        return $false
    }

    $orderedPids = @($currentPids)
    [Array]::Reverse($orderedPids)
    $orderedPids += @($TreePids | Where-Object { $currentPids -notcontains $_ })
    foreach ($processId in $orderedPids) {
        Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    }
    Write-WatchdogEvent -Event "tree_terminated" -Data @{
        reason = "probable_hang_confirmed"
        treePids = $allTreePids
    }
    return $true
}

$startedAt = Get-Date
$lastProgressAt = $startedAt
$lastHeartbeatAt = [DateTime]::MinValue
$previous = $null
$previousClassification = $null
$consecutiveHangCount = 0

Write-WatchdogEvent -Event "watch_started" -Data @{
    pollSeconds = $PollSeconds
    warnAfterSeconds = $WarnAfterSeconds
    hangAfterSeconds = $HangAfterSeconds
    consecutiveHangSamples = $ConsecutiveHangSamples
    minimumCpuProgressSeconds = $MinimumCpuProgressSeconds
    progressPaths = $ProgressPath
    protectedPids = $ProtectedPid
    terminateProbableHang = [bool]$TerminateProbableHang
}

while ($true) {
    $now = Get-Date
    $sample = Get-WatchdogSample

    if (-not $sample.rootAlive) {
        Write-WatchdogEvent -Event "root_exited" -Data @{
            elapsedSeconds = [Math]::Round(($now - $startedAt).TotalSeconds, 1)
            lastProgressSecondsAgo = [Math]::Round(($now - $lastProgressAt).TotalSeconds, 1)
        }
        break
    }

    $cpuDelta = 0.0
    $treeChanged = $false
    $outputChanged = $false
    if ($null -ne $previous) {
        $cpuDelta = [Math]::Max(0.0, [double]$sample.totalCpuSeconds - [double]$previous.totalCpuSeconds)
        $treeChanged = $sample.treeSignature -ne $previous.treeSignature
        $outputChanged = $sample.progressSignature -ne $previous.progressSignature
    }

    $madeProgress = $null -eq $previous -or
        $cpuDelta -ge $MinimumCpuProgressSeconds -or
        $treeChanged -or
        $outputChanged
    if ($madeProgress) {
        $lastProgressAt = $now
    }

    $quietSeconds = [Math]::Round(($now - $lastProgressAt).TotalSeconds, 1)
    $classification = if ($quietSeconds -ge $HangAfterSeconds) {
        "probable_hang"
    } elseif ($quietSeconds -ge $WarnAfterSeconds) {
        "quiet"
    } else {
        "healthy"
    }

    if ($classification -eq "probable_hang" -and -not $madeProgress) {
        $consecutiveHangCount += 1
    } else {
        $consecutiveHangCount = 0
    }

    $heartbeatDue = ($now - $lastHeartbeatAt).TotalSeconds -ge $HeartbeatSeconds
    if ($classification -ne $previousClassification -or $heartbeatDue -or $SnapshotOnly) {
        Write-WatchdogEvent -Event "watch_state" -Data @{
            classification = $classification
            elapsedSeconds = [Math]::Round(($now - $startedAt).TotalSeconds, 1)
            quietSeconds = $quietSeconds
            cpuDeltaSeconds = [Math]::Round($cpuDelta, 3)
            treeChanged = $treeChanged
            outputChanged = $outputChanged
            consecutiveHangSamples = $consecutiveHangCount
            processCount = $sample.processCount
            pids = $sample.pids
            processNames = $sample.processNames
            workingSetMb = $sample.workingSetMb
            progressFiles = $sample.progressFiles
        }
        $lastHeartbeatAt = $now
        $previousClassification = $classification
    }

    if ($SnapshotOnly) {
        break
    }

    if (
        $TerminateProbableHang -and
        $classification -eq "probable_hang" -and
        $consecutiveHangCount -ge $ConsecutiveHangSamples
    ) {
        [void](Stop-ConfirmedProcessTree -TreePids $sample.pids)
        break
    }

    $previous = $sample
    Start-Sleep -Seconds $PollSeconds
}
