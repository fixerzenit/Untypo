/**
 * Keeping the subject and dropping what it was photographed against.
 *
 * Every mode in this app starts from "how light is this pixel", which quietly
 * assumes the subject is the dark part and the ground is the white part. Put
 * the same object on a grey card and the whole picture reads as ink; put it on
 * black and it inverts. The threshold has no idea what the subject *is* — only
 * how bright things are.
 *
 * So the ground is identified as a region rather than as a brightness. A flood
 * fill starts from the frame's own border and spreads through whatever is
 * continuous with it. That fixes three things a threshold cannot:
 *
 *   - the ground can be any colour, and any two grounds can differ;
 *   - a gradient is followed, because each step only has to resemble the pixel
 *     it spread from, not some global level;
 *   - a part of the subject that happens to match the ground is kept, because
 *     it is not *connected* to the border. A white shirt inside a portrait on
 *     a white wall survives, which is exactly the case a threshold ruins.
 *
 * What it cannot do is find a subject in a cluttered photograph. Nothing here
 * knows what a subject is; it only knows what the border is connected to. A
 * street scene has no ground to flood.
 */

/**
 * Working resolution.
 *
 * The tone field downstream is a couple of hundred rows, so this is already
 * far more than the marks can resolve — but the mask's edge is what the
 * silhouette tracer follows, and tracing a coarse mask shows.
 */
const MAX_SIDE = 900;

/** Bins per axis when looking for the border's dominant colour. */
const BINS = 12;

let cache = null;

/**
 * A blurred copy of the picture, for the fill to reason about.
 *
 * The fill has to tell two things apart that both look like "the colour
 * changed a lot": a ground shading slowly from white to charcoal, and the
 * antialiased edge of the subject. They differ only in *steepness* — a couple
 * of levels per pixel against fifty — so the gate that separates them has to
 * be tight. But a tight gate cannot cross film grain or a textured wall, where
 * neighbouring pixels differ by more than that on their own.
 *
 * Blurring first settles it. Noise is averaged away, the gradient is untouched
 * because it was already smooth, and the edge stays a cliff — it is merely a
 * slightly wider one. The original pixels are what finally get written; this
 * copy only ever decides.
 */
function blurChannels(pixels, width, height, radius) {
  const n = width * height;
  const out = new Float32Array(n * 3);
  const tmp = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    out[i * 3] = pixels[i * 4];
    out[i * 3 + 1] = pixels[i * 4 + 1];
    out[i * 3 + 2] = pixels[i * 4 + 2];
  }
  if (radius < 1) return out;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0, m = 0;
      for (let k = -radius; k <= radius; k++) {
        const xx = x + k;
        if (xx < 0 || xx >= width) continue;
        const q = (y * width + xx) * 3;
        r += out[q]; g += out[q + 1]; b += out[q + 2]; m++;
      }
      const p = (y * width + x) * 3;
      tmp[p] = r / m; tmp[p + 1] = g / m; tmp[p + 2] = b / m;
    }
  }
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      let r = 0, g = 0, b = 0, m = 0;
      for (let k = -radius; k <= radius; k++) {
        const yy = y + k;
        if (yy < 0 || yy >= height) continue;
        const q = (yy * width + x) * 3;
        r += tmp[q]; g += tmp[q + 1]; b += tmp[q + 2]; m++;
      }
      const p = (y * width + x) * 3;
      out[p] = r / m; out[p + 1] = g / m; out[p + 2] = b / m;
    }
  }
  return out;
}

/** Squared distance in RGB, normalised so 1 is the diagonal of the cube. */
function distance(pixels, a, b) {
  const dr = pixels[a] - pixels[b];
  const dg = pixels[a + 1] - pixels[b + 1];
  const db = pixels[a + 2] - pixels[b + 2];
  return (dr * dr + dg * dg + db * db) / 195075; // 3 * 255²
}

function distanceTo(pixels, a, rgb) {
  const dr = pixels[a] - rgb[0];
  const dg = pixels[a + 1] - rgb[1];
  const db = pixels[a + 2] - rgb[2];
  return (dr * dr + dg * dg + db * db) / 195075;
}

/**
 * The ground, as a plane per channel rather than a single colour.
 *
 * A fixed reference is what actually contains the fill — it is the thing that
 * says "this is no longer the ground" when the local step is too small to
 * notice, which happens wherever the subject's boundary runs tangent to the
 * direction of travel or is thin enough for a blur to wash out. Letting that
 * reference drift along with the fill, as an earlier attempt did, removes the
 * only barrier there is: the fill finds the one tangent point on a disc and
 * floods the whole interior through it.
 *
 * But a single colour cannot describe a ground that shades from white at the
 * top to charcoal at the bottom, and refusing everything past the midpoint
 * leaves a third of it behind. A plane fits that exactly, costs a 3x3 solve,
 * and is still fixed — so it contains the fill exactly as a constant did.
 *
 * Fitted only to border pixels near the modal colour. A subject that runs off
 * the edge of the frame puts its own colour into the border, and least squares
 * has no opinion about which points deserve to be there.
 */
function groundPlane(pixels, width, height) {
  const counts = new Uint32Array(BINS * BINS * BINS);
  const sums = new Float64Array(BINS * BINS * BINS * 3);
  const step = 256 / BINS;
  const border = [];

  for (let x = 0; x < width; x++) {
    border.push(x, (height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    border.push(y * width, y * width + width - 1);
  }

  for (const i of border) {
    const p = i * 4;
    if (pixels[p + 3] < 8) continue; // already transparent: not part of the ground
    const bin =
      Math.min(BINS - 1, (pixels[p] / step) | 0) * BINS * BINS +
      Math.min(BINS - 1, (pixels[p + 1] / step) | 0) * BINS +
      Math.min(BINS - 1, (pixels[p + 2] / step) | 0);
    counts[bin]++;
    sums[bin * 3] += pixels[p];
    sums[bin * 3 + 1] += pixels[p + 1];
    sums[bin * 3 + 2] += pixels[p + 2];
  }

  let best = 0;
  for (let i = 1; i < counts.length; i++) if (counts[i] > counts[best]) best = i;
  const modal = counts[best]
    ? [sums[best * 3] / counts[best], sums[best * 3 + 1] / counts[best], sums[best * 3 + 2] / counts[best]]
    : [255, 255, 255];

  // A gradient spreads the ground across many bins, so the modal bin alone is
  // too small a sample to fit a plane to. Everything within this of it counts.
  const admit = 110 * 110 * 3;
  const chosen = [];
  for (const i of border) {
    const p = i * 4;
    if (pixels[p + 3] < 8) continue;
    const dr = pixels[p] - modal[0];
    const dg = pixels[p + 1] - modal[1];
    const db = pixels[p + 2] - modal[2];
    if (dr * dr + dg * dg + db * db <= admit) chosen.push(i);
  }
  const use = chosen.length >= 12 ? chosen : border;

  // Normal equations for v = a + b*u + c*w, with u,w in 0..1 across the frame.
  const A = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  const rhs = [0, 0, 0, 0, 0, 0, 0, 0, 0]; // three channels, three terms each
  for (const i of use) {
    const x = i % width;
    const u = x / (width - 1 || 1);
    const w = ((i - x) / width) / (height - 1 || 1);
    const basis = [1, u, w];
    for (let a = 0; a < 3; a++) {
      for (let b = 0; b < 3; b++) A[a * 3 + b] += basis[a] * basis[b];
      const p = i * 4;
      rhs[a * 3] += basis[a] * pixels[p];
      rhs[a * 3 + 1] += basis[a] * pixels[p + 1];
      rhs[a * 3 + 2] += basis[a] * pixels[p + 2];
    }
  }

  const coefficients = solve3(A, rhs);
  if (!coefficients) {
    return () => modal;
  }
  return (u, w) => [
    coefficients[0] + coefficients[3] * u + coefficients[6] * w,
    coefficients[1] + coefficients[4] * u + coefficients[7] * w,
    coefficients[2] + coefficients[5] * u + coefficients[8] * w,
  ];
}

/**
 * Gauss-Jordan on the 3x3 normal matrix, for all three channels at once.
 * Returns null when the border is degenerate — a single row of pixels, say —
 * in which case the caller falls back to a constant.
 */
function solve3(A, rhs) {
  const m = [
    [A[0], A[1], A[2], rhs[0], rhs[1], rhs[2]],
    [A[3], A[4], A[5], rhs[3], rhs[4], rhs[5]],
    [A[6], A[7], A[8], rhs[6], rhs[7], rhs[8]],
  ];
  for (let col = 0; col < 3; col++) {
    let pivot = col;
    for (let r = col + 1; r < 3; r++) if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    if (Math.abs(m[pivot][col]) < 1e-9) return null;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    const d = m[col][col];
    for (let k = col; k < 6; k++) m[col][k] /= d;
    for (let r = 0; r < 3; r++) {
      if (r === col) continue;
      const f = m[r][col];
      if (!f) continue;
      for (let k = col; k < 6; k++) m[r][k] -= f * m[col][k];
    }
  }
  // [a.r, a.g, a.b, b.r, b.g, b.b, c.r, c.g, c.b]
  return [m[0][3], m[0][4], m[0][5], m[1][3], m[1][4], m[1][5], m[2][3], m[2][4], m[2][5]];
}

/**
 * Separable box blur over the mask, run twice.
 *
 * A flood fill answers in whole pixels, so its edge is a stair. Two box passes
 * are enough to turn that into a ramp the tracer can follow without every step
 * showing up as a notch in the silhouette.
 */
function soften(mask, width, height, radius) {
  if (radius < 1) return mask;
  let src = mask;
  let dst = new Float32Array(mask.length);

  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = 0; x < width; x++) {
        let sum = 0;
        let n = 0;
        for (let k = -radius; k <= radius; k++) {
          const xx = x + k;
          if (xx < 0 || xx >= width) continue;
          sum += src[row + xx];
          n++;
        }
        dst[row + x] = sum / n;
      }
    }
    [src, dst] = [dst, src];

    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        let sum = 0;
        let n = 0;
        for (let k = -radius; k <= radius; k++) {
          const yy = y + k;
          if (yy < 0 || yy >= height) continue;
          sum += src[yy * width + x];
          n++;
        }
        dst[y * width + x] = sum / n;
      }
    }
    [src, dst] = [dst, src];
  }
  return src;
}

/**
 * @param tolerance 0..1 — how far from the ground's colour still counts as ground
 * @param feather   how many working pixels of softness the mask's edge gets
 * @returns a canvas with the ground made transparent, ready to drop straight
 *          into the existing pipeline: imageField already multiplies by alpha,
 *          so nothing downstream needs to know this happened
 */
export function cutSubject(bitmap, { tolerance = 0.35, feather = 1 } = {}) {
  const key = `${bitmap.width}x${bitmap.height}|${tolerance}|${feather}`;
  if (cache && cache.bitmap === bitmap && cache.key === key) return cache.canvas;

  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, width, height);

  const image = ctx.getImageData(0, 0, width, height);
  const pixels = image.data;
  const ground = groundPlane(pixels, width, height);
  // Every gate below reads this rather than the picture itself.
  const view = blurChannels(pixels, width, height, 2);

  // Two gates, and the fixed one is the one that holds.
  //
  // The local gate keeps the fill from stepping over a hard edge, and on its
  // own it is not enough: wherever the subject's boundary runs tangent to the
  // direction of travel, or is thin enough for the blur to wash out, the step
  // is small and the fill walks straight through. One tangent point on a disc
  // is all it takes to flood the whole interior.
  //
  // What actually contains it is the comparison against the ground plane,
  // which does not move as the fill spreads. Inside the subject the plane
  // still describes the *ground*, so a pixel that has crossed the boundary
  // fails against it however gently it got there.
  const near = ((3 + tolerance * 22) / 255) ** 2 * 3;
  const far = (0.05 + tolerance * 0.35) ** 2 * 3;

  const seen = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  const lastX = width - 1 || 1;
  const lastY = height - 1 || 1;

  const isGround = (i, x, y) =>
    distanceTo(view, i * 3, ground(x / lastX, y / lastY)) <= far;

  const seed = (i, x, y) => {
    if (seen[i] || !isGround(i, x, y)) return;
    seen[i] = 1;
    queue[tail++] = i;
  };
  for (let x = 0; x < width; x++) {
    seed(x, x, 0);
    seed((height - 1) * width + x, x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    seed(y * width, 0, y);
    seed(y * width + width - 1, width - 1, y);
  }

  while (head < tail) {
    const i = queue[head++];
    const x = i % width;
    const y = (i - x) / width;
    const from = i * 3;

    for (let k = 0; k < 4; k++) {
      const nx = x + (k === 0 ? -1 : k === 1 ? 1 : 0);
      const ny = y + (k === 2 ? -1 : k === 3 ? 1 : 0);
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const j = ny * width + nx;
      if (seen[j]) continue;
      if (distance(view, from, j * 3) > near) continue;
      if (!isGround(j, nx, ny)) continue;
      seen[j] = 1;
      queue[tail++] = j;
    }
  }

  // Whatever the fill never reached is the subject — including any part of it
  // the same colour as the ground, which is the whole point of asking about
  // connection rather than about brightness.
  let mask = new Float32Array(width * height);
  for (let i = 0; i < mask.length; i++) mask[i] = seen[i] ? 0 : 1;
  mask = soften(mask, width, height, Math.round(feather));

  for (let i = 0; i < mask.length; i++) {
    pixels[i * 4 + 3] = Math.round(pixels[i * 4 + 3] * mask[i]);
  }
  ctx.putImageData(image, 0, 0);

  cache = { bitmap, key, canvas };
  return canvas;
}
