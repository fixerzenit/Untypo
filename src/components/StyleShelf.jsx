import { folderOf, inkOn } from '../lib/folders.js';

/**
 * The index, as a shelf of folders under the page.
 *
 * It has been three things now: names across the masthead, numbers down the
 * two side margins, and this. Each move was made for the same reason and this
 * one is no exception — the index has to be reachable in one gesture and cost
 * the page as little as possible — but the object it imitates has changed, and
 * that is the real difference. A rack of tabs down the side is a ring binder
 * seen edge-on. A row of folders under the sheet is a drawer, and a drawer is
 * what you actually flick through when you are looking for one of twenty-two
 * things rather than reading them in order.
 *
 * Ten to a row and then it wraps, so the shelf grows downward in whole rows
 * rather than shrinking every folder to fit one line. The folders overlap the
 * way filed ones do, so a row of ten is not ten folder widths — which is the
 * only reason ten fit at a size their numbers can be read at.
 */

/**
 * How many folders to a row.
 *
 * Half of them, rounded up, rather than a fixed ten. The drawer is built on two
 * rows and only two — a front and a back, one lapping the other, each number
 * sitting on the seam between the two ahead of it — and a fixed ten turns
 * twenty-one styles into three rows, the last of which holds a single folder
 * standing on its own above the other twenty.
 *
 * So the count follows the file: nineteen gives ten and nine, twenty-one gives
 * eleven and ten. The row's arithmetic is in the stylesheet and reads this, so
 * the folders and the pitch resize themselves rather than being re-solved by
 * hand every time a style is added.
 */
const perRow = (n) => Math.ceil(n / 2);

/**
 * Which spacing the drawer uses.
 *
 * 'compact' — folders lap each other, the way filed ones do. Two digits fit.
 * 'wide'    — no lap, so a folder shows all of itself and has room for a
 *             longer mark. See shelf-wide.css, which is inert until this says
 *             otherwise.
 *
 * One word, in one place, because the whole difference is spacing and none of
 * it is behaviour: the shapes, colours, ink, pull and shadow are the same in
 * both and are not repeated in the variant.
 */
const LAYOUT = 'compact';

/**
 * The drawer, front to back.
 *
 * The first ten folders stand on the footer — the bottom edge of the window is
 * the bottom edge of the folder, so the row is attached to it rather than
 * floating above it. Everything after them is filed *behind*: a deeper folder,
 * lifted so that only its head shows over the front row, and shifted along by
 * half a width so each head comes up in a gap rather than immediately behind
 * a folder in front of it.
 *
 * The rows are therefore rendered back first and front second. Two things fall
 * out of that and both are wanted: the back row sits higher on the screen, and
 * the front row paints over it without any stacking arithmetic at all.
 *
 * Two shapes, as supplied — the same folder cut shallow and deep. The deep one
 * is 44 units taller at the same width, all of it added at the foot, which is
 * exactly the part that ends up hidden behind the front row.
 */
export default function StyleShelf({ patterns, index, onPick }) {
  const each = perRow(patterns.length);
  const rows = [];
  for (let i = 0; i < patterns.length; i += each) {
    rows.push(patterns.slice(i, i + each).map((pattern, n) => ({ pattern, i: i + n })));
  }
  // Back to front, so the DOM order is the paint order.
  const filed = rows.map((row, r) => ({ row, r })).reverse();

  return (
    <nav
      aria-label="Styles"
      className={`style-shelf ${LAYOUT === 'wide' ? 'style-shelf-wide' : ''}`}
      // The stylesheet solves the row from this: a folder's width is fixed and
      // the pitch is what is left over, shared between the gaps.
      style={{ '--per-row': each }}
    >
      {filed.map(({ row, r }) => (
        <div
          key={r}
          className={`shelf-row ${r === 0 ? 'shelf-row-front' : 'shelf-row-back'}`}
        >
          {row.map(({ pattern, i }) => {
            // The list lives in lib/folders.js, because the page under this
            // folder is tinted from the same entry and a palette kept in two
            // places is a palette that drifts.
            const paper = folderOf(i);
            return (
              <button
                key={pattern.id}
                type="button"
                onClick={() => onPick(i)}
                aria-current={i === index || undefined}
                // The number is what is written on it; the name is what you
                // came for. Both are in the label so the shelf is usable by
                // ear as well as by eye.
                aria-label={`${pattern.mark} ${pattern.label}`}
                title={`${pattern.mark}  ${pattern.label} — ${pattern.blurb}`}
                className={`shelf-tab ${i === index ? 'shelf-tab-on' : ''}`}
                style={{
                  '--paper': paper,
                  '--ink': inkOn(paper),
                  /**
                   * A band per row, and strictly left over right within it.
                   *
                   * The row band is because painting back-to-front in the DOM
                   * only orders the rows while nothing carries a `z-index`.
                   *
                   * Inside a row nothing is allowed to jump the queue, and the
                   * folder you are on least of all. Left-over-right is not
                   * decoration here — it is what makes the numbers visible: a
                   * folder laps its neighbour past where the number sits, so
                   * every mark is legible only because the folder to its left
                   * is painted above it. Raising the selected one inverted
                   * that for its left-hand neighbour and buried that
                   * neighbour's number, and the press with it. Twice, in two
                   * different rows, before it was written down.
                   *
                   * Being the folder you are on is said with the lift and the
                   * shadow, which cost nobody else anything.
                   */
                  zIndex: (r === 0 ? 100 : 0) + (row.length - row.findIndex((x) => x.i === i)),
                }}
              >
                {/* The prefix is a separate span so a narrow window can drop
                    it. Ten folders across a phone leave about nineteen pixels
                    of plateau to write on, which "N.11" does not fit in and
                    "11" does — and the alternative was letting the rows wrap,
                    which puts half the back row on the same line as the front
                    one and behind it. */}
                <span className="shelf-mark">
                  <span className="shelf-mark-prefix">N.</span>
                  {pattern.mark.slice(2)}
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
