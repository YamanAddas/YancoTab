#!/usr/bin/env python3
"""
decrest-wallpapers.py — remove the baked-in YancoTab crest from the wallpapers.

Every shipped wallpaper has the same green YancoTab crest composited into its
centre — identical in all eight, from black Obsidian to red Crimson. It sits
directly behind the app grid, and because it is near-white it dragged app-label
contrast down to ~1.1:1 (see CHANGELOG 1.4.2 / 1.4.3).

The crest is found rather than hand-masked. Because it is pixel-identical
across all eight images while the backgrounds differ completely, the per-pixel
standard deviation across the stack collapses to ~0 exactly where the crest is
opaque. That gives a mask with no hand-tuned coordinates, which stays correct
if the wallpapers are ever re-exported at a different size or position.

The glow around the crest is semi-transparent, so it still varies across the
stack and is not caught by the variance test. It has to be masked by measuring
how far it reaches. Note that the glow is NEUTRAL, not green: testing green
excess suggests it dies within 15px, which is wrong and leaves a bright blob on
Obsidian. Luma on Obsidian (the darkest background) shows the real decay —
85 at the mask edge, 29 at 20px, 11 at 60px, reaching the 5.7 background level
around 130px. Hence DILATE = 130.

The hole is then filled by a pyramid push-pull interpolation: repeatedly
downsample keeping track of which pixels are known, fill the coarsest level,
then walk back up using each coarser level to seed the unknown pixels of the
finer one. For smooth, blurred backgrounds that reconstructs the gradient
essentially invisibly.

Smooth interpolation alone is not enough for every wallpaper: Arctic is fine
turbulent texture rather than a soft gradient, and a purely smooth fill leaves
an obvious blurred patch. So the fill is frequency-split — the interpolation
supplies the low frequencies (colour and gradient, which must be right) and the
high frequencies are borrowed from a clean donor region of the same image. On
the seven smooth wallpapers the borrowed detail is near zero, so this costs
them nothing.

Dev-time only — Pillow, numpy and scipy are not runtime dependencies. The
originals are recoverable with `git checkout -- assets/wallpapers`.

Usage:  python3 scripts/decrest-wallpapers.py [--dry-run] [--out DIR]
"""

import argparse
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

WALLPAPERS = ['emerald', 'obsidian', 'sapphire', 'amethyst',
              'rose', 'arctic', 'sunset', 'crimson']

SRC_DIR = os.path.join('assets', 'wallpapers')

# Pixels whose cross-wallpaper std is below this are the opaque crest.
STD_THRESHOLD = 5.0
# Dilation covering the semi-transparent glow (measured on Obsidian luma:
# reaches the background level around 130px out from the opaque core).
DILATE = 130
# Below this scale is "texture" and gets borrowed from a donor region; above it
# is "gradient" and comes from the interpolation.
TEXTURE_SIGMA = 6.0
# Feather width for blending the fill back in.
FEATHER = 6
# WebP quality. The originals are ~23-35KB at 1080x1080 except arctic (181KB).
WEBP_QUALITY = 90


def load_stack(src_dir):
    imgs = {}
    for name in WALLPAPERS:
        path = os.path.join(src_dir, f'{name}.webp')
        if not os.path.exists(path):
            sys.exit(f'missing wallpaper: {path}')
        imgs[name] = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    shapes = {im.shape for im in imgs.values()}
    if len(shapes) != 1:
        sys.exit(f'wallpapers differ in size ({shapes}); the shared-crest mask assumes one size')
    return imgs


def crest_mask(imgs):
    """Locate the crest by cross-wallpaper variance, then cover its glow."""
    stack = np.stack(list(imgs.values()))
    std = stack.std(axis=0).mean(axis=2)
    core = std < STD_THRESHOLD

    # Keep only the largest connected blob: stray low-variance specks can occur
    # anywhere two wallpapers happen to agree, and must not be inpainted.
    labels, n = ndimage.label(core)
    if n == 0:
        sys.exit('no crest found — the wallpapers may already be clean')
    sizes = ndimage.sum(core, labels, range(1, n + 1))
    core = labels == (int(np.argmax(sizes)) + 1)

    # Close interior gaps (the crest has thin dark details inside it) so the
    # fill treats it as one solid region rather than leaving speckle behind.
    core = ndimage.binary_closing(core, structure=np.ones((9, 9)), iterations=3)
    core = ndimage.binary_fill_holes(core)

    mask = ndimage.binary_dilation(core, ndimage.generate_binary_structure(2, 2),
                                   iterations=DILATE)
    return core, mask


def _down(img, known):
    """Downsample by 2, averaging only the known pixels."""
    h, w = known.shape
    h2, w2 = h // 2 * 2, w // 2 * 2
    img, known = img[:h2, :w2], known[:h2, :w2]
    k = known.astype(np.float32)[..., None]
    num = (img * k).reshape(h2 // 2, 2, w2 // 2, 2, 3).sum(axis=(1, 3))
    den = k.reshape(h2 // 2, 2, w2 // 2, 2, 1).sum(axis=(1, 3))
    out = np.where(den > 0, num / np.maximum(den, 1e-6), 0.0)
    return out, den[..., 0] > 0


def inpaint(img, mask):
    """Pyramid push-pull fill of `mask` (True == unknown)."""
    known = ~mask
    pyr = [(img.copy(), known.copy())]
    while min(pyr[-1][1].shape) > 4:
        pyr.append(_down(*pyr[-1]))

    # Coarsest level: any still-unknown pixel takes the mean of what is known.
    coarse, ck = pyr[-1]
    if (~ck).any():
        coarse[~ck] = coarse[ck].mean(axis=0) if ck.any() else 0.0
    filled = coarse

    for level in range(len(pyr) - 2, -1, -1):
        fine, fk = pyr[level]
        h, w = fk.shape
        up = np.asarray(
            Image.fromarray(np.clip(filled, 0, 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)
        ).astype(np.float32)
        out = np.where(fk[..., None], fine, up)
        # A few smoothing sweeps let the seeded values relax toward the
        # surrounding gradient instead of showing the upsampled block edges.
        for _ in range(24):
            sm = ndimage.uniform_filter(out, size=(5, 5, 1))
            out = np.where(fk[..., None], fine, sm)
        filled = out
    return filled


def borrow_texture(img, mask):
    """High-frequency detail for the hole, taken from a clean part of the image.

    Smooth interpolation cannot invent texture, so Arctic's turbulence would
    otherwise become a blurred patch. Pick the shift whose donor region is both
    fully outside the mask and closest in local contrast to the ring around the
    hole, so the borrowed grain matches what surrounds it.
    """
    detail = img - ndimage.gaussian_filter(img, (TEXTURE_SIGMA, TEXTURE_SIGMA, 0))

    ring = ndimage.binary_dilation(mask, iterations=40) & ~mask
    target = float(np.abs(detail[ring]).mean())
    if target < 0.5:                      # smooth wallpaper — nothing to borrow
        return np.zeros_like(detail)

    # The shift must exceed the mask's own extent, or the donor overlaps the
    # crest and every candidate is rejected. The mask is ~505x462 here, so
    # thirds of the image (360px) are not enough — halves are.
    h, w = mask.shape
    ys, xs = np.where(mask)
    mh, mw = ys.max() - ys.min() + 1, xs.max() - xs.min() + 1
    sx, sy = max(w // 2, mw + 8), max(h // 2, mh + 8)
    best, best_err = None, None
    for dy, dx in [(0, sx), (0, -sx), (sy, 0), (-sy, 0),
                   (sy, sx), (-sy, -sx), (sy, -sx), (-sy, sx)]:
        shifted_mask = np.roll(np.roll(mask, dy, axis=0), dx, axis=1)
        if (shifted_mask & mask).any():   # donor would include the crest itself
            continue
        donor = np.roll(np.roll(detail, dy, axis=0), dx, axis=1)
        err = abs(float(np.abs(donor[mask]).mean()) - target)
        if best_err is None or err < best_err:
            best_err, best = err, donor
    return best if best is not None else np.zeros_like(detail)


def check(src_dir):
    """Verify the shipped wallpapers carry no crest. Exit non-zero if they do.

    Node cannot decode WebP without a dependency, so this invariant cannot live
    in the `node --test` suite. Run this after ever re-exporting the artwork:

        python3 scripts/decrest-wallpapers.py --check
    """
    imgs = load_stack(src_dir)
    stack = np.stack(list(imgs.values()))
    std = stack.std(axis=0).mean(axis=2)
    core = std < STD_THRESHOLD
    labels, n = ndimage.label(core)
    biggest = 0
    if n:
        biggest = int(ndimage.sum(core, labels, range(1, n + 1)).max())

    # A shared logo shows up as thousands of pixels that are identical across
    # wallpapers whose backgrounds are otherwise completely different.
    ok = biggest < 500
    print(f'largest identical-across-all-wallpapers region: {biggest} px')
    if not ok:
        ys, xs = np.where(labels == (int(np.argmax(ndimage.sum(core, labels, range(1, n + 1)))) + 1))
        print(f'  FAIL: a shared element is baked into every wallpaper at '
              f'({xs.min()},{ys.min()})-({xs.max()},{ys.max()})')
        print('  Re-run without --check to remove it.')
        return 1
    print('  OK: no shared crest — wallpapers differ everywhere, as they should.')
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--check', action='store_true',
                    help='verify the wallpapers are crest-free; do not modify them')
    ap.add_argument('--out', default=SRC_DIR)
    ap.add_argument('--src', default=SRC_DIR)
    args = ap.parse_args()

    if args.check:
        sys.exit(check(args.src))

    imgs = load_stack(args.src)
    core, mask = crest_mask(imgs)
    ys, xs = np.where(mask)
    print(f'crest core {core.sum()}px; mask {mask.sum()}px '
          f'bbox=({xs.min()},{ys.min()})-({xs.max()},{ys.max()})')

    # Feathered blend so the fill meets the original without a visible seam.
    soft = ndimage.gaussian_filter(mask.astype(np.float32), FEATHER)
    soft = np.clip((soft - 0.15) / 0.7, 0, 1)[..., None]

    os.makedirs(args.out, exist_ok=True)
    for name, img in imgs.items():
        filled = inpaint(img, mask) + borrow_texture(img, mask)
        blended = img * (1 - soft) + filled * soft
        out = Image.fromarray(np.clip(blended + 0.5, 0, 255).astype(np.uint8))
        dst = os.path.join(args.out, f'{name}.webp')
        if args.dry_run:
            print(f'  [dry-run] {name}')
            continue
        out.save(dst, 'WEBP', quality=WEBP_QUALITY, method=6)

        # Re-encoding must not damage the untouched majority of the image.
        rt = np.asarray(Image.open(dst).convert('RGB')).astype(np.float32)
        outside = ~ndimage.binary_dilation(mask, iterations=FEATHER * 3)
        mse = float(((rt - np.asarray(out, dtype=np.float32))[outside] ** 2).mean())
        psnr = 99.0 if mse < 1e-9 else 10 * np.log10(255.0 ** 2 / mse)
        print(f'  {name}: {os.path.getsize(dst) / 1024:6.1f} KB   '
              f're-encode PSNR outside mask {psnr:.1f} dB')


if __name__ == '__main__':
    main()
