/**
 * A GIF89a encoder, written out rather than pulled in.
 *
 * A general-purpose encoder has to solve colour quantisation, which is the hard
 * part of writing one. Here the palette is known in advance: the artwork is a
 * pattern colour over a background colour, so a ramp between those two covers
 * every pixel the rasteriser can produce, antialiasing included. That turns
 * quantisation into a dot product and leaves only the LZW stage, which is
 * mechanical.
 *
 * The result is small too — a 64-entry ramp compresses far better than the
 * generic 256-colour cube a library would reach for.
 */

const RAMP = 64;

class ByteWriter {
  constructor() {
    this.bytes = [];
  }
  byte(v) {
    this.bytes.push(v & 0xff);
  }
  short(v) {
    this.bytes.push(v & 0xff, (v >> 8) & 0xff);
  }
  string(s) {
    for (let i = 0; i < s.length; i++) this.bytes.push(s.charCodeAt(i));
  }
  raw(list) {
    for (const v of list) this.bytes.push(v & 0xff);
  }
  done() {
    return new Uint8Array(this.bytes);
  }
}

function parseHex(hex) {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.replace(/./g, (c) => c + c) : clean;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/**
 * A ramp from background to pattern colour, plus one spare slot used as the
 * transparent index when the artwork has no background of its own.
 */
function buildPalette(fg, bg) {
  const from = parseHex(bg);
  const to = parseHex(fg);
  const table = [];
  for (let i = 0; i < RAMP; i++) {
    const t = i / (RAMP - 1);
    table.push([
      Math.round(from[0] + (to[0] - from[0]) * t),
      Math.round(from[1] + (to[1] - from[1]) * t),
      Math.round(from[2] + (to[2] - from[2]) * t),
    ]);
  }
  table.push([0, 0, 0]); // transparent slot
  return { table, transparentIndex: RAMP, from, to };
}

/** Projects each pixel onto the background-to-pattern axis and rounds. */
function quantise(rgba, palette, transparent) {
  const { from, to, transparentIndex } = palette;
  const dr = to[0] - from[0];
  const dg = to[1] - from[1];
  const db = to[2] - from[2];
  const lenSq = dr * dr + dg * dg + db * db;

  const out = new Uint8Array(rgba.length / 4);
  for (let i = 0; i < out.length; i++) {
    const p = i * 4;
    if (transparent && rgba[p + 3] < 128) {
      out[i] = transparentIndex;
      continue;
    }
    if (lenSq === 0) {
      out[i] = RAMP - 1;
      continue;
    }
    const t =
      ((rgba[p] - from[0]) * dr + (rgba[p + 1] - from[1]) * dg + (rgba[p + 2] - from[2]) * db) /
      lenSq;
    out[i] = Math.max(0, Math.min(RAMP - 1, Math.round(t * (RAMP - 1))));
  }
  return out;
}

/** GIF's variable-width LZW, emitted as the 255-byte sub-blocks the format wants. */
function lzwCompress(indices, minCodeSize) {
  const clearCode = 1 << minCodeSize;
  const endCode = clearCode + 1;

  let codeSize = minCodeSize + 1;
  let next = endCode + 1;
  let dictionary = new Map();

  const out = [];
  let bitBuffer = 0;
  let bitCount = 0;

  const emit = (code) => {
    bitBuffer |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      out.push(bitBuffer & 0xff);
      bitBuffer >>= 8;
      bitCount -= 8;
    }
  };

  emit(clearCode);
  let prefix = indices[0];

  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = prefix * 4096 + k;
    const found = dictionary.get(key);
    if (found !== undefined) {
      prefix = found;
      continue;
    }

    emit(prefix);
    dictionary.set(key, next);
    next += 1;

    if (next > 1 << codeSize) {
      if (codeSize < 12) {
        codeSize += 1;
      } else {
        emit(clearCode);
        dictionary = new Map();
        next = endCode + 1;
        codeSize = minCodeSize + 1;
      }
    }
    prefix = k;
  }

  emit(prefix);
  emit(endCode);
  if (bitCount > 0) out.push(bitBuffer & 0xff);

  // Sub-blocks: a length byte, then up to 255 bytes, repeated.
  const blocked = [];
  for (let i = 0; i < out.length; i += 255) {
    const chunk = out.slice(i, i + 255);
    blocked.push(chunk.length, ...chunk);
  }
  blocked.push(0);
  return blocked;
}

/**
 * @param frames  RGBA pixel buffers, all `width` x `height`
 * @param delayMs per-frame delay; GIF stores hundredths of a second, so this
 *                is rounded to the nearest 10ms
 * @returns a Blob of type image/gif
 */
export function encodeGIF({ frames, width, height, delayMs = 40, fg, bg, transparent = false }) {
  const palette = buildPalette(fg, transparent ? '#ffffff' : bg);
  const w = new ByteWriter();

  w.string('GIF89a');
  w.short(width);
  w.short(height);
  // Global colour table, 7 bits of colour resolution, 128 entries (2^7).
  w.byte(0b1111_0110);
  w.byte(0);
  w.byte(0);
  for (let i = 0; i < 128; i++) w.raw(palette.table[i] ?? [0, 0, 0]);

  // Netscape extension — the only way to say "loop forever".
  w.byte(0x21);
  w.byte(0xff);
  w.byte(11);
  w.string('NETSCAPE2.0');
  w.byte(3);
  w.byte(1);
  w.short(0);
  w.byte(0);

  const delay = Math.max(2, Math.round(delayMs / 10));

  for (const rgba of frames) {
    const indices = quantise(rgba, palette, transparent);

    w.byte(0x21);
    w.byte(0xf9);
    w.byte(4);
    // Disposal 2 (restore to background) so transparency does not smear.
    w.byte(transparent ? 0b0000_1001 : 0b0000_0100);
    w.short(delay);
    w.byte(transparent ? palette.transparentIndex : 0);
    w.byte(0);

    w.byte(0x2c);
    w.short(0);
    w.short(0);
    w.short(width);
    w.short(height);
    w.byte(0);

    const minCodeSize = 7;
    w.byte(minCodeSize);
    w.raw(lzwCompress(indices, minCodeSize));
  }

  w.byte(0x3b);
  return new Blob([w.done()], { type: 'image/gif' });
}
