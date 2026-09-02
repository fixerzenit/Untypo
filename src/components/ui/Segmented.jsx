import { useLayoutEffect, useRef, useState } from 'react';

/**
 * A row of choices, drawn as a sliding pill.
 *
 * A grey trough with one filled pill in it says "pick one of these" before you
 * have read any of the labels. The pill is solid white on grey rather than
 * white with a shadow under it — with nothing else on the page raised, the one
 * raised object was reading as furniture. Contrast does the separating.
 *
 * The pill is a real element rather than a background on the selected button,
 * so it can be transitioned across the track and the labels can stay put.
 *
 * ON FITTING ON A PHONE
 *   `inline-flex` with `whitespace-nowrap` labels has a min-content floor, so a
 *   five-way control could not shrink below the sum of its words and pushed the
 *   whole document sideways instead. `min-w-0` and a truncating label let it
 *   give, which is the right trade: a clipped word in a control you can reach
 *   beats a legible one you have to pan the page to find.
 *
 *   The row is also taller below `sm`: around thirty-four pixels rather than
 *   twenty-three. Still under Apple's forty-four, which no interface with this
 *   many controls could honour without becoming a scroll, but comfortably past
 *   the point where a thumb starts missing.
 */
export default function Segmented({ options, value, onChange, size = 'md', fit = false, className = '' }) {
  const pad =
    size === 'sm'
      ? 'px-1.5 py-[0.7rem] sm:px-2 sm:py-[0.15rem]'
      : 'px-2 py-[0.72rem] sm:px-3 sm:py-[0.22rem]';
  const text = size === 'sm' ? 'text-[0.68rem]' : 'text-[0.75rem]';
  /**
   * Every one of these may give, and none of them has to.
   *
   * `truncate` does not shorten a label that fits; it shortens one that does
   * not, and `min-w-0` is what lets the control shrink far enough to find out.
   * Without them a `nowrap` row has a min-content floor and simply overflows —
   * Sampler's three-way ran 43px past the edge of the sheet, where it could be
   * neither read nor pressed.
   *
   * `fit` is the way out for the places that are not short of room. In a
   * control column giving is the right answer; in a full-width bar it is not,
   * and "Ease in-out" was reading as "Ease in-…" with two hundred spare pixels
   * beside it — the row was sharing its slack with something that had said it
   * would give, so it did.
   */
  const tight = fit
    ? 'flex-1 min-w-0 truncate sm:flex-none sm:min-w-max sm:overflow-visible'
    : 'flex-1 min-w-0 truncate';
  const index = Math.max(0, options.findIndex((option) => option.value === value));

  /**
   * Where the pill sits when the buttons are their own widths.
   *
   * Measured from the DOM rather than computed, because the whole point of
   * `fit` is that the widths come from the words and nothing here knows how
   * wide a word is. Re-measured whenever the selection or the option list
   * changes, which is the only time it can move.
   */
  const track = useRef(null);
  const [offsets, setOffsets] = useState({ left: 2, width: 0 });
  useLayoutEffect(() => {
    const el = track.current;
    if (!fit || !el) return undefined;
    const measure = () => {
      const active = el.querySelectorAll('button')[index];
      if (active) setOffsets({ left: active.offsetLeft, width: active.offsetWidth });
    };
    measure();
    // The widths come from the words, and below `sm` they come from the row
    // instead — so they change with the window and the pill has to be told.
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [fit, index, options.length, value]);

  return (
    <div
      ref={track}
      role="radiogroup"
      className={`relative flex min-w-0 rounded-[var(--radius-control)] bg-fill-soft p-[2px]
                  ${fit ? 'sm:min-w-max' : ''} ${className}`}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute top-[2px] bottom-[2px] rounded-[var(--radius-control)]
                   bg-page transition-[left] duration-250 ease-[var(--ease-snap)]"
        /* An equal share of the track, which is what the options are — except
           when they are fitted to their words, and then the pill has to be
           measured off the button it is under rather than off the count. */
        style={
          fit
            ? { left: `${offsets.left}px`, width: `${offsets.width}px` }
            : {
                left: `calc(${(index * 100) / options.length}% + 2px)`,
                width: `calc(${100 / options.length}% - 4px)`,
              }
        }
      />
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            title={option.hint}
            onClick={() => onChange(option.value)}
            className={`relative z-10 rounded-[var(--radius-control)] ${tight} ${pad} ${text}
                        transition-colors duration-250 ease-[var(--ease-snap)]
                        ${selected ? 'text-ink' : 'text-ink-soft hover:text-ink'}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
