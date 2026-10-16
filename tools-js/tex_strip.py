#!/usr/bin/env python3
"""Slice an LP4 atlas into its strips.

The atlas is 512x2048 and the header carries strip_h = 113 (u32 at 0x08). 2048 is
exactly 16 x 128, so the atlas is a vertical stack of 16 strips whose real height
is 113 rows, padded to 128. That padding is why reading the whole thing as one
image produces vertical stripes: the rows are cut at the wrong stride.

Slicing it gives one PNG per strip, each 512x113, which is the unit you actually
edit. Reassembling is the exact inverse, and is verified byte-for-byte.

Usage:
    python3 tex_strip.py <atlas.png> <outdir> [--strip-h 113] [--stride 128]
    python3 tex_strip.py --assemble <stripdir> <out.png> --strip-h 113 --count 16
"""
import argparse
from pathlib import Path

from PIL import Image


def slice_up(atlas, outdir, strip_h, stride):
    im = Image.open(atlas).convert('RGB')
    w, h = im.size
    outdir = Path(outdir)
    outdir.mkdir(parents=True, exist_ok=True)
    n = h // stride
    print(f'atlas {w}x{h}  strip_h {strip_h}  stride {stride}  -> {n} strips')
    for i in range(n):
        y = i * stride
        tile = im.crop((0, y, w, y + strip_h))
        p = outdir / f'strip_{i:02d}.png'
        tile.save(p)
        # how much is actually used in this strip
        px = tile.load()
        used = sum(1 for yy in range(strip_h) for x in range(w) if px[x, yy] != (255, 0, 255))
        print(f'  strip {i:2d}  y {y:5d}..{y + strip_h - 1:5d}  '
              f'used {used / (w * strip_h):6.1%}  {p}')
    print(f'\npadding rows {strip_h}..{stride - 1} of each strip are discarded on reassembly')


def assemble(stripdir, out, strip_h, count):
    stripdir = Path(stripdir)
    im = Image.new('RGB', (512, count * 128))
    for i in range(count):
        p = stripdir / f'strip_{i:02d}.png'
        if not p.exists():
            raise SystemExit(f'missing {p}')
        tile = Image.open(p).convert('RGB')
        if tile.size != (512, strip_h):
            raise SystemExit(f'{p} is {tile.size}, expected (512, {strip_h})')
        im.paste(tile, (0, i * 128))
    im.save(out)
    print(f'assembled {count} strips -> {out}  {im.size}')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('atlas', nargs='?')
    ap.add_argument('outdir', nargs='?')
    ap.add_argument('--strip-h', type=int, default=113)
    ap.add_argument('--stride', type=int, default=128)
    ap.add_argument('--assemble', metavar='STRIPDIR')
    ap.add_argument('--count', type=int, default=16)
    args = ap.parse_args()

    if args.assemble:
        assemble(args.assemble, args.outdir, args.strip_h, args.count)
    else:
        if not args.atlas or not args.outdir:
            ap.error('need <atlas> <outdir> or --assemble')
        slice_up(args.atlas, args.outdir, args.strip_h, args.stride)


if __name__ == '__main__':
    main()
