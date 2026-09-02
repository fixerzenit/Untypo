/**
 * How far every point is from the edge of the shape.
 *
 * Every other pattern here asks the tone field one question — "is there ink at
 * this point?" — and gets a yes or no. That is enough to fill a shape, and not
 * enough to do anything that depends on *where in* the shape you are. A stroke
 * has a middle; a counter has a corner; the outside has a near and a far. None
 * of it is visible to a threshold.
 *
 * This answers the other question. Distance to the nearest edge, signed:
 * negative inside the ink, positive outside it, zero on the outline. Contour
 * reads it as elevation and traces its level curves; Packing reads it as the
 * largest circle that fits at a point.
 */

/**
 * The grid the transform runs on.
 *
 * Distance is smooth, so it survives a coarse sampling far better than a
 * letterform's outline does — but a contour traced through it inherits this
 * resolution as its own smoothness, so it cannot go as low as the blur field's.
 */
const MAX_ROWS = 260;
const MAX_CELLS = 190_000;

/**
 * A few fields, not one.
 *
 * Chip builds a second field from its own snapped outline and then reads both
 * in the same pass, so a single slot would thrash on every call and rebuild a
 * quarter-million-cell transform twice per frame.
 */
const cache = [];
const CACHE_LIMIT = 3;
let scratch = null;

/**
 * Exact squared distance transform of one row, after Felzenszwalb & Huttenlocher.
 *
 * The naive alternative is a chamfer mask, which is a handful of lines and
 * wrong in a way that shows here: its error is directional, so a contour drawn
 * from it comes out visibly octagonal. This is exact and still linear — it
 * walks the lower envelope of a set of parabolas, one rooted at each sample,
 * and reads off whichever is lowest at each point.
 */
function transform1d(f, n, d, v, z) {
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;

  for (let q = 1; q < n; q++) {
    // Where the parabola at q crosses the one currently on top.
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    // If it crosses behind the last boundary, that parabola is buried entirely.
    while (k > 0 && s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }

  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

/** Squared distance from every cell to the nearest cell where `mask` is set. */
function distanceSquared(mask, cols, rows) {
  const INF = 1e12;
  const out = new Float32Array(cols * rows);
  for (let i = 0; i < out.length; i++) out[i] = mask[i] ? 0 : INF;

  const span = Math.max(cols, rows);
  const f = new Float32Array(span);
  const d = new Float32Array(span);
  const v = new Int32Array(span);
  const z = new Float32Array(span + 1);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) f[c] = out[r * cols + c];
    transform1d(f, cols, d, v, z);
    for (let c = 0; c < cols; c++) out[r * cols + c] = d[c];
  }
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) f[r] = out[r * cols + c];
    transform1d(f, rows, d, v, z);
    for (let r = 0; r < rows; r++) out[r * cols + c] = d[r];
  }
  return out;
}

/**
 * @returns {{ cols, rows, box, unit, values, at }}
 *   values  signed distance per cell, in world units
 *   unit    world units per cell, so a caller can judge its own precision
 *   at      bilinear lookup in world coordinates
 */
export function distanceField(geo) {
  const key = `${geo.d.length}|${geo.box.x}|${geo.box.y}|${geo.box.width}|${geo.box.height}`;
  const hit = cache.find((entry) => entry.key === key);
  if (hit) return hit.value;

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
  // A traced silhouette can self-intersect; nonzero keeps a counter a counter.
  ctx.fill(new Path2D(geo.d), 'nonzero');
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  const pixels = ctx.getImageData(0, 0, cols, rows).data;
  const ink = new Uint8Array(cols * rows);
  for (let i = 0; i < ink.length; i++) ink[i] = pixels[i * 4 + 3] >= 128 ? 1 : 0;

  // Two transforms, each measuring to the *other* side: one gives depth inside
  // the ink, the other reach outside it. Subtracting them signs the field.
  const gap = new Uint8Array(ink.length);
  for (let i = 0; i < ink.length; i++) gap[i] = ink[i] ? 0 : 1;
  const inward = distanceSquared(gap, cols, rows);
  const outward = distanceSquared(ink, cols, rows);

  // Cells are not square unless the frame happens to be; measure in the larger
  // of the two so a distance is never overstated.
  const unit = Math.max(geo.box.width / cols, geo.box.height / rows);
  const values = new Float32Array(ink.length);
  for (let i = 0; i < values.length; i++) {
    values[i] = ink[i] ? -Math.sqrt(inward[i]) * unit : Math.sqrt(outward[i]) * unit;
  }

  const field = {
    key,
    cols,
    rows,
    box: geo.box,
    unit,
    values,
    at(x, y) {
      // Sample (c, r) sits at the centre of its cell, hence the half-cell shift.
      const fc = ((x - geo.box.x) / geo.box.width) * cols - 0.5;
      const fr = ((y - geo.box.y) / geo.box.height) * rows - 0.5;
      const c0 = Math.max(0, Math.min(cols - 1, Math.floor(fc)));
      const r0 = Math.max(0, Math.min(rows - 1, Math.floor(fr)));
      const c1 = Math.min(cols - 1, c0 + 1);
      const r1 = Math.min(rows - 1, r0 + 1);
      const tx = Math.max(0, Math.min(1, fc - c0));
      const ty = Math.max(0, Math.min(1, fr - r0));

      const top = values[r0 * cols + c0] * (1 - tx) + values[r0 * cols + c1] * tx;
      const bottom = values[r1 * cols + c0] * (1 - tx) + values[r1 * cols + c1] * tx;
      return top * (1 - ty) + bottom * ty;
    },
  };

  cache.unshift({ key, value: field });
  if (cache.length > CACHE_LIMIT) cache.pop();
  return field;
}
