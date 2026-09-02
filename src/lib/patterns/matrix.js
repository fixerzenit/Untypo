/**
 * The word on a dot-matrix sign.
 *
 * A grid of lamps, and the ones over ink are lit. What makes it read as a sign
 * rather than as another halftone is what happens to lamps that are lit *next
 * to each other*: on a real matrix display they bleed into one continuous bar,
 * so a horizontal stroke becomes a dash and an isolated pixel stays a dot.
 *
 * Which is one path and one property. Every run of lit cells is emitted as a
 * single line segment from the first lamp's centre to the last, and the whole
 * thing is stroked with round caps — so a run of one is a circle, a run of six
 * is a capsule six lamps long, and the difference between a dot and a dash is
 * how many cells happened to be lit in a row. Nothing has to decide which is
 * which.
 *
 * ON THE GLOW
 *
 * The reference glows, and there is no filter here. A blur is a raster
 * operation and everything in this app is meant to survive being exported as
 * vector and reopened — so the halo is three copies of the same path at
 * increasing widths and falling opacity, drawn behind the mark. It is what a
 * sign painter would do, it scales without resampling, and it is three <path>s
 * instead of a filter region the size of the artboard.
 */

import { hashRandom, irisHides, num } from './helpers.js';
import { markWeight, weighsMarks } from '../motion.js';

/** How the lamps are allowed to run together. */
const RUNS = {
  rows: { across: true, down: false },
  columns: { across: false, down: true },
  both: { across: true, down: true },
  none: { across: false, down: false },
};

export function matrixMarks({
  geo,
  spacing,
  dot,
  merge,
  glow,
  spread,
  color,
  fx,
}) {
  const { box, tone } = geo;
  const floor = geo.floor ?? 0.5;

  const cols = Math.max(1, Math.round(box.width / spacing));
  const rows = Math.max(1, Math.round(box.height / spacing));
  const stepX = box.width / cols;
  const stepY = box.height / rows;
  const radius = Math.max(0.15, Math.min(stepX, stepY) * dot * 0.5);

  const at = (c, r) => {
    const x = box.x + (c + 0.5) * stepX;
    const y = box.y + (r + 0.5) * stepY;
    return { x, y };
  };

  // One pass to decide which lamps are on, so the run-walks below agree with
  // each other — sampling twice would let a cell be lit for the row pass and
  // dark for the column pass, and the two would disagree at the joins.
  const lit = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const { x, y } = at(c, r);
      if (tone.average(x, y, Math.min(stepX, stepY)) < floor) continue;
      const nx = (x - box.x) / box.width;
      const ny = (y - box.y) / box.height;
      if (fx.wipe !== null && nx > fx.wipe) continue;
      if (fx.build < 1 && hashRandom(c, r, fx.reveal) > fx.build) continue;
      if (irisHides(fx, nx, ny)) continue;
      lit[r * cols + c] = 1;
    }
  }

  const runs = RUNS[merge] ?? RUNS.rows;
  const segments = [];

  const emit = (a, b) => {
    const from = at(a.c, a.r);
    const to = at(b.c, b.r);
    segments.push(
      from.x === to.x && from.y === to.y
        ? `M${num(from.x)} ${num(from.y)}h0`
        : `M${num(from.x)} ${num(from.y)}L${num(to.x)} ${num(to.y)}`,
    );
  };

  if (runs.across) {
    for (let r = 0; r < rows; r++) {
      let start = -1;
      for (let c = 0; c <= cols; c++) {
        const on = c < cols && lit[r * cols + c];
        if (on && start < 0) start = c;
        if (!on && start >= 0) {
          emit({ c: start, r }, { c: c - 1, r });
          start = -1;
        }
      }
    }
  }

  if (runs.down) {
    for (let c = 0; c < cols; c++) {
      let start = -1;
      for (let r = 0; r <= rows; r++) {
        const on = r < rows && lit[r * cols + c];
        if (on && start < 0) start = r;
        if (!on && start >= 0) {
          // A column run of one is already drawn by the row pass when both are
          // on; emitting it again would only double the ink under the halo.
          if (!runs.across || r - 1 > start) emit({ c, r: start }, { c, r: r - 1 });
          start = -1;
        }
      }
    }
  }

  if (!runs.across && !runs.down) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) if (lit[r * cols + c]) emit({ c, r }, { c, r });
    }
  }

  if (!segments.length) return '';
  const d = segments.join('');

  // The lamp itself, and the light around it. Three halos rather than one: a
  // single wide soft stroke reads as a fat outline, and it is the falloff —
  // each one wider and fainter than the last — that reads as light.
  const halo = [];
  if (glow > 0) {
    for (let i = 3; i >= 1; i--) {
      const width = radius * 2 * (1 + spread * i);
      const alpha = glow * (0.16 / i);
      halo.push(
        `<path d="${d}" fill="none" stroke="${color}" stroke-width="${num(width)}" ` +
          `stroke-linecap="round" stroke-linejoin="round" opacity="${num(alpha)}"/>`,
      );
    }
  }

  // Weight rides the motion the same way every other style's marks do.
  const gain = weighsMarks(fx) ? Math.sqrt(Math.max(0.05, markWeight(fx, 0.5, 0.5))) : 1;

  return (
    halo.join('') +
    `<path d="${d}" fill="none" stroke="${color}" stroke-width="${num(radius * 2 * gain)}" ` +
    `stroke-linecap="round" stroke-linejoin="round"/>`
  );
}
