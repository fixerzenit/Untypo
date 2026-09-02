/**
 * The word extruded, with the depth pushed off at an angle.
 *
 * Every other style here is flat: marks lie on the page and the only thing
 * that varies is where they sit and how heavy they are. This one gives the
 * letters a third dimension.
 *
 * Projecting the *grid* isometrically — the textbook construction, where a
 * cube's three faces are equal and (col - row) goes across while (col + row)
 * goes down — turns a word set horizontally into a diagonal band running
 * across the corner of the frame. It is correct and it is unreadable, which
 * settles it: the front face stays square and on the page, and only the depth
 * is pushed off at an angle. That is an oblique projection rather than a true
 * isometric, and it is what extruded lettering has always actually been.
 *
 * On a word every column is the same height, and that is the point: a solid
 * extruded slab. On a photograph the height follows the darkness instead, so
 * the same code turns a picture into a relief map without being told which it
 * is looking at.
 *
 * Drawn far to near, and the order has to follow the extrusion rather than
 * assume it. Projecting a cube's position onto the extrusion vector says how
 * far away it is — larger is further, whichever way the depth happens to point
 * — so descending order of that projection lets the near ones paint over what
 * they cover. Hard-coding the order for one bearing, which is what this did at
 * first, draws them back to front at every other one and the picture comes
 * apart. That is also why the direction is a short list rather than a dial:
 * four diagonals are the ones worth having, and each of them is exact.
 */

import { hashRandom, irisHides, num, scatterOffset } from './helpers.js';
import { markWeight, weighsMarks } from '../motion.js';

/**
 * Convex hull of a handful of points, by monotone chain.
 *
 * Eight points, so the sort costs nothing and the result is exact — which
 * matters more than speed here, because the alternative was a hand-written
 * winding that only closed correctly for one of the four directions.
 */
function hull(points) {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const build = (list) => {
    const out = [];
    for (const point of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], point) <= 0) {
        out.pop();
      }
      out.push(point);
    }
    out.pop();
    return out;
  };
  return [...build(sorted), ...build([...sorted].reverse())];
}

/** Ceiling on cubes, so the finest grid on a long word still tracks a drag. */
const MAX_CUBES = 14_000;

export function isometricMarks({
  geo,
  spacing,
  definition,
  depth,
  angle,
  style,
  thickness,
  color,
  background,
  fx,
}) {
  const { box, tone } = geo;
  // How much of a cell has to be inked before it becomes a cube. Low and the
  // letters thicken as every cell the outline grazes fills in; high and only
  // the solid middles survive, which sharpens the shape and thins it. It is
  // the one control that decides how much of the letterform the grid keeps.
  const floor = geo.tonal ? (geo.floor ?? 0.04) : 0.15 + definition * 0.7;

  let cell = Math.max(2, spacing);
  const wanted = (box.width / cell) * (box.height / cell);
  if (wanted > MAX_CUBES) cell *= Math.sqrt(wanted / MAX_CUBES);

  const cols = Math.max(1, Math.ceil(box.width / cell));
  const rows = Math.max(1, Math.ceil(box.height / cell));

  // How far back a full-height cube reaches, and in which direction. The front
  // face keeps the grid's own square footprint; only this is oblique.
  const radians = (angle * Math.PI) / 180;
  const reach = cell * depth;
  const ex = Math.cos(radians) * reach;
  const ey = -Math.sin(radians) * reach;

  // Gather first, so the frame can be fitted to what is actually drawn rather
  // than to the grid's full extent — most of which is empty margin.
  const cubes = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const wx = box.x + (c + 0.5) * cell;
      const wy = box.y + (r + 0.5) * cell;
      const ink = tone.average(wx, wy, cell);
      if (ink < floor) continue;

      const nx = (wx - box.x) / box.width;
      const ny = (wy - box.y) / box.height;
      if (fx.build < 1 && hashRandom(c, r, fx.reveal) > fx.build) continue;
      if (fx.wipe !== null && nx > fx.wipe) continue;
      if (irisHides(fx, nx, ny)) continue;

      let h = geo.tonal ? ink : 1;
      if (weighsMarks(fx)) h *= Math.max(0.02, markWeight(fx, nx, ny));

      cubes.push({ c, r, h, nx, ny });
    }
  }
  if (!cubes.length) return '';

  // Far first, measured along the extrusion itself. Ties broken by row so the
  // order is total and the same every time — an unstable sort would draw a
  // different frame per browser.
  const away = (cube) => cube.c * ex + cube.r * ey;
  cubes.sort((a, b) => away(b) - away(a) || a.r - b.r);

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const cube of cubes) {
    const x = box.x + cube.c * cell;
    const y = box.y + cube.r * cell;
    const bx = x + ex * cube.h;
    const by = y + ey * cube.h;
    minX = Math.min(minX, x, bx);
    maxX = Math.max(maxX, x + cell, bx + cell);
    minY = Math.min(minY, y, by);
    maxY = Math.max(maxY, y + cell, by + cell);
  }

  // The extrusion pushes the drawing outside the frame it was measured in, so
  // one transform puts it back — fitted to what was drawn, not to the grid.
  // Fitted to a little less than the frame. Every other style draws at the
  // source's own size inside the frame's margin; this one refits to whatever
  // it drew, so without a margin of its own it came out noticeably larger than
  // everything it sits beside.
  const MARGIN = 0.74;
  const fit =
    Math.min(box.width / (maxX - minX || 1), box.height / (maxY - minY || 1)) * MARGIN;
  const offsetX = box.x + (box.width - (maxX - minX) * fit) / 2 - minX * fit;
  const offsetY = box.y + (box.height - (maxY - minY) * fit) / 2 - minY * fit;

  const outline = style === 'outline';
  const bodies = [];
  const seams = [];

  for (const cube of cubes) {
    const drift = scatterOffset(fx, cube.c, cube.r, cell, cube.nx, cube.ny);
    const x = box.x + cube.c * cell + drift[0];
    const y = box.y + cube.r * cell + drift[1];
    const dx = ex * cube.h;
    const dy = ey * cube.h;
    const p = (a, b) => `${num(a)} ${num(b)}`;

    // The silhouette of a square swept along a vector is the hull of its eight
    // corners — four in front, four behind. Writing that hexagon out by hand
    // works for one direction and self-intersects at the other three, which
    // fills as a tangle of triangles rather than as a block. The hull is the
    // same shape and is right at every bearing.
    const corners = [
      [x, y], [x + cell, y], [x + cell, y + cell], [x, y + cell],
      [x + dx, y + dy], [x + cell + dx, y + dy],
      [x + cell + dx, y + cell + dy], [x + dx, y + cell + dy],
    ];
    bodies.push(`M${hull(corners).map(([hx, hy]) => p(hx, hy)).join('L')}Z`);
    // The front face, whose four edges are all visible whichever way the depth
    // goes. Drawn into the block, it is what stops a run of cubes reading as
    // one slab.
    seams.push(
      `M${p(x, y)}L${p(x + cell, y)}L${p(x + cell, y + cell)}L${p(x, y + cell)}Z`,
    );
  }

  const transform = `translate(${num(offsetX)} ${num(offsetY)}) scale(${num(fit)})`;
  // Stroke widths are quoted in frame units, so they have to be divided back
  // out of the fit or a small word would come with hairlines and a large one
  // with slabs.
  const stroke = num(Math.max(0.05, thickness / fit));

  if (outline) {
    return (
      `<g transform="${transform}" fill="none" stroke="${color}" stroke-width="${stroke}" ` +
      `stroke-linejoin="round"><path d="${bodies.join('')}"/>` +
      `<path d="${seams.join('')}"/></g>`
    );
  }

  // Seams in the background colour: the block reads as solid, and the edges
  // that make it read as three faces are cut out of it rather than added.
  return (
    `<g transform="${transform}"><path d="${bodies.join('')}" fill="${color}"/>` +
    `<path d="${seams.join('')}" fill="none" stroke="${background}" stroke-width="${stroke}" ` +
    `stroke-linecap="round"/></g>`
  );
}
