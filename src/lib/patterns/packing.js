/**
 * Circles packed inside the shape, each as large as the room it has.
 *
 * Every lattice style sizes its marks by darkness, which on a letterform means
 * they are all the same size — a word is ink or it isn't, so there is nothing
 * for the size to follow. This sizes them by *space* instead, which a word has
 * plenty of variation in: the middle of a stem is far from any edge and the
 * inside of a corner is not. So the marks grow through the open parts of the
 * letters and shrink to a grain along their outlines, and the silhouette comes
 * back out of a field of circles without anything being clipped to draw it.
 *
 * Greedy, largest first. Relaxation schemes pack a few per cent tighter and
 * take iterations to converge, which is the wrong trade for something that has
 * to redraw while a slider is moving.
 */

import { distanceField } from './distance.js';
import { hashRandom, irisHides, num, scatterOffset } from './helpers.js';
import { markWeight, weighsMarks } from '../motion.js';

/** Ceiling on candidate positions, so the tightest setting still tracks a drag. */
const MAX_CANDIDATES = 14_000;

let cached = null;

/**
 * @param smallest  circles below this are not worth placing
 * @param largest   ceiling, so one open area does not become a single disc
 * @param gap       clearance between neighbours, in world units
 * @returns [{ x, y, r }] in world coordinates, largest first
 */
export function packCircles({ geo, smallest, largest, gap, seed }) {
  const field = distanceField(geo);
  const { box } = geo;
  const unit = field.unit;
  const key = [field.key, smallest, largest, gap, seed].join('|');
  if (cached && cached.key === key) return cached.value;

  // Candidates on a jittered lattice rather than uniform random points: random
  // ones clump, and a clump wastes most of its members on positions already
  // taken while leaving gaps elsewhere that nothing ever tries to fill.
  let step = Math.max(smallest, unit) * 1.1;
  const wanted = (box.width / step) * (box.height / step);
  if (wanted > MAX_CANDIDATES) step *= Math.sqrt(wanted / MAX_CANDIDATES);

  const cols = Math.max(1, Math.ceil(box.width / step));
  const rows = Math.max(1, Math.ceil(box.height / step));

  const candidates = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = box.x + (c + hashRandom(c, r, seed)) * step;
      const y = box.y + (r + hashRandom(c, r, seed + 47)) * step;
      // Negative inside the ink; how deep is how much room there is here.
      const depth = -field.at(x, y);
      if (depth < smallest) continue;
      candidates.push({ x, y, depth });
    }
  }

  // Largest first, so the big circles claim the open areas before the small
  // ones fragment them. Sorting on depth alone leaves ties to the engine, and
  // an unstable sort would mean a different packing on a different browser.
  candidates.sort((a, b) => b.depth - a.depth || a.x - b.x || a.y - b.y);

  // Anything outside the 5x5 block around a candidate is at least two buckets
  // away, so sizing a bucket at the largest circle plus its clearance is what
  // guarantees the block holds every circle that could possibly conflict.
  const bucket = Math.max(largest + gap, smallest * 2, 1);
  const bcols = Math.max(1, Math.ceil(box.width / bucket));
  const brows = Math.max(1, Math.ceil(box.height / bucket));
  const grid = new Map();

  const placed = [];
  for (const candidate of candidates) {
    const bc = Math.max(0, Math.min(bcols - 1, Math.floor((candidate.x - box.x) / bucket)));
    const br = Math.max(0, Math.min(brows - 1, Math.floor((candidate.y - box.y) / bucket)));

    // The largest circle that fits: limited by the outline, by the ceiling,
    // and by whatever is already sitting next to it.
    let radius = Math.min(candidate.depth, largest);
    for (let r = br - 2; r <= br + 2 && radius >= smallest; r++) {
      if (r < 0 || r >= brows) continue;
      for (let c = bc - 2; c <= bc + 2 && radius >= smallest; c++) {
        if (c < 0 || c >= bcols) continue;
        const list = grid.get(r * bcols + c);
        if (!list) continue;
        for (const other of list) {
          const room = Math.hypot(other.x - candidate.x, other.y - candidate.y) - other.r - gap;
          if (room < radius) radius = room;
          if (radius < smallest) break;
        }
      }
    }
    if (radius < smallest) continue;

    const circle = { x: candidate.x, y: candidate.y, r: radius };
    placed.push(circle);
    const cell = br * bcols + bc;
    const list = grid.get(cell);
    if (list) list.push(circle);
    else grid.set(cell, [circle]);
  }

  cached = { key, value: placed };
  return placed;
}

export function packingMarks({
  geo,
  circles,
  scale,
  style,
  thickness,
  color,
  fx,
}) {
  const { box } = geo;
  const front = fx.wipe !== null ? box.x + fx.wipe * box.width : null;
  const weighted = weighsMarks(fx);
  const outline = style === 'outline';

  const parts = [];
  circles.forEach((circle, index) => {
    if (fx.build < 1 && hashRandom(index, 0, fx.reveal) > fx.build) return;
    if (front !== null && circle.x > front) return;
    const nx = (circle.x - box.x) / box.width;
    const ny = (circle.y - box.y) / box.height;
    if (irisHides(fx, nx, ny)) return;

    let r = circle.r * scale;
    if (weighted) r *= markWeight(fx, nx, ny);
    if (r <= 0.05) return;

    // The packing is fixed, so a drift moves a circle out of the hole it was
    // sized for — which is the point: they slide off and settle back in.
    const drift = scatterOffset(fx, index, index * 7, circle.r * 2, nx, ny);
    parts.push(
      `<circle cx="${num(circle.x + drift[0])}" cy="${num(circle.y + drift[1])}" r="${num(r)}"/>`,
    );
  });

  const body = parts.join('');
  if (!body) return '';
  return outline
    ? `<g fill="none" stroke="${color}" stroke-width="${num(thickness)}">${body}</g>`
    : `<g fill="${color}">${body}</g>`;
}
