#!/usr/bin/env python3
"""Find the button art in an LP4 atlas and report the indices in use.

No numpy (not installed here), so this works on bytes. Reads the PNG produced by
tex_index_tool.py decode and reduces it back to indices, then reports where
content lives and which indices each region uses.

Usage:
    python3 tex_find.py <atlas.png> [--bands] [--region x,y,w,h]
"""
import argparse
from collections import Counter

from PIL import Image

LEGEND = [
    (255, 0, 255), (255, 0, 0), (0, 255, 0), (0, 0, 255),
    (255, 255, 0), (255, 128, 0), (0, 255, 255), (255, 0, 128),
    (128, 255, 0), (0, 128, 255), (128, 0, 255), (255, 255, 128),
    (0, 255, 128), (128, 0, 128), (128, 128, 128), (255, 255, 255),
]
LOOKUP = {c: i for i, c in enumerate(LEGEND)}


def load_indices(path):
    im = Image.open(path).convert('RGB')
    w, h = im.size
    px = im.load()
    idx = bytearray(w * h)
    for y in range(h):
        for x in range(w):
            idx[y * w + x] = LOOKUP.get(px[x, y], 0)
    return idx, w, h


def bands(idx, w, h, thresh=0):
    out = []
    start = None
    for y in range(h):
        row = idx[y * w:(y + 1) * w]
        n = sum(1 for v in row if v)
        if n > thresh and start is None:
            start = y
        elif n <= thresh and start is not None:
            out.append((start, y - 1))
            start = None
    if start is not None:
        out.append((start, h - 1))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('atlas')
    ap.add_argument('--bands', action='store_true')
    ap.add_argument('--region', help='x,y,w,h')
    args = ap.parse_args()

    idx, w, h = load_indices(args.atlas)
    print(f'{args.atlas}: {w}x{h}')

    if args.bands:
        print('\ncontent bands:')
        for y0, y1 in bands(idx, w, h):
            print(f'  y {y0:5d}..{y1:5d}   height {y1 - y0 + 1:4d}')
        return

    if args.region:
        x, y, rw, rh = (int(v) for v in args.region.split(','))
        c = Counter(idx[(y + j) * w + (x + i)] for j in range(rh) for i in range(rw)
                    if 0 <= x + i < w and 0 <= y + j < h)
        total = sum(c.values())
        print(f'\nregion {rw}x{rh} at ({x},{y}) -- index usage:')
        for i, n in c.most_common():
            print(f'  index {i:2d}: {n:7d}  {n / total:6.2%}  rgb{LEGEND[i]}')
        return

    c = Counter(idx)
    total = sum(c.values())
    print('\nwhole atlas -- index usage:')
    for i, n in sorted(c.items()):
        print(f'  index {i:2d}: {n:8d}  {n / total:6.2%}  rgb{LEGEND[i]}')


if __name__ == '__main__':
    main()
