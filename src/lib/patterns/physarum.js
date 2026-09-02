/**
 * Slime mould, growing on the word.
 *
 * Physarum polycephalum has no brain and no plan, and it reliably finds the
 * shortest path through a maze. Each agent does three things: look a little way
 * ahead to the left, straight on, and to the right; turn toward whichever smells
 * strongest; move, and leave a trail of its own behind it. The trail spreads a
 * little and fades a little between steps. That is the whole rule, and out of it
 * comes the branching, reinforcing, self-pruning network the organism actually
 * builds — paths that carry traffic get stronger and paths that do not vanish.
 *
 * This is the effect the earlier reaction-diffusion attempt was reaching for and
 * never held. Turing patterns live in a narrow band of feed and kill rates, and
 * a step outside it in either direction gives a dead field or a flooded one —
 * which is exactly what that attempt produced, repeatedly. There is no such
 * cliff here. Any sane sensor angle and decay give a network; the settings
 * change what kind, not whether.
 *
 * The letterform enters as food, and how *little* of it there should be is the
 * whole difficulty. The obvious move is to keep the word topped up so it stays
 * the strongest smell in the frame; four attempts at that produced a solid
 * word with a texture on it and no network at all, because a uniform blanket
 * of food has no gradient in it — inside a filled letter every cell smells the
 * same, so agents mill about and fill it rather than finding paths through it.
 *
 * The network only exists when the colony's own trail is what it is following.
 * So the word does two small things: it decides where the agents start, and it
 * adds a light bias that keeps them coming back. Everything that reads as
 * branching, thinning and reaching is the trail, not the letter. Turn the food
 * up and the effect disappears — which is why that slider stops early.
 *
 * The trail is a field like any other by the time it is drawn, so it goes
 * through the same marching squares as an image silhouette and comes out as
 * real outlines. Nothing raster survives into the export.
 */

import { traceField } from '../sources/trace.js';
import { distanceField } from './distance.js';
import { hashRandom, num } from './helpers.js';

/**
 * Grid the colony lives on.
 *
 * Coarser than the tone field, and the size is a real trade rather than a
 * default. Diffusion runs once per step over every cell, so cells times steps
 * is the whole cost: at a quarter of a million cell-steps this took five
 * seconds, which is not a live preview of anything. Too coarse is worse — at
 * ninety rows a filament is thinner than a cell and every trail came out as a
 * blob — so this sits where filaments still resolve and a run finishes in
 * about a second. The whole run is cached; only the threshold moves cheaply.
 */
/**
 * Headings, as an index into a circle rather than an angle.
 *
 * An agent asks for a sine and a cosine eight times a step — three sensors, a
 * heading, a step taken — and at the top of the colony and growth sliders that
 * is some thirty million calls to Math.cos and Math.sin in one render. They are
 * all asking about the same circle, so the circle is tabulated once and the
 * heading becomes an integer index into it. Turning is then an integer add, and
 * because the table is a power of two the wrap is a mask — which is also the
 * right answer for a negative index, two's complement seeing to it.
 *
 * Four thousand and ninety six directions is a step of 0.088 degrees, against a
 * turn control whose smallest setting is 2. What the quantisation costs is that
 * a turn is rounded to the nearest of those — 25 degrees becomes 24.96 — so a
 * colony no longer walks the identical path it walked before. It is a chaotic
 * system and it never walked a path anyone could predict; the character of it
 * is set by the sensor geometry, and that is unchanged.
 */
const DIRS = 4096;
const DIR_MASK = DIRS - 1;
const COS = new Float32Array(DIRS);
const SIN = new Float32Array(DIRS);
for (let i = 0; i < DIRS; i++) {
  const a = (i / DIRS) * Math.PI * 2;
  COS[i] = Math.cos(a);
  SIN[i] = Math.sin(a);
}

const MAX_ROWS = 190;
const MAX_CELLS = 70_000;
const MAX_AGENTS = 18_000;

let cached = null;

/**
 * The diffusion step: a 3x3 box blur, done as two 3-tap passes.
 *
 * Separable and identical in result — a box blur is the same in either form —
 * but six reads a cell instead of nine, and this runs once per step over the
 * whole grid, so it is the single most expensive thing here by a wide margin.
 */
function diffuse(trail, next, cols, rows, keep) {
  const last = cols - 1;
  for (let r = 0; r < rows; r++) {
    const row = r * cols;
    // Sliding, so each cell is read once rather than three times: the right
    // neighbour of one column is the centre of the next.
    let a = trail[row];
    let b = trail[row];
    for (let c = 0; c < cols; c++) {
      const d = trail[row + (c < last ? c + 1 : c)];
      next[row + c] = a + b + d;
      a = b;
      b = d;
    }
  }

  /**
   * The vertical pass, walked along the rows rather than down the columns.
   *
   * It used to be `for each column, for each row`, which is the way the maths
   * reads and the worst way to ask memory for it: consecutive reads sat one
   * whole row apart, so every one of them was a fresh cache line for a single
   * float. Rows outermost touches the same three lines for a whole row and
   * gives an identical answer. It is two thirds of this style's cost at the
   * default settings, and the transpose is most of that.
   */
  const scale = keep / 9;
  for (let r = 0; r < rows; r++) {
    const up = (r > 0 ? r - 1 : r) * cols;
    const mid = r * cols;
    const down = (r < rows - 1 ? r + 1 : r) * cols;
    for (let c = 0; c < cols; c++) {
      trail[mid + c] = (next[up + c] + next[mid + c] + next[down + c]) * scale;
    }
  }
}

export function growColony({ geo, density, steps, sense, turn, reach, decay, food, spread, seed }) {
  const key = [
    geo.key ?? geo.d.length, geo.box.x, geo.box.width,
    density, steps, sense, turn, reach, decay, food, spread, seed,
  ].join('|');
  if (cached && cached.key === key) return cached.value;

  const { box, tone } = geo;
  const aspect = box.width / box.height;
  let rows = MAX_ROWS;
  let cols = Math.max(8, Math.round(rows * aspect));
  if (cols * rows > MAX_CELLS) {
    const shrink = Math.sqrt(MAX_CELLS / (cols * rows));
    cols = Math.max(8, Math.floor(cols * shrink));
    rows = Math.max(8, Math.floor(rows * shrink));
  }

  // Ink, sampled once onto the colony's own grid. Re-asking the tone field
  // inside the loop would be the same answer a million times over.
  const ink = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = box.x + ((c + 0.5) / cols) * box.width;
      const y = box.y + ((r + 0.5) / rows) * box.height;
      ink[r * cols + c] = tone.at(x, y);
    }
  }

  /**
   * How far off the letters the colony is allowed to get.
   *
   * The colony used to have the run of the frame, and it wrapped at the edges
   * on the argument that a wall collects agents along it and draws a line
   * about the frame rather than about the word. That is true, and wrapping is
   * not the answer to it: an agent leaving the top reappeared at the bottom,
   * so the frame still got its line — a filament arriving from an edge with
   * nothing on the other side of it, growing out of the border.
   *
   * The answer is that neither edge should ever be reached. A colony feeds on
   * what is there; a page of paper is not food, and a real one does not strike
   * out across it. So the walk is bounded by the letterform itself: agents may
   * work the ink and the space immediately around it — far enough to bridge
   * from one letter to the next, which is where the network belongs — and are
   * turned back before they get anywhere near the frame.
   *
   * The bound is measured, not set. Distance is signed here, so the mean depth
   * inside the ink is a quarter of the typical stroke, and four times it is
   * the stroke itself. `spread` is then in stroke widths, which is a unit that
   * means the same thing at any size of word, on any frame.
   */
  const sdf = distanceField(geo);
  const away = new Float32Array(cols * rows);
  let depth = 0;
  let inked = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = box.x + ((c + 0.5) / cols) * box.width;
      const y = box.y + ((r + 0.5) / rows) * box.height;
      const d = sdf.at(x, y);
      away[r * cols + c] = d;
      if (d < 0) {
        depth -= d;
        inked++;
      }
    }
  }
  // A blank frame has no letterform to stay near, so it keeps the run of the
  // frame rather than collapsing to nothing.
  let halo = inked > 0 ? spread * 4 * (depth / inked) : Infinity;

  /**
   * And never past the frame, whatever the slider says.
   *
   * A halo in stroke widths is the right unit for the word and says nothing
   * about the room around it. Wound out to four on a word set large, the band
   * reached the edge of the frame and put marks on it — the exact thing the
   * confinement is here to prevent, arrived at from the other direction. So
   * the closest the ink comes to the border is measured too, and the band
   * stops short of it. The slider then runs out of effect rather than running
   * out of frame, which is the failure worth having.
   */
  let edgeGap = Infinity;
  for (let c = 0; c < cols; c++) {
    if (away[c] < edgeGap) edgeGap = away[c];
    if (away[(rows - 1) * cols + c] < edgeGap) edgeGap = away[(rows - 1) * cols + c];
  }
  for (let r = 0; r < rows; r++) {
    if (away[r * cols] < edgeGap) edgeGap = away[r * cols];
    if (away[r * cols + cols - 1] < edgeGap) edgeGap = away[r * cols + cols - 1];
  }
  if (edgeGap > 0 && edgeGap * 0.85 < halo) halo = edgeGap * 0.85;
  // World size of one colony cell — the smallest fade that can still be
  // resolved on this grid, and so the floor on the shoulder below.
  const unit = Math.max(box.width / cols, box.height / rows);

  const cellAway = (c, r) => {
    const cc = c < 0 ? 0 : c >= cols ? cols - 1 : c;
    const rr = r < 0 ? 0 : r >= rows ? rows - 1 : r;
    return away[rr * cols + cc];
  };

  /**
   * How many agents, counted against the ground they are allowed to work.
   *
   * This used to be a share of the whole frame, which was right when the
   * colony had the whole frame. Confined to the letterform and its halo, the
   * same number crowds into perhaps a quarter of the area — every cell gets
   * visited every step, every cell reaches the deposit ceiling, and a field
   * that is uniformly at its maximum thresholds as one solid slab. The first
   * run after the confinement went in came out as a fat inky word with the
   * counters filled and no network in it at all.
   *
   * Counted against the ink, then, and not against the halo either. A colony
   * is as large as its food supply, which is the letterform — the halo is not
   * ground it lives on, it is ground it can reach. Sized to the halo it fills
   * the halo, and a filled halo is a fringe round the word; sized to the ink,
   * the few that wander out are sparse enough to lay paths instead of a
   * blanket, and paths between letters is the whole thing being asked for.
   */
  const ground = inked || cols * rows;
  const count = Math.min(MAX_AGENTS, Math.max(200, Math.round(ground * density)));
  const px = new Float32Array(count);
  const py = new Float32Array(count);
  const heading = new Int32Array(count);

  // Seeded on the word, because that is where the food is — starting them
  // uniformly wastes most of the run on agents walking in from the margin.
  let placed = 0;
  for (let attempt = 0; placed < count && attempt < count * 40; attempt++) {
    const c = hashRandom(attempt, 1, seed) * cols;
    const r = hashRandom(attempt, 2, seed) * rows;
    if (ink[Math.floor(r) * cols + Math.floor(c)] < 0.4) continue;
    px[placed] = c;
    py[placed] = r;
    heading[placed] = (hashRandom(attempt, 3, seed) * DIRS) & DIR_MASK;
    placed++;
  }
  // A source with no ink at all — a blank frame — still gets a colony rather
  // than an empty loop that looks like a crash.
  for (let i = placed; i < count; i++) {
    px[i] = hashRandom(i, 4, seed) * cols;
    py[i] = hashRandom(i, 5, seed) * rows;
    heading[i] = (hashRandom(i, 6, seed) * DIRS) & DIR_MASK;
  }

  const trail = new Float32Array(cols * rows);
  const next = new Float32Array(cols * rows);
  const keep = 1 - decay;
  // Both deposits decay at the same rate, so their steady states are what
  // decide who is visible: food settles at ink * food / decay, an agent
  // visiting every step at 1 / decay. The two are only comparable when food is
  // near one — set it to five, as an earlier attempt did, and the word sits
  // forty times above anything the colony can build, so the threshold keeps
  // the letters and nothing else. The ceiling then stops a knot of agents
  // running away in the other direction and burying the word under a peak
  // nothing else can approach. Twice the food's own level is room enough to
  // be the brightest thing without being the only thing.
  const settled = food / decay;
  const ceiling = settled * 2.2;
  // Both controls arrive in degrees and are used only as a count of table
  // steps. A turn of at least one keeps the smallest setting a turn.
  const senseSteps = Math.round((sense / 360) * DIRS);
  const turnSteps = Math.max(1, Math.round((turn / 360) * DIRS));

  const at = (x, y) => {
    const c = x < 0 ? 0 : x >= cols ? cols - 1 : x | 0;
    const r = y < 0 ? 0 : y >= rows ? rows - 1 : y | 0;
    return trail[r * cols + c];
  };

  /**
   * The word's cells, and what each of them is worth per step.
   *
   * Food is laid down every step for the whole run, and it used to be laid by
   * walking all seventy thousand cells and adding `ink[i] * food` — which is
   * mostly a multiply by zero, because a word covers under a third of its own
   * frame. The inked cells are gathered once instead, with the multiply already
   * done, and the step loop touches those and nothing else.
   */
  const fedAt = [];
  for (let i = 0; i < ink.length; i++) if (ink[i] > 0) fedAt.push(i);
  const fedCell = Int32Array.from(fedAt);
  const fedGain = Float32Array.from(fedAt, (i) => ink[i] * food);
  const fedCount = fedCell.length;

  const total = Math.round(steps);
  for (let step = 0; step < total; step++) {
    // Food first, so the word is always the strongest thing in the field.
    for (let j = 0; j < fedCount; j++) trail[fedCell[j]] += fedGain[j];

    for (let i = 0; i < count; i++) {
      const a = heading[i];
      const li = (a - senseSteps) & DIR_MASK;
      const ri = (a + senseSteps) & DIR_MASK;
      const x = px[i];
      const y = py[i];
      const ahead = at(x + COS[a] * reach, y + SIN[a] * reach);
      const left = at(x + COS[li] * reach, y + SIN[li] * reach);
      const right = at(x + COS[ri] * reach, y + SIN[ri] * reach);

      // Straight on when it is already the best answer; otherwise toward the
      // better side; and when the two sides tie and beat the middle, a coin —
      // without which a colony in a symmetric field never picks a direction.
      if (ahead >= left && ahead >= right) {
        /* hold */
      } else if (left > right) {
        heading[i] = (a - turnSteps) & DIR_MASK;
      } else if (right > left) {
        heading[i] = (a + turnSteps) & DIR_MASK;
      } else {
        heading[i] =
          (a + (hashRandom(i, step, seed + 11) < 0.5 ? -turnSteps : turnSteps)) & DIR_MASK;
      }

      const h = heading[i];
      let nx = x + COS[h];
      let ny = y + SIN[h];
      if (nx < 0) nx = 0;
      else if (nx >= cols) nx = cols - 0.001;
      if (ny < 0) ny = 0;
      else if (ny >= rows) ny = rows - 0.001;
      px[i] = nx;
      py[i] = ny;

      /**
       * Too far from the ink: turn for home.
       *
       * Steered rather than snapped. Pointing a straying agent straight back
       * sends every one of them home along the field's own gradient lines, and
       * a fringe of agents all taking the same route draws spokes — the halo
       * came out looking like a sun. Turning at the same rate it turns for
       * anything else, it curves back and keeps its own trail while doing it,
       * which is what puts the reaching, looping filaments between letters.
       */
      const outside = cellAway(nx | 0, ny | 0);
      if (outside > halo) {
        const gx = cellAway((nx | 0) + 1, ny | 0) - cellAway((nx | 0) - 1, ny | 0);
        const gy = cellAway(nx | 0, (ny | 0) + 1) - cellAway(nx | 0, (ny | 0) - 1);
        if (gx !== 0 || gy !== 0) {
          // The one angle still worth computing, and it is asked for only by
          // agents that have strayed past the halo. Brought into table steps,
          // the shortest way round is a mask and one compare rather than the
          // two while-loops it used to take.
          const home = Math.round((Math.atan2(-gy, -gx) / (Math.PI * 2)) * DIRS) & DIR_MASK;
          let diff = (home - heading[i]) & DIR_MASK;
          if (diff > DIRS / 2) diff -= DIRS;
          const swing = turnSteps * 2;
          heading[i] =
            (heading[i] + (diff > 0 ? Math.min(diff, swing) : Math.max(diff, -swing))) & DIR_MASK;
        }
      }

      // Capped. Without a ceiling a knot of agents piles up an order of
      // magnitude above anything else, and normalising against that peak puts
      // the whole rest of the colony — and the word — under the threshold.
      const cell = (ny | 0) * cols + (nx | 0);
      if (trail[cell] < ceiling) trail[cell] += 1;
    }

    diffuse(trail, next, cols, rows, keep);
  }

  // Normalised so the threshold means the same thing whatever the settings —
  // otherwise every slider would also be a brightness control.
  //
  // Only the trail is drawn. Painting the word back in underneath was the
  // second thing tried and it is worse than the problem it fixed: the letters
  // came out solid and the colony became a texture on top of them, when the
  // whole point is that the network *is* the drawing and the word is only what
  // it grew on. The letters stay legible because food keeps them the strongest
  // thing in the field, not because they are drawn twice.
  /**
   * And the trail is closed off at the same bound.
   *
   * Confining the walk is not on its own enough, because diffusion does not
   * ask where the agents are allowed: it spreads whatever is deposited a
   * little further every step, and over a hundred and forty of them a faint
   * skirt reaches well past the halo. Thresholded, that skirt is a shape.
   *
   * Faded rather than cut. A hard edge here would be traced as an edge, and
   * the colony would come out with a clean arc around it — the frame's line
   * again, moved inward. Taken to nothing across a shoulder, the last contour
   * falls somewhere inside the fade and reads as the network running out.
   */
  if (halo !== Infinity) {
    const shoulder = Math.max(unit, halo * 0.4);
    const soft = halo - shoulder;
    for (let i = 0; i < trail.length; i++) {
      const over = away[i] - soft;
      if (over > 0) trail[i] *= over >= shoulder ? 0 : 1 - over / shoulder;
    }
  }

  let peak = 0;
  for (let i = 0; i < trail.length; i++) if (trail[i] > peak) peak = trail[i];
  const values = new Uint8Array(trail.length);
  if (peak > 0) {
    for (let i = 0; i < trail.length; i++) {
      const v = (trail[i] / peak) * 255;
      values[i] = v > 255 ? 255 : v;
    }
  }

  const value = { cols, rows, box, values };
  cached = { key, value };
  return value;
}

export function physarumMarks({
  geo,
  density,
  steps,
  sense,
  turn,
  reach,
  decay,
  food,
  spread,
  level,
  smoothing,
  style,
  thickness,
  seed,
  color,
  fx,
}) {
  const field = growColony({ geo, density, steps, sense, turn, reach, decay, food, spread, seed });
  const d = traceField(field, Math.max(0.01, level), smoothing);
  if (!d) return '';

  // The whole colony is one shape, so the reveal effects act on it as one:
  // there are no marks here to hide or displace individually.
  const alpha = fx.build < 1 ? Math.max(0.04, fx.build) : 1;
  return style === 'outline'
    ? `<path d="${d}" fill="none" stroke="${color}" stroke-width="${num(thickness)}" ` +
        `stroke-linejoin="round" opacity="${num(alpha)}"/>`
    : `<path d="${d}" fill="${color}" fill-rule="nonzero" opacity="${num(alpha)}"/>`;
}
