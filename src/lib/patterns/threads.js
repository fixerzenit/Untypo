/**
 * Parallel threads that never break, only swell.
 *
 * Hatching answers the shape by *presence*: a rule is drawn where there is ink
 * and absent where there is not, so the picture is made of what is missing.
 * This answers by weight instead — the word appears purely as the places where
 * the threads thicken. Nothing is cut and nothing is dropped, which is why it
 * plots in one pass per thread and why the letters read at a spacing far
 * coarser than hatching would survive.
 *
 * A stroke cannot vary its width along its length, so each thread is a closed
 * ribbon: the centreline sampled, offset both ways by half the local weight,
 * and the two edges joined into one outline. That is real geometry rather than
 * a stroke, so it survives into a cutter or a fill exactly as drawn.
 *
 * ON THE FRAME
 *   The first version gave every thread a floor width, so each one ruled the
 *   full frame edge to edge whether there was anything to say out there or
 *   not, and the word ended up sitting in a drawn rectangle. The frame is not
 *   part of the artwork. At a floor of zero the ribbon closes to nothing away
 *   from the ink and the piece ends where the type does; `falloff` then decides
 *   how it gets there, by widening the box each sample averages over. A wider
 *   box bleeds the ink outward, so the taper lengthens without anything having
 *   to know where the edges are.
 *
 *   Zero-width ribbon is invisible but it is still geometry, and a page of
 *   frame-wide paths carrying nothing is a page an editor has to open. The
 *   runs where a thread has width are emitted separately, so what exports is
 *   what you can see.
 */

import { hashRandom, num } from './helpers.js';
import { markWeight, weighsMarks } from '../motion.js';

/** Ceiling on samples, so the finest thread on a long word still tracks a drag. */
const MAX_SAMPLES = 90_000;

export function threadMarks({
  geo,
  spacing,
  angle,
  thin,
  thick,
  falloff,
  response,
  seed,
  wobble,
  color,
  fx,
}) {
  const { box, tone } = geo;
  const radians = (angle * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const span = Math.hypot(box.width, box.height) / 2;

  const gap = Math.max(1.5, spacing);
  const rows = Math.ceil((span * 2) / gap);
  let step = Math.max(1, gap / 3);
  if ((rows * (span * 2)) / step > MAX_SAMPLES) step = (rows * span * 2) / MAX_SAMPLES;
  const along = Math.max(4, Math.ceil((span * 2) / step));

  const front = fx.wipe !== null ? box.x + fx.wipe * box.width : null;
  const weighted = weighsMarks(fx);
  const low = Math.min(thin, thick);
  const high = Math.max(thin, thick);
  const parts = [];

  // How wide a box each sample averages over. At zero it is the thread's own
  // spacing, which is a hard edge at the outline; opening it up bleeds the ink
  // outward, and the thread tapers away over that distance instead.
  const reach = gap * (1 + Math.max(0, falloff ?? 0) * 7);
  // Below this a ribbon is thinner than a hairline and is a gap, not a thread.
  const VISIBLE = 0.05;

  /**
   * How quickly the floor arrives once there is anything to floor.
   *
   * Thinnest is a floor width, and it used to be a floor everywhere: every
   * thread carried it from one edge of the frame to the other whether it had
   * anything to say out there or not, so anything above zero drew the word
   * inside a ruled rectangle. The frame is not part of the artwork.
   *
   * The averaged sample is already the answer. `tone.average` over the reach
   * returns zero wherever that box holds no ink at all, so it is nonzero
   * exactly within half a reach of the letterform — which is the distance
   * `falloff` was put there to set. Fading the floor in over the first few
   * hundredths of that gives a thread that starts a little before the letter
   * and ends a little after it, tapering both times, instead of one that runs
   * to the edge of the page.
   */
  const FLOOR_IN = 0.06;

  for (let j = 0; j <= rows; j++) {
    if (fx.build < 1 && hashRandom(j, 0, fx.reveal) > fx.build) continue;
    const v = -span + j * gap;

    // A thread is emitted as the runs where it has width, so a floor of zero
    // ends the piece at the type rather than leaving invisible geometry
    // stretched across the frame.
    let top = [];
    let bottom = [];
    const flush = () => {
      if (top.length > 1) {
        bottom.reverse();
        parts.push(`M${top.join('L')}L${bottom.join('L')}Z`);
      }
      top = [];
      bottom = [];
    };

    // The u of the sample before this one, so a run can be opened at a point
    // where the last one was empty rather than at full width where this one
    // is not.
    let lastU = -span;

    for (let i = 0; i <= along; i++) {
      const u = -span + (i / along) * span * 2;
      const x = cx + u * cos - v * sin;
      const y = cy + u * sin + v * cos;

      // Past the wipe front the thread is still there, at nothing.
      let ink = tone.average(x, y, reach);
      if (front !== null && x > front) ink = 0;

      // Response bends the middle of the range without moving its ends: below
      // one the thin parts fatten and the word blooms, above one they starve
      // and only the solid middles of the strokes survive.
      const t = response === 1 ? ink : Math.pow(Math.max(0, Math.min(1, ink)), response);
      // The floor is only a floor where the thread has something under it.
      const presence = Math.min(1, ink / FLOOR_IN);
      let w = (low + (high - low) * t) * presence;
      if (weighted) {
        w *= Math.max(0, markWeight(fx, (x - box.x) / box.width, (y - box.y) / box.height));
      }
      if (wobble) w *= 1 + (hashRandom(j, i, seed) - 0.5) * 2 * wobble;
      w = Math.max(0, w) / 2;

      if (w < VISIBLE) {
        // Closed at nothing rather than cut, so the run still comes to a point
        // instead of ending on a blunt edge mid-taper.
        if (top.length) {
          const point = `${num(cx + u * cos - v * sin)} ${num(cy + u * sin + v * cos)}`;
          top.push(point);
          bottom.push(point);
          flush();
        }
        lastU = u;
        continue;
      }

      /**
       * And opened at nothing too.
       *
       * Only the closing end did this, so every thread came to a point on its
       * right and stopped on a blunt vertical edge on its left — visible along
       * the whole left side of the word as a cut, against a taper on the other
       * side. The run now starts with a zero-width point at the last empty
       * sample, which is the same shape the closing end makes, drawn in the
       * other direction.
       */
      if (!top.length) {
        const open = `${num(cx + lastU * cos - v * sin)} ${num(cy + lastU * sin + v * cos)}`;
        top.push(open);
        bottom.push(open);
      }

      top.push(`${num(cx + u * cos - (v - w) * sin)} ${num(cy + u * sin + (v - w) * cos)}`);
      bottom.push(`${num(cx + u * cos - (v + w) * sin)} ${num(cy + u * sin + (v + w) * cos)}`);
      lastU = u;
    }
    flush();
  }

  if (!parts.length) return '';
  return `<path d="${parts.join('')}" fill="${color}"/>`;
}
