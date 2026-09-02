/**
 * Motion.
 *
 * `loop` drives a pattern's own marked slider from the clock. Every other mode
 * leaves the sliders alone and acts on the marks themselves, which is why they
 * work on every style without a pattern opting in: the generators in
 * patterns/helpers.js all read the same effect object.
 */
export const MOTION_MODES = [
  { value: 'loop', label: 'Loop', hint: "Cycles each card's marked slider" },
  { value: 'build', label: 'Build', hint: 'Draws in, mark by mark' },
  { value: 'wipe', label: 'Wipe', hint: 'Sweeps a front across the frame' },
  { value: 'ripple', label: 'Ripple', hint: 'A wave of weight travels sideways' },
  { value: 'radial', label: 'Radial', hint: 'The wave spreads out from the centre' },
  { value: 'bloom', label: 'Bloom', hint: 'Everything swells up from nothing' },
  { value: 'scatter', label: 'Scatter', hint: 'Marks fly in and settle into place' },
  { value: 'iris', label: 'Iris', hint: 'Opens outward from the centre' },
  { value: 'orbit', label: 'Orbit', hint: 'Every mark circles the spot it belongs to' },
  { value: 'jitter', label: 'Jitter', hint: 'Everything vibrates where it stands' },
  { value: 'glitch', label: 'Glitch', hint: 'Bands tear sideways and snap back' },
  { value: 'twinkle', label: 'Twinkle', hint: 'Marks blink out and back, never the same ones' },
  { value: 'flicker', label: 'Flicker', hint: 'The whole sign gutters, the way a failing tube does' },
  { value: 'wave', label: 'Wave', hint: 'The marks themselves undulate, like cloth' },
];

/**
 * Timing curves, as CSS-style cubic-beziers.
 *
 * Linear is the only one that leaves the loop seamless: the others change speed
 * across the cycle, so a mode that wraps rather than settles will visibly jolt
 * at the seam. That is a legitimate look, so the choice is left open rather
 * than locked down.
 */
export const EASINGS = [
  // Named without the word "Ease", which the control beside them already says.
  // It also happens to be what makes them fit: "Ease in-out" wanted sixteen
  // pixels more than a quarter of a 375px row could give it, and was reading
  // as an ellipsis on every phone.
  { value: 'linear', label: 'Linear', curve: null },
  { value: 'smooth', label: 'In-out', curve: [0.42, 0, 0.58, 1] },
  { value: 'out', label: 'Out', curve: [0.16, 1, 0.3, 1] },
  { value: 'spring', label: 'Spring', curve: [0.34, 1.56, 0.64, 1] },
];

const TAU = Math.PI * 2;

/** Nothing moving: everything drawn, nothing modulated, nothing displaced. */
export const STILL = {
  build: 1,
  /**
   * The seed the reveal draws its order from.
   *
   * Build shuffles marks with a fixed seed so that the frame it settles on is
   * the same one the pattern draws standing still. Twinkle wants the opposite
   * — the same *share* of marks each frame but a different selection — and it
   * gets that by moving this instead of the share. Every generator already
   * consults it, so twinkling cost no generator any code.
   */
  reveal: 4242,
  wipe: null,
  ripple: null,
  radial: null,
  bloom: null,
  scatter: null,
  iris: null,
  orbit: null,
  jitter: null,
  glitch: null,
  flicker: null,
  wave: null,
};

/**
 * Evaluates a cubic-bezier at `t`.
 *
 * The curve is parametric, so the x that matches `t` has to be solved for
 * before y can be read. Newton-Raphson converges in a few steps here because
 * the curves are all monotonic in x.
 */
function bezier(t, [x1, y1, x2, y2]) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;

  const ax = 3 * x1 - 3 * x2 + 1;
  const bx = 3 * x2 - 6 * x1;
  const cx = 3 * x1;
  const ay = 3 * y1 - 3 * y2 + 1;
  const by = 3 * y2 - 6 * y1;
  const cy = 3 * y1;

  const xAt = (u) => ((ax * u + bx) * u + cx) * u;
  const slopeAt = (u) => (3 * ax * u + 2 * bx) * u + cx;

  let u = t;
  for (let i = 0; i < 6; i++) {
    const slope = slopeAt(u);
    if (Math.abs(slope) < 1e-6) break;
    const next = u - (xAt(u) - t) / slope;
    if (Math.abs(next - u) < 1e-6) {
      u = next;
      break;
    }
    u = next;
  }
  return ((ay * u + by) * u + cy) * u;
}

export function applyEasing(t, easing) {
  const curve = EASINGS.find((e) => e.value === easing)?.curve;
  return curve ? bezier(t, curve) : t;
}

/** Reaches the end at 80% of the cycle and holds, so the finished frame lands. */
const settle = (t) => Math.min(1, t / 0.8);

export function motionEffect(mode, phase, easing = 'linear') {
  const t = applyEasing(phase % 1, easing);
  switch (mode) {
    case 'build':
      return { ...STILL, build: settle(t) };
    case 'wipe':
      return { ...STILL, wipe: settle(t) };
    case 'ripple':
      return { ...STILL, ripple: t };
    case 'radial':
      return { ...STILL, radial: t };
    case 'bloom':
      return { ...STILL, bloom: settle(t) };
    case 'scatter':
      // Starts fully displaced and converges, so the artwork assembles.
      return { ...STILL, scatter: 1 - settle(t) };
    case 'iris':
      return { ...STILL, iris: settle(t) };
    case 'orbit':
      // Each mark travels a small circle around its own cell, starting from
      // its own angle — so the field churns without anything leaving home.
      return { ...STILL, orbit: t };
    case 'jitter':
      // Quantised so the shake lands on discrete frames instead of sliding,
      // which is what makes it read as vibration rather than drift.
      return { ...STILL, jitter: Math.floor(t * 24) };
    case 'flicker':
      // Twinkle changes *which* marks show; this changes how strongly all of
      // them do, together. Mostly lit with occasional dropouts rather than an
      // even wobble — a tube that is failing spends most of its time fine.
      {
        const tick = Math.floor(t * 26);
        const roll = ((tick * 2654435761) >>> 0) / 4294967296;
        const level = roll > 0.82 ? 0.12 + roll * 0.25 : 0.86 + roll * 0.16;
        return { ...STILL, flicker: Math.min(1.15, level) };
      }
    case 'twinkle':
      // A fixed share showing, a different selection each tick. Quantised so
      // marks hold long enough to be seen rather than dissolving into hiss.
      return { ...STILL, build: 0.72, reveal: 4242 + Math.floor(t * 18) * 9973 };
    case 'wave':
      // Position, not weight — which is the whole difference from Ripple. That
      // one leaves the marks where they are and changes how heavy they draw;
      // this leaves them exactly as heavy and moves them, so the field reads as
      // a surface being disturbed rather than a pattern being modulated.
      return { ...STILL, wave: t };
    case 'glitch':
      // Quantised like jitter, and for the same reason — but coarser, because
      // a tear that resolves every frame reads as static rather than as
      // damage. Sixteen states per cycle leaves each one on screen long
      // enough to register before the next one replaces it.
      return { ...STILL, glitch: Math.floor(t * 16) };
    default:
      return STILL;
  }
}

/**
 * Weight multiplier for the travelling waves.
 *
 * Whole cycles across the frame mean the wave meets itself at the edges, so one
 * loop of the phase returns exactly to the start and an exported clip repeats
 * with no seam.
 */
const CYCLES = 2;
const DEPTH = 0.7;

export function rippleGain(norm, phase) {
  return 1 + DEPTH * Math.sin((norm * CYCLES - phase) * TAU);
}

/** The same wave, but spreading outward from the middle of the frame. */
export function radialGain(nx, ny, phase) {
  // The frame is usually much wider than it is tall; squashing y keeps the
  // wavefront reading as a circle rather than a flattened ellipse.
  const dx = (nx - 0.5) * 2;
  const dy = (ny - 0.5) * 2;
  const distance = Math.min(1, Math.hypot(dx, dy * 0.55));
  return 1 + DEPTH * Math.sin((distance * CYCLES - phase) * TAU);
}

/** Everything the weighting effects contribute, combined. */
export function markWeight(fx, nx, ny) {
  let weight = 1;
  if (fx.ripple !== null) weight *= rippleGain(nx, fx.ripple);
  if (fx.radial !== null) weight *= radialGain(nx, ny, fx.radial);
  if (fx.bloom !== null) weight *= fx.bloom;
  if (fx.flicker !== null) weight *= fx.flicker;
  return weight;
}

/**
 * How far a mark sits from where it belongs, as a fraction of its cell.
 *
 * Scatter converges on zero so the artwork assembles; jitter never settles,
 * and changes its offsets on a quantised tick so it vibrates rather than
 * drifts. Wave is coherent instead of random — neighbouring marks move
 * together, which is what separates a disturbance from noise. All of them are
 * answered here so a generator only asks once.
 */
export function driftAmount(fx) {
  if (fx.scatter !== null && fx.scatter > 0) return { kind: 'random', reach: fx.scatter * 7, seed: 77 };
  if (fx.jitter !== null) return { kind: 'random', reach: 0.35, seed: 77 + fx.jitter * 13 };
  if (fx.orbit !== null) return { kind: 'orbit', reach: 0.3, phase: fx.orbit, seed: 55 };
  if (fx.wave !== null) return { kind: 'wave', reach: 1.1, phase: fx.wave };
  if (fx.glitch !== null) return { kind: 'glitch', reach: 4, tick: fx.glitch };
  return null;
}

/**
 * Horizontal bands the glitch tears along.
 *
 * Few enough that a torn band is a recognisable slab of the artwork rather
 * than a scanline — the damage has to be legible as damage.
 */
export const GLITCH_BANDS = 14;

/** How many bands tear at once. Most of the frame has to stay put to read as a fault. */
export const GLITCH_SHARE = 0.3;

/** True when any effect needs a per-element weight rather than a group-level one. */
export function weighsMarks(fx) {
  return fx.ripple !== null || fx.radial !== null || fx.bloom !== null || fx.flicker !== null;
}
