/**
 * The small shared controls.
 *
 * One shape for everything you touch: a stadium, radius half its own height.
 * It is not decoration — with a hundred controls on a page and no shadows,
 * borders or dividers anywhere, the outline *is* the affordance, and making
 * every one of them the same outline means a control is recognisable before
 * you have read its label.
 *
 * Colour is the other half of that. A filled ground says a thing is a control;
 * *which* fill says what kind. Black is the one action a screen is asking for,
 * and there is never more than one on screen at a time.
 */

/** The named fills, and the ink that stays legible on each. */
const VARIANTS = {
  fill: 'bg-fill-soft text-ink hover:bg-fill',
  solid: 'bg-ink text-page hover:bg-[#2a2a2a]',
  quiet: 'bg-transparent text-ink hover:bg-fill-soft',
  yellow: 'bg-signal-yellow text-ink hover:brightness-95',
  green: 'bg-signal-green text-page hover:brightness-95',
  violet: 'bg-signal-violet text-page hover:brightness-95',
  blue: 'bg-signal-blue text-page hover:brightness-110',
  /* On a saturated field, where a grey pill would be mud. */
  onField: 'bg-white/20 text-current hover:bg-white/30',
};

/** iOS's toggle, in the only two colours this design has. */
export function Switch({ checked, onChange, label }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-[0.75rem] select-none">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative h-[1.6rem] w-[2.7rem] shrink-0 rounded-full sm:h-[1.35rem] sm:w-[2.3rem]
                    transition-colors duration-250 ease-[var(--ease-snap)]
                    ${checked ? 'bg-ink' : 'bg-fill'}`}
      >
        <span
          className={`absolute top-[2px] left-[2px] h-[calc(1.6rem-4px)] w-[calc(1.6rem-4px)]
                      rounded-full bg-page transition-transform duration-250 ease-[var(--ease-snap)]
                      sm:h-[calc(1.35rem-4px)] sm:w-[calc(1.35rem-4px)]
                      ${checked ? 'translate-x-[1.1rem] sm:translate-x-[0.95rem]' : 'translate-x-0'}`}
        />
      </button>
      {label}
    </label>
  );
}

export function Button({ variant = 'fill', size = 'md', className = '', children, ...rest }) {
  // Taller on a phone than on a desktop. Everything here is a stadium and a
  // stadium's height is its whole tap target, so the same padding that reads as
  // trim under a cursor reads as a 23px sliver under a thumb.
  const pad =
    size === 'sm'
      ? 'px-3 py-[0.66rem] text-[0.7rem] sm:py-[0.2rem]'
      : 'px-4 py-[0.68rem] text-[0.78rem] sm:py-[0.32rem]';
  return (
    <button
      type="button"
      className={`rounded-[var(--radius-control)] whitespace-nowrap
                  transition duration-250 ease-[var(--ease-snap)]
                  disabled:pointer-events-none disabled:opacity-35
                  ${pad} ${VARIANTS[variant] ?? VARIANTS.fill} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/**
 * A control laid out as one line: name and value together, then the track.
 *
 * The name and its number are set flush against each other with nothing
 * between them — `Weight400`, not `Weight: 400`. It looks wrong written down
 * and reads right on screen: the pair becomes one object, the colon and the
 * gap stop competing for attention with the number, and a column of them lines
 * up on the left the way a table wants to. The number is mono and
 * tabular so it cannot shove the label about as it changes.
 */
export function Row({ label, value, hint, className = '', children }) {
  return (
    /**
     * `min-w-0`, and it is not decoration.
     *
     * A grid item's `min-width` is `auto`, which means it refuses to shrink
     * below its own min-content — and a row's min-content is its name plus
     * whatever the control inside cannot give up. On a phone that came to
     * 339px inside a 195px region: the single column sized itself to the
     * widest row and every control on the crowded styles sat bodily off the
     * right-hand edge of the sheet, where it could be neither read nor
     * pressed. The `min-w-0` the control span already carries is no help,
     * because the floor is on the item in the grid, not on anything inside it.
     */
    /**
     * Name beside the control on a desk, above it on a phone.
     *
     * Side by side, the name gets a fixed column and anything longer than it
     * is cut: "Pieces in the yard", "Pull of the word", "Find the spine" and
     * thirteen others were reading as ellipses on a 375px card. The column
     * cannot grow, either — what it would take, it would take from the control
     * beside it, which is the thing being set.
     *
     * Stacked, the name has the whole width and none of them is cut. It costs
     * a row its height twice over, which the region below was already built to
     * absorb: it scrolls, and it is the one place on the card that can give.
     */
    <label
      className={`flex min-w-0 flex-col items-stretch gap-1
                  sm:flex-row sm:items-center sm:gap-3 ${className}`}
    >
      {/* Narrower on a phone. At a fixed 8.2rem the name took half a 390px
          row and the control could not fit in what was left, so the whole row
          overflowed and grew a horizontal scrollbar inside the page.

          And narrower on the desk than it was, because the two racks down the
          sides took 85px off the page and the columns took a third of that
          each. The name is the shorter half of a row — every one of them fits
          in 7.4rem — while what it left behind was clipping the labels inside
          the segmented controls, which are words you have to read to choose
          between. */}
      <span
        className="flex w-full shrink-0 items-baseline gap-0 text-[0.75rem] leading-tight
                   sm:w-[7.4rem]"
      >
        <span className="sm:truncate">{label}</span>
        {value !== undefined && (
          <span className="ml-0.5 shrink-0 font-mono tabular-nums">
            {hint && <span className="mr-1 opacity-45">{hint}</span>}
            {value}
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </label>
  );
}

/**
 * A small square-set caption in mono.
 *
 * Everything the interface says about itself — hints, counts, fine print —
 * is set in the mono, so that the sans is only ever used for things the *user*
 * put there. It is the cheapest way to keep a tool from sounding like it is
 * talking over your work.
 */
export function Note({ className = '', children }) {
  return (
    <span className={`font-mono text-[0.68rem] leading-snug ${className}`}>{children}</span>
  );
}

