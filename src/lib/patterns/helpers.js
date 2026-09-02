import {
  GLITCH_BANDS,
  GLITCH_SHARE,
  STILL,
  driftAmount,
  markWeight,
  weighsMarks,
} from '../motion.js';

/** Building blocks shared by the pattern modules. */

export const num = (n) => (Math.round(n * 1000) / 1000).toString();

/**
 * Ceiling on marks per render.
 *
 * The lattice is box area / cell², and the box widens with every letter, so a
 * long word at the tightest spacing can ask for hundreds of thousands of marks
 * — enough markup to stall the tab on each slider tick. Past the budget the
 * cell is coarsened, which reads as a slightly looser grid rather than a
 * freeze. Ordinary words never come close.
 */
const MAX_MARKS = 45_000;

function budget(cell, width, height) {
  const wanted = (width / cell) * (height / cell);
  return wanted > MAX_MARKS ? cell * Math.sqrt(wanted / MAX_MARKS) : cell;
}

/** Deterministic pseudo-random in 0..1 — same seed, same artwork, every time. */
export function hashRandom(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 2246822519) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const NO_DRIFT = [0, 0];

/**
 * How far a mark sits from where it belongs.
 *
 * Two families. The random ones take their direction from the cell's own hash
 * rather than a clock, so every mark travels a fixed path home and the finished
 * frame is identical to the one the pattern draws standing still. The coherent
 * coherent one — wave — takes its direction from where the mark is in the
 * frame, so neighbours move together and the field reads as one surface being
 * disturbed instead of a thousand marks each doing their own thing.
 *
 * @param nx,ny position in the frame, 0..1. Only the coherent drifts need it.
 */
export function scatterOffset(fx, i, j, cell, nx = 0.5, ny = 0.5) {
  const drift = driftAmount(fx);
  if (!drift) return NO_DRIFT;

  if (drift.kind === 'orbit') {
    // Its own starting angle, advanced by the shared clock: the field churns
    // but nothing drifts away from where it belongs.
    const angle = (hashRandom(i, j, drift.seed) + drift.phase) * Math.PI * 2;
    const reach = cell * drift.reach;
    return [Math.cos(angle) * reach, Math.sin(angle) * reach];
  }

  if (drift.kind === 'wave') {
    // Whole cycles across the frame, so the crest that leaves one edge is the
    // one arriving at the other and a looped clip has no seam.
    const swing = Math.sin((nx * WAVE_CYCLES - drift.phase) * Math.PI * 2);
    return [0, swing * cell * drift.reach];
  }

  if (drift.kind === 'glitch') {
    // Coherent inside a band and unrelated to the next one, which is the whole
    // effect: the artwork stays intact but arrives in the wrong places. Most
    // bands hold still, so the ones that move read as a fault rather than as
    // the pattern simply being made of moving parts.
    const band = Math.floor(ny * GLITCH_BANDS);
    if (hashRandom(band, drift.tick, 91) > GLITCH_SHARE) return NO_DRIFT;
    return [(hashRandom(band, drift.tick, 7) - 0.5) * 2 * cell * drift.reach, 0];
  }

  const angle = hashRandom(i, j, drift.seed) * Math.PI * 2;
  const reach = (0.5 + hashRandom(i, j, drift.seed + 14) * 2) * cell * drift.reach;
  return [Math.cos(angle) * reach, Math.sin(angle) * reach];
}

/** Crests across the frame. Matched to the ripple's, so the two read as kin. */
const WAVE_CYCLES = 2;

/** True when the iris has not yet opened past this point. */
export function irisHides(fx, nx, ny) {
  if (fx.iris === null) return false;
  const dx = (nx - 0.5) * 2;
  const dy = (ny - 0.5) * 2;
  return Math.hypot(dx, dy * 0.55) > fx.iris * 1.25;
}

/** Extent of `box` measured in a frame rotated by `angle`, centred on the box. */
function rotatedBounds(box, cos, sin) {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;

  for (const [px, py] of [
    [box.x, box.y],
    [box.x + box.width, box.y],
    [box.x + box.width, box.y + box.height],
    [box.x, box.y + box.height],
  ]) {
    const dx = px - cx;
    const dy = py - cy;
    const u = dx * cos + dy * sin;
    const v = -dx * sin + dy * cos;
    if (u < minU) minU = u;
    if (u > maxU) maxU = u;
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
  }
  return { cx, cy, minU, maxU, minV, maxV };
}

/**
 * Stamps one *complete* copy of a motif into every lattice cell that carries
 * enough ink.
 *
 * The obvious implementation — an SVG <pattern> painted through a clip-path of
 * the shape — slices the marks in half wherever the outline crosses them.
 * Sampling onto the motif's own lattice instead keeps every mark intact: the
 * edge becomes a mosaic of whole marks, so the pattern stays exact and the
 * silhouette is what gives.
 *
 * The lattice can be rotated, which is how real print screens avoid moiré —
 * cyan, magenta and black are conventionally 15°, 75° and 45° apart.
 *
 * @param motif (x, y, cell, ink) => markup. Positions are in the rotated
 *              frame; `ink` is 1 for a solid source and the local tone for a
 *              tonal one, so a motif can size itself by darkness.
 * @param fx    the motion effect (see lib/motion.js): scattered reveal, wipe
 *              front, and ripple weighting, all in normalised frame space.
 */
export function motifGrid({ geo, spacing, angle = 0, motif, fx = STILL }) {
  const { box, tone, tonal } = geo;
  const floor = geo.floor ?? 0.5;

  const radians = (angle * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const { cx, cy, minU, maxU, minV, maxV } = rotatedBounds(box, cos, sin);

  const cell = budget(spacing, maxU - minU + spacing * 2, maxV - minV + spacing * 2);
  const half = cell / 2;
  const i0 = Math.floor(minU / cell) - 1;
  const i1 = Math.ceil(maxU / cell) + 1;
  const j0 = Math.floor(minV / cell) - 1;
  const j1 = Math.ceil(maxV / cell) + 1;

  const weighted = weighsMarks(fx);
  const marks = [];
  for (let j = j0; j <= j1; j++) {
    const v = j * cell + half;
    for (let i = i0; i <= i1; i++) {
      const u = i * cell + half;
      // A build reveals mark by mark in a fixed shuffled order, so the shape
      // assembles as scattered dots rather than sweeping across.
      if (fx.build < 1 && hashRandom(i, j, fx.reveal) > fx.build) continue;

      // Lattice position -> world position, to ask the field for its ink.
      const wx = cx + u * cos - v * sin;
      const wy = cy + u * sin + v * cos;
      const nx = (wx - box.x) / box.width;
      const ny = (wy - box.y) / box.height;
      if (fx.wipe !== null && nx > fx.wipe) continue;
      if (irisHides(fx, nx, ny)) continue;

      const ink = tone.average(wx, wy, cell);
      if (ink < floor) continue;

      // The weighting effects ride on the ink value, so a mark's *area* swells
      // and shrinks exactly the way darkness would drive it.
      const weight = weighted ? Math.max(0.02, ink * markWeight(fx, nx, ny)) : tonal ? ink : 1;

      // Scatter displaces the mark from its cell without changing which cell
      // it belongs to, so the artwork converges on the same frame every time.
      const drift = scatterOffset(fx, i, j, cell, nx, ny);
      marks.push(motif(cx + u + drift[0], cy + v + drift[1], cell, weight));
    }
  }

  const body = marks.join('');
  if (!body || !angle) return body;
  return `<g transform="rotate(${num(angle)} ${num(cx)} ${num(cy)})">${body}</g>`;
}

/**
 * Parallel rules at an arbitrary angle, drawn as the spans where they actually
 * cross the shape.
 *
 * The cheap way is one long rule per row trimmed by a clip-path. That is what
 * this used to do, and it costs three things: a clip cuts a round cap back to
 * a square edge, it cannot end a line anywhere other than exactly on the
 * outline, and it will happily snap a rule in two to preserve a sliver of
 * counter — the artefact visible in the corner of a "D".
 *
 * So the rules are marched instead, and their spans measured. That buys
 * genuine round caps, endpoints that can be nudged off the outline, and a
 * continuity threshold that bridges a gap too small to be worth breaking a
 * line for. Same principle as the whole marks: the pattern stays intact and
 * the silhouette is what gives.
 *
 * @param continuity gaps shorter than this are bridged; spans shorter than
 *                   half of it are dropped rather than left as slivers
 * @param noise      nudges each span's ends off the outline, 0 = exact
 * @param wave       amplitude of a sinusoidal displacement, in units
 * @param fx         motion effect: reveals rule by rule, truncates at a wipe
 *                   front, or weights each span by a travelling ripple
 */
export function hatch({
  geo,
  spacing,
  thickness,
  angle = 0,
  dash = 0,
  phase = 0,
  wave = 0,
  waves = 3,
  noise = 0,
  continuity = 8,
  cap = 'butt',
  seed = 1,
  fx = STILL,
  color,
}) {
  const { box, tone, tonal } = geo;
  const floor = geo.floor ?? (tonal ? 0.04 : 0.5);
  // Ripple and tone both need a weight per span, so the width moves off the
  // group and onto each element.
  const perSpan = tonal || weighsMarks(fx);
  const front = fx.wipe !== null ? box.x + fx.wipe * box.width : null;

  const radians = (angle * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const { cx, cy, minU, maxU, minV, maxV } = rotatedBounds(box, cos, sin);

  const gap = budget(spacing, maxU - minU + spacing * 2, maxV - minV + spacing * 2);
  const u0 = minU - gap;
  const u1 = maxU + gap;
  const rows = Math.ceil((maxV - minV) / gap) + 2;
  const startV = Math.floor(minV / gap) * gap;

  // Fine enough to catch a thin stem, capped so a long word cannot explode.
  let step = Math.min(2.5, Math.max(0.9, gap / 3));
  if ((u1 - u0) / step > 900) step = (u1 - u0) / 900;

  const bridge = continuity;
  const minSpan = continuity * 0.5;
  const nudge = noise * 18;

  // Only the coherent drifts move a rule off its own row; the random ones keep
  // sliding along it, which is what makes a line assemble rather than shred.
  const driftKind = driftAmount(fx)?.kind;
  const acrossRule = driftKind === 'wave' || driftKind === 'glitch';

  const offset = (u, v) =>
    wave
      ? v + wave * Math.sin(((u - u0) / (u1 - u0)) * waves * Math.PI * 2 + phase * Math.PI * 2)
      : v;

  const parts = [];

  for (let j = 0; j <= rows; j++) {
    if (fx.build < 1 && j / rows > fx.build) continue;
    const v = startV + j * gap + phase * gap;

    // Walk the rule and record where it is over ink.
    const spans = [];
    let open = null;
    for (let u = u0; u <= u1; u += step) {
      const vv = offset(u, v);
      const ink = tone.average(cx + u * cos - vv * sin, cy + u * sin + vv * cos, step);
      if (ink >= floor) {
        if (open === null) open = u;
      } else if (open !== null) {
        spans.push([open, u]);
        open = null;
      }
    }
    if (open !== null) spans.push([open, u1]);
    if (!spans.length) continue;

    // Close gaps too small to justify breaking the rule, then drop slivers.
    const merged = [spans[0]];
    for (let s = 1; s < spans.length; s++) {
      const last = merged[merged.length - 1];
      if (spans[s][0] - last[1] <= bridge) last[1] = spans[s][1];
      else merged.push(spans[s]);
    }

    for (let s = 0; s < merged.length; s++) {
      let [a, b] = merged[s];
      if (b - a < minSpan) continue;
      if (nudge) {
        a += (hashRandom(j, s, seed) - 0.5) * 2 * nudge;
        b += (hashRandom(j, s, seed + 733) - 0.5) * 2 * nudge;
        if (b - a < step) continue;
      }

      // A wipe cuts the rule at the front rather than dropping whole spans,
      // so the sweep reads as an edge instead of a stutter. World x runs
      // linearly along the rule, unless the rule is perpendicular to it.
      if (front !== null) {
        if (Math.abs(cos) < 1e-6) {
          if (cx - v * sin > front) continue;
        } else {
          const uFront = (front - cx + v * sin) / cos;
          if (cos > 0) b = Math.min(b, uFront);
          else a = Math.max(a, uFront);
          if (b - a < step) continue;
        }
      }

      // Where the span sits in the frame. The coherent drifts read it to know
      // which way to push, and the weighting effects to know how hard.
      const mx = cx + ((a + b) / 2) * cos - v * sin;
      const my = cy + ((a + b) / 2) * sin + v * cos;
      const nx = (mx - box.x) / box.width;
      const ny = (my - box.y) / box.height;

      // Scatter slides the whole span along its own rule, so a line assembles
      // from pieces sliding into place rather than dissolving. Wave is the one
      // that also lifts it off its row — a rule that can only slide along
      // itself cannot undulate.
      let row = v;
      const drift = scatterOffset(fx, j, s, gap, nx, ny);
      if (drift !== NO_DRIFT) {
        if (acrossRule) {
          // The drift is a direction in the frame; the span lives in the
          // rotated one, so it has to be turned before it can be added.
          a += drift[0] * cos + drift[1] * sin;
          b += drift[0] * cos + drift[1] * sin;
          row += -drift[0] * sin + drift[1] * cos;
        } else {
          a += drift[0];
          b += drift[0];
        }
      }

      let width = thickness;
      if (weighsMarks(fx)) width = Math.max(0.05, thickness * markWeight(fx, nx, ny));

      parts.push(
        renderSpan({
          a, b, v: row, offset, cx, cy, cos, sin, gap, wave, tonal, tone, thickness,
          width: perSpan && !tonal ? width : null,
        }),
      );
    }
  }

  const dashAttr = dash > 0 ? ` stroke-dasharray="${num(dash)} ${num(dash)}"` : '';
  const widthAttr = perSpan ? '' : ` stroke-width="${num(thickness)}"`;
  return (
    `<g transform="rotate(${num(angle)} ${num(cx)} ${num(cy)})" fill="none" stroke="${color}" ` +
    `stroke-linecap="${cap}"${widthAttr}${dashAttr}>${parts.join('')}</g>`
  );
}

function renderSpan({ a, b, v, offset, cx, cy, cos, sin, gap, wave, tonal, tone, thickness, width }) {
  const w = width === null || width === undefined ? '' : ` stroke-width="${num(width)}"`;
  // Tonal: cut the span into cells and weight each by the local darkness.
  if (tonal) {
    const cells = Math.max(1, Math.round((b - a) / gap));
    const size = (b - a) / cells;
    const out = [];
    for (let i = 0; i < cells; i++) {
      const ua = a + i * size;
      const mid = ua + size / 2;
      const vv = offset(mid, v);
      const ink = tone.average(cx + mid * cos - vv * sin, cy + mid * sin + vv * cos, size);
      if (ink <= 0.02) continue;
      const y = num(cy + vv);
      out.push(
        `<line x1="${num(cx + ua)}" y1="${y}" x2="${num(cx + ua + size)}" y2="${y}" ` +
          `stroke-width="${num(thickness * ink)}"/>`,
      );
    }
    return out.join('');
  }

  if (wave) {
    const steps = Math.max(2, Math.min(80, Math.round((b - a) / 6)));
    const points = [];
    for (let s = 0; s <= steps; s++) {
      const u = a + ((b - a) * s) / steps;
      points.push(`${num(cx + u)} ${num(cy + offset(u, v))}`);
    }
    return `<path d="M${points.join('L')}"${w}/>`;
  }

  const y = num(cy + v);
  return `<line x1="${num(cx + a)}" y1="${y}" x2="${num(cx + b)}" y2="${y}"${w}/>`;
}

/**
 * Concentric rings, measured as arcs the same way hatch measures spans — so
 * they get the same round caps, the same endpoint nudge, and the same refusal
 * to snap a ring in two over a sliver of counter.
 */
export function rings({
  geo,
  spacing,
  thickness,
  phase = 0,
  noise = 0,
  continuity = 8,
  cap = 'butt',
  dash = 0,
  seed = 1,
  fx = STILL,
  color,
}) {
  const { box, tone } = geo;
  const floor = geo.floor ?? 0.5;
  const front = fx.wipe !== null ? box.x + fx.wipe * box.width : null;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const reach = Math.hypot(box.width, box.height) / 2;
  const count = Math.min(400, Math.ceil(reach / spacing));

  const parts = [];
  const point = (r, t) => `${num(cx + r * Math.cos(t))} ${num(cy + r * Math.sin(t))}`;

  for (let i = 0; i <= count; i++) {
    if (fx.build < 1 && i / (count + 1) > fx.build) continue;
    const r = (i + phase) * spacing;
    if (r <= 0.5 || r > reach + spacing) continue;

    // Constant arc-length steps, so a big ring is sampled as finely as a small one.
    const stepArc = Math.min(2.5, Math.max(0.9, spacing / 3));
    const steps = Math.max(24, Math.min(1400, Math.ceil((2 * Math.PI * r) / stepArc)));
    const dt = (2 * Math.PI) / steps;

    const spans = [];
    let open = null;
    for (let s = 0; s <= steps; s++) {
      const t = s * dt;
      const ink = tone.average(cx + r * Math.cos(t), cy + r * Math.sin(t), stepArc);
      if (ink >= floor && s < steps) {
        if (open === null) open = t;
      } else if (open !== null) {
        spans.push([open, t]);
        open = null;
      }
    }
    if (!spans.length) continue;

    // A ring wraps, so a span touching 0 and one touching 2π are one span.
    if (
      spans.length > 1 &&
      spans[0][0] <= dt * 0.5 &&
      spans[spans.length - 1][1] >= 2 * Math.PI - dt * 1.5
    ) {
      spans[0][0] = spans[spans.length - 1][0] - 2 * Math.PI;
      spans.pop();
    }

    const bridge = continuity / r; // arc length -> radians
    const merged = [spans[0]];
    for (let s = 1; s < spans.length; s++) {
      const last = merged[merged.length - 1];
      if (spans[s][0] - last[1] <= bridge) last[1] = spans[s][1];
      else merged.push(spans[s]);
    }

    for (let s = 0; s < merged.length; s++) {
      let [a, b] = merged[s];
      if ((b - a) * r < continuity * 0.5) continue;
      if (noise) {
        const nudge = (noise * 18) / r;
        a += (hashRandom(i, s, seed) - 0.5) * 2 * nudge;
        b += (hashRandom(i, s, seed + 733) - 0.5) * 2 * nudge;
        if (b <= a) continue;
      }
      // An arc cannot be cut at an arbitrary x cheaply, so a wipe takes it
      // whole or not at all, judged at its midpoint.
      const midX = cx + r * Math.cos((a + b) / 2);
      if (front !== null && midX > front) continue;

      let w = '';
      if (weighsMarks(fx)) {
        const midY = cy + r * Math.sin((a + b) / 2);
        const gain = markWeight(fx, (midX - box.x) / box.width, (midY - box.y) / box.height);
        w = ` stroke-width="${num(Math.max(0.05, thickness * gain))}"`;
      }

      if (b - a >= 2 * Math.PI - dt) {
        parts.push(`<circle cx="${num(cx)}" cy="${num(cy)}" r="${num(r)}"${w}/>`);
      } else {
        const large = b - a > Math.PI ? 1 : 0;
        parts.push(
          `<path d="M${point(r, a)}A${num(r)} ${num(r)} 0 ${large} 1 ${point(r, b)}"${w}/>`,
        );
      }
    }
  }

  const dashAttr = dash > 0 ? ` stroke-dasharray="${num(dash)} ${num(dash)}"` : '';
  return (
    `<g fill="none" stroke="${color}" stroke-width="${num(thickness)}" ` +
    `stroke-linecap="${cap}"${dashAttr}>${parts.join('')}</g>`
  );
}

/**
 * Quantises the source to a grid of on/off cells with optional dithering.
 *
 * Against a letterform this is a plain threshold. Against a photograph, error
 * diffusion is what keeps the greys alive at one bit per cell.
 */
/** Reads a raw field (cols/rows/values) the way tone.average reads a shape. */
function sampleField(field, x, y) {
  const c = Math.floor(((x - field.box.x) / field.box.width) * field.cols);
  const r = Math.floor(((y - field.box.y) / field.box.height) * field.rows);
  if (c < 0 || r < 0 || c >= field.cols || r >= field.rows) return 0;
  return field.values[r * field.cols + c] / 255;
}

/**
 * @param field optional grid to quantise instead of the glyph's own tone —
 *              which is how a blurred copy gets dithered rather than the
 *              letterform itself
 */
export function ditherCells(geo, requested, method = 'none', fx = STILL, field = null, angle = 0) {
  const { box, tone } = geo;
  const floor = field ? 0.02 : (geo.floor ?? 0.5);
  const cell = budget(requested, box.width, box.height);

  /**
   * Turning the screen.
   *
   * The grid stays axis-aligned and the *sampling* rotates: each cell asks the
   * tone field where it would be if the whole screen were turned, and the
   * caller then turns the drawing to match with one group transform. Rotating
   * the grid itself instead would mean rotating the dither too, and Floyd's
   * error diffusion is defined on rows and columns — pushing error into a
   * neighbour that is no longer to the right of you is a different algorithm.
   *
   * The grid grows to the diagonal so a turned screen still covers the corners
   * of the frame it is turned inside.
   */
  const turn = ((angle || 0) * Math.PI) / 180;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const span = turn ? Math.hypot(box.width, box.height) : 0;
  const width = turn ? span : box.width;
  const height = turn ? span : box.height;
  const originX = turn ? cx - span / 2 : box.x;
  const originY = turn ? cy - span / 2 : box.y;

  const cols = Math.max(1, Math.ceil(width / cell));
  const rows = Math.max(1, Math.ceil(height / cell));

  const weighted = weighsMarks(fx);
  const ink = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lx = originX + (c + 0.5) * cell;
      const ly = originY + (r + 0.5) * cell;
      // Where this cell lands once the screen is turned.
      const x = turn ? cx + (lx - cx) * cos - (ly - cy) * sin : lx;
      const y = turn ? cy + (lx - cx) * sin + (ly - cy) * cos : ly;
      let value = field ? sampleField(field, x, y) : tone.average(x, y, cell);
      // The waves weight the greys *before* they are quantised, so they show
      // up as blocks lighting and dropping out rather than resizing.
      if (weighted) {
        const nx = (x - box.x) / box.width;
        const ny = (y - box.y) / box.height;
        value = Math.min(1, value * markWeight(fx, nx, ny));
      }
      ink[r * cols + c] = value;
    }
  }

  const wipeCol = fx.wipe === null ? Infinity : fx.wipe * cols;
  const on = [];
  const reveal = (c, r) =>
    c <= wipeCol && (fx.build >= 1 || hashRandom(c, r, fx.reveal) <= fx.build);

  if (method === 'floyd') {
    // Floyd–Steinberg: push each cell's rounding error into its neighbours.
    // The diffusion runs over every cell regardless of the build, so revealing
    // never changes the pattern the finished frame settles into.
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const value = ink[i];
        const lit = value >= 0.5;
        if (lit && reveal(c, r)) on.push([c, r, 1]);
        const error = value - (lit ? 1 : 0);
        if (c + 1 < cols) ink[i + 1] += (error * 7) / 16;
        if (r + 1 < rows) {
          if (c > 0) ink[i + cols - 1] += (error * 3) / 16;
          ink[i + cols] += (error * 5) / 16;
          if (c + 1 < cols) ink[i + cols + 1] += error / 16;
        }
      }
    }
  } else if (method === 'bayer') {
    // 4x4 ordered dither — the crosshatched, screen-printed look.
    const M = [
      [0, 8, 2, 10],
      [12, 4, 14, 6],
      [3, 11, 1, 9],
      [15, 7, 13, 5],
    ];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (ink[r * cols + c] > (M[r % 4][c % 4] + 0.5) / 16 && reveal(c, r)) on.push([c, r, 1]);
      }
    }
  } else {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const value = ink[r * cols + c];
        // `size` keeps the grey rather than quantising it: every cell that has
        // any ink is drawn, and how much it has decides how big. It is the one
        // response here that is not a dither, and it is what a lattice of
        // squares scaled by darkness has always been.
        if (method === 'size') {
          if (value > 0.02 && reveal(c, r)) on.push([c, r, Math.min(1, value)]);
        } else if (value >= floor && reveal(c, r)) {
          on.push([c, r, 1]);
        }
      }
    }
  }

  return { cell, cols, rows, cells: on, originX, originY, angle: angle || 0, cx, cy };
}
