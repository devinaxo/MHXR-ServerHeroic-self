#!/usr/bin/env python3
"""PVRTC4 support for the MHXR Android TEX format (revil TEXx09, format 0x0D).

A PVRTC4 texture in these packs holds two variants:

    dataOffset .. pvrVariantOffset   one byte per texel (unused by the client)
    pvrVariantOffset .. +pvrSize      the PVRTC4 payload the client renders

pvrSize is exactly width*height/2, so only that payload is rewritten and every
header field is left untouched. That keeps the file byte-length identical, which
is what arc-edit's same-size path needs.

Decoding uses texture2ddecoder, encoding uses Imagination's PVRTexToolCLI
(`PVRTCI_4BPP_RGBA`). Both are verified against RevilToolset and against the
original art in screenshots/menu.jpg.

    PVRTEXTOOL=/path/to/PVRTexToolCLI python3 tex_pvrtc4.py decode|encode|info ...
"""
import os
import struct
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

try:
    import texture2ddecoder as _t2d
except ImportError:  # pragma: no cover
    _t2d = None

DEFAULT_TOOL = '/home/nacho/Documents/mhxr/' \
               'PVRTexTool_linux@f61b9fab251192eb5e26549f13cbcc2994547fba/' \
               'CLI/Linux_x86_64/PVRTexToolCLI'

# PVRTC v1, 4bpp RGBA. PVRTCII_4BPP was measured at mean|err| 106 against this
# game's art versus 16 for PVRTCI, so v1 is what MHXR ships.
PVR_FORMAT = 'PVRTCI_4BPP_RGBA'
PVR_QUALITY = 'PVRTCHIGH'
# PVRTexTool defaults its input colourspace to sRGB, converts to linear, and
# bakes that into the compressed values -- the GPU then darkens the texture a
# second time, which is why the ship wheel came out gamma 2.2 too dark. Declaring
# the input linear stops the conversion so the stored bytes equal the PNG.
PVR_IN_COLOURSPACE = 'lRGB'

PVR_HEADER = 52          # PVRv3 header
PVR_META_SIZE_AT = 48    # u32 metaDataSize, so the payload starts at 52 + meta


def tool_path():
    p = os.environ.get('PVRTEXTOOL', DEFAULT_TOOL)
    if not Path(p).exists():
        sys.exit(f'PVRTexToolCLI not found at {p}\n'
                 f'set PVRTEXTOOL=/path/to/PVRTexToolCLI')
    return p


def swap_rb(rgba):
    """texture2ddecoder emits BGRA; the game's art is RGB (brown wheel, blonde
    hair). Without this everything comes out blue."""
    out = bytearray(rgba)
    out[0::4], out[2::4] = rgba[2::4], rgba[0::4]
    return bytes(out)


def decode_pvrtc4(d, h):
    if _t2d is None:
        sys.exit('pip install texture2ddecoder')
    w, ht = h.width, h.height
    data = d[h.pvrVariantOffset:h.pvrVariantOffset + h.pvrSize]
    if len(data) < w * ht // 2:
        sys.exit(f'payload {len(data)} < {w * ht // 2} for {w}x{ht}')
    rgba = _t2d.decode_pvrtc(bytes(data), w, ht, False)
    return Image.frombytes('RGBA', (w, ht), swap_rb(rgba))


def pvr_payload(path, expect):
    b = Path(path).read_bytes()
    ver = struct.unpack_from('<I', b, 0)[0]
    if ver not in (0x50565243, 0x03525650):
        sys.exit(f'{path}: not a PVR container (version {ver:#010x})')
    # PVRv2 ('PVRC') and PVRv3 share this layout: metaDataSize sits at 0x30 and
    # the payload follows the 52-byte header.
    meta = struct.unpack_from('<I', b, PVR_META_SIZE_AT)[0]
    start = PVR_HEADER + meta
    return b[start:start + expect]


def encode_pvrtc4(src, edited, out):
    """Re-encode a PVRTC4 texture, keeping the file byte length identical."""
    from tex_android import Header
    h = Header(src)
    w, ht = h.width, h.height
    need = w * ht // 2

    img = Image.open(edited).convert('RGBA')
    if img.size != (w, ht):
        sys.exit(f'{edited} is {img.size}, texture is {(w, ht)}')

    tool = tool_path()
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        src_png, out_pvr = td / 'in.png', td / 'out.pvr'
        img.save(src_png)
        res = subprocess.run(
            [tool, '-i', str(src_png), '-o', str(out_pvr),
             '-ics', PVR_IN_COLOURSPACE,
             '-f', PVR_FORMAT, '-m', '1', '-q', PVR_QUALITY, '-shh'],
            capture_output=True, text=True)
        if res.returncode != 0 or not out_pvr.exists():
            sys.exit(f'PVRTexToolCLI failed ({res.returncode}):\n{res.stderr}')
        payload = pvr_payload(out_pvr, need)
    if len(payload) != need:
        sys.exit(f'encoded payload is {len(payload)}, expected {need}')

    result = bytearray(src)
    result[h.pvrVariantOffset:h.pvrVariantOffset + need] = payload
    if len(result) != len(src):
        sys.exit(f'size changed: {len(src)} -> {len(result)}')
    Path(out).write_bytes(result)
    print(f'encoded {out}: {len(result)} bytes (original {len(src)})')
    print(f'  {PVR_FORMAT} {PVR_QUALITY}, {need} bytes at offset {h.pvrVariantOffset}')
    print(f'  the {h.unkSize}-byte secondary region was left untouched')


if __name__ == '__main__':
    from tex_android import Header
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument('cmd', choices=['decode', 'encode', 'info'])
    ap.add_argument('args', nargs='*')
    a = ap.parse_args()
    if a.cmd == 'info':
        print(Header(Path(a.args[0]).read_bytes()))
    elif a.cmd == 'decode':
        s = Path(a.args[0]).read_bytes()
        h = Header(s)
        decode_pvrtc4(s, h).save(a.args[1])
        print(f'decoded -> {a.args[1]} ({h.width}x{h.height})')
    else:
        encode_pvrtc4(Path(a.args[0]).read_bytes(), a.args[1], a.args[2])