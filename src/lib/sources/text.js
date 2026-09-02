import { UNIT_HEIGHT } from '../constants.js';
import { pathField } from '../tone.js';

/**
 * Breathing room around the ink, as a fraction of the em.
 *
 * The frame is fitted to the ink plus this margin, so widening the margin is
 * what makes the word sit smaller inside the artboard.
 *
 * No single value shrinks every word by the same amount — the fraction the ink
 * occupies is H/(H+2·pad), so a word with ascenders and descenders starts from
 * a larger H than a line of capitals and moves less. The relation is also not
 * linear: each further step costs more margin than the last, which is why this
 * has grown faster than the reductions asked for.
 *
 * The letters themselves are still set at UNIT_HEIGHT, so a pattern's spacing
 * keeps the same relation to them; only the empty margin grows.
 */
const PAD_RATIO = 0.45;

// Cards that share the same type settings share one source: identical geometry,
// and more usefully one tone field instead of a dozen.
const cache = new Map();
const CACHE_LIMIT = 24;

/**
 * Text as outline geometry, set over one line or several.
 *
 * Lines are laid out here rather than left to the renderer because the whole
 * app works from one path and one framing box: patterns sample the box, the
 * clip uses the path, and exports crop to it. A block of text has to arrive as
 * a single shape or none of that holds.
 *
 * @param leading line-to-line distance, as a multiple of the em
 * @param align   how short lines sit against the longest one
 * @returns {{ kind, d, box, viewBox, tone, floor, tonal } | null}
 *          null when there is nothing to draw
 */
export function buildTextSource({
  font,
  text,
  tracking = 0,
  leading = 1.15,
  align = 'left',
  cacheKey,
}) {
  if (!font || !text || !text.trim()) return null;
  if (cacheKey && cache.has(cacheKey)) return cache.get(cacheKey);

  const options = { kerning: true, tracking };
  // Blank lines are kept: they hold their slot in the stack, so an empty line
  // opens a real gap rather than being silently swallowed.
  const lines = text.split('\n');
  const widths = lines.map((line) => (line ? font.getAdvanceWidth(line, UNIT_HEIGHT, options) : 0));
  const widest = Math.max(...widths);
  const step = UNIT_HEIGHT * leading;

  let d = '';
  let bounds = null;

  lines.forEach((line, i) => {
    if (!line.trim()) return; // holds its slot, contributes no ink
    const slack = widest - widths[i];
    const x = align === 'center' ? slack / 2 : align === 'right' ? slack : 0;

    const path = font.getPath(line, x, i * step, UNIT_HEIGHT, options);
    const box = path.getBoundingBox();
    if (!Number.isFinite(box.x1)) return;

    d += path.toPathData(2);
    bounds = bounds
      ? {
          x1: Math.min(bounds.x1, box.x1),
          y1: Math.min(bounds.y1, box.y1),
          x2: Math.max(bounds.x2, box.x2),
          y2: Math.max(bounds.y2, box.y2),
        }
      : box;
  });

  // Nothing but whitespace and empty lines.
  if (!d || !bounds) return null;
  if (bounds.x2 - bounds.x1 <= 0 || bounds.y2 - bounds.y1 <= 0) return null;

  const pad = UNIT_HEIGHT * PAD_RATIO;
  const box = {
    x: round(bounds.x1 - pad),
    y: round(bounds.y1 - pad),
    width: round(bounds.x2 - bounds.x1 + pad * 2),
    height: round(bounds.y2 - bounds.y1 + pad * 2),
  };

  const source = {
    kind: 'text',
    // What was set. Carried on the source rather than threaded through the
    // renderer because it *is* part of the source: an image has no text, and a
    // style that wants the letters can ask the thing that has them.
    text,
    d,
    box,
    viewBox: `${box.x} ${box.y} ${box.width} ${box.height}`,
    tone: pathField(d, box),
    floor: 0.5, // a letterform is ink or it is not
    tonal: false,
  };

  if (cacheKey) {
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value);
    cache.set(cacheKey, source);
  }
  return source;
}

function round(n) {
  return Math.round(n * 100) / 100;
}
