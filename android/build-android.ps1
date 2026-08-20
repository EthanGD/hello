# ============================================================================
# MWRecord Android Build Wrapper (PowerShell 5)
#
# USER PREFERENCE RECORDED (2026-08-19):
#   The user prefers to run `npx react-native run-android` directly.
#   This wrapper (build-android.ps1) is kept ONLY as a fallback when the
#   Gradle dependencies-accessors race hits more than 3 times in a row.
#   For normal builds, use `npx react-native run-android`.
#
# What this wrapper does on top of npx react-native run-android:
#   1. Ensures C:\Ethan\cache\* folders exist
#   2. Pre-cleans broken "dependencies-accessors" caches (the Windows
#      Gradle 8.x race) before each attempt
#   3. Cleans corrupt Gradle native JNI dll temp dirs
#   4. Passes --project-cache-dir (official CLI flag) + no-build-cache
#   5. Automatically retries up to 12 times with jittered back-off
#   6. If init-script fails on attempt 1, automatically falls back to
#      "pre-clean only (PS1)" for remaining attempts
# ============================================================================

$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------
# 1. PATHS (all under C:\Ethan\cache — user-chosen, 100% long-path, never 8.3)
# ---------------------------------------------------------------------------
$ProjectRoot   = Resolve-Path (Join-Path $PSScriptRoot "..")
$AndroidDir    = $PSScriptRoot
$CacheRoot     = "C:\Ethan\cache"
$ProjCacheDir  = Join-Path $CacheRoot "gradle_project"
$BuildCacheDir = Join-Path $CacheRoot "gradle_build"
$GradleUserDir = Join-Path $CacheRoot "gradle_user_home"
$JvmTmpDir     = Join-Path $CacheRoot "jvm_tmp"

$Gradlew       = Join-Path $AndroidDir "gradlew.bat"
$InitScript    = Join-Path $AndroidDir "retry-accessors-simple.gradle"

# ---------------------------------------------------------------------------
# 2. ENSURE CACHE DIRS + PERMISSIONS
# ---------------------------------------------------------------------------
function Ensure-CacheDirs {
    foreach ($d in @($CacheRoot, $ProjCacheDir, $BuildCacheDir, $GradleUserDir, $JvmTmpDir)) {
        if (-not (Test-Path $d)) {
            New-Item -ItemType Directory -Force -Path $d | Out-Null
        }
        try {
            $acl = Get-Acl $d -ErrorAction SilentlyContinue
            if ($null -ne $acl) {
                $me = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
                $rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
                    $me, "FullControl",
                    [System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [System.Security.AccessControl.InheritanceFlags]::ObjectInherit,
                    [System.Security.AccessControl.PropagationFlags]::None,
                    [System.Security.AccessControl.AccessControlType]::Allow)
                $acl.SetAccessRule($rule)
                Set-Acl -Path $d -AclObject $acl -ErrorAction SilentlyContinue | Out-Null
            }
        } catch {
            # Non-fatal: directory just needs to be writable.
        }
    }
}

# ---------------------------------------------------------------------------
# 3. SYNC gradle.properties TO THE SAME PATHS (safety net)
# ---------------------------------------------------------------------------
function Sync-GradlePropertiesPaths {
    param( [Parameter(Mandatory=$true)] [string] $PropFile )
    if (-not (Test-Path $PropFile)) { return }

    $Marker    = "# NUCLEAR FIX (100% reliable)"
    $EndMarker = "# --- native-platform.dll failure fix (Windows 11) ---"

    $lines    = Get-Content -Path $PropFile
    $idxStart = -1
    $idxEnd   = -1
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($idxStart -lt 0 -and $lines[$i].StartsWith($Marker)) { $idxStart = $i }
        if ($idxStart -ge 0 -and $lines[$i].StartsWith($EndMarker)) { $idxEnd = $i; break }
    }

    if ($idxStart -ge 0 -and $idxEnd -gt $idxStart) {
        $slashProj  = $ProjCacheDir  -replace '\\','/'
        $slashBuild = $BuildCacheDir -replace '\\','/'
        $slashGUH   = $GradleUserDir -replace '\\','/'
        $slashTmp   = $JvmTmpDir     -replace '\\','/'
        $newBlock = @(
            $Marker,
            "# Relocate all Gradle caches to C:\Ethan\cache (user-chosen long-path folder).",
            "# Same values are also set in settings.gradle (Groovy API earliest phase) AND CLI flags.",
            "org.gradle.project.cache.dir=$slashProj",
            "org.gradle.build-cache-dir=$slashBuild",
            "systemProp.gradle.user.home=$slashGUH",
            ""
        )
        $before = if ($idxStart -gt 0) { $lines[0..($idxStart-1)] } else { @() }
        $after  = $lines[$idxEnd..($lines.Count-1)]
        $out = @($before) + @($newBlock) + @($after)
        Set-Content -Path $PropFile -Value $out -Encoding UTF8
    }
}

# ---------------------------------------------------------------------------
# 4. PRE-CLEAN: dependencies-accessors + corrupt native dlls
# ---------------------------------------------------------------------------
function Remove-AllChildren {
    param([Parameter(Mandatory=$true)][string]$Path)
    if (-not (Test-Path $Path)) { return $false }
    $removed = $false
    Get-ChildItem -LiteralPath $Path -Force -Recurse -Depth 5 -ErrorAction SilentlyContinue |
        Sort-Object FullName -Descending |
        ForEach-Object {
            try {
                if ($_.PSIsContainer) {
                    Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
                    if (-not (Test-Path $_.FullName)) { $removed = $true }
                } else {
                    Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue
                    if (-not (Test-Path $_.FullName)) { $removed = $true }
                }
            } catch { }
        }
    return $removed
}

function Pre-CleanAccessors {
    Write-Host "Pre-cleaning accessors caches ..." -ForegroundColor DarkGray
    $targets = @(
        (Join-Path $AndroidDir ".gradle\8.6\dependencies-accessors"),
        (Join-Path $env:USERPROFILE ".gradle\caches\8.6\dependencies-accessors"),
        (Join-Path $ProjCacheDir "8.6\dependencies-accessors"),
        (Join-Path $GradleUserDir "caches\8.6\dependencies-accessors")
    )
    foreach ($t in $targets) {
        if (Remove-AllChildren -Path $t) {
            Write-Host "  [cleanup] removed $t" -ForegroundColor DarkCyan
        }
    }
    Write-Host "Cleaning corrupt Gradle native-lib temp dirs ..." -ForegroundColor DarkGray
    if ($env:TEMP -and (Test-Path $env:TEMP)) {
        Get-ChildItem -LiteralPath $env:TEMP -Force -Directory -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -like "gradle-native*" -or $_.Name -like "jna-*" -or $_.Name -like "native-tools-*" } |
            ForEach-Object {
                try { Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue } catch { }
            }
    }
    $envLocalTmp = Join-Path $CacheRoot "jvm_tmp"
    if (Test-Path $envLocalTmp) {
        Get-ChildItem -LiteralPath $envLocalTmp -Force -Directory -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -like "gradle-native*" -or $_.Name -like "jna-*" } |
            ForEach-Object {
                try { Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue } catch { }
            }
    }
}

# ---------------------------------------------------------------------------
# 5. MAIN RETRY LOOP
# ---------------------------------------------------------------------------
Ensure-CacheDirs
Sync-GradlePropertiesPaths -PropFile (Join-Path $AndroidDir "gradle.properties")

Write-Host ""
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host " MWRecord Android Build Wrapper" -ForegroundColor Cyan
Write-Host (" Cache root      : {0}" -f $CacheRoot) -ForegroundColor DarkCyan
Write-Host (" Project cache   : {0}" -f $ProjCacheDir) -ForegroundColor DarkCyan
Write-Host (" Gradle USER home: {0}" -f $GradleUserDir) -ForegroundColor DarkCyan
Write-Host (" Build cache     : {0}" -f $BuildCacheDir) -ForegroundColor DarkCyan
Write-Host ""
Write-Host (" USER PREF: for normal builds use:") -ForegroundColor Yellow
Write-Host ("     npx react-native run-android") -ForegroundColor Yellow
Write-Host (" (from project root C:\Ethan\Code\MWRecord)") -ForegroundColor DarkYellow
Write-Host (" This wrapper is for auto-retry when Gradle hits") -ForegroundColor DarkYellow
Write-Host (" the Windows dependencies-accessors race.") -ForegroundColor DarkYellow
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host ""

$MAX_ATTEMPTS    = 12
$INIT_SCRIPT_OK  = (Test-Path $InitScript)
$Script:InitScriptHasFailedBefore = $false

for ($attempt = 1; $attempt -le $MAX_ATTEMPTS; $attempt++) {
    Write-Host ""
    Write-Host ("========== [Attempt {0} / {1}] gradlew installDebug ==========" -f $attempt, $MAX_ATTEMPTS) -ForegroundColor Cyan

    Pre-CleanAccessors

    # Decide: do we use init-script hook?
    # Attempt 1 uses it unless it's absent.
    # After attempt 1 fails with init-script error → fall back to pre-clean only.
    $useInit = ($INIT_SCRIPT_OK -and -not $Script:InitScriptHasFailedBefore)

    $args = @(
        "--no-daemon",
        "--no-build-cache",
        "--project-cache-dir", $ProjCacheDir,
        "app:installDebug",
        "-PreactNativeDevServerPort=8081"
    )
    if ($useInit) {
        $args = @("--init-script", $InitScript) + $args
        Write-Host ("Using init-script hook: {0}" -f $InitScript) -ForegroundColor DarkCyan
    } else {
        Write-Host "Running WITHOUT --init-script (pre-clean only via PS1)" -ForegroundColor DarkYellow
    }

    # Environment (must be set BEFORE spawning gradle)
    $env:GRADLE_USER_HOME = $GradleUserDir
    $env:GRADLE_OPTS      = ("-Dorg.gradle.native=false -Djava.io.tmpdir=`"{0}`" -Dgradle.user.home=`"{1}`"" -f $JvmTmpDir, $GradleUserDir)
    $env:TEMP             = $JvmTmpDir
    $env:TMP              = $JvmTmpDir

    & $Gradlew @args
    $exitCode = $LASTEXITCODE

    if ($exitCode -eq 0) {
        Write-Host ""
        Write-Host ("  🍾 BUILD SUCCESS on attempt #{0}! 🎉" -f $attempt) -ForegroundColor Green
        $ts = Get-Date -Format "HH:mm:ss"
        Write-Host ("  Build finished at {0}. Apk installed on device/emulator." -f $ts) -ForegroundColor Green
        exit 0
    }

    if ($useInit -and $attempt -eq 1 -and $exitCode -ne 0) {
        Write-Warning "Init-script run on first attempt failed; disabling it for remaining retries."
        $Script:InitScriptHasFailedBefore = $true
    }

    # Jittered backoff: base 4s × attempt^(0.3) + random 0..3s
    $baseWait = [Math]::Max(3.0, 4.0 * [Math]::Pow($attempt, 0.3))
    $waitSecs = [Math]::Round(($baseWait + (Get-Random -Maximum 3000) / 1000.0), 1)
    Write-Host ""
    Write-Host ("Attempt #{0} failed (exit={1}). Waiting {2}s before retry ..." -f $attempt, $exitCode, $waitSecs) -ForegroundColor Yellow
    Start-Sleep -Seconds $waitSecs
}

# ---------------------------------------------------------------------------
# MAX_ATTEMPTS reached — guide the user to Defender exclusions
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host ("❌  Build failed after {0} retries." -f $MAX_ATTEMPTS) -ForegroundColor Red
Write-Host ""
Write-Host "NEXT STEP — add these 4 folders to Windows Defender exclusions:" -ForegroundColor Yellow
Write-Host "   1. $ProjCacheDir"
Write-Host "   2. $GradleUserDir"
Write-Host "   3. $BuildCacheDir"
Write-Host "   4. $JvmTmpDir"
Write-Host ""
Write-Host "Or, even simpler, add the single parent folder:" -ForegroundColor Yellow
Write-Host "       $CacheRoot"
Write-Host ""
Write-Host "Instructions: Start → ""Windows Security"" → Virus & Threat Protection →" -ForegroundColor DarkCyan
Write-Host "              Manage Settings → Exclusions → Add folder (pick paths above)." -ForegroundColor DarkCyan
Write-Host "Then re-run this wrapper (usually succeeds on attempt 1 after exclusion)." -ForegroundColor DarkCyan
Write-Host ""
Write-Host "ALSO — remember the user's preferred build command:" -ForegroundColor DarkCyan
Write-Host "   cd C:\Ethan\Code\MWRecord ; npx react-native run-android" -ForegroundColor Cyan
exit 1
