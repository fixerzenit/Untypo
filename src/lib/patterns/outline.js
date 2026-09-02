/**
 * The silhouette walked by arc length, with the outward normal at every step.
 *
 * Three styles need the same thing and none of them wants the tracer's own
 * vertices: those land wherever the curve happened to bend, so anything spaced
 * on them crowds at every corner and strands along every straight. Walking the
 * length instead puts marks where the eye expects them — evenly, all the way
 * round — and the spacing is adjusted per ring so it divides exactly, which is
 * what stops each ring having one short gap where it closes.
 *
 * The normal is the direction of travel turned a quarter turn. The tracer winds
 * outlines and counters opposite ways, so this points out of the ink on both
 * without anything having to know which it is looking at.
 */

import { traceRings } from '../sources/trace.js';

/** Ceiling on samples, so the tightest spacing on a long word still tracks a drag. */
const MAX_POINTS = 24_000;

const cache = [];
const CACHE_LIMIT = 3;

export function outlineWalk(geo, spacing, smoothing) {
  const key = [geo.key ?? geo.d.length, geo.box.x, geo.box.width, spacing, smoothing].join('|');
  const hit = cache.find((entry) => entry.key === key);
  if (hit) return hit.value;

  const rings = traceRings(geo.tone, geo.floor ?? 0.5, smoothing);
  const walked = [];

  for (const ring of rings) {
    let total = 0;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      total += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    if (total < spacing * 2) continue;
    const count = Math.max(3, Math.round(total / spacing));
    const step = total / count;

    const points = [];
    let travelled = 0;
    let due = 0;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const length = Math.hypot(dx, dy);
      if (length < 1e-9) continue;

      while (due <= travelled + length && points.length < MAX_POINTS) {
        const t = (due - travelled) / length;
        points.push({
          x: a[0] + dx * t,
          y: a[1] + dy * t,
          nx: dy / length,
          ny: -dx / length,
        });
        due += step;
      }
      travelled += length;
    }
    if (points.length >= 3) walked.push(points);
  }

  cache.unshift({ key, value: walked });
  if (cache.length > CACHE_LIMIT) cache.pop();
  return walked;
}
