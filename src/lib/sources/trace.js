/**
 * Turns a tone field into vector outlines: marching squares to find the
 * contours, then Douglas–Peucker to shed the staircase.
 *
 * The point is export quality. Masking a pattern with the bitmap itself would
 * be far less code, but it would put a raster inside every exported SVG and
 * throw away exactly the property the text side is built around — a file that
 * opens as real geometry in Illustrator, Figma or a cutter.
 */

/**
 * Directed edge crossings per marching-squares case, keyed by the corner bits
 * TL=1, TR=2, BR=4, BL=8. Every segment is oriented with the inked side on its
 * left, which makes holes wind opposite to outlines — so the default nonzero
 * fill rule resolves nesting on its own.
 *
 * Edge midpoints use doubled integer coordinates to stay exactly comparable:
 * T=(2c+1, 2r), R=(2c+2, 2r+1), B=(2c+1, 2r+2), L=(2c, 2r+1).
 */
const T = 0;
const R = 1;
const B = 2;
const L = 3;

const CASES = [
  [], // 0  empty
  [[L, T]], // 1  TL
  [[T, R]], // 2  TR
  [[L, R]], // 3  TL TR
  [[R, B]], // 4  BR
  [[L, T], [R, B]], // 5  saddle
  [[T, B]], // 6  TR BR
  [[L, B]], // 7  TL TR BR
  [[B, L]], // 8  BL
  [[B, T]], // 9  TL BL
  [[T, R], [B, L]], // 10 saddle
  [[B, R]], // 11 TL TR BL
  [[R, L]], // 12 BR BL
  [[R, T]], // 13 TL BR BL
  [[T, L]], // 14 TR BR BL
  [], // 15 full
];

function edgePoint(kind, c, r) {
  switch (kind) {
    case T:
      return [2 * c + 1, 2 * r];
    case R:
      return [2 * c + 2, 2 * r + 1];
    case B:
      return [2 * c + 1, 2 * r + 2];
    default:
      return [2 * c, 2 * r + 1];
  }
}

/** Perpendicular-distance simplification. Keeps corners, drops the staircase. */
function simplify(points, epsilon) {
  if (points.length < 3 || epsilon <= 0) return points;

  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  const epsSq = epsilon * epsilon;

  while (stack.length) {
    const [first, last] = stack.pop();
    if (last - first < 2) continue;

    const [ax, ay] = points[first];
    const [bx, by] = points[last];
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;

    let worst = 0;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const [px, py] = points[i];
      let distSq;
      if (lenSq === 0) {
        distSq = (px - ax) ** 2 + (py - ay) ** 2;
      } else {
        const cross = (px - ax) * dy - (py - ay) * dx;
        distSq = (cross * cross) / lenSq;
      }
      if (distSq > worst) {
        worst = distSq;
        index = i;
      }
    }

    if (index !== -1 && worst > epsSq) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }

  const out = [];
  for (let i = 0; i < points.length; i++) if (keep[i]) out.push(points[i]);
  return out;
}

/**
 * @param field      a tone field from tone.js
 * @param threshold  ink level that counts as inside, 0..1
 * @param smoothing  0 = follow every pixel, 1 = heavy simplification
 * @returns closed rings as arrays of world-space [x, y] points
 */
export function traceRings(field, threshold, smoothing = 0.4) {
  const { cols, rows, values, box } = field;
  const cut = Math.max(1, threshold * 255);
  const inside = (c, r) =>
    c >= 0 && r >= 0 && c < cols && r < rows && values[r * cols + c] >= cut;

  // Doubled coordinates run -2..2*cols and -2..2*rows; shift to index a map.
  const stride = 2 * cols + 6;
  const key = (p) => (p[1] + 2) * stride + (p[0] + 2);

  const starts = new Map();
  for (let r = -1; r < rows; r++) {
    for (let c = -1; c < cols; c++) {
      const code =
        (inside(c, r) ? 1 : 0) |
        (inside(c + 1, r) ? 2 : 0) |
        (inside(c + 1, r + 1) ? 4 : 0) |
        (inside(c, r + 1) ? 8 : 0);
      for (const [from, to] of CASES[code]) {
        const a = edgePoint(from, c, r);
        const b = edgePoint(to, c, r);
        starts.set(key(a), { a, b, used: false });
      }
    }
  }

  // Grid space -> world space. Sample (c, r) is centred half a cell in.
  const ux = box.width / cols;
  const uy = box.height / rows;
  const toWorld = (p) => [box.x + (p[0] / 2 + 0.5) * ux, box.y + (p[1] / 2 + 0.5) * uy];

  const epsilon = Math.max(ux, uy) * smoothing * 1.5;
  const parts = [];

  for (const seg of starts.values()) {
    if (seg.used) continue;

    const ring = [];
    let current = seg;
    while (current && !current.used) {
      current.used = true;
      ring.push(toWorld(current.a));
      current = starts.get(key(current.b));
    }
    if (ring.length < 4) continue; // speckle

    const points = simplify(ring, epsilon);
    if (points.length < 3) continue;

    parts.push(points);
  }

  return parts;
}

/**
 * A closed ring as path data, straight or curved.
 *
 * Simplification on its own is not smoothing, and calling it that was the
 * quiet lie in this file. Douglas-Peucker only ever *removes* points: turn the
 * control up and the outline keeps every corner it had and loses the detail
 * between them, so a "smoothed" letter came out as a coarser polygon with
 * harder angles than the one it started from. The control did the opposite of
 * what it said.
 *
 * So the surviving points are joined with curves rather than with lines, and
 * the same control sets how much curve. Centripetal Catmull-Rom, converted
 * segment by segment into the cubic Beziers SVG can draw: it passes exactly
 * through every point it is given, so the outline still sits where the tracer
 * put it, and the centripetal parameterisation is what keeps a sharp turn from
 * throwing a loop or a cusp the way the uniform form does.
 *
 * `tension` is the whole blend. At zero the tangents vanish, both control
 * points collapse onto their anchors, and every curve is exactly the straight
 * line it replaced — so smoothing 0 draws precisely what it drew before, which
 * is the faithful outline it is supposed to be.
 */
function ringPath(points, tension) {
  const n = points.length;
  const head = `M${round(points[0][0])} ${round(points[0][1])}`;
  if (tension <= 0 || n < 3) {
    return `${head}${points.slice(1).map(([x, y]) => `L${round(x)} ${round(y)}`).join('')}Z`;
  }

  const at = (i) => points[((i % n) + n) % n];
  // Centripetal: the exponent is a half, so a knot's span grows with the root
  // of its chord rather than with the chord. Uniform (exponent zero) is the
  // form that overshoots; chordal (one) flattens the tight turns away.
  const span = (a, b) => Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])) || 1e-6;

  let d = head;
  for (let i = 0; i < n; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);

    const d1 = span(p0, p1);
    const d2 = span(p1, p2);
    const d3 = span(p2, p3);

    // The non-uniform Catmull-Rom tangents at the two anchors, each scaled by
    // a third because that is where a cubic's control points live.
    const k1 = (d2 / (d1 + d2) / 3) * tension;
    const k2 = (d2 / (d2 + d3) / 3) * tension;
    const c1x = p1[0] + (p2[0] - p0[0]) * k1;
    const c1y = p1[1] + (p2[1] - p0[1]) * k1;
    const c2x = p2[0] - (p3[0] - p1[0]) * k2;
    const c2y = p2[1] - (p3[1] - p1[1]) * k2;

    d += `C${round(c1x)} ${round(c1y)} ${round(c2x)} ${round(c2y)} ${round(p2[0])} ${round(p2[1])}`;
  }
  return `${d}Z`;
}

/**
 * The same rings, as fillable SVG path data.
 *
 * @returns path data, or '' when nothing crosses the threshold
 */
export function traceField(field, threshold, smoothing = 0.4) {
  // The same number does both halves of the job: how much detail is dropped,
  // and how far the survivors are bent toward each other. One control, because
  // they are one idea — and because two would let you ask for a heavily
  // simplified outline with hard corners, which is the state this was stuck in.
  const tension = Math.max(0, Math.min(1, smoothing));
  return traceRings(field, threshold, smoothing)
    .map((points) => ringPath(points, tension))
    .join('');
}

function round(n) {
  return Math.round(n * 100) / 100;
}
