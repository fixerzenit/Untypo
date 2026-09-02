import { PATTERNS } from './patterns/index.js';

/**
 * Weight and tracking shape the silhouette itself rather than the fill, so
 * every style shares one setting instead of carrying its own copy — which is
 * the app's premise anyway: one word, many fills.
 *
 * They surface on the toolbar and on the Solid card, since Solid *is* the
 * silhouette. The effect cards inherit them and do not repeat the controls.
 *
 * `kind: 'weight'` tells the UI to snap the slider to the weights the chosen
 * family actually ships — static fonts have no in-between.
 */
export const TYPE_PARAMS = [
  { key: 'weight', label: 'Font weight', kind: 'weight', def: 900 },
  { key: 'tracking', label: 'Tracking', min: -60, max: 400, step: 5, def: 0 },
  // Only meaningful once there is a second line, so they stay out of the way
  // until one exists — see typeParamsFor().
  {
    key: 'leading',
    label: 'Leading',
    min: 0.6,
    max: 2.4,
    step: 0.05,
    def: 1.15,
    unit: 'em',
    multiline: true,
  },
  {
    key: 'align',
    label: 'Align',
    kind: 'select',
    def: 'left',
    multiline: true,
    options: [
      { value: 'left', label: 'Left' },
      { value: 'center', label: 'Centre' },
      { value: 'right', label: 'Right' },
    ],
  },
];

/** Leading and alignment appear only once the text actually has two lines. */
export function typeParamsFor(text) {
  const multiline = typeof text === 'string' && text.includes('\n');
  return multiline ? TYPE_PARAMS : TYPE_PARAMS.filter((p) => !p.multiline);
}

export const DEFAULT_TYPE = Object.fromEntries(TYPE_PARAMS.map((p) => [p.key, p.def]));

export function paramsFor(pattern) {
  return pattern.params;
}

/** `{ [patternId]: { ...patternParams } }` */
export function defaultParams() {
  const state = {};
  for (const pattern of PATTERNS) {
    state[pattern.id] = Object.fromEntries(pattern.params.map((p) => [p.key, p.def]));
  }
  return state;
}

/**
 * How far a shuffled value may wander from the default, as a fraction of the
 * slider's range.
 *
 * A shuffle should hand back a different look, not a broken one, and the two
 * ends of a slider are exactly where a pattern stops describing the word:
 * spacing so coarse the letters lose their edges, marks so fine the page reads
 * as blank, a stroke so heavy the counters fill in. Sampling uniformly hands
 * those back as often as anything else — and at ten rolls a pattern that is a
 * near certainty. Reaching a little under half the range from a value that was
 * chosen to work keeps every roll legible while still covering most of what
 * the slider can say.
 */
const SHUFFLE_REACH = 0.42;

/** Fresh values for a card's pattern-specific sliders. Leaves type params be. */
export function randomizeParams(pattern, current) {
  const next = { ...current };
  for (const p of pattern.params) {
    // Some controls guard quality rather than express a look — rolling
    // Continuity down to 0 would just hand back the broken-line artefact.
    if (p.stable) continue;
    if (p.kind === 'select') {
      next[p.key] = p.options[Math.floor(Math.random() * p.options.length)].value;
      continue;
    }

    const steps = Math.floor((p.max - p.min) / p.step);
    let t;
    if (p.free) {
      // A seed only picks which arrangement you get, never how readable it is.
      t = Math.random();
    } else {
      // Two uniforms averaged make a triangle peaked at their middle; centring
      // that on the default puts most rolls near it and none beyond the reach.
      const home = (p.def - p.min) / (p.max - p.min);
      const wander = ((Math.random() + Math.random()) / 2 - 0.5) * 2 * SHUFFLE_REACH;
      t = Math.min(1, Math.max(0, home + wander));
    }

    const value = p.min + Math.round(t * steps) * p.step;
    next[p.key] = Math.round(value * 1000) / 1000;
  }
  return next;
}

/** Human-readable slider value: "32%", "45°", "solid", "700". */
export function formatValue(param, value) {
  if (param.zeroLabel && value === 0) return param.zeroLabel;
  if (param.ratio) return `${Math.round(value * 100)}%`;
  const rounded = Math.round(value * 100) / 100;
  return `${rounded}${param.unit ?? ''}`;
}

/**
 * The value a pattern's animated slider takes at time `t` (0..1 through one
 * loop). `wrap` runs straight through and jumps back — right for anything
 * cyclic like an angle or a phase. `pingpong` eases out and back, for
 * quantities with no natural wrap-around such as a radius.
 */
export function motionValue(motion, t) {
  const cycle = motion.loop === 'pingpong' ? (1 - Math.cos(t * Math.PI * 2)) / 2 : t % 1;
  return motion.from + (motion.to - motion.from) * cycle;
}

/** Params with the animated slider overridden for this instant. */
export function animateParams(pattern, params, t) {
  if (!pattern.motion) return params;
  return { ...params, [pattern.motion.key]: motionValue(pattern.motion, t) };
}

