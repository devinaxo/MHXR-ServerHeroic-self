#!/usr/bin/env python3
"""Find BL call sites to a target vaddr in an arm64 ELF (libMHS.so).

    python3 frida/xref.py <elf> <target_vaddr_hex>

Resolves each call site address to the nearest exported symbol.
"""
import struct
import subprocess
import sys

from capstone import Cs, CS_ARCH_ARM64, CS_MODE_LITTLE_ENDIAN

path = sys.argv[1]
target = int(sys.argv[2], 16)
data = open(path, "rb").read()

e_phoff = struct.unpack_from("<Q", data, 0x20)[0]
e_phnum = struct.unpack_from("<H", data, 0x38)[0]
e_phes = struct.unpack_from("<H", data, 0x36)[0]
segs = []
for i in range(e_phnum):
    o = e_phoff + i * e_phes
    p_type = struct.unpack_from("<I", data, o)[0]
    p_flags = struct.unpack_from("<I", data, o + 4)[0]
    if p_type != 1 or not (p_flags & 1):  # PT_LOAD and executable
        continue
    segs.append(
        (
            struct.unpack_from("<Q", data, o + 0x10)[0],
            struct.unpack_from("<Q", data, o + 8)[0],
            struct.unpack_from("<Q", data, o + 0x20)[0],
        )
    )

# exported symbols for annotation
out = subprocess.run(["nm", "-D", "-C", path], capture_output=True, text=True).stdout
syms = []
for line in out.splitlines():
    parts = line.split(maxsplit=2)
    if len(parts) != 3:
        continue
    try:
        syms.append((int(parts[0], 16), parts[2]))
    except ValueError:
        pass
syms.sort()


def nearest(addr):
    lo, hi = 0, len(syms) - 1
    best = None
    while lo <= hi:
        mid = (lo + hi) // 2
        if syms[mid][0] <= addr:
            best = syms[mid]
            lo = mid + 1
        else:
            hi = mid - 1
    if not best:
        return "?"
    return f"{best[1]} (+{addr - best[0]:#x})"


md = Cs(CS_ARCH_ARM64, CS_MODE_LITTLE_ENDIAN)
for vaddr, off, size in segs:
    for ins in md.disasm(data[off : off + size], vaddr):
        if ins.mnemonic == "bl":
            try:
                dest = int(ins.op_str, 16)
            except ValueError:
                continue
            if dest == target:
                print(f"call at {ins.address:#x}  in  {nearest(ins.address)}")
