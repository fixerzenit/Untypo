/**
 * Tone fields.
 *
 * A source — glyph outlines or a bitmap — is reduced to a grid of ink values
 * in 0..1, and every pattern then asks the same question: "how much ink is in
 * this cell?" A letterform answers 0 or 1, a photograph answers everything in
 * between, and the patterns do not need to know which they are drawing.
 *
 * Cells are answered with a *box average* rather than a point sample. That
 * matters twice over: it keeps a mosaic edge as smooth as coverage-based
 * sampling, and on a detailed photo it stops fine texture from aliasing into
 * noise. A summed-area table makes each average four lookups regardless of
 * cell size.
 */

const FIELD_ROWS = 260;
const MAX_FIELD_CELLS = 400_000;

let scratch = null;

function fieldDimensions(box) {
  let rows = FIELD_ROWS;
  let cols = Math.max(1, Math.round(rows * (box.width / box.height)));
  const total = cols * rows;
  if (total > MAX_FIELD_CELLS) {
    const k = Math.sqrt(MAX_FIELD_CELLS / total);
    cols = Math.max(1, Math.floor(cols * k));
    rows = Math.max(1, Math.floor(rows * k));
  }
  return { cols, rows };
}

/** Paints into a canvas whose transform maps `box` onto the field grid. */
function rasterise(box, paint) {
  const { cols, rows } = fieldDimensions(box);
  scratch ??= document.createElement('canvas');
  scratch.width = cols;
  scratch.height = rows;

  const ctx = scratch.getContext('2d', { willReadFrequently: true });
  const sx = cols / box.width;
  const sy = rows / box.height;
  ctx.setTransform(sx, 0, 0, sy, -box.x * sx, -box.y * sy);
  paint(ctx);
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  return { cols, rows, pixels: ctx.getImageData(0, 0, cols, rows).data };
}

function makeField(cols, rows, box, values) {
  // Summed-area table, one row and column larger so the lookups need no
  // bounds branching. Max sum is 255 * MAX_FIELD_CELLS, well inside Uint32.
  const w = cols + 1;
  const sat = new Uint32Array(w * (rows + 1));
  for (let r = 0; r < rows; r++) {
    let rowSum = 0;
    for (let c = 0; c < cols; c++) {
      rowSum += values[r * cols + c];
      sat[(r + 1) * w + c + 1] = sat[r * w + c + 1] + rowSum;
    }
  }

  const sx = cols / box.width;
  const sy = rows / box.height;
  const clampCol = (v) => (v < 0 ? 0 : v > cols ? cols : v);
  const clampRow = (v) => (v < 0 ? 0 : v > rows ? rows : v);

  return {
    cols,
    rows,
    box,
    values,

    /** Ink at a single point, 0..1. */
    at(x, y) {
      const c = Math.floor((x - box.x) * sx);
      const r = Math.floor((y - box.y) * sy);
      if (c < 0 || r < 0 || c >= cols || r >= rows) return 0;
      return values[r * cols + c] / 255;
    },

    /**
     * Mean ink over a `size`-wide square centred on (x, y), 0..1.
     * Anything outside the field counts as blank, so edge cells are not
     * inflated by having less area to average over.
     */
    average(x, y, size) {
      const half = size / 2;
      const c0 = Math.round((x - half - box.x) * sx);
      const r0 = Math.round((y - half - box.y) * sy);
      let c1 = Math.round((x + half - box.x) * sx);
      let r1 = Math.round((y + half - box.y) * sy);
      if (c1 <= c0) c1 = c0 + 1;
      if (r1 <= r0) r1 = r0 + 1;

      const area = (c1 - c0) * (r1 - r0);
      const cc0 = clampCol(c0);
      const cc1 = clampCol(c1);
      const rr0 = clampRow(r0);
      const rr1 = clampRow(r1);
      if (cc1 <= cc0 || rr1 <= rr0) return 0;

      const sum =
        sat[rr1 * w + cc1] - sat[rr0 * w + cc1] - sat[rr1 * w + cc0] + sat[rr0 * w + cc0];
      return sum / area / 255;
    },
  };
}

/**
 * Ink = how sharply the picture changes here, rather than how dark it is.
 *
 * A threshold answers one question — light or dark — and throws away
 * everything a photograph knows about its own structure. Two faces of the same
 * brightness merge into one blob; a pale object on a pale ground vanishes
 * entirely. Gradient magnitude keeps what the threshold discards: the places
 * where one thing stops and another starts.
 *
 * Sobel, over a blurred copy. The blur is not optional — an unblurred gradient
 * on a photograph is mostly sensor noise, and every fleck of it becomes a
 * mark.
 */
export function edgeField(field, { smoothing = 1.2, gain = 1 } = {}) {
  const { cols, rows, box, values } = field;
  const smooth = blurValues(values, cols, rows, Math.max(0, Math.round(smoothing * 2)));
  const out = new Uint8Array(cols * rows);

  for (let r = 1; r < rows - 1; r++) {
    for (let c = 1; c < cols - 1; c++) {
      const i = r * cols + c;
      const tl = smooth[i - cols - 1];
      const t = smooth[i - cols];
      const tr = smooth[i - cols + 1];
      const l = smooth[i - 1];
      const rr = smooth[i + 1];
      const bl = smooth[i + cols - 1];
      const b = smooth[i + cols];
      const br = smooth[i + cols + 1];

      const gx = tl + 2 * l + bl - (tr + 2 * rr + br);
      const gy = tl + 2 * t + tr - (bl + 2 * b + br);
      // /4 brings a full-contrast step back to roughly 1 before the gain.
      const magnitude = (Math.hypot(gx, gy) / 4) * gain;
      out[i] = magnitude > 255 ? 255 : magnitude > 0 ? magnitude : 0;
    }
  }
  return makeField(cols, rows, box, out);
}

/** Separable box blur with a running sum: O(n) whatever the radius. */
function blurValues(values, cols, rows, radius) {
  if (radius < 1) return Float32Array.from(values);
  let a = Float32Array.from(values);
  let b = new Float32Array(a.length);

  for (let pass = 0; pass < 2; pass++) {
    for (let r = 0; r < rows; r++) {
      const base = r * cols;
      let sum = 0;
      for (let c = 0; c <= radius && c < cols; c++) sum += a[base + c];
      for (let c = 0; c < cols; c++) {
        const span = Math.min(cols - 1, c + radius) - Math.max(0, c - radius) + 1;
        b[base + c] = sum / span;
        if (c + radius + 1 < cols) sum += a[base + c + radius + 1];
        if (c - radius >= 0) sum -= a[base + c - radius];
      }
    }
    let swap = a;
    a = b;
    b = swap;

    for (let c = 0; c < cols; c++) {
      let sum = 0;
      for (let r = 0; r <= radius && r < rows; r++) sum += a[r * cols + c];
      for (let r = 0; r < rows; r++) {
        const span = Math.min(rows - 1, r + radius) - Math.max(0, r - radius) + 1;
        b[r * cols + c] = sum / span;
        if (r + radius + 1 < rows) sum += a[(r + radius + 1) * cols + c];
        if (r - radius >= 0) sum -= a[(r - radius) * cols + c];
      }
    }
    swap = a;
    a = b;
    b = swap;
  }
  return a;
}

/** Ink = glyph coverage. Binary in substance, antialiased at the edges. */
export function pathField(d, box) {
  const { cols, rows, pixels } = rasterise(box, (ctx) => {
    ctx.fillStyle = '#000';
    ctx.fill(new Path2D(d));
  });
  const values = new Uint8Array(cols * rows);
  for (let i = 0; i < values.length; i++) values[i] = pixels[i * 4 + 3];
  return makeField(cols, rows, box, values);
}

/**
 * Ink = darkness. Transparent pixels read as blank, so cut-out PNGs work
 * without any extra handling.
 */
export function imageField(bitmap, box, { invert = false, brightness = 0, contrast = 1 } = {}) {
  const { cols, rows, pixels } = rasterise(box, (ctx) => {
    ctx.drawImage(bitmap, box.x, box.y, box.width, box.height);
  });

  const values = new Uint8Array(cols * rows);
  for (let i = 0; i < values.length; i++) {
    const p = i * 4;
    const alpha = pixels[p + 3] / 255;
    const luma = (0.2126 * pixels[p] + 0.7152 * pixels[p + 1] + 0.0722 * pixels[p + 2]) / 255;
    let ink = invert ? luma : 1 - luma;
    ink = (ink - 0.5) * contrast + 0.5 + brightness;
    ink = ink < 0 ? 0 : ink > 1 ? 1 : ink;
    values[i] = ink * alpha * 255;
  }
  return makeField(cols, rows, box, values);
}
