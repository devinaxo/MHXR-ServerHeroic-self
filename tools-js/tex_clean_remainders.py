#!/usr/bin/env python3
"""Clean up half-erased Japanese outlines from an edited RGBA4 atlas PNG.

When Japanese text is blocked out in Photoshop with a *faded* fill or a soft
eraser, part of the label's dark outline survives at partial alpha. In the
original art, outline pixels are fully opaque; in-game a partial-alpha outline
reads as a faint dark ghost over the plate, and because RGBA4 only has 16 alpha
levels it shows up as visible steps.

This finds those remnants and inpaints them from the surrounding plate, leaving
everything else -- including the new text -- byte-identical.

    python3 tex_clean_remainders.py <original.tex> <edited.png> [-o out.png] [--dry-run]

<original.tex> is the untouched texture from dump/tex/, used only as the
reference for "which pixels used to be opaque art".
"""
import argparse
import sys
from collections import Counter
from pathlib import Path

from PIL import Image

HDR = 0x28


def read_header(d):
    if len(d) < HDR or d[:4] != b'TEX ':
        sys.exit('not an Android TEX file')
    bf0c = int.from_bytes(d[0x0C:0x10], 'little')
    return {'width': bf0c & 0x1FFF, 'height': (bf0c >> 13) & 0x1FFF}


def orig_pixels(texpath):
    """Decode the pristine texture to RGBA so we know what was there before."""
    from tex_batch_decode import decode
    d = Path(texpath).read_bytes()
    h = read_header(d)
    img, why = decode(d)
    if img is None:
        sys.exit(f'cannot decode {texpath}: {why}')
    return img.convert('RGBA'), h


def luminance(p):
    return (p[0] + p[1] + p[2]) / 3


def clean(edited, orig, dark_max=90, radius=4):
    """Inpaint semi-transparent dark remnants; return (new_img, stats)."""
    w, h = edited.size
    o = list(orig.getdata())
    n = list(edited.getdata())

    # a remnant is: opaque in the original, partially transparent now, and still
    # dark -- i.e. a piece of the label outline that the fade only half-covered
    bad = set()
    for i, (a, b) in enumerate(zip(o, n)):
        if a[3] > 200 and 50 <= b[3] < 200 and luminance(b) < dark_max:
            bad.add(i)

    if not bad:
        return edited, {'remnants': 0}

    def solid(i):
        return i not in bad and n[i][3] >= 200

    out = list(n)
    # iterative fill: repeatedly let opaque, unfilled neighbours vote, so a
    # 1-3 px streak resolves from the art on either side of it
    remaining = set(bad)
    found = len(bad)
    for _ in range(24):
        if not remaining:
            break
        votes = {}
        for i in remaining:
            x, y = i % w, i // w
            bucket = []
            for dy in range(-radius, radius + 1):
                yy = y + dy
                if yy < 0 or yy >= h:
                    continue
                for dx in range(-radius, radius + 1):
                    xx = x + dx
                    if xx < 0 or xx >= w or (dx == 0 and dy == 0):
                        continue
                    j = yy * w + xx
                    if solid(j):
                        bucket.append(n[j])
            if bucket:
                bucket.sort(key=lambda p: luminance(p))
                votes[i] = bucket[len(bucket) // 2]  # median neighbour colour
        for i, col in votes.items():
            out[i] = (col[0], col[1], col[2], 255)
            bad.discard(i)
        remaining -= set(votes)

    stats = {
        'found': found,
        'filled': found - len(remaining),
        'unfilled': len(remaining),
        'colours': Counter(out[i][:3] for i in range(len(n)) if n[i] != out[i]),
    }
    return Image.new('RGBA', (w, h), None), stats, out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('tex', help='pristine .tex from dump/tex/')
    ap.add_argument('png', help='your edited PNG')
    ap.add_argument('-o', '--out', default=None, help='output path (default: overwrite the png)')
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--radius', type=int, default=4)
    a = ap.parse_args()

    orig, hdr = orig_pixels(a.tex)
    edited = Image.open(a.png).convert('RGBA')
    if edited.size != (hdr['width'], hdr['height']):
        sys.exit(f'{a.png} is {edited.size}, texture is {(hdr["width"], hdr["height"])}')

    res = clean(edited, orig, radius=a.radius)
    if len(res) == 2:
        print('no remnants found -- nothing to do')
        return
    _, stats, out = res
    n = list(edited.getdata())
    fixed = stats['filled']
    print(f'{a.png}')
    print(f'  size {edited.size[0]}x{edited.size[1]}  (matches the texture header)')
    print(f'  semi-transparent dark remnants found : {stats["found"]}')
    print(f'  repainted opaque                     : {fixed}')
    if stats['unfilled']:
        print(f'  WARNING: {stats["unfilled"]} had no opaque neighbour and were left alone')
    if fixed:
        print(f'  colours used          : {stats["colours"].most_common(5)}')
        print(f'  pixels changed        : {fixed} of {len(n)} ({fixed / len(n):.2%}) -- nothing else touched')

    if not a.dry_run:
        target = Path(a.out) if a.out else Path(a.png)
        img = Image.new('RGBA', edited.size)
        img.putdata(out)
        img.save(target)
        print(f'  wrote {target}')


if __name__ == '__main__':
    main()