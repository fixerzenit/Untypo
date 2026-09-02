/**
 * A different fill for every letter.
 *
 * Assorted picks a shape per *cell*, which gives an even confetti across the
 * whole word. This picks a fill per *letter*: the h is checkerboard, the a is
 * a grid of discs, the l is barred, and the change happens at the letter
 * boundary rather than at random. It is what makes a modular specimen read as
 * a set of related designs instead of as one texture — you see the system by
 * seeing it applied several ways at once.
 *
 * Finding the letters costs nothing clever. Ink is summed down each column of
 * the frame, and a run of columns with ink in them is a letter; the gaps
 * between words and between letters are the same gaps a reader uses. It is
 * wrong exactly where a reader would also be wrong — a kerned `Vo`, a script
 * with joins — and in those cases it simply treats the joined pair as one
 * letter, which is a reasonable thing to look at rather than a failure.
 */

import { hashRandom, irisHides, num, scatterOffset } from './helpers.js';
import { markWeight, weighsMarks } from '../motion.js';

/**
 * The fills, plainest first.
 *
 * Each draws itself inside a cell at (x, y) of side s, given the row and
 * column so the ones that alternate can. Ordered so that turning `variety`
 * down leaves the simplest of them rather than an arbitrary subset.
 *
 * The set is deliberately short of near-misses. Two designs that differ by a
 * few per cent of coverage read as one design drawn twice, and a specimen
 * whose whole subject is *variation* cannot afford that — every entry here has
 * to be namable across a room. The ones that carry the reference are the
 * checkerboard, the four-cornered star, and bars running both ways; the rest
 * are there so a long word does not repeat.
 */
const FILLS = [
  // Solid.
  (x, y, s) => `M${x} ${y}h${s}v${s}h${-s}z`,
  // Vertical bars.
  (x, y, s) => `M${x + s * 0.12} ${y}h${s * 0.34}v${s}h${-s * 0.34}z` +
    `M${x + s * 0.58} ${y}h${s * 0.34}v${s}h${-s * 0.34}z`,
  // Horizontal bars.
  (x, y, s) => `M${x} ${y + s * 0.12}h${s}v${s * 0.34}h${-s}z` +
    `M${x} ${y + s * 0.58}h${s}v${s * 0.34}h${-s}z`,
  // Checkerboard.
  (x, y, s, r, c) =>
    (r + c) % 2
      ? `M${x} ${y}h${s / 2}v${s / 2}h${-s / 2}z M${x + s / 2} ${y + s / 2}h${s / 2}v${s / 2}h${-s / 2}z`
      : `M${x + s / 2} ${y}h${s / 2}v${s / 2}h${-s / 2}z M${x} ${y + s / 2}h${s / 2}v${s / 2}h${-s / 2}z`,
  // A disc in the cell.
  (x, y, s) =>
    `M${x + s * 0.08} ${y + s / 2}a${s * 0.42} ${s * 0.42} 0 1 0 ${s * 0.84} 0` +
    `a${s * 0.42} ${s * 0.42} 0 1 0 ${-s * 0.84} 0z`,
  // The negative of that: a square with a round bite out of the middle, which
  // is the four-cornered star the reference is full of.
  (x, y, s) =>
    `M${x} ${y}h${s}v${s}h${-s}z` +
    `M${x + s * 0.06} ${y + s / 2}a${s * 0.44} ${s * 0.44} 0 1 1 ${s * 0.88} 0` +
    `a${s * 0.44} ${s * 0.44} 0 1 1 ${-s * 0.88} 0z`,
  // Half the cell, alternating side by row — a running bond.
  (x, y, s, r) =>
    r % 2 ? `M${x} ${y}h${s / 2}v${s}h${-s / 2}z` : `M${x + s / 2} ${y}h${s / 2}v${s}h${-s / 2}z`,
  // Two triangles meeting on the diagonal, alternating which way they lean.
  (x, y, s, r, c) =>
    (r + c) % 2
      ? `M${x} ${y}h${s}L${x} ${y + s}z`
      : `M${x + s} ${y}v${s}h${-s}z`,
  // A quarter-round, turning a step each cell, which reads as a woven curve
  // running through the letter rather than as a field of identical marks.
  (x, y, s, r, c) => {
    const turn = (r + c) % 4;
    const corners = [
      [x, y],
      [x + s, y],
      [x + s, y + s],
      [x, y + s],
    ];
    const [px, py] = corners[turn];
    const [ax, ay] = corners[(turn + 1) % 4];
    const [bx, by] = corners[(turn + 3) % 4];
    return `M${px} ${py}L${ax} ${ay}A${s} ${s} 0 0 1 ${bx} ${by}Z`;
  },
  // A ring.
  (x, y, s) =>
    `M${x + s * 0.06} ${y + s / 2}a${s * 0.44} ${s * 0.44} 0 1 0 ${s * 0.88} 0` +
    `a${s * 0.44} ${s * 0.44} 0 1 0 ${-s * 0.88} 0z` +
    `M${x + s * 0.24} ${y + s / 2}a${s * 0.26} ${s * 0.26} 0 1 1 ${s * 0.52} 0` +
    `a${s * 0.26} ${s * 0.26} 0 1 1 ${-s * 0.52} 0z`,
  // A cross.
  (x, y, s) =>
    `M${x + s * 0.34} ${y}h${s * 0.32}v${s * 0.34}h${s * 0.34}v${s * 0.32}h${-s * 0.34}` +
    `v${s * 0.34}h${-s * 0.32}v${-s * 0.34}h${-s * 0.34}v${-s * 0.32}h${s * 0.34}z`,
  // A diamond.
  (x, y, s) =>
    `M${x + s / 2} ${y}L${x + s} ${y + s / 2}L${x + s / 2} ${y + s}L${x} ${y + s / 2}z`,
];

/**
 * Where each letter starts and stops, from the ink's own column profile.
 *
 * A column counts as inked when *any* row in it carries ink, not when the
 * column average clears a threshold — an `l` is one stroke wide and would
 * never clear an average, and dropping it would merge the letters either side
 * of it into one.
 */
function letterBands(geo, resolution) {
  const { box, tone } = geo;
  const floor = geo.floor ?? 0.5;
  const columns = Math.max(16, Math.min(1200, Math.round(box.width / resolution)));
  const rowCount = 48;
  const step = box.width / columns;

  const inked = new Uint8Array(columns);
  for (let c = 0; c < columns; c++) {
    const x = box.x + (c + 0.5) * step;
    for (let r = 0; r < rowCount; r++) {
      const y = box.y + ((r + 0.5) / rowCount) * box.height;
      if (tone.average(x, y, step) >= floor * 0.6) {
        inked[c] = 1;
        break;
      }
    }
  }

  const bands = [];
  let start = -1;
  for (let c = 0; c <= columns; c++) {
    if (c < columns && inked[c]) {
      if (start < 0) start = c;
    } else if (start >= 0) {
      bands.push([box.x + start * step, box.x + c * step]);
      start = -1;
    }
  }
  return bands;
}

export function samplerMarks({ geo, spacing, variety, scale, change, weight, seed, color, fx }) {
  const { box, tone } = geo;
  const floor = geo.floor ?? 0.5;
  const cell = Math.max(3, spacing);
  const cols = Math.max(1, Math.ceil(box.width / cell));
  const rows = Math.max(1, Math.ceil(box.height / cell));
  const front = fx.wipe !== null ? box.x + fx.wipe * box.width : null;
  const weighted = weighsMarks(fx);
  const pool = Math.max(1, Math.min(FILLS.length, Math.round(variety)));
  const bands = letterBands(geo, cell * 0.4);
  const parts = [];

  /** Which letter a point belongs to, or -1 out in the margin. */
  const bandAt = (x) => {
    for (let i = 0; i < bands.length; i++) {
      if (x >= bands[i][0] && x < bands[i][1]) return i;
    }
    return -1;
  };

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = box.x + c * cell;
      const y = box.y + r * cell;
      const ink = tone.average(x + cell / 2, y + cell / 2, cell);
      if (ink < floor * 0.5) continue;

      const nx = (x + cell / 2 - box.x) / box.width;
      const ny = (y + cell / 2 - box.y) / box.height;
      if (front !== null && x + cell / 2 > front) continue;
      if (irisHides(fx, nx, ny)) continue;
      if (fx.build < 1 && hashRandom(c, r, fx.reveal) > fx.build) continue;

      // What the fill belongs to. Per letter is the specimen — you see the
      // system by seeing it applied several ways at once, and the change
      // happening at the letter boundary is what makes it a system rather than
      // a texture. Per word applies one design to the whole thing, which is
      // what you want when the design *is* the point; per cell is confetti,
      // and it is there because it is a different and useful kind of noise.
      const band = bandAt(x + cell / 2);
      const key = change === 'word' ? 0 : change === 'cell' ? c * 131 + r * 17 : Math.max(0, band);
      const pick = Math.floor(hashRandom(key, key * 3 + 1, seed) * pool + key * 0.37) % pool;

      let size = cell * scale;
      if (weighted) size *= Math.max(0.05, markWeight(fx, nx, ny));
      if (size < 0.4) continue;
      const inset = (cell - size) / 2;
      const drift = scatterOffset(fx, c, r, cell, nx, ny);

      parts.push(
        FILLS[pick](
          round(x + inset + drift[0]),
          round(y + inset + drift[1]),
          round(size),
          r,
          c,
        ),
      );
    }
  }

  if (!parts.length) return '';
  // Even-odd, because the fills that are a shape with a hole in it — the ring,
  // the bitten square — describe the hole as a second subpath in the same
  // direction. Nonzero would fill it back in.
  //
  // Outlined, the same paths are stroked instead. It is not a variation on the
  // filled version so much as the other half of the reference: a modular
  // alphabet reads as *drawn* when it is solid and as *engineered* when it is
  // a line, and both are in that specimen.
  const d = parts.join('');
  return weight > 0.01
    ? `<path d="${d}" fill="none" stroke="${color}" stroke-width="${num(weight)}" ` +
        `stroke-linejoin="round" fill-rule="evenodd"/>`
    : `<path d="${d}" fill="${color}" fill-rule="evenodd"/>`;
}

/** Two decimals as a *number*: the fills do arithmetic on what they are given. */
const round = (v) => Math.round(v * 100) / 100;

export { FILLS as SAMPLER_FILLS };
