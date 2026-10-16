#!/usr/bin/env python3
"""Decode/encode MHXR Android TEX (revil TEXx09) textures.

The header format is the one revil (PredatorCZ/RevilLib) implements as TEXx09,
and database/data/mhxr.ini confirms MHXR uses TEX version 9:

    0x00 u32 "TEX "   0x04 u16 version(9)   0x06 u8 format   0x07 u8 unk00
    0x08 bits: unk01:4, type:28   (type 1 = BM/BaseMap, 7 = LP4)
    0x0c bits: width:13, height:13, numMips:4, unk0:1, unk1:1
    0x10 u32 dataOffset   0x14 u32 pvrVariantOffset   0x18 u32 unkVariantOffset
    0x1c u32 dataSize     0x20 u32 pvrSize            0x24 u32 unkSize

formats: 0x01 RGBA8  0x06 R5G6B5  0x07 RGBA4  0x0A ETC1  0x0C BC3  0x0D PVRTC4

RGBA4 is 4 bits per channel -- two bytes per texel, high nibble alpha, then
blue, green, red. There is NO palette: LP4 does not mean 4bpp palettized, it is
just the name of the texture type enum (revil TEXTypeAndr::LP4 = 7).

    python3 tex_android.py decode <in.tex> <out.png>
    python3 tex_android.py encode <orig.tex> <edited.png> <out.tex>
    python3 tex_android.py info  <in.tex>
"""
import argparse
import struct
import sys
from pathlib import Path

from PIL import Image

TEX_FORMATS = {
    0x01: 'RGBA8',
    0x06: 'R5G6B5',
    0x07: 'RGBA4',
    0x0A: 'ETC1',
    0x0C: 'BC3',
    0x0D: 'PVRTC4',
}
TEX_TYPES = {
    0: 'Common', 1: 'BaseMap(BM)', 2: 'MaskMap(MM)', 5: 'AlphaMap(AM)',
    6: 'Cubemap(CM)', 7: 'LP4', 8: 'Nuki',
}
HDR = 0x28  # 40


class Header:
    def __init__(self, d):
        if d[:4] != b'TEX ':
            sys.exit(f'not an Android TEX file (magic {d[:4]!r})')
        self.version = struct.unpack_from('<H', d, 4)[0]
        self.format = d[6]
        self.unk00 = d[7]
        bf08 = struct.unpack_from('<I', d, 8)[0]
        self.unk01 = bf08 & 0xF
        self.type = bf08 >> 4
        bf0c = struct.unpack_from('<I', d, 0x0C)[0]
        self.width = bf0c & 0x1FFF
        self.height = (bf0c >> 13) & 0x1FFF
        self.numMips = (bf0c >> 26) & 0xF
        (self.dataOffset, self.pvrVariantOffset, self.unkVariantOffset,
         self.dataSize, self.pvrSize, self.unkSize) = struct.unpack_from('<IIIIII', d, 0x10)

    def __str__(self):
        return (f'v{self.version} format={TEX_FORMATS.get(self.format, self.format)} '
                f'type={TEX_TYPES.get(self.type, self.type)} {self.width}x{self.height} '
                f'mips={self.numMips} dataOffset={self.dataOffset} '
                f'pvrOffset={self.pvrVariantOffset} pvrSize={self.pvrSize} '
                f'unkSize={self.unkSize} unk00={self.unk00:#x} unk01={self.unk01}')


def _unpack_rgba4(v):
    # u16 holds the four channels high nibble first: 0xRGBA
    #   bits 15..12 = R, 11..8 = G, 7..4 = B, 3..0 = A
    # (Reading them the other way round mirrors every hue and puts alpha in the
    # high nibble, which is what made the first decoder produce red/cyan art.)
    return (((v >> 12) & 0xF) * 17, ((v >> 8) & 0xF) * 17, ((v >> 4) & 0xF) * 17, (v & 0xF) * 17)


def decode_rgba4(d, h):
    img = Image.new('RGBA', (h.width, h.height))
    px = img.load()
    base = h.dataOffset
    for i in range(h.width * h.height):
        v = d[base + 2 * i] | (d[base + 2 * i + 1] << 8)
        px[i % h.width, i // h.width] = _unpack_rgba4(v)
    return img


def encode_rgba4(src, edited, out):
    h = Header(src)
    if h.format != 0x07:
        sys.exit(f'{h.format} is not RGBA4; only RGBA4 is writable for now')
    img = Image.open(edited).convert('RGBA')
    if img.size != (h.width, h.height):
        sys.exit(f'edited image is {img.size}, expected {(h.width, h.height)}')
    px = img.load()
    body = bytearray()
    for y in range(h.height):
        for x in range(h.width):
            r, g, b, a = px[x, y]
            # back to nibbles; round(v/17) since 17*15 = 255
            v = (min(15, round(r / 17)) << 12) | (min(15, round(g / 17)) << 8) | \
                (min(15, round(b / 17)) << 4) | min(15, round(a / 17))
            body += struct.pack('<H', v)
    result = bytearray(src[:h.dataOffset]) + body
    if len(result) != len(src):
        sys.exit(f'size changed: {len(src)} -> {len(result)}')
    Path(out).write_bytes(result)
    print(f'encoded {out}: {len(result)} bytes (original {len(src)})')


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd', required=True)
    d = sub.add_parser('decode'); d.add_argument('inp'); d.add_argument('out')
    e = sub.add_parser('encode'); e.add_argument('orig'); e.add_argument('edited'); e.add_argument('out')
    i = sub.add_parser('info'); i.add_argument('inp')
    a = ap.parse_args()

    if a.cmd == 'info':
        print(Header(Path(a.inp).read_bytes()))
    elif a.cmd == 'decode':
        src = Path(a.inp).read_bytes()
        h = Header(src)
        if h.format == 0x07:
            img = decode_rgba4(src, h)
        elif h.format == 0x0D:
            from tex_pvrtc4 import decode_pvrtc4
            img = decode_pvrtc4(src, h)
        else:
            sys.exit(f'{TEX_FORMATS.get(h.format)}: only RGBA4 (0x07) and PVRTC4 (0x0D) here')
        img.save(a.out)
        print(f'decoded {a.inp}: {h.width}x{h.height} '
              f'{TEX_FORMATS.get(h.format, hex(h.format))} -> {a.out}')
        print(f'  header {h}')
    else:
        src = Path(a.orig).read_bytes()
        h = Header(src)
        if h.format == 0x07:
            encode_rgba4(src, a.edited, a.out)
        elif h.format == 0x0D:
            from tex_pvrtc4 import encode_pvrtc4
            encode_pvrtc4(src, a.edited, a.out)
        else:
            sys.exit(f'{TEX_FORMATS.get(h.format)}: cannot encode')


if __name__ == '__main__':
    main()
