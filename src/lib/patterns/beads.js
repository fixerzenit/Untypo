/**
 * Marks threaded along the outline instead of filling what it encloses.
 *
 * Every other style here answers "is there ink at this point" and puts
 * something down where the answer is yes. This one only cares where the answer
 * *changes*. The letters come back as their own boundary — a bead chain
 * following every stroke and every counter, with the middle of the strokes left
 * empty, which is the one description of a letterform none of the fill styles
 * can give.
 *
 * The outline is walked by arc length rather than by vertex — see outline.js
 * for why, and for the two other styles that need the same thing.
 */

import { outlineWalk } from './outline.js';
import { hashRandom, irisHides, num, scatterOffset } from './helpers.js';
import { markWeight, weighsMarks } from '../motion.js';

export function beadMarks({
  geo,
  spacing,
  size,
  variation,
  offset,
  smoothing,
  style,
  thickness,
  seed,
  color,
  fx,
}) {
  const beads = outlineWalk(geo, spacing, smoothing).flat();
  if (!beads.length) return '';

  const { box } = geo;
  const front = fx.wipe !== null ? box.x + fx.wipe * box.width : null;
  const weighted = weighsMarks(fx);
  const parts = [];

  beads.forEach((bead, i) => {
    if (fx.build < 1 && hashRandom(i, 0, fx.reveal) > fx.build) return;
    if (front !== null && bead.x > front) return;
    const nx = (bead.x - box.x) / box.width;
    const ny = (bead.y - box.y) / box.height;
    if (irisHides(fx, nx, ny)) return;

    let r = size * (1 + (hashRandom(i, 1, seed) - 0.5) * 2 * variation);
    if (weighted) r *= markWeight(fx, nx, ny);
    if (r <= 0.05) return;

    // Positive rides outside the outline, negative sits inside it — the same
    // control a stroke's alignment gives you in a drawing program.
    const drift = scatterOffset(fx, i, i * 3, spacing, nx, ny);
    const x = bead.x + bead.nx * offset + drift[0];
    const y = bead.y + bead.ny * offset + drift[1];
    parts.push(`<circle cx="${num(x)}" cy="${num(y)}" r="${num(r)}"/>`);
  });

  const body = parts.join('');
  if (!body) return '';
  return style === 'outline'
    ? `<g fill="none" stroke="${color}" stroke-width="${num(thickness)}">${body}</g>`
    : `<g fill="${color}">${body}</g>`;
}
