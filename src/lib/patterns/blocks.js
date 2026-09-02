/**
 * The word rebuilt from a builder's yard.
 *
 * Every other lattice style here stamps one motif and lets its size carry the
 * tone. This chooses instead: each cell is filled with whichever primitive from
 * a small architectural vocabulary — bar, half, quarter round, disc, wedge —
 * best matches the ink actually under it.
 *
 * Which is the interesting part. A cell is sampled in quarters, and the four
 * answers are matched against what each primitive covers: a cell inked only on
 * its left half wants a half-bar, one inked in three quarters wants a quarter
 * round with the bite out of the empty corner, one inked evenly wants the full
 * square. So the letters are not approximated by a grid of squares with a
 * stair-stepped edge — the vocabulary contains the diagonals and the curves,
 * and the fit puts them where they belong. The result reads as a letterform
 * assembled out of parts rather than as one sampled onto a grid.
 */

import { hashRandom, irisHides, scatterOffset } from './helpers.js';
import { markWeight, weighsMarks } from '../motion.js';

/**
 * The vocabulary, plainest first — which is what a tie resolves to: given a
 * choice between a square and a disc for the same coverage, a builder reaches
 * for the square.
 *
 * Each piece draws itself into a cell at (x, y) of side s, and that is the only
 * thing written down about it. What it *covers* is measured off the drawing
 * (see `coverage`) rather than declared alongside it, because the first version
 * did declare it and three of the fourteen entries disagreed with their own
 * geometry — a quarter round with the bite in the wrong corner matches cells it
 * does not fit. Adding a piece here now needs nothing else.
 */
const PIECES = [
  (x, y, s) => `M${x} ${y}h${s}v${s}h${-s}z`,
  // Half bars, one per side.
  (x, y, s) => `M${x} ${y}h${s / 2}v${s}h${-s / 2}z`,
  (x, y, s) => `M${x + s / 2} ${y}h${s / 2}v${s}h${-s / 2}z`,
  (x, y, s) => `M${x} ${y}h${s}v${s / 2}h${-s}z`,
  (x, y, s) => `M${x} ${y + s / 2}h${s}v${s / 2}h${-s}z`,
  // Quarter rounds — a pie wedge with its point in one corner, the arc swung
  // through the far one. Absolute arcs, and the sweep flag chosen by measuring
  // the result: with `large-arc` off both flags give a 90° arc, and the wrong
  // one puts the centre in the opposite corner, so the piece bulges out of its
  // own cell instead of filling it.
  (x, y, s) => `M${x} ${y + s}L${x} ${y}A${s} ${s} 0 0 1 ${x + s} ${y + s}Z`,
  (x, y, s) => `M${x + s} ${y + s}L${x + s} ${y}A${s} ${s} 0 0 0 ${x} ${y + s}Z`,
  (x, y, s) => `M${x} ${y}L${x + s} ${y}A${s} ${s} 0 0 1 ${x} ${y + s}Z`,
  (x, y, s) => `M${x + s} ${y}L${x + s} ${y + s}A${s} ${s} 0 0 1 ${x} ${y}Z`,
  // Wedges, one corner cut off each time.
  (x, y, s) => `M${x} ${y}h${s}L${x} ${y + s}z`,
  (x, y, s) => `M${x + s} ${y}v${s}h${-s}z`,
  (x, y, s) => `M${x} ${y}h${s}v${s}z`,
  (x, y, s) => `M${x} ${y}v${s}h${s}z`,
  // Half discs, flat against each edge in turn.
  (x, y, s) => `M${x} ${y}h${s}A${s / 2} ${s / 2} 0 0 1 ${x} ${y}Z`,
  (x, y, s) => `M${x} ${y + s}h${s}A${s / 2} ${s / 2} 0 0 0 ${x} ${y + s}Z`,
  (x, y, s) => `M${x} ${y}v${s}A${s / 2} ${s / 2} 0 0 0 ${x} ${y}Z`,
  (x, y, s) => `M${x + s} ${y}v${s}A${s / 2} ${s / 2} 0 0 1 ${x + s} ${y}Z`,
  // A disc, for a cell inked in the middle and shy at every corner.
  (x, y, s) =>
    `M${x} ${y + s / 2}a${s / 2} ${s / 2} 0 1 0 ${s} 0a${s / 2} ${s / 2} 0 1 0 ${-s} 0z`,
];

let covers = null;

/**
 * What each piece covers of the four quarters — [top-left, top-right,
 * bottom-right, bottom-left], the same order the cell is sampled in.
 *
 * Measured by drawing each piece once into a 32×32 canvas and counting alpha,
 * so a curve contributes the area it actually has rather than a guess at it.
 * Once per session, and only when a block is first drawn.
 */
function coverage() {
  if (covers) return covers;
  const n = 32;
  const canvas = document.createElement('canvas');
  canvas.width = n;
  canvas.height = n;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const full = (n / 2) * (n / 2) * 255;

  covers = PIECES.map((draw) => {
    ctx.clearRect(0, 0, n, n);
    ctx.fill(new Path2D(draw(0, 0, n)));
    const { data } = ctx.getImageData(0, 0, n, n);
    const sums = [0, 0, 0, 0];
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const quarter = r < n / 2 ? (c < n / 2 ? 0 : 1) : c < n / 2 ? 3 : 2;
        sums[quarter] += data[(r * n + c) * 4 + 3];
      }
    }
    return sums.map((sum) => sum / full);
  });
  return covers;
}

/**
 * Two decimals, as a number.
 *
 * The pieces do arithmetic on what they are handed — `s / 2`, `y + s` — so they
 * have to be given numbers. Handing them the strings `num` returns turns
 * `${y + s / 2}` into concatenation, and a path that begins `M10.86 -151.4414.1`
 * draws nothing at all.
 */
const round = (v) => Math.round(v * 100) / 100;

export function blockMarks({ geo, spacing, scale, variety, seed, color, fx }) {
  const { box, tone } = geo;
  const floor = geo.floor ?? 0.5;
  const cell = Math.max(3, spacing);
  const cols = Math.max(1, Math.ceil(box.width / cell));
  const rows = Math.max(1, Math.ceil(box.height / cell));
  const front = fx.wipe !== null ? box.x + fx.wipe * box.width : null;
  const weighted = weighsMarks(fx);
  const shapes = coverage();
  const pool = Math.max(1, Math.min(shapes.length, Math.round(variety)));
  const parts = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = box.x + c * cell;
      const y = box.y + r * cell;
      const q = cell / 4;
      // The four quarters, which are what the vocabulary is matched against.
      const seen = [
        tone.average(x + q, y + q, cell / 2),
        tone.average(x + cell - q, y + q, cell / 2),
        tone.average(x + cell - q, y + cell - q, cell / 2),
        tone.average(x + q, y + cell - q, cell / 2),
      ];
      // Barely-touched cells get nothing. Every piece in the yard fills at
      // least a quarter of its cell, so answering a trace of ink with one
      // thickens the letter rather than describing it.
      const ink = (seen[0] + seen[1] + seen[2] + seen[3]) / 4;
      if (ink < floor * 0.36) continue;

      if (fx.build < 1 && hashRandom(c, r, fx.reveal) > fx.build) continue;
      const nx = (x + cell / 2 - box.x) / box.width;
      const ny = (y + cell / 2 - box.y) / box.height;
      if (front !== null && x + cell / 2 > front) continue;
      if (irisHides(fx, nx, ny)) continue;

      let best = 0;
      let bestError = Infinity;
      for (let i = 0; i < pool; i++) {
        let error = 0;
        for (let k = 0; k < 4; k++) error += (seen[k] - shapes[i][k]) ** 2;
        // Nudged by the hash so two cells with identical coverage do not always
        // reach for the same piece — a wall built entirely of one brick.
        error += hashRandom(c, r, seed + i) * 0.04;
        if (error < bestError) {
          bestError = error;
          best = i;
        }
      }

      let size = cell * scale;
      if (weighted) size *= Math.max(0.05, markWeight(fx, nx, ny));
      if (size < 0.3) continue;
      const inset = (cell - size) / 2;
      const drift = scatterOffset(fx, c, r, cell, nx, ny);
      parts.push(
        PIECES[best](round(x + inset + drift[0]), round(y + inset + drift[1]), round(size)),
      );
    }
  }

  if (!parts.length) return '';
  return `<path d="${parts.join('')}" fill="${color}"/>`;
}

/** The vocabulary itself, so it can be laid out and looked at. */
