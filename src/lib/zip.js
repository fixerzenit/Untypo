/**
 * A minimal ZIP writer.
 *
 * Only the STORE method, no compression — the payload is PNGs, which are
 * already deflated, so a second pass would cost time and win nothing. That
 * removes the only genuinely hard part of the format and leaves a header
 * layout and a CRC.
 *
 * The alternative was firing two hundred separate downloads, which every
 * browser blocks after the first few.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function bytes(...values) {
  return new Uint8Array(values);
}

const u16 = (v) => bytes(v & 0xff, (v >> 8) & 0xff);
const u32 = (v) => bytes(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff);

function concat(chunks) {
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

/**
 * @param files [{ name, data: Uint8Array }]
 * @returns a Blob of type application/zip
 */
export function createZip(files) {
  const encoder = new TextEncoder();
  const local = [];
  const central = [];
  let offset = 0;

  for (const file of files) {
    const name = encoder.encode(file.name);
    const crc = crc32(file.data);
    const size = file.data.length;

    const header = concat([
      u32(0x04034b50),
      u16(20), // version needed
      u16(0x0800), // UTF-8 names
      u16(0), // stored
      u16(0),
      u16(0), // no meaningful timestamp
      u32(crc),
      u32(size),
      u32(size),
      u16(name.length),
      u16(0),
      name,
    ]);

    local.push(header, file.data);

    central.push(
      concat([
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(0x0800),
        u16(0),
        u16(0),
        u16(0),
        u32(crc),
        u32(size),
        u32(size),
        u16(name.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        name,
      ]),
    );

    offset += header.length + size;
  }

  const directory = concat(central);
  const end = concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(directory.length),
    u32(offset),
    u16(0),
  ]);

  return new Blob([concat([...local, directory, end])], { type: 'application/zip' });
}
