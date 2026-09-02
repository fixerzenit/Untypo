/**
 * A labyrinth grown inside the letterform.
 *
 * Every other style here draws marks that do not know about each other — a dot
 * does not care what the next dot did, and the picture is the sum of them. This
 * one is a single connected structure: a spanning tree over the cells the word
 * covers, so there is exactly one route between any two points inside a letter,
 * and the letter is legible because the corridors stop where the ink does.
 *
 * Randomised depth-first search, which is the maze generator that produces long
 * winding corridors rather than the short stubby ones a random-edge method
 * gives — it commits to a direction until it runs out of room, and that is what
 * makes the result read as passages instead of as texture.
 *
 * Each letter is its own component. The search is restarted from every cell it
 * has not reached, so a counter enclosed by its own stroke gets a maze of its
 * own rather than being left blank.
 */

import { hashRandom, irisHides, num, scatterOffset } from './helpers.js';
import { markWeight, weighsMarks } from '../motion.js';

/** Ceiling on cells, so the tightest spacing on a long word still tracks a drag. */
const MAX_CELLS = 30_000;

/** Link bits, stored on the cell to the west/north of each edge so no edge is stored twice. */
const EAST = 1;
const SOUTH = 2;

let cached = null;

function carve({ geo, spacing, braid, seed }) {
  const key = [geo.d.length, geo.box.x, geo.box.width, spacing, braid, seed].join('|');
  if (cached && cached.key === key) return cached.value;

  const { box, tone } = geo;
  // A photograph has no silhouette, so the corridors would fill the frame;
  // asking for a good deal more than "not blank" keeps them in the dark areas.
  const floor = geo.tonal ? 0.4 : (geo.floor ?? 0.5);

  let cell = Math.max(2, spacing);
  const wanted = (box.width / cell) * (box.height / cell);
  if (wanted > MAX_CELLS) cell *= Math.sqrt(wanted / MAX_CELLS);

  const cols = Math.max(1, Math.ceil(box.width / cell));
  const rows = Math.max(1, Math.ceil(box.height / cell));
  const inSet = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = box.x + (c + 0.5) * cell;
      const y = box.y + (r + 0.5) * cell;
      inSet[r * cols + c] = tone.average(x, y, cell) >= floor ? 1 : 0;
    }
  }

  const link = new Uint8Array(cols * rows);
  const seen = new Uint8Array(cols * rows);
  const stack = [];
  // Steps as [dc, dr, bit, owner] — owner says which of the pair carries the bit.
  const steps = [
    [1, 0, EAST, 'self'],
    [-1, 0, EAST, 'other'],
    [0, 1, SOUTH, 'self'],
    [0, -1, SOUTH, 'other'],
  ];

  for (let start = 0; start < inSet.length; start++) {
    if (!inSet[start] || seen[start]) continue;
    seen[start] = 1;
    stack.length = 0;
    stack.push(start);

    let step = 0;
    while (stack.length) {
      const here = stack[stack.length - 1];
      const c = here % cols;
      const r = (here - c) / cols;

      const options = [];
      for (const [dc, dr, bit, owner] of steps) {
        const nc = c + dc;
        const nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
        const next = nr * cols + nc;
        if (!inSet[next] || seen[next]) continue;
        options.push([next, bit, owner === 'self' ? here : next]);
      }
      if (!options.length) {
        stack.pop();
        continue;
      }

      // Deterministic, and varied along the walk rather than fixed per cell:
      // the same cell reached from a different direction should not always
      // turn the same way.
      const pick = options[Math.floor(hashRandom(here, step++, seed) * options.length)];
      link[pick[2]] |= pick[1];
      seen[pick[0]] = 1;
      stack.push(pick[0]);
    }
  }

  // Braiding. A spanning tree has no loops at all, which reads as correct and
  // a little airless; opening a share of the remaining walls gives the eye
  // somewhere to go round.
  if (braid > 0) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const here = r * cols + c;
        if (!inSet[here]) continue;
        if (c + 1 < cols && inSet[here + 1] && !(link[here] & EAST)) {
          if (hashRandom(here, 1, seed + 77) < braid) link[here] |= EAST;
        }
        if (r + 1 < rows && inSet[here + cols] && !(link[here] & SOUTH)) {
          if (hashRandom(here, 2, seed + 77) < braid) link[here] |= SOUTH;
        }
      }
    }
  }

  const value = { cols, rows, cell, inSet, link };
  cached = { key, value };
  return value;
}

export function mazeMarks({ geo, spacing, thickness, style, braid, seed, color, fx }) {
  const { cols, rows, cell, inSet, link } = carve({ geo, spacing, braid, seed });
  const { box } = geo;
  const front = fx.wipe !== null ? box.x + fx.wipe * box.width : null;
  const weighted = weighsMarks(fx);
  const walls = style === 'walls';

  const parts = [];
  const perSpan = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const here = r * cols + c;
      if (!inSet[here]) continue;
      if (fx.build < 1 && hashRandom(c, r, fx.reveal) > fx.build) continue;

      const cx = box.x + (c + 0.5) * cell;
      const cy = box.y + (r + 0.5) * cell;
      const nx = (cx - box.x) / box.width;
      const ny = (cy - box.y) / box.height;
      if (front !== null && cx > front) continue;
      if (irisHides(fx, nx, ny)) continue;

      // The whole cell moves as one joint, so a corridor stays attached to the
      // cells at both of its ends instead of coming apart into pieces.
      const [dx, dy] = scatterOffset(fx, c, r, cell, nx, ny);
      const x = cx + dx;
      const y = cy + dy;
      const half = cell / 2;
      const d = [];

      if (walls) {
        // A wall stands wherever the maze does not open, and around the edge
        // of the ink — which is what draws the silhouette.
        const open = (dc, dr, bit) => {
          const nc = c + dc;
          const nr = r + dr;
          if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) return false;
          const other = nr * cols + nc;
          if (!inSet[other]) return false;
          return dc > 0 || dr > 0
            ? (link[here] & bit) !== 0
            : (link[other] & bit) !== 0;
        };
        if (!open(0, -1, SOUTH)) d.push(`M${num(x - half)} ${num(y - half)}h${num(cell)}`);
        if (!open(-1, 0, EAST)) d.push(`M${num(x - half)} ${num(y - half)}v${num(cell)}`);
        // The far sides only where there is no neighbour to draw them instead.
        if (c === cols - 1 || !inSet[here + 1]) {
          d.push(`M${num(x + half)} ${num(y - half)}v${num(cell)}`);
        }
        if (r === rows - 1 || !inSet[here + cols]) {
          d.push(`M${num(x - half)} ${num(y + half)}h${num(cell)}`);
        }
      } else {
        // A stub at the centre keeps an isolated cell visible; the links then
        // reach out to the neighbours the maze opened onto.
        if (link[here] & EAST) d.push(`M${num(x)} ${num(y)}h${num(cell)}`);
        if (link[here] & SOUTH) d.push(`M${num(x)} ${num(y)}v${num(cell)}`);
        if (!d.length) d.push(`M${num(x)} ${num(y)}h0.01`);
      }

      if (!d.length) continue;
      if (weighted) {
        const w = Math.max(0.05, thickness * markWeight(fx, nx, ny));
        perSpan.push(`<path d="${d.join('')}" stroke-width="${num(w)}"/>`);
      } else {
        parts.push(d.join(''));
      }
    }
  }

  const body = weighted ? perSpan.join('') : parts.length ? `<path d="${parts.join('')}"/>` : '';
  if (!body) return '';
  const widthAttr = weighted ? '' : ` stroke-width="${num(thickness)}"`;
  return (
    `<g fill="none" stroke="${color}"${widthAttr} stroke-linecap="round" ` +
    `stroke-linejoin="round">${body}</g>`
  );
}
