param(
    [Parameter(Position = 0)]
    [ValidateRange(0, 32)]
    [int]$WorkerCount = 2
)

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$wt = Get-Command wt.exe -ErrorAction Stop
$windowName = "cluster-$([guid]::NewGuid().ToString('N'))"

Set-Location -LiteralPath $projectRoot

# Windows Terminal inherits this folder. Using "." avoids problems caused by
# the spaces in this project's full path.
$arguments = @("-w", $windowName, "new-tab", "--title", '"Coordinator"', "-d", ".", "cmd.exe", "/k", "npm run coordinator")
& $wt.Source @arguments
Start-Sleep -Milliseconds 500

$arguments = @("-w", $windowName, "new-tab", "--title", '"Developer"', "-d", ".", "cmd.exe", "/k", "npm run developer")
& $wt.Source @arguments
Start-Sleep -Milliseconds 500

for ($i = 1; $i -le $WorkerCount; $i++) {
    $arguments = @("-w", $windowName, "new-tab", "--title", ('"Worker {0}"' -f $i), "-d", ".", "cmd.exe", "/k", ("npm run worker -- worker-{0}" -f $i))
    & $wt.Source @arguments
    Start-Sleep -Milliseconds 500
}

if ($LASTEXITCODE -ne 0) {
    throw "Windows Terminal could not start the cluster (exit code $LASTEXITCODE)."
}

Write-Host "Opened one Windows Terminal window with a coordinator, developer, and $WorkerCount worker tab(s)."
