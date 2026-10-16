/*
 * FPK container: read and write the 100-entry packs the client downloads.
 *
 * Mirrors src/tools/fpk/formats/fpk.ts, which is TypeScript and only exists in
 * the built image. Kept here so the message-arc tooling runs straight from the
 * working tree with plain `node`, without a build step.
 *
 * Format
 * ------
 *   0x00  "FPK\0"
 *   0x04  field4   (unused)
 *   0x08  field8   (unused)
 *   0x0c  compression
 *   0x0e  file count
 *   0x10  entry table, 80 bytes per entry:
 *         +0x00 file path, 64 bytes, null padded
 *         +0x40 0xCDCDCDCD
 *         +0x44 uncompressed size
 *         +0x48 size | (flags << 29)
 *         +0x4c offset into the buffer
 *   then the payloads, back to back
 *
 * At most 100 entries per pack; longer lists split across several packs.
 */
const FPK_MAGIC = 'FPK\0';
const HEADER_SIZE = 16;
const ENTRY_SIZE = 80;
const MAX_ENTRIES_PER_FPK = 100;

function parseFpk(buf) {
  if (buf.length < HEADER_SIZE) throw new Error(`FPK header too small: ${buf.length} bytes`);
  if (buf.toString('ascii', 0, 4) !== FPK_MAGIC) {
    throw new Error(`bad FPK magic: ${JSON.stringify(buf.toString('ascii', 0, 4))}`);
  }
  const header = {
    magic: FPK_MAGIC,
    field4: buf.readUInt32LE(4),
    field8: buf.readUInt32LE(8),
    compression: buf.readUInt16LE(12),
    fileCount: buf.readUInt16LE(14),
  };

  const entries = [];
  for (let i = 0; i < header.fileCount; i++) {
    const at = HEADER_SIZE + i * ENTRY_SIZE;
    if (at + ENTRY_SIZE > buf.length) throw new Error(`FPK entry ${i} runs past the buffer`);
    const pathBuf = buf.subarray(at, at + 64);
    const nul = pathBuf.indexOf(0);
    const filePath = pathBuf.toString('utf8', 0, nul === -1 ? 64 : nul);
    const padding = buf.readUInt32LE(at + 64);
    const size = buf.readUInt32LE(at + 68);
    const sizeAndFlags = buf.readUInt32LE(at + 72);
    const offset = buf.readUInt32LE(at + 76);
    if (offset + size > buf.length) {
      throw new Error(`FPK entry "${filePath}" data (offset=${offset}, size=${size}) runs past the buffer`);
    }
    entries.push({ filePath, padding, size, sizeAndFlags, offset, data: Buffer.from(buf.subarray(offset, offset + size)) });
  }
  return { header, entries };
}

function buildFpk(inputs, options = {}) {
  const compression = options.compression ?? 2;
  const mFlags = options.mFlags ?? 1;
  const results = [];
  for (let start = 0; start < inputs.length; start += MAX_ENTRIES_PER_FPK) {
    results.push(buildSingleFpk(inputs.slice(start, start + MAX_ENTRIES_PER_FPK), compression, mFlags, options.header));
  }
  return results;
}

function buildSingleFpk(entries, compression, mFlags, header) {
  const tableSize = HEADER_SIZE + entries.length * ENTRY_SIZE;
  let dataOffset = tableSize;
  let total = tableSize;
  for (const e of entries) total += e.data.length;

  const buf = Buffer.alloc(total);
  buf.write(FPK_MAGIC, 0, 4, 'ascii');
  buf.writeUInt32LE(header?.field4 ?? 0, 4);
  buf.writeUInt32LE(header?.field8 ?? 0, 8);
  buf.writeUInt16LE(compression, 12);
  buf.writeUInt16LE(entries.length, 14);

  entries.forEach((entry, i) => {
    const at = HEADER_SIZE + i * ENTRY_SIZE;
    const pathBytes = Buffer.from(entry.filePath, 'utf-8');
    if (pathBytes.length > 64) throw new Error(`file path too long (${pathBytes.length} > 64): ${entry.filePath}`);
    pathBytes.copy(buf, at);
    /*
     * The word at +0x40 is not padding: the real packs leave it zero, and the
     * game reads it. Copy whatever the source pack had rather than inventing a
     * value -- writing 0xCDCDCDCD here makes the client crash on startup.
     */
    buf.writeUInt32LE(entry.padding ?? 0, at + 64);
    buf.writeUInt32LE(entry.data.length, at + 68);
    buf.writeUInt32LE((entry.data.length & 0x1fffffff) | (mFlags << 29), at + 72);
    buf.writeUInt32LE(dataOffset, at + 76);
    entry.data.copy(buf, dataOffset);
    dataOffset += entry.data.length;
  });
  return buf;
}

module.exports = { parseFpk, buildFpk, HEADER_SIZE, ENTRY_SIZE, MAX_ENTRIES_PER_FPK };