$src = 'C:\Users\dryam\.claude\projects\D--YancoTab--claude-worktrees-inspiring-wilson-3039aa\ba5936c3-1845-475c-89ea-a09ee6f7c15e\tool-results\webfetch-1778105052784-115yex.bin'
$dest = 'D:\YancoTab\.claude\worktrees\inspiring-wilson-3039aa\design-lab\fetched-design'
New-Item -ItemType Directory -Force -Path $dest | Out-Null

$bytes = [System.IO.File]::ReadAllBytes($src)
Write-Host ("File size: " + $bytes.Length)
Write-Host ("Magic bytes: " + ('{0:X2} {1:X2} {2:X2} {3:X2}' -f $bytes[0], $bytes[1], $bytes[2], $bytes[3]))

# Try gzip decompression first
try {
    $ms = New-Object System.IO.MemoryStream(,$bytes)
    $gz = New-Object System.IO.Compression.GzipStream($ms, [System.IO.Compression.CompressionMode]::Decompress)
    $out = New-Object System.IO.MemoryStream
    $gz.CopyTo($out)
    $decompressed = $out.ToArray()
    [System.IO.File]::WriteAllBytes("$dest\decompressed.bin", $decompressed)
    Write-Host ("Decompressed size: " + $decompressed.Length)
    Write-Host ("Decompressed magic: " + ('{0:X2} {1:X2} {2:X2} {3:X2}' -f $decompressed[0], $decompressed[1], $decompressed[2], $decompressed[3]))

    # Show first 200 bytes as text
    $text = [System.Text.Encoding]::UTF8.GetString($decompressed[0..([Math]::Min(500, $decompressed.Length - 1))])
    Write-Host "--- First 500 bytes as text ---"
    Write-Host $text
} catch {
    Write-Host ("Gzip failed: " + $_.Exception.Message)
}
