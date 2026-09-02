import {
  ditherCells,
  hashRandom,
  irisHides,
  motifGrid,
  num,
  rings,
  scatterOffset,
} from './helpers.js';
import { markWeight, weighsMarks } from '../motion.js';
import { blurField } from './blur.js';
import { beadMarks } from './beads.js';
import { blockMarks } from './blocks.js';
import { matrixMarks } from './matrix.js';
import { blotMarks } from './blots.js';
import { mazeMarks } from './maze.js';
import { samplerMarks } from './sampler.js';
import { physarumMarks } from './physarum.js';
import { threadMarks } from './threads.js';
import { isometricMarks } from './isometric.js';
import { packCircles, packingMarks } from './packing.js';

/**
 * The pattern registry.
 *
 * Adding a style means appending one object here — nothing else in the app
 * needs to change. The UI builds its sliders from `params`, and both the live
 * preview and the SVG/PNG/WebM exports go through `render`, so what you see is
 * literally what you download.
 *
 * A pattern is:
 *   id      stable key, also used in export filenames
 *   label   card title
 *   blurb   one-line description under the title
 *   params  slider definitions (see PARAM SHAPE below)
 *   motion  { key, from, to, loop } — which slider animates, and how
 *   render  ({ p, geo, fg, bg, ids, fx, font }) => { defs, body, clip }
 *             defs  optional markup for <defs>; use `ids` for unique ids
 *             body  markup painted inside the shape
 *             clip  false to opt out of the silhouette clip-path
 *           `fx` is the motion effect (lib/motion.js); `font` is the loaded
 *           typeface, for styles that draw with glyphs.
 *
 * PARAM SHAPE
 *   key, label, min, max, step, def
 *   unit       suffix shown next to the value
 *   ratio      true => value is a fraction of the cell, displayed as a %
 *   zeroLabel  what to show at 0, e.g. "solid"
 *   kind       'select' with `options: [{value, label}]` for discrete choices
 *
 * ON CLIPPING
 *   Clipping a fill to the shape gives a perfect outline but slices the marks
 *   in half wherever the outline crosses them. The grid styles therefore opt
 *   out and stamp whole marks via motifGrid(): the pattern stays exact and the
 *   silhouette is what gives, turning the edge into a mosaic. The line styles
 *   follow the same rule by measuring the spans where a rule actually crosses
 *   the shape, rather than drawing a long rule and letting a clip trim it —
 *
 * ON TONE
 *   motifGrid hands each motif an `ink` value. It is 1 for a word or a traced
 *   silhouette, and the local darkness for a tonal image. Sizing a mark by
 *   sqrt(ink) makes its *area* proportional to darkness, which is what a real
 *   halftone screen does and why photographs come out reading correctly.
 */

const RATIO = { unit: '%', ratio: true };

const SCREEN_ANGLE = {
  key: 'angle',
  label: 'Screen angle',
  min: 0,
  max: 90,
  step: 1,
  def: 0,
  unit: '°',
};

/**
 * The finishing controls every line-based style shares.
 *
 * `continuity` is the answer to a rule snapping in two over a sliver of
 * counter: gaps below it are bridged, so the line stays whole and the
 * silhouette gives instead. `noise` then nudges the ends off the outline, so
 * the edge stops looking machine-cut.
 */
const LINE_FINISH = [
  { key: 'continuity', label: 'Continuity', min: 0, max: 40, step: 1, def: 8, stable: true },
  { key: 'noise', label: 'Noise', min: 0, max: 1, step: 0.02, def: 0, ...RATIO },
  {
    key: 'cap',
    label: 'Line ends',
    kind: 'select',
    def: 'butt',
    options: [
      { value: 'butt', label: 'Flat' },
      { value: 'round', label: 'Round' },
    ],
  },
  { key: 'dash', label: 'Stroke dash', min: 0, max: 40, step: 1, def: 0, zeroLabel: 'solid' },
  { key: 'phase', label: 'Phase offset', min: 0, max: 1, step: 0.01, def: 0, ...RATIO },
];

/**
 * A seed picks which arrangement you get, never how legible it is — so unlike
 * every other slider it is safe to shuffle across its whole range.
 */
const SEED = { key: 'seed', label: 'Seed', min: 1, max: 60, step: 1, def: 7, free: true };

/** Area proportional to darkness, the way a print screen behaves. */
const byInk = (ink) => Math.sqrt(ink);

const DEFINED = [

  {
    id: 'defocus',
    label: 'Defocus',
    blurb: 'Type gone soft, resolved as grain rather than as bands.',
    // Weight and tracking live on the first card in the file. They were on
    // Solid, because Solid *was* the silhouette and editing it there needed no
    // explanation; with Solid gone they would have had nowhere at all, and a
    // control with nowhere to be is a control that quietly stops existing.
    typography: true,
    motion: { key: 'blur', from: 0.01, to: 0.12, loop: 'pingpong' },
    params: [
      { key: 'blur', label: 'Blur', min: 0.005, max: 0.18, step: 0.005, def: 0.035, ...RATIO },
      { key: 'grain', label: 'Grain', min: 30, max: 150, step: 2, def: 96, unit: ' rows' },
      { key: 'scale', label: 'Mark size', min: 0.3, max: 1.6, step: 0.05, def: 1, ...RATIO },
      {
        key: 'mode',
        label: 'Falloff',
        kind: 'select',
        def: 'hollow',
        options: [
          { value: 'hollow', label: 'Edge glow' },
          { value: 'solid', label: 'Solid' },
        ],
      },
      {
        key: 'dither',
        label: 'Dither',
        kind: 'select',
        def: 'floyd',
        options: [
          { value: 'floyd', label: 'Diffusion' },
          { value: 'bayer', label: 'Ordered' },
        ],
      },
      {
        key: 'shape',
        label: 'Mark',
        kind: 'select',
        def: 'dot',
        options: [
          { value: 'dot', label: 'Dot' },
          { value: 'square', label: 'Square' },
        ],
      },
    ],
    render: ({ p, geo, fg, fx }) => {
      const field = blurField(geo, { blur: p.blur, hollow: p.mode === 'hollow' });

      // Dithering rather than contour bands. A soft edge has no boundary to
      // trace, and stacking traced levels only ever approximates the gradient
      // as steps you can count. Scattering one-bit marks by error diffusion is
      // how a continuous tone is actually rendered without greys — and it is
      // grain, which is what the soft-focus look is made of anyway.
      const { cell, cells } = ditherCells(geo, geo.box.height / p.grain, p.dither, fx, field);
      if (!cells.length) return { body: '', clip: false };

      const size = cell * p.scale;
      if (p.shape === 'square') {
        // One <path> of many subpaths: thousands of squares in one element.
        const d = cells
          .map(([col, row]) => {
            const x = num(geo.box.x + col * cell + (cell - size) / 2);
            const y = num(geo.box.y + row * cell + (cell - size) / 2);
            return `M${x} ${y}h${num(size)}v${num(size)}h${num(-size)}z`;
          })
          .join('');
        return { body: `<path d="${d}" fill="${fg}"/>`, clip: false };
      }

      const r = num(size / 2);
      const dots = cells
        .map(
          ([col, row]) =>
            `<circle cx="${num(geo.box.x + (col + 0.5) * cell)}" cy="${num(geo.box.y + (row + 0.5) * cell)}" r="${r}"/>`,
        )
        .join('');
      return { body: `<g fill="${fg}">${dots}</g>`, clip: false };
    },
  },

  {
    id: 'cross-stitch',
    label: 'Stitch',
    blurb: "A grid of whole ×'s mapped onto the shape.",
    motion: { key: 'angle', from: 0, to: 90, loop: 'wrap' },
    params: [
      { key: 'spacing', label: 'Grid spacing', min: 5, max: 48, step: 1, def: 15 },
      { key: 'strokeWidth', label: 'Stroke width', min: 0.5, max: 8, step: 0.25, def: 2 },
      { key: 'scale', label: 'Cross scale', min: 0.2, max: 0.95, step: 0.05, def: 0.6, ...RATIO },
      SCREEN_ANGLE,
    ],
    render: ({ p, geo, fg, fx }) => {
      const marks = motifGrid({
        geo,
        fx,
        spacing: p.spacing,
        angle: p.angle,
        // Both strokes as one two-subpath <path>: one element per cross.
        motif: (x, y, cell, ink) => {
          const arm = (cell * p.scale * byInk(ink)) / 2;
          return (
            `<path d="M${num(x - arm)} ${num(y - arm)}L${num(x + arm)} ${num(y + arm)}` +
            `M${num(x - arm)} ${num(y + arm)}L${num(x + arm)} ${num(y - arm)}"/>`
          );
        },
      });
      return {
        body:
          `<g fill="none" stroke="${fg}" stroke-width="${num(p.strokeWidth)}" ` +
          `stroke-linecap="round">${marks}</g>`,
        clip: false,
      };
    },
  },

  {
    id: 'circles',
    label: 'Circles',
    blurb: 'Complete outlined rings on a regular grid.',
    motion: { key: 'radius', from: 0.08, to: 0.5, loop: 'pingpong' },
    params: [
      { key: 'spacing', label: 'Grid spacing', min: 5, max: 48, step: 1, def: 17 },
      { key: 'radius', label: 'Circle radius', min: 0.08, max: 0.5, step: 0.01, def: 0.32, ...RATIO },
      { key: 'strokeWidth', label: 'Stroke width', min: 0.25, max: 6, step: 0.25, def: 1.5 },
      SCREEN_ANGLE,
    ],
    render: ({ p, geo, fg, fx }) => {
      const marks = motifGrid({
        geo,
        fx,
        spacing: p.spacing,
        angle: p.angle,
        motif: (x, y, cell, ink) =>
          `<circle cx="${num(x)}" cy="${num(y)}" r="${num(cell * p.radius * byInk(ink))}"/>`,
      });
      return {
        body: `<g fill="none" stroke="${fg}" stroke-width="${num(p.strokeWidth)}">${marks}</g>`,
        clip: false,
      };
    },
  },

  {
    id: 'pixel',
    label: '8-bit',
    blurb: 'Quantised to a block grid — solid, outlined, or sized by darkness.',
    motion: { key: 'gap', from: 0, to: 0.6, loop: 'pingpong' },
    params: [
      { key: 'resolution', label: 'Resolution', min: 6, max: 90, step: 1, def: 24, unit: ' rows' },
      { key: 'gap', label: 'Block gap', min: 0, max: 0.75, step: 0.02, def: 0.12, ...RATIO },
      {
        key: 'dither',
        label: 'Response',
        kind: 'select',
        def: 'floyd',
        options: [
          { value: 'none', label: 'Off' },
          { value: 'floyd', label: 'Diffusion' },
          { value: 'bayer', label: 'Ordered' },
          { value: 'size', label: 'By size' },
        ],
      },
      SCREEN_ANGLE,
    ],
    render: ({ p, geo, fg, fx }) => {
      // Squares used to be a style of its own — outlined squares on a
      // rotatable lattice, each sized by the ink under it. Everything that
      // made it different from this one is a choice this one can offer:
      // outlined rather than filled, a screen angle, and a response that keeps
      // the grey instead of quantising it. Two cards that differ by three
      // settings are one card with three settings.
      //
      // Resolution counts rows, not columns, so density stays put as the
      // subject gets wider. Lower = fewer, chunkier blocks.
      const { cell, cells, originX, originY, cx, cy } = ditherCells(
        geo,
        geo.box.height / p.resolution,
        p.dither,
        fx,
        null,
        p.angle,
      );
      const inset = (cell * p.gap) / 2;
      const full = cell - inset * 2;
      if (full <= 0) return { body: '', clip: false };

      /**
       * The blocks, and where an outline's weight goes.
       *
       * SVG strokes a path down its middle: half the width falls outside the
       * shape. So an outlined block of side `s` covered `s + thickness` on the
       * screen, growing into the gap the Block gap slider had just been used
       * to set — turn the weight up and the grid closed itself, which is the
       * one thing a block grid must not do.
       *
       * There is no `stroke-alignment` to reach for; browsers dropped it. The
       * way to stroke inside a shape is to stroke a smaller one: inset the
       * square by half the weight and the outer edge of the stroke lands
       * exactly where the block's edge was. The grid then keeps its spacing
       * at every weight, which is the whole point.
       *
       * A block smaller than the weight cannot be outlined at all — the stroke
       * would be wider than the thing it outlines. Those are drawn filled, at
       * their true size, in a second path. That is not a fallback: an outline
       * heavier than its block *is* a solid block, and drawing it as one is
       * the only reading that keeps the tone right.
       */
      const stroke = p.style === 'outline' ? p.thickness : 0;
      const outlined = [];
      const solid = [];
      for (const [col, row, ink] of cells) {
        // Area with darkness, the way a print screen behaves — and a no-op
        // for the dithering responses, which hand back a flat 1.
        const size = full * byInk(ink);
        if (size <= 0.05) continue;
        const slack = (cell - size) / 2;
        const left = originX + col * cell + slack;
        const top = originY + row * cell + slack;
        if (stroke > 0 && size > stroke) {
          const inner = size - stroke;
          const x = num(left + stroke / 2);
          const y = num(top + stroke / 2);
          outlined.push(`M${x} ${y}h${num(inner)}v${num(inner)}h${num(-inner)}z`);
        } else {
          const x = num(left);
          const y = num(top);
          solid.push(`M${x} ${y}h${num(size)}v${num(size)}h${num(-size)}z`);
        }
      }

      // The grid is sampled turned and drawn straight, so one rotation on the
      // group is what puts the drawing back where the sampling was.
      const turned = p.angle
        ? `<g transform="rotate(${num(p.angle)} ${num(cx)} ${num(cy)})">`
        : '<g>';

      const body =
        (outlined.length
          ? `<path d="${outlined.join('')}" fill="none" stroke="${fg}" ` +
            `stroke-width="${num(p.thickness)}"/>`
          : '') +
        (solid.length ? `<path d="${solid.join('')}" fill="${fg}"/>` : '');

      // Not clipped: the blocks are meant to overshoot the silhouette. That
      // stair-stepped edge is the whole point of the style.
      return { body: `${turned}${body}</g>`, clip: false };
    },
  },

  {
    id: 'dots',
    label: 'Dots',
    blurb: 'Round marks — scattered on a grid, or grown until they touch.',
    motion: { key: 'seed', from: 1, to: 60, loop: 'wrap' },
    params: [
      /**
       * Two ways of covering a shape in circles.
       *
       * Scattered puts one on every cell of a jittered grid and sizes it by
       * the ink under it. Packed grows each one until it meets its neighbour
       * or the edge, so the size comes from the room available rather than
       * from the tone. Same mark, same subject; what differs is where the
       * radius comes from, which is a setting.
       */
      {
        key: 'mode',
        label: 'Circles',
        kind: 'select',
        def: 'scattered',
        options: [
          { value: 'scattered', label: 'Scattered' },
          { value: 'packed', label: 'Packed' },
        ],
      },
      { key: 'spacing', label: 'Grid spacing', min: 3, max: 30, step: 1, def: 8 },
      { key: 'dotScale', label: 'Dot scale', min: 0.05, max: 0.6, step: 0.01, def: 0.22, ...RATIO },
      { key: 'scatter', label: 'Scatter', min: 0, max: 1, step: 0.02, def: 0.55, ...RATIO },
      { key: 'largest', label: 'Largest circle', min: 3, max: 70, step: 1, def: 26 },
      { key: 'smallest', label: 'Smallest circle', min: 0.5, max: 14, step: 0.5, def: 2 },
      { key: 'gap', label: 'Clearance', min: 0, max: 8, step: 0.25, def: 1 },
      { key: 'scale', label: 'Fill', min: 0.2, max: 1, step: 0.02, def: 0.92, ...RATIO },
      {
        key: 'style',
        label: 'Ink',
        kind: 'select',
        def: 'filled',
        options: [
          { value: 'filled', label: 'Filled' },
          { value: 'outline', label: 'Outline' },
        ],
      },
      { key: 'thickness', label: 'Stroke width', min: 0.25, max: 6, step: 0.25, def: 1.5 },
      SEED,
    ],
    render: ({ p, geo, fg, fx }) => {
      if (p.mode === 'packed') {
        return {
          body: packingMarks({
            geo,
            fx,
            color: fg,
            scale: p.scale,
            style: p.style,
            thickness: p.thickness,
            // A smallest above the largest would ask for circles that cannot
            // exist; the slider pair is independent, so the order is enforced
            // here.
            circles: packCircles({ ...p, geo, smallest: Math.min(p.smallest, p.largest * 0.9) }),
          }),
          clip: false,
        };
      }

      const marks = motifGrid({
        geo,
        fx,
        spacing: p.spacing,
        motif: (x, y, cell, ink) => {
          const gx = Math.round(x / cell);
          const gy = Math.round(y / cell);
          // Jitter and size both come from the same hash, so a seed change
          // reshuffles the texture without ever drifting between renders.
          const jx = (hashRandom(gx, gy, p.seed) - 0.5) * cell * p.scatter;
          const jy = (hashRandom(gx, gy, p.seed + 91) - 0.5) * cell * p.scatter;
          const vary = 0.6 + hashRandom(gx, gy, p.seed + 17) * 0.8;
          const r = cell * p.dotScale * vary * byInk(ink);
          if (r <= 0.05) return '';
          return `<circle cx="${num(x + jx)}" cy="${num(y + jy)}" r="${num(r)}"/>`;
        },
      });
      const paint =
        p.style === 'outline'
          ? `fill="none" stroke="${fg}" stroke-width="${num(p.thickness)}"`
          : `fill="${fg}"`;
      return { body: `<g ${paint}>${marks}</g>`, clip: false };
    },
  },

  {
    id: 'physarum',
    label: 'Physarum',
    blurb: 'A colony that feeds on the word and bridges letter to letter.',
    motion: { key: 'level', from: 0.05, to: 0.6, loop: 'pingpong' },
    params: [
      { key: 'density', label: 'Colony', min: 0.02, max: 0.8, step: 0.02, def: 0.22, ...RATIO },
      { key: 'steps', label: 'Growth', min: 20, max: 240, step: 5, def: 140 },
      { key: 'sense', label: 'Sensor angle', min: 5, max: 80, step: 1, def: 38, unit: '\u00b0' },
      { key: 'turn', label: 'Turn', min: 2, max: 60, step: 1, def: 25, unit: '\u00b0' },
      { key: 'reach', label: 'Sensor reach', min: 1, max: 16, step: 0.5, def: 8 },
      { key: 'decay', label: 'Decay', min: 0.01, max: 0.4, step: 0.01, def: 0.09, ...RATIO },
      /**
       * How strongly the word feeds the colony — and the range is the point.
       *
       * Food is laid on the ink every step and settles at food/decay, so a
       * generous setting makes the letterform a plateau. Three sensors on a
       * plateau read the same number three times, the tie is broken by a coin,
       * and the positive feedback that builds a network never starts: the
       * colony spreads evenly and draws a thickened letter. That is what this
       * style shipped, at every setting of every other control.
       *
       * The network lives between about 0.008 and 0.05, which on the old
       * control was the bottom three per cent of the travel with the default
       * six times above the top of it. Rescaled to the band; the old behaviour
       * is still there at the far end where it belongs.
       */
      { key: 'food', label: 'Pull of the word', min: 0.004, max: 0.2, step: 0.002, def: 0.03 },
      // In stroke widths, measured off the letterform itself, so it means the
      // same at any size of word. Around one and a half the halos of adjacent
      // letters meet and the network bridges between them; below about a half
      // it hugs each letter on its own.
      { key: 'spread', label: 'Spread', min: 0.2, max: 4, step: 0.1, def: 1.5 },
      { key: 'level', label: 'Threshold', min: 0.02, max: 0.8, step: 0.02, def: 0.22, ...RATIO },
      { key: 'smoothing', label: 'Smoothing', min: 0, max: 1.2, step: 0.05, def: 0.3, ...RATIO },
      {
        key: 'style',
        label: 'Colony',
        kind: 'select',
        def: 'filled',
        options: [
          { value: 'filled', label: 'Filled' },
          { value: 'outline', label: 'Outline' },
        ],
      },
      { key: 'thickness', label: 'Stroke width', min: 0.25, max: 5, step: 0.25, def: 1 },
      SEED,
    ],
    render: ({ p, geo, fg, fx }) => ({
      body: physarumMarks({ geo, fx, color: fg, ...p }),
      clip: false,
    }),
  },

  {
    id: 'rules',
    label: 'Rules',
    blurb: 'Parallel strokes across the shape, each one weighed by the ink under it.',
    motion: { key: 'angle', from: 0, to: 180, loop: 'wrap' },
    params: [
      /**
       * One idea, not two.
       *
       * There were two here — Cut measured where a rule actually crosses the
       * shape and drew only those spans, Weighed walks a column and turns each
       * run of ink into one mark as wide as the ink is dark. They were on one
       * card because both are parallel strokes laid across a silhouette and the
       * difference is only whether a stroke is cut by the shape or sized by it.
       *
       * Cut is gone, and five controls went with it: the line thickness it
       * measured its strokes in, and the continuity, noise, line ends, dash and
       * phase that were about the ends of a cut span. The walk below reads none
       * of them — it only ever needed the spacing, the angle, and the two
       * numbers that shape a bar.
       */
      { key: 'spacing', label: 'Spacing', min: 3, max: 48, step: 0.5, def: 10 },
      { key: 'angle', label: 'Rotation', min: 0, max: 180, step: 1, def: 90, unit: '\u00b0' },
      { key: 'scale', label: 'Bar width', min: 0.1, max: 1, step: 0.02, def: 0.7, ...RATIO },
      { key: 'round', label: 'Corner radius', min: 0, max: 0.5, step: 0.02, def: 0.3, ...RATIO },
    ],
    render: ({ p, geo, fg, fx }) => {

      /**
       * Weighed strokes, on any axis.
       *
       * The walk is the same one Bars always did — down a line, and every run
       * of ink becomes a mark as wide as the ink is dark — but it is done in a
       * frame turned by the rotation and drawn back straight, which is the
       * same trick 8-bit uses for its screen angle. Rotating the finished
       * drawing instead would turn the marks with it and leave a bar lying
       * across its own column.
       */
      const { box, tone } = geo;
      const floor = geo.floor ?? 0.5;
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      const turn = ((p.angle - 90) * Math.PI) / 180;
      const cos = Math.cos(turn);
      const sin = Math.sin(turn);
      // A turned frame has to cover the corners of the straight one.
      const reach = Math.hypot(box.width, box.height) / 2;
      const cols = Math.max(1, Math.floor((reach * 2) / p.spacing));
      const step = (reach * 2) / cols;
      const rowStep = Math.max(1.5, step / 3);
      const bars = [];

      for (let c = 0; c < cols; c++) {
        const u = -reach + (c + 0.5) * step;
        const nx = (u + reach) / (reach * 2);
        if (fx.wipe !== null && nx > fx.wipe) continue;
        if (fx.build < 1 && hashRandom(c, 0, fx.reveal) > fx.build) continue;

        let open = null;
        for (let v = -reach; v <= reach; v += rowStep) {
          // The sample point, taken in the turned frame.
          const sx = cx + u * cos - v * sin;
          const sy = cy + u * sin + v * cos;
          const lit =
            sx >= box.x && sx <= box.x + box.width &&
            sy >= box.y && sy <= box.y + box.height &&
            tone.average(sx, sy, step) >= floor;
          if (lit && open === null) open = v;
          if ((!lit || v + rowStep > reach) && open !== null) {
            const ny = ((open + v) / 2 + reach) / (reach * 2);
            if (!irisHides(fx, nx, ny)) {
              const gain = weighsMarks(fx) ? markWeight(fx, nx, ny) : 1;
              const w = Math.max(0.2, step * p.scale * Math.sqrt(Math.max(0.02, gain)));
              const h = Math.max(rowStep, v - open);
              bars.push(
                `<rect x="${num(cx + u - w / 2)}" y="${num(cy + open)}" width="${num(w)}" ` +
                  `height="${num(h)}" rx="${num(w * p.round)}"/>`,
              );
            }
            open = null;
          }
        }
      }
      const back = p.angle === 90 ? '' : ` transform="rotate(${num((p.angle - 90))} ${num(cx)} ${num(cy)})"`;
      return { body: `<g fill="${fg}"${back}>${bars.join('')}</g>`, clip: false };
    },
  },

  {
    id: 'spiral',
    label: 'Spiral',
    blurb: 'A single coil from the centre, thickening where the ink is.',
    motion: { key: 'phase', from: 0, to: 1, loop: 'wrap' },
    params: [
      { key: 'spacing', label: 'Coil spacing', min: 3, max: 30, step: 0.5, def: 9 },
      { key: 'thickness', label: 'Max thickness', min: 0.5, max: 16, step: 0.25, def: 6 },
      { key: 'phase', label: 'Phase', min: 0, max: 1, step: 0.01, def: 0, ...RATIO },
    ],
    render: ({ p, geo, fg, fx }) => {
      const { box, tone } = geo;
      const floor = geo.floor ?? 0.5;
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      const reach = Math.hypot(box.width, box.height) / 2;

      /**
       * One coil, walked by arc length.
       *
       * WHAT WAS WRONG
       *
       * It stepped by a constant *angle* — ninety segments to a turn, whatever
       * the radius — and drew a straight line between each pair. Near the
       * middle that is a fine sampling of a small circle; at the rim it is a
       * 47px chord laid across coils 3px apart. Two things came of that, and
       * both are in the picture: the letters broke up into scattered dashes,
       * because a 47px segment is either wholly in the ink or wholly out of it
       * and there is nothing in between; and the chords cut across their own
       * neighbours, because a straight line between two points of a curve does
       * not stay on the curve.
       *
       * So the walk is by distance now. The spiral is Archimedean, r = a·θ with
       * a = spacing / 2π, and its arc element is a·√(θ²+1)·dθ — invert that and
       * the angular step falls out of the distance you want to travel. The step
       * is also capped in angle, because at the very centre the same distance is
       * most of a revolution and the cap is what keeps the first few turns round.
       *
       * THE OTHER COLLISION
       *
       * Coil spacing goes down to 3 and Max thickness up to 16, so a coil could
       * be five times wider than the gap to the next one and the whole field
       * filled in solid. A stroke is now allowed at most 95% of the spacing,
       * which is the one bound that makes the two controls independent: every
       * combination draws a spiral rather than a disc.
       */
      const pitch = p.spacing / (Math.PI * 2);
      const widest = Math.min(p.thickness, p.spacing * 0.95);

      // A step fine enough to follow the ink, and a budget so a tight spacing
      // over a large frame cannot ask for a quarter of a million samples.
      const MAX_SAMPLES = 24000;
      const arc = (Math.PI * reach * reach) / p.spacing;
      /**
       * The step is whatever gets the coil to the rim inside the budget.
       *
       * It was also capped at 3px, and that cap is what a budget already does —
       * except that when the two disagreed the cap won and the walk simply
       * stopped early. At the tightest spacing the arc is a quarter of a
       * million pixels long, so twenty-four thousand steps of 3 reached about a
       * third of the way out and the outer letters were never drawn at all: the
       * word came out cropped, which looked like a layout bug and was a budget
       * one. Only the floor is kept, because there is no point sampling finer
       * than the ink can be read.
       */
      const ds = Math.max(0.9, arc / MAX_SAMPLES);
      const MAX_TURN = 0.3;

      /**
       * Ten paths, not ten thousand lines.
       *
       * Every segment carries its own weight, and SVG has no way to vary the
       * width along one stroke — so this used to be one <line> per segment,
       * which at this sampling would be tens of thousands of elements. Rounding
       * the weight into ten steps and giving each step its own path collapses
       * that to ten, and consecutive segments at the same weight join into one
       * subpath rather than repeating their shared point.
       */
      const STEPS = 10;
      const runs = Array.from({ length: STEPS }, () => ({ d: '', at: null }));

      let theta = p.phase * Math.PI * 2;
      const theta0 = theta;
      let prev = [cx + Math.cos(theta) * 0, cy + Math.sin(theta) * 0];

      for (let n = 0; n < MAX_SAMPLES; n++) {
        const r = pitch * (theta - theta0);
        if (r > reach) break;
        const turned = theta - theta0;
        theta += Math.min(MAX_TURN, ds / (pitch * Math.sqrt(turned * turned + 1)));
        const nr = pitch * (theta - theta0);
        const x = cx + Math.cos(theta) * nr;
        const y = cy + Math.sin(theta) * nr;

        const mx = (prev[0] + x) / 2;
        const my = (prev[1] + y) / 2;
        const nx = (mx - box.x) / box.width;
        const ny = (my - box.y) / box.height;
        // Averaged over the coil pitch rather than the segment, so the weight
        // reads the ink the coil is passing through and not one pixel of it.
        const ink = tone.average(mx, my, p.spacing);
        const hidden =
          ink < floor ||
          (fx.wipe !== null && nx > fx.wipe) ||
          irisHides(fx, nx, ny) ||
          (fx.build < 1 && r / reach > fx.build);

        if (!hidden) {
          const gain = weighsMarks(fx) ? markWeight(fx, nx, ny) : 1;
          const weight = Math.max(0.05, Math.min(1, ink * Math.max(0.05, gain)));
          const step = Math.min(STEPS - 1, Math.max(0, Math.round(weight * (STEPS - 1))));
          const run = runs[step];
          const from = `${num(prev[0])} ${num(prev[1])}`;
          if (run.at === from) run.d += `L${num(x)} ${num(y)}`;
          else run.d += `M${from}L${num(x)} ${num(y)}`;
          run.at = `${num(x)} ${num(y)}`;
        } else {
          for (const run of runs) run.at = null;
        }
        prev = [x, y];
      }

      const parts = runs
        .map((run, i) =>
          run.d
            ? `<path d="${run.d}" stroke-width="${num(Math.max(0.15, (widest * (i + 1)) / STEPS))}"/>`
            : '',
        )
        .filter(Boolean);

      return {
        body: `<g fill="none" stroke="${fg}" stroke-linecap="round" stroke-linejoin="round">${parts.join('')}</g>`,
        clip: false,
      };
    },
  },

  {
    id: 'beads',
    label: 'Beads',
    blurb: 'Threaded along the outline, leaving the middle empty.',
    motion: { key: 'offset', from: -14, to: 14, loop: 'pingpong' },
    params: [
      { key: 'spacing', label: 'Bead spacing', min: 3, max: 60, step: 1, def: 13 },
      { key: 'size', label: 'Bead size', min: 0.5, max: 14, step: 0.25, def: 3.5 },
      { key: 'variation', label: 'Variation', min: 0, max: 1, step: 0.02, def: 0.25, ...RATIO },
      { key: 'offset', label: 'Ride', min: -14, max: 14, step: 0.5, def: 0 },
      { key: 'smoothing', label: 'Smoothing', min: 0, max: 1.5, step: 0.05, def: 0.35, ...RATIO },
      SEED,
    ],
    render: ({ p, geo, fg, fx }) => ({
      body: beadMarks({ geo, fx, color: fg, style: 'filled', thickness: 1.25, ...p }),
      clip: false,
    }),
  },

  {
    id: 'threads',
    label: 'Threads',
    blurb: 'Nothing is cut — the word is where the threads thicken.',
    motion: { key: 'angle', from: 0, to: 180, loop: 'wrap' },
    params: [
      { key: 'spacing', label: 'Thread spacing', min: 2, max: 40, step: 0.5, def: 9 },
      { key: 'angle', label: 'Angle', min: 0, max: 180, step: 1, def: 0, unit: '°' },
      { key: 'thin', label: 'Thinnest', min: 0, max: 8, step: 0.1, def: 0, zeroLabel: 'ends' },
      { key: 'thick', label: 'Thickest', min: 0.5, max: 40, step: 0.5, def: 8 },
      { key: 'falloff', label: 'Fade out', min: 0, max: 1, step: 0.02, def: 0.28, ...RATIO },
      { key: 'response', label: 'Response', min: 0.2, max: 4, step: 0.1, def: 1 },
      { key: 'wobble', label: 'Unevenness', min: 0, max: 0.6, step: 0.02, def: 0, ...RATIO },
      SEED,
    ],
    render: ({ p, geo, fg, fx }) => ({
      body: threadMarks({ geo, fx, color: fg, ...p }),
      clip: false,
    }),
  },

  {
    id: 'rings',
    label: 'Rings',
    blurb: 'Rings radiating from the centre of the frame.',
    motion: { key: 'phase', from: 0, to: 1, loop: 'wrap' },
    params: [
      { key: 'spacing', label: 'Ring spacing', min: 4, max: 50, step: 0.5, def: 14 },
      { key: 'thickness', label: 'Ring thickness', min: 0.25, max: 14, step: 0.25, def: 3.5 },
      ...LINE_FINISH,
    ],
    render: ({ p, geo, fg, fx }) => ({
      body: rings({ geo, color: fg, fx, ...p }),
      clip: false,
    }),
  },

  {
    id: 'maze',
    label: 'Maze',
    blurb: 'One route between any two points inside a letter.',
    motion: { key: 'seed', from: 1, to: 60, loop: 'wrap' },
    params: [
      { key: 'spacing', label: 'Cell size', min: 3, max: 40, step: 1, def: 11 },
      { key: 'thickness', label: 'Line thickness', min: 0.25, max: 8, step: 0.25, def: 1.75 },
      {
        key: 'style',
        label: 'Draw',
        kind: 'select',
        def: 'walls',
        options: [
          { value: 'walls', label: 'Walls' },
          { value: 'corridors', label: 'Corridors' },
        ],
      },
      { key: 'braid', label: 'Loops', min: 0, max: 0.6, step: 0.02, def: 0.08, ...RATIO },
      SEED,
    ],
    render: ({ p, geo, fg, fx }) => ({
      body: mazeMarks({ geo, fx, color: fg, ...p }),
      clip: false,
    }),
  },

  {
    id: 'sampler',
    label: 'Sampler',
    blurb: 'Every letter filled with a design of its own.',
    skipTonal: true,
    motion: { key: 'variety', from: 1, to: 12, loop: 'pingpong' },
    params: [
      { key: 'spacing', label: 'Module', min: 4, max: 60, step: 1, def: 21 },
      { key: 'variety', label: 'Designs', min: 1, max: 12, step: 1, def: 12 },
      {
        key: 'change',
        label: 'Design changes',
        kind: 'select',
        def: 'letter',
        options: [
          { value: 'letter', label: 'Letter' },
          { value: 'word', label: 'Once' },
          { value: 'cell', label: 'Module' },
        ],
      },
      { key: 'scale', label: 'Fill', min: 0.5, max: 1, step: 0.02, def: 1, ...RATIO },
      { key: 'weight', label: 'Outline', min: 0, max: 6, step: 0.25, def: 0, zeroLabel: 'solid' },
      SEED,
    ],
    render: ({ p, geo, fg, fx }) => ({
      body: samplerMarks({ geo, fx, color: fg, ...p }),
      clip: false,
    }),
  },

  {
    id: 'blots',
    label: 'Blots',
    blurb: 'Gone over with a marker too broad for it, one touch at a time.',
    skipTonal: true,
    motion: { key: 'scale', from: 0.5, to: 2.2, loop: 'pingpong' },
    params: [
      { key: 'spacing', label: 'Touch spacing', min: 3, max: 60, step: 1, def: 19 },
      { key: 'scale', label: 'Nib size', min: 0.3, max: 2.6, step: 0.05, def: 0.92, ...RATIO },
      { key: 'vary', label: 'Uneven', min: 0, max: 0.7, step: 0.02, def: 0.22, ...RATIO },
      { key: 'climb', label: 'Find the spine', min: 0, max: 1, step: 0.05, def: 1, ...RATIO },
      { key: 'rough', label: 'Wet edge', min: 0, max: 0.5, step: 0.01, def: 0.09, ...RATIO },
      { key: 'facets', label: 'Blot sides', min: 5, max: 30, step: 1, def: 14 },
      SEED,
    ],
    render: ({ p, geo, fg, fx }) => ({
      body: blotMarks({ geo, fx, color: fg, ...p }),
      clip: false,
    }),
  },

  {
    id: 'blocks',
    label: 'Blocks',
    blurb: 'Assembled out of bars, quarter rounds and wedges.',
    motion: { key: 'spacing', from: 10, to: 54, loop: 'pingpong' },
    params: [
      { key: 'spacing', label: 'Grid', min: 6, max: 90, step: 1, def: 30 },
      { key: 'variety', label: 'Pieces in the yard', min: 1, max: 18, step: 1, def: 18 },
      { key: 'scale', label: 'Fill', min: 0.4, max: 1, step: 0.02, def: 0.94, ...RATIO },
      SEED,
    ],
    render: ({ p, geo, fg, fx }) => ({
      body: blockMarks({ geo, fx, color: fg, ...p }),
      clip: false,
    }),
  },

  {
    id: 'isometric',
    label: 'Isometric',
    blurb: 'The word extruded, seen from the corner.',
    motion: { key: 'depth', from: 0, to: 8, loop: 'pingpong' },
    params: [
      { key: 'spacing', label: 'Cube size', min: 4, max: 60, step: 1, def: 24 },
      { key: 'definition', label: 'Definition', min: 0, max: 1, step: 0.02, def: 0.5, ...RATIO },
      { key: 'depth', label: 'Extrusion', min: 0, max: 8, step: 0.1, def: 1.6, ...RATIO },
      {
        key: 'angle',
        label: 'Direction',
        kind: 'select',
        def: 45,
        options: [
          { value: 45, label: '\u2197' },
          { value: 135, label: '\u2196' },
          { value: 225, label: '\u2199' },
          { value: 315, label: '\u2198' },
        ],
      },
      {
        key: 'style',
        label: 'Faces',
        kind: 'select',
        def: 'solid',
        options: [
          { value: 'solid', label: 'Solid' },
          { value: 'outline', label: 'Outline' },
        ],
      },
      { key: 'thickness', label: 'Edge width', min: 0.25, max: 5, step: 0.25, def: 1 },
    ],
    render: ({ p, geo, fg, bg, fx }) => ({
      body: isometricMarks({ geo, fx, color: fg, background: bg, ...p }),
      clip: false,
    }),
  },

  {
    id: 'matrix',
    label: 'Matrix',
    blurb: 'Lamps on a grid — a run of them is a dash, one of them is a dot.',
    motion: { key: 'dot', from: 0.25, to: 1.05, loop: 'pingpong' },
    params: [
      { key: 'spacing', label: 'Lamp pitch', min: 5, max: 44, step: 1, def: 15 },
      { key: 'dot', label: 'Lamp size', min: 0.2, max: 1.1, step: 0.02, def: 0.62, ...RATIO },
      {
        key: 'merge',
        label: 'Runs',
        kind: 'select',
        def: 'rows',
        options: [
          { value: 'rows', label: 'Across' },
          { value: 'columns', label: 'Down' },
          { value: 'both', label: 'Both' },
          { value: 'none', label: 'Dots' },
        ],
      },
    ],
    render: ({ p, geo, fg, fx }) => ({
      body: matrixMarks({ geo, fx, color: fg, ...p }),
      clip: false,
    }),
  },
];

/**
 * The file's four sections, and the order the book is bound in.
 *
 * Stated here rather than by the order the definitions happen to sit in above,
 * because this is the one thing about the registry a reader wants at a glance:
 * what kinds of style there are, and which is which. Adding a style means
 * appending its definition above and its id to one of these lists.
 *
 * The division is by how a style is *made*, not by how it looks, because that
 * is the thing that stays true. A silhouette treated whole, a mark stamped per
 * cell of a grid, a line measured across the shape, and something grown on it:
 * every pattern in this app is one of those four, and the index says so.
 */
const GROUPS = [
  {
    letter: 'A',
    name: 'Letterform',
    // The silhouette itself, altered as one shape.
    ids: ['defocus', 'sampler'],
  },
  {
    letter: 'B',
    name: 'Screens',
    // One whole mark per cell, chosen or sized by the tone under it.
    ids: ['circles', 'cross-stitch', 'pixel', 'matrix', 'beads', 'blocks', 'isometric'],
  },
  {
    letter: 'C',
    name: 'Lines',
    // Continuous strokes, measured where they actually cross the shape.
    ids: ['rules', 'spiral', 'threads', 'rings', 'maze'],
  },
  {
    letter: 'D',
    name: 'Grown',
    // Points, territories and organisms that find the word for themselves.
    ids: ['dots', 'physarum', 'blots'],
  },
];

/**
 * The registry proper: every style, in file order, each carrying its section.
 *
 * The reconciliation is checked rather than trusted. A style defined and never
 * listed would simply vanish from the app, and a typo in an id would vanish it
 * just as quietly — both are the kind of fault that shows up as "where did
 * Voronoi go" three days later instead of as an error now.
 */
const byId = new Map(DEFINED.map((pattern) => [pattern.id, pattern]));

let place = 0;

export const PATTERNS = GROUPS.flatMap((group) =>
  group.ids.map((id) => {
    const pattern = byId.get(id);
    if (!pattern) throw new Error(`Pattern "${id}" is in group ${group.letter} but not defined`);
    return {
      ...pattern,
      group: group.letter,
      groupName: group.name,
      // Just the place in the file: 01 to 22, running straight through. The
      // section is still there and still does its work — it decides the
      // colour of the tab and which rack it stands in — it is simply not
      // something the tab has to spell out. Two characters read at a size
      // four never could.
      // The place in the file and nothing else. "N." is a fixed prefix and
      // not a group — it reads as a filing number, which is what a folder tab
      // carries. The section letters were tried here and made the number
      // harder to read while telling you something the page already says.
      mark: `N.${String(++place).padStart(2, '0')}`,
    };
  }),
);

if (PATTERNS.length !== DEFINED.length) {
  const listed = new Set(GROUPS.flatMap((g) => g.ids));
  const missing = DEFINED.filter((p) => !listed.has(p.id)).map((p) => p.id);
  throw new Error(`Defined but not in any group: ${missing.join(', ')}`);
}
