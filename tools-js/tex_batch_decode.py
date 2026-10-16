#!/usr/bin/env python3
"""Decode every RGBA4 texture in a dump produced by gui-tex-dump.cjs into a PNG.

Reads dump/manifest.json and writes dump/png/<same path as the .tex>.png.

The Android TEX format (revil's TEXx09, see tools-js/tex_android.py) stores
RGBA4 as two bytes per texel: bits 15..12 alpha, 11..8 blue, 7..4 green, 3..0
red. There is no palette. LP4 is just the name of the texture *type*, not a
4bpp-palettized format -- believing otherwise is what made the old decoder
produce noise.

    python3 tex_batch_decode.py [--dump dump] [--force] [--verify N] [--limit N]

--verify N re-encodes N of the decoded PNGs back to .tex and compares bytes, so
you can trust the dump before editing anything.
"""
import argparse
import array
import json
import sys
from pathlib import Path

from PIL import Image

# RGBA4 -> RGBA8 done with bytes.translate, so the whole texel expansion runs in
# C rather than per-texel Python. The u16 is 0xRGBA (R = bits 15..12, G = 11..8,
# B = 7..4, A = 3..0), so stored little-endian as two bytes:
#   byte0 = (B << 4) | A      byte1 = (R << 4) | G
# Hence R and G come from the second (odd) byte, B and A from the first (even).
T_LO = bytes((v & 0xF) * 17 for v in range(256))
T_HI = bytes((v >> 4) * 17 for v in range(256))


def rgba4_to_rgba8(pay):
    even, odd = pay[0::2], pay[1::2]
    n = len(even)
    out = bytearray(n * 4)
    out[0::4] = odd.translate(T_HI)    # R
    out[1::4] = odd.translate(T_LO)    # G
    out[2::4] = even.translate(T_HI)   # B
    out[3::4] = even.translate(T_LO)   # A
    return bytes(out)


DECODABLE = {'RGBA4', 'RGBA8', 'R5G6B5', 'PVRTC4', 'ETC1', 'BC3'}

try:
    import texture2ddecoder as _t2d
except ImportError:  # optional; only the block-compressed formats need it
    _t2d = None


def read_header(d):
    if len(d) < 0x28 or d[:4] != b'TEX ':
        return None
    bf0c = int.from_bytes(d[0x0C:0x10], 'little')
    return {
        'format': d[6],
        'width': bf0c & 0x1FFF,
        'height': (bf0c >> 13) & 0x1FFF,
        'dataOffset': int.from_bytes(d[0x10:0x14], 'little'),
        'pvrVariantOffset': int.from_bytes(d[0x14:0x18], 'little'),
        'unkVariantOffset': int.from_bytes(d[0x18:0x1C], 'little'),
        'dataSize': int.from_bytes(d[0x1C:0x20], 'little'),
        'pvrSize': int.from_bytes(d[0x20:0x24], 'little'),
        'unkSize': int.from_bytes(d[0x24:0x28], 'little'),
    }


def swap_rb(rgba):
    """Swap the red and blue channels of a raw RGBA byte string.

    texture2ddecoder (and revil's DDS writer, which agrees with it byte for byte)
    emit **BGRA**, not RGBA. Left alone the ship wheel comes out blue and the
    girls' hair comes out cyan. Caught by comparing against screenshots/menu.jpg:
    the real art is a brown/bronze wheel and blonde hair.
    """
    out = bytearray(rgba)
    out[0::4], out[2::4] = rgba[2::4], rgba[0::4]
    return bytes(out)


def decode_block(d, h):
    """Decode a block-compressed texture (ETC1 / BC3 / PVRTC4).

    PVRTC4 files carry two variants: a 1-byte-per-texel region starting at
    dataOffset, and the real PVRTC payload at pvrVariantOffset. pvrSize is
    exactly width*height/2, and the client renders the PVRTC variant, so that is
    what we decode.
    """
    if _t2d is None:
        return None, 'block-compressed format: pip install texture2ddecoder'

    w, ht = h['width'], h['height']
    fmt = h['format']

    if fmt == 0x0D:  # PVRTC4
        pvr_off, pvr_size = h['pvrVariantOffset'], h['pvrSize']
        if pvr_off and pvr_size == w * ht // 2:
            data = d[pvr_off:pvr_off + pvr_size]
        else:
            data = d[h['dataOffset']:]
        if len(data) < w * ht // 2:
            return None, f'payload {len(data)} < {w * ht // 2} for {w}x{ht} PVRTC4'
        return Image.frombytes('RGBA', (w, ht), swap_rb(_t2d.decode_pvrtc(bytes(data), w, ht, False))), None

    data = d[h['dataOffset']:]
    if fmt == 0x0A:  # ETC1
        return Image.frombytes('RGBA', (w, ht), swap_rb(_t2d.decode_etc1(bytes(data), w, ht))), None
    if fmt == 0x0C:  # BC3 / DXT5
        return Image.frombytes('RGBA', (w, ht), swap_rb(_t2d.decode_bc3(bytes(data), w, ht))), None
    return None, f'block format {fmt} unhandled'


def decode(d):
    """Return (PIL.Image or None, reason)."""
    h = read_header(d)
    if not h:
        return None, 'not a TEX file'
    w, ht, off = h['width'], h['height'], h['dataOffset']
    if not w or not ht:
        return None, f'bad dimensions {w}x{ht}'
    pay = d[off:]
    fmt = h['format']

    if fmt == 0x07:  # RGBA4
        need = w * ht * 2
        if len(pay) < need:
            return None, f'payload {len(pay)} < {need} for {w}x{ht}'
        return Image.frombytes('RGBA', (w, ht), rgba4_to_rgba8(pay[:need])), None

    if fmt == 0x01:  # RGBA8
        need = w * ht * 4
        if len(pay) < need:
            return None, f'payload {len(pay)} < {need}'
        return Image.frombytes('RGBA', (w, ht), pay[:need]), None

    if fmt == 0x06:  # R5G6B5
        need = w * ht * 2
        if len(pay) < need:
            return None, f'payload {len(pay)} < {need}'
        vals = array.array('H')
        vals.frombytes(pay[:need])
        if sys.byteorder == 'big':
            vals.byteswap()
        out = bytearray(w * ht * 3)
        for i, v in enumerate(vals):
            out[i * 3] = (v >> 11) << 3
            out[i * 3 + 1] = ((v >> 5) & 0x3F) << 2
            out[i * 3 + 2] = (v & 0x1F) << 3
        return Image.frombytes('RGB', (w, ht), bytes(out)), None

    # PVRTC4 / PVRTC2. These files carry two variants: a 1-byte-per-texel region
    # from dataOffset, and the real PVRTC payload at pvrVariantOffset, with the
    # sizes in the header (pvrSize matches width*height/2 exactly for PVRTC4).
    # The renderer uses the PVRTC variant, so that is what we decode.
    if fmt in (0x0A, 0x0C, 0x0D):  # ETC1, BC3, PVRTC4
        return decode_block(d, h)

    return None, f'format {fmt} not decodable locally'


def encode_rgba4(src, img):
    """Inverse of the RGBA4 decode, used only by --verify."""
    h = read_header(src)
    w, ht, off = h['width'], h['height'], h['dataOffset']
    if img.size != (w, ht) or img.mode != 'RGBA':
        return None
    data = img.tobytes()
    vals = array.array('H', bytes(2 * w * ht))
    for i in range(w * ht):
        r, g, b, a = data[i * 4:i * 4 + 4]
        vals[i] = (min(15, (r + 8) // 17) << 12) | (min(15, (g + 8) // 17) << 8) | \
                  (min(15, (b + 8) // 17) << 4) | min(15, (a + 8) // 17)
    if sys.byteorder == 'big':
        vals.byteswap()
    body = vals.tobytes()[:len(src) - off]
    return bytes(src[:off]) + body


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dump', default='dump')
    ap.add_argument('--limit', type=int, default=None, help='only decode the first N (testing)')
    ap.add_argument('--force', action='store_true', help='ignore existing PNGs')
    ap.add_argument('--verify', type=int, default=0, metavar='N',
                    help='re-encode N decoded PNGs and compare bytes with the original')
    a = ap.parse_args()

    dump = Path(a.dump)
    manifest = dump / 'manifest.json'
    if not manifest.exists():
        sys.exit(f'{manifest} not found -- run tools-js/gui-tex-dump.cjs first')
    records = json.loads(manifest.read_text())

    todo = [r for r in records if r['status'] != 'duplicate' and r['format'] in DECODABLE]
    if a.limit:
        todo = todo[:a.limit]
    print(f'{len(todo)} decodable of {len(records)} entries')

    ok = skipped = failed = 0
    reasons = {}
    for i, r in enumerate(todo):
        tex = Path(r['tex_path'])
        png = dump / 'png' / tex.relative_to(dump / 'tex').with_suffix('.png')
        if png.exists() and not a.force and png.stat().st_mtime > tex.stat().st_mtime:
            skipped += 1
            continue
        img, why = decode(tex.read_bytes())
        if img is None:
            failed += 1
            reasons[why] = reasons.get(why, 0) + 1
            continue
        png.parent.mkdir(parents=True, exist_ok=True)
        # no optimize=True: it costs ~8x for no gain on art this compressible
        img.save(png)
        ok += 1
        if (i + 1) % 1000 == 0:
            print(f'  {i + 1}/{len(todo)}  ok={ok} fail={failed}')

    print(f'\ndecoded {ok} PNGs -> {dump}/png   (skipped up-to-date {skipped}, failed {failed})')
    for k, v in sorted(reasons.items(), key=lambda kv: -kv[1]):
        print(f'  failed: {k} x{v}')

    undecodable = [r for r in records if r['status'] != 'duplicate' and r['format'] not in DECODABLE]
    print(f'\nnot decodable locally: {len(undecodable)}')
    byfmt = {}
    for r in undecodable:
        byfmt[r['format']] = byfmt.get(r['format'], 0) + 1
    print('  ' + '  '.join(f'{k}={v}' for k, v in sorted(byfmt.items(), key=lambda kv: -kv[1])))

    # ---- verification: prove the dump round-trips --------------------------
    if a.verify:
        import random
        sample = random.Random(1).sample(todo, min(a.verify, len(todo)))
        print(f'\nverifying {len(sample)} textures (decode -> encode -> byte compare):')
        bad = 0
        for r in sample:
            tex = Path(r['tex_path'])
            src = tex.read_bytes()
            if read_header(src)['format'] != 0x07:
                continue
            img, why = decode(src)
            if img is None:
                print(f'  !! {tex.name}: {why}')
                bad += 1
                continue
            rebuilt = encode_rgba4(src, img)
            if rebuilt != src:
                print(f'  MISMATCH {tex.name}: {sum(1 for x, y in zip(src, rebuilt) if x != y)} bytes')
                bad += 1
        print(f'  {len(sample) - bad}/{len(sample)} byte-identical on round trip')
        if bad:
            sys.exit(1)


if __name__ == '__main__':
    main()
