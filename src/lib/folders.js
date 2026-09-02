/**
 * The drawer's colours, and the two things that read them.
 *
 * The shelf writes a number on a folder; the page under it is the sheet that
 * folder holds. They have to agree, so the list lives here rather than in
 * either of them — a colour defined in the component that draws the tab would
 * have to be duplicated, and a duplicated palette is a palette that drifts.
 *
 * One colour per style, no two alike. Not the poster ones: nineteen saturated
 * tabs under the artwork would be the loudest thing on a screen whose subject
 * is the artwork, so these are the colours real filing folders come in.
 *
 * Two things are measured rather than eyed, because neither is visible to
 * judgement:
 *
 *   Every colour clears 4.5:1 against whichever of the two inks suits it. A
 *   palette this muted puts several of them near the middle of the range where
 *   neither ink is obviously right, and picking by eye gets one of them wrong.
 *
 *   The *order* is solved, not chosen. What matters is that neighbours differ,
 *   not that the set does: two folders 13 apart at opposite ends of the drawer
 *   are fine, and two that close side by side are one folder. Walking the set
 *   by always stepping to the most distant colour left puts the nearest pair of
 *   neighbours 28.9 apart in Lab — and because a back folder sits between two
 *   front ones, that triple is checked too, at 18.2 for the worst of them.
 */
export const FOLDERS = [
  '#d9cbab', // sand
  '#6b5b8f', // indigo
  '#d8a544', // ochre
  '#3f5f8a', // navy
  '#b1923f', // olive gold
  '#8497b7', // slate
  '#b34a41', // clay
  '#a9c3cf', // ice
  '#8f5330', // rust
  '#c3a8cf', // lilac
  '#cb8660', // apricot
  '#659993', // teal
  '#9c5560', // oxblood
  '#b8c9a0', // celadon
  '#a284a9', // plum
  '#8faa86', // sage
  '#d7a0a0', // dusty rose
  '#4f7a63', // pine
  '#9aa0a6', // steel
];

/** The colour of the folder a given style is filed in. Steel past the end. */
export function folderOf(index) {
  return FOLDERS[index] ?? '#9aa0a6';
}

const DARK = '#191512';
const LIGHT = '#fffaf4';

function channels(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function relative([r, g, b]) {
  const linear = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** Relative luminance of an opaque colour. */
function luminance(hex) {
  return relative(channels(hex));
}

/**
 * The ink on a given folder, measured rather than assumed.
 *
 * The palette is muted, which puts several of these near the middle of the
 * range where neither ink is obviously right — clay and rust take the light
 * one, sand and rose the dark. Picking by eye would get one of them wrong and
 * it would be the one nobody looks at twice.
 */
export function inkOn(hex) {
  // Against the colour as painted. It used to composite the folder at 88% over
  // the desk, which was right while folders were translucent and became a
  // measurement of a colour nobody could see when they stopped being. The two
  // agree on all nineteen as it happens — but a calculation that is right by
  // luck is one that goes wrong the first time the palette moves.
  const l = luminance(hex);
  const onDark = (l + 0.05) / (luminance(DARK) + 0.05);
  const onLight = (luminance(LIGHT) + 0.05) / (l + 0.05);
  return onDark >= onLight ? DARK : LIGHT;
}

/**
 * The page is the folder's own colour, full strength.
 *
 * The tinted version was a compromise nobody asked for: at a sixth it read as
 * a faintly grubby white, and the point of colouring a page is that it belongs
 * to a folder, which a hint does not say. The artwork keeps its own two
 * colours on its own panel in the middle, so nothing is competing — the card
 * around it is card, and the picture on it is the picture.
 */
export function paperOf(index) {
  return folderOf(index);
}

/**
 * The ink for everything printed on that page.
 *
 * The sheet used to be white and everything on it was black by default. On a
 * navy or an oxblood sheet that is unreadable, so the title, the control names
 * and the slider tracks all take this instead — measured per colour, the same
 * way the number on the tab is.
 */
export function pageInk(index) {
  // The tab and the sheet are the same colour, so this is `inkOn` and says so
  // rather than repeating it.
  return inkOn(folderOf(index));
}
