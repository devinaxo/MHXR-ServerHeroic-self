<#
.SYNOPSIS
    Downloads the game resource packs (FPK) from the private server, verifies them,
    and lays them out where the server expects to find them.

.DESCRIPTION
    The packs are not inside the APK and not in git. The game downloads them from
    the server on first login; this script does the same thing from a PC, checks
    every byte of every pack, and puts them in the server's resource tree so your
    own server can hand them back out.

    Total roughly 1.8 GB across 262 packs. Every URL is derived from the server's
    own manifests, so no third-party tool is needed: PowerShell alone.

    Uses the FULL manifest (v0285/stdDL/download.list), not the differential ones
    (d0282_0285 and friends). That looks backwards given pubblica-risorse.sh, but
    the difference was measured against the live server:

        resident.00.fpk   manifest v0285       4307152 / 5b5cbd6e  <- actual: 4307152 / 5b5cbd6e  match
        resident.00.fpk   manifest d0283_0285  4322032 / c8de24a7  <- actual: 4307152 / 5b5cbd6e  MISMATCH

    The d<old>_<new> folders are symlinks to v0282 (see tools-js/pubblica-risorse.sh),
    so every path serves byte-identical content. The differential manifests simply
    describe packs larger than the ones the server actually has. Verifying against
    them marks resident.00.fpk and GUI.00.fpk as corrupt when they are perfectly
    fine. The full manifest matches.

    v0285 is itself a symlink to v0282, so the two are equivalent; downloads go
    through v0285 to stay on the side of the declared version.

    The packs served are the English build. Verified 2026-10-07 by extracting
    GUI_font.arc from cmn/GUI.00.fpk: SHA-256 identical to the translated
    lavoro-traduzione/GUI_font.arc in this repo.

.PARAMETER Server
    Private server address. Defaults to the one baked into the official patcher.

.PARAMETER ProjectRoot
    Server project directory. Defaults to the directory containing this script,
    which is the project itself.

.PARAMETER Delay
    Pause in seconds between packs. The origin is one person's VPS; there is no
    reason to pull 1.8 GB at line rate. Defaults to 1.

.PARAMETER Sets
    Which groups to fetch: Std, Opening, Tutorial, Training. Defaults to all.

.PARAMETER Only
    Only fetch packs whose manifest path contains this text.
    For example -Only 'cmn/GUI' to get just the text pack.

.PARAMETER Force
    Re-download packs that are already present and intact.

.EXAMPLE
    ./Download-Packs.ps1
    Downloads everything into src/public/res/ inside the project.

.EXAMPLE
    ./Download-Packs.ps1 -Only 'cmn/resident' -Force
    Re-downloads just the pack with the English equipment names.

.EXAMPLE
    ./Download-Packs.ps1 -ProjectRoot /opt/MHXR-ServerHeroic -Delay 3
    Downloads everything 3 seconds apart, into a project elsewhere on disk.

.NOTE
    These files are Capcom's and remain under Capcom's licence. This script is for
    private use. Do not redistribute them.
#>
[CmdletBinding()]
param(
    [string]$Server      = 'http://57.131.193.244/',
    [string]$ProjectRoot = $PSScriptRoot,
    [ValidateSet('Std', 'Opening', 'Tutorial', 'Training')]
    [string[]]$Sets       = @('Std', 'Opening', 'Tutorial', 'Training'),
    [string]$Only         = '',
    [int]$Delay           = 1,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Server = $Server.TrimEnd('/')

# ---------------------------------------------------------------------------
# crcJam
# ---------------------------------------------------------------------------
# The manifest CRC is in "crcjam" format, what the server computes with
# crc/crcjam (src/services/initResourceDownloadList.ts). It is NOT zlib's CRC-32:
# same table-driven computation, but WITHOUT the final inversion. Same pycrc
# table, same 0xFFFFFFFF init, and that's it: the register is returned as-is.
# Adding the final XOR gives you the bitwise complement of the correct value, so
# every single pack reports as corrupt.
#
#   crcJam("123456789") = 340bc6d9     (zlib's CRC-32 gives cbf43926, the complement)
#   crcJam("")         = ffffffff     (not 00000000)
#
# Verified against pack eft.00.fpk: 2e853644, matching the manifest exactly.
#
# PowerShell 5.1 has no System.IO.Hashing, so a C# class is compiled on the fly.
# In pure PowerShell, checksumming 1.8 GB would take minutes.
if (-not ('MhxrCrcJam' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.IO;

public static class MhxrCrcJam {
    static readonly uint[] Tab = Build();

    static uint[] Build() {
        var t = new uint[256];
        for (uint i = 0; i < 256; i++) {
            uint c = i;
            for (int k = 0; k < 8; k++) c = (c & 1) != 0 ? (0xEDB88320u ^ (c >> 1)) : (c >> 1);
            t[i] = c;
        }
        return t;
    }

    // Reads in blocks: the largest pack is 142 MB and does not sit comfortably
    // in memory.
    public static uint FromFile(string path) {
        uint c = 0xFFFFFFFFu;
        var buf = new byte[4 * 1024 * 1024];
        using (var fs = File.OpenRead(path)) {
            int n;
            while ((n = fs.Read(buf, 0, buf.Length)) > 0) {
                for (int i = 0; i < n; i++) c = Tab[(c ^ buf[i]) & 0xFF] ^ (c >> 8);
            }
        }
        return c;   // no final XOR. That is the whole trick.
    }
}
'@
}

function Get-CrcJam {
    param([Parameter(Mandatory)][string]$Path)
    return [uint32]([MhxrCrcJam]::FromFile($Path))
}

# ---------------------------------------------------------------------------
# Manifest
# ---------------------------------------------------------------------------
function Get-Manifest {
    param(
        [Parameter(Mandatory)][string]$Base,   # .../res/download/android
        [Parameter(Mandatory)][string]$ListPath
    )

    $uri = "$Base/$ListPath"
    Write-Host "  reading $ListPath" -ForegroundColor DarkGray
    $raw = (Invoke-WebRequest -Uri $uri -UseBasicParsing -TimeoutSec 120).Content

    $out = foreach ($line in ($raw -split "`n")) {
        $t = $line.Trim()
        if (-not $t) { continue }
        $p = $t -split ','
        if ($p.Count -lt 3) { continue }
        [pscustomobject]@{
            Path = $p[0]
            Crc  = [Convert]::ToUInt32($p[1].Trim(), 16)
            Size = [int64]$p[2]
        }
    }
    return @($out)
}

# ---------------------------------------------------------------------------
# One pack
# ---------------------------------------------------------------------------
function Get-Pack {
    param(
        [Parameter(Mandatory)][pscustomobject]$Item,
        [Parameter(Mandatory)][string]$DestRoot,  # .../<group> under res/download/android
        [Parameter(Mandatory)][string]$UrlBase,   # .../android/v0285/stdDL
        [Parameter(Mandatory)][string]$Prefix,    # 'stdDL', 'openingDL', ...
        [Parameter(Mandatory)][int]$Delay,
        [switch]$Force
    )

    # The manifest path carries the group name as its first segment:
    # /stdDL/cmn/GUI.00.fpk, /openingDL/adrd/eft.00.fpk. The destination
    # directory is already the group's, so strip it:
    # /stdDL/cmn/GUI.00.fpk -> cmn/GUI.00.fpk
    # Appending it verbatim instead would double the group name and 404.
    $rel = $Item.Path -replace "^/$([regex]::Escape($Prefix))/", ''
    $rel = $rel.TrimStart('/')

    # '/' rather than '\': on Linux a backslash is an ordinary filename
    # character, not a separator. .NET accepts '/' on Windows too.
    $dest = Join-Path $DestRoot $rel
    $dir  = Split-Path -Parent $dest
    if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }

    $mb = [Math]::Round($Item.Size / 1MB, 1)

    # Already present and intact: skip, so the script can be re-run safely.
    if (Test-Path -LiteralPath $dest) {
        $len = (Get-Item -LiteralPath $dest).Length
        if (-not $Force -and $len -eq $Item.Size) {
            if ((Get-CrcJam $dest) -eq $Item.Crc) {
                Write-Host ("  already ok  {0,-42} {1,7} MB" -f $rel, $mb) -ForegroundColor DarkGray
                return 'ok'
            }
        }
    }

    # .part: the file only becomes a .fpk once the CRC checks out, so a partial
    # transfer can never be mistaken for a good file on the next run.
    $part = "$dest.part"
    $url  = "$UrlBase/$rel"

    for ($try = 1; $try -le 3; $try++) {
        try {
            Invoke-WebRequest -Uri $url -OutFile $part -UseBasicParsing -TimeoutSec 600
            break
        }
        catch {
            if ($try -eq 3) {
                Write-Host ("  FAILED      {0,-42} {1}" -f $rel, $_.Exception.Message) -ForegroundColor Red
                return 'error'
            }
            Write-Host ("  retry $try/3 on $rel") -ForegroundColor Yellow
            Start-Sleep -Seconds 5
        }
    }

    $len = (Get-Item -LiteralPath $part).Length
    if ($len -ne $Item.Size) {
        Write-Host ("  size differs {0,-34} expected {1} bytes, got {2}" -f $rel, $Item.Size, $len) -ForegroundColor Red
        return 'error'
    }

    $crc = Get-CrcJam $part
    if ($crc -ne $Item.Crc) {
        Write-Host ("  CRC differs  {0,-35} expected {1:x8}, got {2:x8}" -f $rel, $Item.Crc, $crc) -ForegroundColor Red
        return 'error'
    }

    Move-Item -LiteralPath $part -Destination $dest -Force
    Write-Host ("  downloaded   {0,-41} {1,7} MB" -f $rel, $mb) -ForegroundColor Green

    if ($Delay -gt 0) { Start-Sleep -Seconds $Delay }
    return 'ok'
}

# ---------------------------------------------------------------------------
# Groups
# ---------------------------------------------------------------------------
# Keys are the values accepted by -Sets. Each group knows where its manifest
# lives and where the files come from. For stdDL the two differ on purpose: the
# manifest that matches the served bytes is the full one, not the differential.
$GROUPS = @{
    Std      = @{ List = 'v0285/stdDL/download.list'; File = 'v0285/stdDL'; Root = 'v0282/stdDL' }
    Opening  = @{ List = 'openingDL/download.list';   File = 'openingDL';    Root = 'openingDL' }
    Tutorial = @{ List = 'tutorialDL/download.list';  File = 'tutorialDL';   Root = 'tutorialDL' }
    Training = @{ List = 'trainingDL/download.list';  File = 'trainingDL';   Root = 'trainingDL' }
}

if (-not (Test-Path -LiteralPath $ProjectRoot)) { throw "Project directory not found: $ProjectRoot" }

$resRoot = Join-Path $ProjectRoot 'src/public/res/download/android'

Write-Host ''
Write-Host "Downloading packs from $Server" -ForegroundColor Cyan
Write-Host "into: $resRoot" -ForegroundColor DarkGray
Write-Host ''

$summary = @{}

foreach ($set in $Sets) {
    $g = $GROUPS[$set]
    $base = "$Server/res/download/android"
    $urlBase = "$base/$($g.File)"
    $destRoot = Join-Path $resRoot $g.Root
    # The prefix to strip off manifest paths is the last folder of the
    # destination: v0282/stdDL -> stdDL, openingDL -> openingDL.
    $prefix = Split-Path $g.Root -Leaf

    Write-Host "--- $set ---" -ForegroundColor Cyan
    $items = Get-Manifest -Base $base -ListPath $g.List
    if ($items.Count -eq 0) { Write-Host '  manifest empty, no packs' -ForegroundColor Yellow; continue }

    if ($Only) { $items = @($items | Where-Object { $_.Path -like "*$Only*" }) }
    $tot = [int64](($items | Measure-Object -Property Size -Sum).Sum)
    Write-Host ("  {0} packs, {1} GB" -f $items.Count, [Math]::Round($tot / 1GB, 2)) -ForegroundColor DarkGray
    Write-Host ''

    if (-not (Test-Path -LiteralPath $destRoot)) { New-Item -ItemType Directory -Path $destRoot -Force | Out-Null }

    $ok = 0; $ko = 0
    foreach ($it in $items) {
        $r = Get-Pack -Item $it -DestRoot $destRoot -UrlBase $urlBase -Prefix $prefix -Delay $Delay -Force:$Force
        if ($r -eq 'ok') { $ok++ } else { $ko++ }
    }
    $summary[$set] = @{ Ok = $ok; Ko = $ko; Tot = $items.Count }
    Write-Host ''
}

# ---------------------------------------------------------------------------
# download.list
# ---------------------------------------------------------------------------
# download.list files are NOT copied from the internet: they have to describe the
# files that are actually in YOUR tree. The server regenerates them on first boot
# (src/services/initResourceDownloadList.ts checksums every .fpk it finds), so
# deleting them is enough. If it finds one already written it leaves it alone, and
# then the client downloads files that do not match.
$lists = Get-ChildItem -LiteralPath $resRoot -Recurse -Filter 'download.list' -ErrorAction SilentlyContinue
foreach ($l in $lists) {
    Write-Host "removing $($l.FullName.Substring($ProjectRoot.Length)) (the server will regenerate it)" -ForegroundColor DarkGray
    Remove-Item -LiteralPath $l.FullName -Force
}

# ---------------------------------------------------------------------------
Write-Host ''
Write-Host '================ summary ================' -ForegroundColor Cyan
$totOk = 0; $totKo = 0
foreach ($k in $summary.Keys) {
    $r = $summary[$k]
    $totOk += $r.Ok; $totKo += $r.Ko
    $col = if ($r.Ko -gt 0) { 'Yellow' } else { 'Green' }
    Write-Host ("  {0,-9} {1,4} ok  {2,3} failed  (of {3})" -f $k, $r.Ok, $r.Ko, $r.Tot) -ForegroundColor $col
}
Write-Host ("  {0,-9} {1,4} ok  {2,3} failed" -f 'TOTAL', $totOk, $totKo) -ForegroundColor Cyan
Write-Host ''

$onDisk = (Get-ChildItem -LiteralPath $resRoot -Recurse -Filter '*.fpk' -ErrorAction SilentlyContinue |
           Measure-Object -Property Length -Sum)
Write-Host ("Packs on disk: {0}, {1} GB" -f $onDisk.Count, [Math]::Round($onDisk.Sum / 1GB, 2)) -ForegroundColor Green

if ($totKo -gt 0) {
    Write-Host ''
    Write-Warning "$totKo packs are not in order. Re-run the same command: it only fetches what is missing."
}

Write-Host ''
Write-Host 'Next steps:' -ForegroundColor Cyan
Write-Host '  1. copy .env.example to .env and set IP=<your hostname>, not 0.0.0.0'
Write-Host '  2. docker compose -f docker-compose.prod.yml up -d --build'
Write-Host '  3. on first boot the server regenerates the download.list files and logs'
Write-Host '     "File created successfully"'