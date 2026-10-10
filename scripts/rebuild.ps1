param(
    [Parameter(Mandatory=$true)][string]$Psd2LiveApp,
    [string]$CubismCoreJs,
    [string]$Node = 'node'
)
$ErrorActionPreference = 'Stop'
$modelRoot = Split-Path -Parent $PSScriptRoot
$engineApp = (Resolve-Path -LiteralPath $Psd2LiveApp).Path
if (-not (Test-Path -LiteralPath $engineApp -PathType Container)) { throw 'PSD2Live app directory missing' }
$classDir = Join-Path $PSScriptRoot 'build'
New-Item -ItemType Directory -Path $classDir -Force | Out-Null
& javac -encoding UTF-8 -cp "$engineApp\*" -d $classDir (Join-Path $PSScriptRoot 'BuildCormy.java')
if ($LASTEXITCODE -ne 0) { throw 'Java compilation failed' }
& java '-Djava.awt.headless=true' -cp "$engineApp\*;$classDir" BuildCormy $modelRoot
if ($LASTEXITCODE -ne 0) { throw 'Model export failed' }
& python (Join-Path $PSScriptRoot 'restore-runtime-inputs.py')
if ($LASTEXITCODE -ne 0) { throw 'Runtime restoration failed' }
if ($CubismCoreJs) {
    $env:CUBISM_CORE_JS = (Resolve-Path -LiteralPath $CubismCoreJs).Path
    & $Node (Join-Path $PSScriptRoot 'check-core.cjs') $env:CUBISM_CORE_JS (Join-Path $modelRoot 'VTubeStudio/Cormy/Cormy.moc3') (Join-Path $modelRoot 'core-validation.json')
    if ($LASTEXITCODE -ne 0) { throw 'Cubism Core validation failed' }
    foreach ($checkName in @('check-no-head-turn.cjs','check-expressions.cjs','check-actions.cjs')) {
        & $Node (Join-Path $PSScriptRoot $checkName)
        if ($LASTEXITCODE -ne 0) { throw "Validation failed: $checkName" }
    }
}
