import { useEffect, useRef, useState } from 'react';
import { fontCatalog, getFamily, loadFont } from '../lib/fonts.js';
import { UNIT_HEIGHT } from '../lib/constants.js';

/**
 * The typeface list, with every name set in its own typeface.
 *
 * A native `<select>` is the better mobile control in almost every case, and
 * it is the wrong one here: the whole point is to see what a face looks like
 * before choosing it, and no browser lets an `<option>` be set in a font the
 * page has not loaded as CSS. Loading twenty-one webfonts purely to letter a
 * menu would cost more than the artwork does.
 *
 * So the names are drawn the way everything else in this app is drawn — as
 * outlines, from the same parsed fonts the patterns use. Nothing extra is
 * fetched, nothing is loaded twice, and it looks the same in every browser
 * rather than working in two of them.
 *
 * Faces load as the menu opens and each name appears when its own arrives, so
 * the list is usable from the first frame instead of after the last file.
 */
export default function FontPicker({ familyId, onChange, className = '' }) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef(null);
  const current = getFamily(familyId);

  useEffect(() => {
    if (!open) return undefined;
    const away = (event) => {
      if (!wrapper.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  return (
    <div ref={wrapper} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Typeface"
        className={`flex w-full items-center justify-between gap-2 rounded-[var(--radius-control)]
                    px-4 py-[0.68rem] text-[0.78rem] transition duration-250 ease-[var(--ease-snap)] sm:py-[0.32rem]
                    ${open ? 'bg-fill' : 'bg-fill-soft hover:bg-fill'}`}
      >
        <span className="truncate">{current.name}</span>
        <span className="shrink-0 text-ink-soft">⌄</span>
      </button>

      {open && (
        <div
          role="listbox"
          // Below `lg` it is a sheet pinned to both margins rather than a
          // panel hung off the button: a fixed-width menu on a phone runs off
          // whichever edge it was aligned to.
          className="z-50 max-h-[60vh] overflow-y-auto rounded-[var(--radius-field)] bg-page p-1.5
                     shadow-[0_10px_34px_rgb(0_0_0/0.18),0_0_0_0.5px_rgb(0_0_0/0.16)]
                     max-lg:fixed max-lg:top-[calc(var(--header-h,5rem)+6px)] max-lg:right-4 max-lg:left-4
                     lg:absolute lg:top-[calc(100%+6px)] lg:left-0 lg:w-[18.5rem]"
        >
          {fontCatalog().map((font) => (
            <button
              key={font.id}
              type="button"
              role="option"
              aria-selected={font.id === familyId}
              onClick={() => {
                onChange(font.id);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-3 rounded-[var(--radius-control)] px-3 py-1.5 text-left
                          transition duration-250 ease-[var(--ease-snap)]
                          ${font.id === familyId ? 'bg-ink text-page' : 'hover:bg-fill-soft'}`}
            >
              <Specimen font={font} dark={font.id === familyId} />
              <span className="shrink-0 font-mono text-[0.6rem] opacity-55">{font.group}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The family's own name, set in it.
 *
 * Drawn as a path rather than as text, so it needs no `@font-face` and cannot
 * disagree with what the patterns will do with the same file. Until the file
 * arrives the name is shown in the interface face, which is a name either way
 * — the list never has a blank row in it.
 */
function Specimen({ font, dark }) {
  const [path, setPath] = useState(null);

  useEffect(() => {
    let live = true;
    loadFont(font.id, font.weights[0])
      .then((parsed) => {
        if (!live) return;
        const drawn = parsed.getPath(font.name, 0, 0, UNIT_HEIGHT);
        const box = drawn.getBoundingBox();
        if (!Number.isFinite(box.x1)) return;
        setPath({
          d: drawn.toPathData(1),
          viewBox: `${box.x1} ${box.y1} ${box.x2 - box.x1} ${box.y2 - box.y1}`,
          ratio: (box.x2 - box.x1) / (box.y2 - box.y1),
        });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [font.id, font.name, font.weights]);

  if (!path) return <span className="min-w-0 flex-1 truncate text-[0.82rem]">{font.name}</span>;

  return (
    <svg
      viewBox={path.viewBox}
      // Height fixed and width from the name's own proportions, so a condensed
      // face reads as condensed instead of being stretched to a common box.
      height="15"
      width={Math.min(190, 15 * path.ratio)}
      preserveAspectRatio="xMinYMid meet"
      className="min-w-0 flex-1"
      aria-hidden
    >
      <path d={path.d} fill={dark ? 'var(--color-page)' : 'var(--color-ink)'} />
    </svg>
  );
}
