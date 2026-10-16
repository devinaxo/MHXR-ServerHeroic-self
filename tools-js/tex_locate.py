#!/usr/bin/env python3
"""Locate art inside an LP4 atlas by rendering indices as a luminance ramp.

The 16-entry palette is a greyscale ramp (index 0 transparent, index 15
brightest), which is why the grey render is readable while a saturated colour
render is all dithering noise. This renders the ramp and tiles the atlas so the
button art can be picked out by eye.

Usage:
    python3 tex_locate.py <atlas.png> [--cols 4] [--cell 256]
"""
import argparse
from PIL import Image

LEGEND = [
    (255, 0, 255), (255, 0, 0), (0, 255, 0), (0, 0, 255),
    (255, 255, 0), (255, 128, 0), (0, 255, 255), (255, 0, 128),
    (128, 255, 0), (0, 128, 255), (128, 0, 255), (255, 255, 128),
    (0, 255, 128), (128, 0, 128), (128, 128, 128), (255, 255, 255),
]
LOOKUP = {c: i for i, c in enumerate(LEGEND)}


def to_ramp(path, out, cols=4, cell=256):
    im = Image.open(path).convert('RGB')
    w, h = im.size
    px = im.load()

    # index -> ramp grey, index 0 black (will read as "empty")
    grey = [0] + [40 + i * 14 for i in range(1, 16)]

    full = Image.new('L', (w, h))
    fpx = full.load()
    for y in range(h):
        for x in range(w):
            fpx[x, y] = grey[LOOKUP.get(px[x, y], 0)]

    rows = (h + cell - 1) // cell
    sheet = Image.new('L', (cols * cell, rows * (cell + 16)), 30)
    for r in range(rows):
        for c in range(cols):
            x0, y0 = c * cell, r * cell
            if y0 >= h or x0 >= w:
                continue
            tile = full.crop((x0, y0, min(x0 + cell, w), min(y0 + cell, h)))
            sheet.paste(tile, (x0, y0 + 16))
    sheet.save(out)
    print(f'{path} {w}x{h} -> {out}')
    print(f'  grid {cols} cols x {rows} rows, cell {cell}px')
    print(f'  tile (col,row) = (x {c*cell}.., y {r*cell}..)')
    # The full-size ramp goes beside the grid, NOT on top of the input: writing
    # it over the atlas silently replaces the colour-indexed PNG with a grey
    # one, and every later colour->index mapping then returns 0.
    full.save(out.replace('_grid', '') + '_ramp.png')


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('atlas')
    ap.add_argument('--out', default=None)
    ap.add_argument('--cols', type=int, default=4)
    ap.add_argument('--cell', type=int, default=256)
    a = ap.parse_args()
    to_ramp(a.atlas, a.out or a.atlas.rsplit('.', 1)[0] + '_grid.png', a.cols, a.cell)
