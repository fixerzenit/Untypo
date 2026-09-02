/**
 * The word laid down in fat wet dots.
 *
 * Somebody has gone over the letterform with a marker too broad for it, one
 * touch at a time, and the touches have run together. The strokes are still
 * the right strokes and the counters are nearly gone.
 *
 * ON WHERE A DOT SHOULD SIT
 *   Scattering discs across the ink on a lattice gives a halftone, not this.
 *   The difference is that a real pen follows the *middle* of the stroke, so
 *   the dots sit on the spine and their size is whatever the stroke will take.
 *   Both of those are the distance field: it is largest along the spine and it
 *   is exactly the radius that fits.
 *
 *   So each candidate is walked a few steps up the gradient — uphill, into the
 *   stroke — before it is drawn. That is a cheap approximation of the medial
 *   axis and it costs three field reads a step. Dots pull off the edges and
 *   collect along the middle, thin strokes get one line of them and a bowl
 *   gets a curve, and the letter comes back as a thing that was written rather
 *   than a thing that was filled.
 *
 * The wobble on each disc is geometry, not a blur: an edge that is a rough
 * polygon exports and cuts, where a filter is an instruction to a renderer.
 */

import { distanceField } from './distance.js';
import { hashRandom, irisHides, num, scatterOffset } from './helpers.js';
import { markWeight, weighsMarks } from '../motion.js';

/** Steps taken uphill toward the spine. More than a few buys nothing. */
const CLIMB = 6;

export function blotMarks({
  geo,
  spacing,
  scale,
  vary,
  climb,
  rough,
  facets,
  seed,
  color,
  fx,
}) {
  const field = distanceField(geo);
  const { box } = geo;
  const cell = Math.max(2, spacing);
  const cols = Math.max(1, Math.ceil(box.width / cell));
  const rows = Math.max(1, Math.ceil(box.height / cell));
  const front = fx.wipe !== null ? box.x + fx.wipe * box.width : null;
  const weighted = weighsMarks(fx);
  const sides = Math.max(5, Math.round(facets));

  /** Signed distance at a point — negative inside the ink. */
  const at = (x, y) => {
    const c = Math.max(
      0,
      Math.min(field.cols - 1, Math.round(((x - box.x) / box.width) * field.cols - 0.5)),
    );
    const r = Math.max(
      0,
      Math.min(field.rows - 1, Math.round(((y - box.y) / box.height) * field.rows - 0.5)),
    );
    return field.values[r * field.cols + c];
  };

  const probe = Math.max(field.unit, cell * 0.3);
  const parts = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let x = box.x + (c + hashRandom(c, r, seed)) * cell;
      let y = box.y + (r + hashRandom(c, r, seed + 61)) * cell;
      if (at(x, y) >= 0) continue; // started outside the ink

      // Uphill, into the stroke. The gradient points *out* of the ink, so
      // going against it is going deeper in.
      const steps = Math.round(CLIMB * climb);
      for (let k = 0; k < steps; k++) {
        const gx = at(x + probe, y) - at(x - probe, y);
        const gy = at(x, y + probe) - at(x, y - probe);
        const mag = Math.hypot(gx, gy);
        if (mag < 1e-6) break;
        const move = Math.min(probe, Math.abs(at(x, y)) * 0.5);
        x -= (gx / mag) * move;
        y -= (gy / mag) * move;
      }

      const depth = -at(x, y);
      if (depth <= 0) continue;

      const nx = (x - box.x) / box.width;
      const ny = (y - box.y) / box.height;
      if (front !== null && x > front) continue;
      if (irisHides(fx, nx, ny)) continue;
      if (fx.build < 1 && hashRandom(c, r, fx.reveal) > fx.build) continue;

      // How much of the room it found the dot takes. Above one it spills over
      // the stroke, which is the whole look — a pen too broad for the letter.
      let radius = depth * scale;
      radius *= 1 + (hashRandom(c, r, seed + 17) - 0.5) * 2 * vary;
      if (weighted) radius *= Math.max(0, markWeight(fx, nx, ny));
      if (radius < 0.35) continue;

      const drift = scatterOffset(fx, c, r, cell, nx, ny);
      const cxp = x + drift[0];
      const cyp = y + drift[1];

      // A rough polygon rather than a circle. Real ink does not have a radius.
      const points = [];
      for (let i = 0; i < sides; i++) {
        const turn = (i / sides) * Math.PI * 2;
        const bump = 1 + (hashRandom(c * 97 + i, r, seed + 5) - 0.5) * 2 * rough;
        points.push(
          `${num(cxp + Math.cos(turn) * radius * bump)} ${num(cyp + Math.sin(turn) * radius * bump)}`,
        );
      }
      parts.push(`M${points.join('L')}Z`);
    }
  }

  if (!parts.length) return '';
  // Nonzero, so overlapping dots merge into one blot instead of punching
  // holes in each other — which is the difference between wet ink and lace.
  return `<path d="${parts.join('')}" fill="${color}" fill-rule="nonzero"/>`;
}
