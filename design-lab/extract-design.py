import gzip, os, io, tarfile, zipfile, sys

src = r'C:\Users\dryam\.claude\projects\D--YancoTab--claude-worktrees-inspiring-wilson-3039aa\ba5936c3-1845-475c-89ea-a09ee6f7c15e\tool-results\webfetch-1778105052784-115yex.bin'
dest = r'D:\YancoTab\.claude\worktrees\inspiring-wilson-3039aa\design-lab\fetched-design'
os.makedirs(dest, exist_ok=True)

with open(src, 'rb') as f:
    data = f.read()

print(f"Size: {len(data)}")
print(f"Magic: {data[:8].hex(' ')}")

# gzip magic = 1f 8b
if data[:2] == b'\x1f\x8b':
    decompressed = gzip.decompress(data)
    print(f"Decompressed size: {len(decompressed)}")
    print(f"Decompressed magic: {decompressed[:8].hex(' ')}")

    # Try as tar
    try:
        tf = tarfile.open(fileobj=io.BytesIO(decompressed))
        members = tf.getmembers()
        print(f"\nTar members ({len(members)}):")
        for m in members:
            print(f"  {m.name} ({m.size} bytes)")
        tf.extractall(dest)
        print(f"\nExtracted to {dest}")
    except Exception as e:
        # Maybe just the raw HTML
        print(f"Not a tar: {e}")
        out = os.path.join(dest, 'decompressed.html')
        with open(out, 'wb') as f:
            f.write(decompressed)
        print(f"Wrote raw decompressed to {out}")
elif data[:4] == b'PK\x03\x04':
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        print(f"Zip members:")
        for n in zf.namelist():
            print(f"  {n}")
        zf.extractall(dest)
else:
    # Try as tar.gz directly
    try:
        tf = tarfile.open(src, 'r:gz')
        for m in tf.getmembers():
            print(f"  {m.name}")
        tf.extractall(dest)
    except Exception as e:
        print(f"Unknown format: {e}")
