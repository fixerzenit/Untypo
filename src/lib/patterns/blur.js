/**
 * A blurred copy of the source, as a field the ditherer can quantise.
 *
 * A blur is a raster effect, so it has to be resolved into marks somehow. The
 * field produced here is handed to the ditherer, which scatters one-bit marks
 * by error diffusion — the way a continuous tone has always been printed
 * without greys. That keeps the export as real geometry, and the grain it
 * produces is what the soft-focus look is made of in the first place.
 */

/** The blur is soft by definition, so it does not need the full-size field. */
const MAX_ROWS = 170;
const MAX_CELLS = 90_000;

let cached = null;
let scratch = null;

/**
 * Three box passes approximate a Gaussian closely enough for this, and a
 * running sum makes each one O(n) whatever the radius — which matters, because
 * the whole point is a radius large enough to wash the letterform out.
 */
function boxBlur(src, cols, rows, radius) {
  if (radius < 1) return src;
  const tmp = new Float32Array(src.length);
  let a = src;
  let b = tmp;

  for (let pass = 0; pass < 3; pass++) {
    // Horizontal.
    for (let r = 0; r < rows; r++) {
      const base = r * cols;
      let sum = 0;
      for (let c = 0; c <= radius && c < cols; c++) sum += a[base + c];
      for (let c = 0; c < cols; c++) {
        const span = Math.min(cols - 1, c + radius) - Math.max(0, c - radius) + 1;
        b[base + c] = sum / span;
        const add = c + radius + 1;
        const drop = c - radius;
        if (add < cols) sum += a[base + add];
        if (drop >= 0) sum -= a[base + drop];
      }
    }
    // Vertical, over the result of the pass above.
    const swap = a;
    a = b;
    b = swap;

    for (let c = 0; c < cols; c++) {
      let sum = 0;
      for (let r = 0; r <= radius && r < rows; r++) sum += a[r * cols + c];
      for (let r = 0; r < rows; r++) {
        const span = Math.min(rows - 1, r + radius) - Math.max(0, r - radius) + 1;
        b[r * cols + c] = sum / span;
        const add = r + radius + 1;
        const drop = r - radius;
        if (add < rows) sum += a[add * cols + c];
        if (drop >= 0) sum -= a[drop * cols + c];
      }
    }
    const swap2 = a;
    a = b;
    b = swap2;
  }
  return a;
}

/**
 * @param blur    radius as a fraction of the frame height
 * @param hollow  true keeps only the edge: the value ridges where the blurred
 *                shape crosses its halfway point, so the band follows the
 *                letterform and fades away on both sides of it, leaving the
 *                middle of a stroke lighter than its rim
 * @returns { cols, rows, box, values } — a grid the ditherer can quantise
 */
export function blurField(geo, { blur, hollow }) {
  const key = [geo.d.length, geo.box.width, geo.box.height, blur, hollow].join('|');
  if (cached && cached.key === key) return cached.value;

  const aspect = geo.box.width / geo.box.height;
  let rows = MAX_ROWS;
  let cols = Math.max(8, Math.round(rows * aspect));
  if (cols * rows > MAX_CELLS) {
    const shrink = Math.sqrt(MAX_CELLS / (cols * rows));
    cols = Math.max(8, Math.floor(cols * shrink));
    rows = Math.max(8, Math.floor(rows * shrink));
  }

  scratch ??= document.createElement('canvas');
  scratch.width = cols;
  scratch.height = rows;
  const ctx = scratch.getContext('2d', { willReadFrequently: true });
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cols, rows);
  ctx.setTransform(
    cols / geo.box.width,
    0,
    0,
    rows / geo.box.height,
    (-geo.box.x * cols) / geo.box.width,
    (-geo.box.y * rows) / geo.box.height,
  );
  ctx.fillStyle = '#000';
  ctx.fill(new Path2D(geo.d));
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  const pixels = ctx.getImageData(0, 0, cols, rows).data;
  const source = new Float32Array(cols * rows);
  for (let i = 0; i < source.length; i++) source[i] = pixels[i * 4 + 3] / 255;

  const blurred = boxBlur(source, cols, rows, Math.max(1, Math.round(blur * rows)));

  const values = new Uint8Array(cols * rows);
  for (let i = 0; i < values.length; i++) {
    const v = blurred[i];
    // The ridge peaks at the halfway value, which is exactly where the blurred
    // edge sits — hence a dark rim with a lighter core.
    const out = hollow ? 1 - Math.abs(2 * v - 1) : v;
    values[i] = out > 1 ? 255 : out > 0 ? out * 255 : 0;
  }

  const value = { cols, rows, box: geo.box, values };
  cached = { key, value };
  return value;
}
