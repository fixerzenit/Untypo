import { useEffect, useRef, useState } from 'react';
import { registerFont } from '../lib/fonts.js';
import { PALETTES } from '../lib/palettes.js';
import FontPicker from './FontPicker.jsx';
import wordmark from '../assets/untypo-logo.svg?raw';
import { EASINGS, MOTION_MODES } from '../lib/motion.js';
import { availableFormats } from '../lib/animate.js';
import { CYCLE_AT_1X } from '../App.jsx';
import Segmented from './ui/Segmented.jsx';
import Slider from './Slider.jsx';
import { typeParamsFor } from '../lib/params.js';
import { Button, Note, Row, Switch } from './ui/Controls.jsx';



/**
 * The masthead: the mark, the word, and two doors.
 *
 * The file below is one card to a screen, so every row spent up here is a row
 * taken off the artwork — permanently, because this bar does not scroll away.
 * That argument used to be made about rows and it is really about things: the
 * face picker, the font upload and the colour swatch each held a seat in the
 * rank so that the thing behind them was one press away, and between them they
 * held enough width that the mark could only be lettering at label size.
 *
 * They are all answers to "how should this word be set", so they are all behind
 * Type now, with the weight, the tracking, the leading, the alignment and the
 * two colours. Animate holds the motion. Shuffle needs no panel because it is
 * one press by definition. What the bar bought with the three seats is the mark
 * at half again the size, which is the difference between a masthead and a
 * toolbar with a name on the end of it.
 *
 * The index used to hang off the bottom of this bar, two rows of style names
 * touching the file they belong to. It is a drawer of folders under the page
 * now — see StyleShelf — which gives those two rows back as well.
 */
export default function TopBar({
  text,
  onText,
  familyId,
  onFamily,
  type,
  onType,
  onShuffleAll,
  onRecord,
  canRecord,
  clip,
  fg,
  onFg,
  bg,
  onBg,
  transparent,
  onTransparent,
  playing,
  onPlaying,
  speed,
  onSpeed,
  motionMode,
  onMotionMode,
  easing,
  onEasing,
  clipFormat,
  onClipFormat,
}) {
  // A dropped font is added to a module-level catalog, which React has no way
  // of noticing. Bumping this is what tells the picker to read it again.
  const [fontsVersion, setFontsVersion] = useState(0);
  const [fontError, setFontError] = useState(null);
  const [panel, setPanel] = useState(null);
  const fontInput = useRef(null);

  const takeFont = async (file) => {
    if (!file) return;
    try {
      const { id } = await registerFont(file);
      setFontsVersion((v) => v + 1);
      setFontError(null);
      onFamily(id);
    } catch {
      setFontError("Couldn't read that font");
    }
  };

  // The bar is fixed and the file is sized against what is left, so its real
  // height has to be published rather than guessed at.
  const ref = useRef(null);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      document.documentElement.style.setProperty('--header-h', `${entry.contentRect.height}px`);
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  /**
   * Escape closes whichever is open, and so does a click anywhere else — a
   * panel you have to find the button for again to dismiss is a panel you
   * leave open.
   *
   * "Anywhere else" is measured against the whole masthead, and that word is
   * the entire bug this used to be. It measured against the top row, and the
   * panels are not in the top row: they are siblings of it, further down the
   * header. So a press on anything inside a panel counted as a press outside,
   * and `pointerdown` — which fires before `click` — tore the panel down while
   * the button was still being pressed. The click then landed on nothing.
   *
   * Every control in both panels was dead: Play, Motion, Cycle, the easing, the
   * export format, both colour wells, every palette swatch. Not dead in a way
   * any test using `element.click()` can see, either, because that dispatches
   * a click with no pointer event in front of it — which is why this survived
   * three rounds of "the animation is broken" and a hit-test sweep of every
   * control in the app.
   */
  useEffect(() => {
    if (!panel) return undefined;
    const onKey = (event) => event.key === 'Escape' && setPanel(null);
    const away = (event) => {
      if (!ref.current?.contains(event.target)) setPanel(null);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', away);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', away);
    };
  }, [panel]);

  const mode = MOTION_MODES.find((m) => m.value === motionMode);
  const toggle = (which) => setPanel((open) => (open === which ? null : which));

  return (
    <header ref={ref} className="relative z-40 bg-page">
      {/* Four punches, and the wires come up through them.

          The bar had padding on the top and none at all on the bottom — the
          index used to hang off the underside and provided the space, and when
          that moved out the bar was left sitting on its own bottom edge with
          its contents pushed up. Equal now, and a little more of it: the
          masthead is the one horizontal band in a page made of stacked
          rectangles, and it needs the height to read as a band rather than as
          a strip.

          The holes are at the same insets and the same four fractions as the
          eyelets in the paper, so a wire runs from a hole in the sheet to a
          hole in the bar without either being told about the other. That is
          the whole trick: the book is not drawn hanging from the masthead, it
          is punched to the same pattern, and the eye does the rest. */}
      <span className="header-punches" aria-hidden>
        {[14, 38, 62, 86].map((at) => (
          <span key={at} className="header-punch" style={{ left: `${at}%` }} />
        ))}
      </span>

      <div className="mx-auto max-w-[110rem] px-5 py-5 lg:px-8 lg:py-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5">
          {/* The drawn mark, inlined rather than linked.

              An <img> would be a picture of the logo and would carry its own
              colour; inlined, the shapes inherit `currentColor` and the mark is
              the same ink as everything else in the bar — which matters here,
              because this masthead is one of two colours and the logo is not a
              third thing on it.

              One file, imported as text. The favicon and the share card are
              built from the same src/assets/untypo-logo.svg, so the mark cannot
              drift between the three places it appears. */}
          <h1
            className="wordmark shrink-0"
            aria-label="Untypo"
            dangerouslySetInnerHTML={{ __html: wordmark }}
          />

          <textarea
            value={text}
            onChange={(event) => onText(event.target.value)}
            rows={1}
            placeholder="untypo"
            spellCheck={false}
            autoComplete="off"
            aria-label="Text"
            /* Takes all the slack, and that is the point.

               It was capped, and everything after it pushed to the far end
               with `ml-auto` — which put one wide gap in the middle of the bar
               and the row's own gap everywhere else. Uncapped and with nothing
               pushing, the row has a single gap repeated all the way along:
               the space between the wordmark and the field is the space
               between the field and the typeface, because both are that gap
               and nothing else is. */
            className="min-w-[10rem] flex-1 resize-none rounded-[var(--radius-control)]
                       bg-fill-soft px-4 py-[0.5rem] text-[0.9rem] leading-snug outline-none
                       placeholder:text-ink-soft"
          />
          {/* Five things and no more: the mark, the word, and the three doors.

              The typeface, the upload, and the colour swatch used to stand out
              here too. They are all answers to "how should this be set", which
              is the question Type asks, so they are behind it now — and what
              the bar got back for them is the room to draw the mark at the size
              a masthead wants it. A bar is worth what it leaves out. */}
          <div className="flex shrink-0 items-center gap-3">
            {/* How the word is set, as opposed to what is stamped through it.

                Everything about the letterform is held once and read by every
                style: the face, its weight, the space between the letters, the
                space between the lines, which edge short lines sit against, and
                the two colours it is printed in. None of that belongs to a
                pattern, so none of it is on a card — and none of it needs a
                permanent seat on the bar either. */}
            <Button
              onClick={() => toggle('type')}
              aria-expanded={panel === 'type'}
              variant={panel === 'type' ? 'solid' : 'fill'}
              title="Typeface, weight, tracking, leading, alignment and colour"
            >
              {panel === 'type' ? 'Close' : 'Type'}
            </Button>

            {/* Animate, and it says whether it is running. */}
            <Button
              onClick={() => toggle('animate')}
              aria-expanded={panel === 'animate'}
              variant={panel === 'animate' ? 'solid' : playing ? 'violet' : 'fill'}
            >
              {panel === 'animate' ? 'Close' : playing ? '❙❙  Animate' : 'Animate'}
            </Button>

            {/* One press for a whole different picture: another style, another
                face, and fresh settings for the style it lands on. The card has
                a Shuffle of its own and it stays on its style on purpose — see
                handleShuffleAll in App.jsx for why the two are separate. */}
            <Button onClick={onShuffleAll} title="A different style, face and settings">
              Shuffle
            </Button>
          </div>
        </div>
      </div>

      {/* The panels sit over the file rather than pushing it down: a card is
          sized against this bar, and a bar that changes height moves the hinge
          every card is rotating about. */}

      {/* Type: everything about how the word is set, in the order you would set
          it — which face, at what weight, spaced how, and printed in what.

          It was two panels. Colour had its own, opened from a swatch on the
          bar, and the argument for the swatch was that the pair is the design
          and showing the pair costs one control where two wells cost three.
          That was right about the wells and wrong about where they live: the
          two colours are not a different subject from the typeface, they are
          the last two decisions in the same one. One door, four groups. */}
      {panel === 'type' && (
        <Panel>
          <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
            <FontPicker
              key={fontsVersion}
              familyId={familyId}
              onChange={onFamily}
              className="w-[11rem] shrink-0 lg:w-[13rem]"
            />
            <Button
              onClick={() => fontInput.current?.click()}
              variant={fontError ? 'yellow' : 'violet'}
              title={fontError ?? 'Use a TTF or OTF from your own machine'}
            >
              {fontError ?? 'Your own font'}
            </Button>
            <input
              ref={fontInput}
              type="file"
              accept=".ttf,.otf,font/ttf,font/otf"
              className="hidden"
              onChange={(event) => takeFont(event.target.files?.[0])}
            />
          </div>

          <div className="grid gap-x-8 gap-y-2.5 md:grid-cols-2 xl:grid-cols-4">
            {typeParamsFor(text).map((param) => (
              <Slider
                key={param.key}
                param={param}
                value={type[param.key]}
                familyId={familyId}
                onChange={(value) => onType({ ...type, [param.key]: value })}
              />
            ))}
          </div>

          {/* Said rather than left to be discovered. Leading and alignment have
              nothing to act on until there is a second line, so they are not
              rendered — and a control that is absent for a reason should say
              the reason, or it reads as one that is missing. */}
          {!text.includes('\n') && (
            <Note>Leading and alignment appear once the text has a second line.</Note>
          )}

          <div className="flex flex-wrap items-center gap-x-8 gap-y-4 border-t border-rule-soft pt-4">
            <Well label="Pattern" value={fg} onChange={onFg} />
            <Well label="Background" value={bg} onChange={onBg} disabled={transparent} />
            <Switch checked={transparent} onChange={onTransparent} label="Transparent" />
            {/* Two colours is the whole design, so a palette is a pair and the
                swatch shows all of it. They stay editable afterwards, so a
                palette is a starting point rather than a mode you are in. */}
            <div className="flex flex-wrap items-center gap-2">
              {PALETTES.map((palette) => {
                const on = fg.toLowerCase() === palette.fg && bg.toLowerCase() === palette.bg;
                return (
                  <button
                    key={palette.id}
                    type="button"
                    title={palette.name}
                    aria-label={palette.name}
                    aria-pressed={on}
                    onClick={() => {
                      onFg(palette.fg);
                      onBg(palette.bg);
                    }}
                    className={`h-[1.8rem] w-[1.8rem] overflow-hidden rounded-full
                                transition duration-250 ease-[var(--ease-snap)]
                                ${on ? 'ring-2 ring-ink ring-offset-2' : 'hover:scale-115'}`}
                    style={{ background: palette.bg }}
                  >
                    <span
                      className="block h-full w-full"
                      style={{ background: palette.fg, clipPath: 'polygon(0 0, 100% 0, 0 100%)' }}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        </Panel>
      )}

      {panel === 'animate' && (
        <Panel>
          {/* The same gap the masthead uses, so the two ranks read as one bar
              that happens to be two rows tall. */}
          <div className="flex flex-wrap items-center gap-x-[13px] gap-y-3">
            <Button
              variant={playing ? 'solid' : 'violet'}
              onClick={() => onPlaying(!playing)}
              aria-pressed={playing}
              className="h-[2rem] min-w-[7rem]"
            >
              {playing ? '❙❙  Pause' : '▶  Play'}
            </Button>

            {/* The clip, written from here rather than from the export rank on
                the card. SVG and PNG take away what is on the screen; this takes
                away something that only exists while the artwork is moving, and
                it is written in the format chosen two controls along. */}
            <Button
              onClick={onRecord}
              disabled={!canRecord || Boolean(clip)}
              variant={clip ? 'yellow' : 'fill'}
              title={canRecord ? 'Record one loop as a file' : 'This style has nothing to animate'}
              className="h-[2rem] min-w-[7rem]"
            >
              {clip ? `${Math.round(clip.progress * 100)}%` : `Record ${clipFormat.toUpperCase()}`}
            </Button>

            {/* `shrink-0` on every group in this rank.

                Without it a flex row shares its slack by squeezing whatever
                will give, and a segmented control gives — it carries
                `min-w-0 truncate` so it can survive a narrow card. Here there
                is no shortage of room, only a row that had not been told to
                stop taking it, and the result was "Ease in-out" reading as
                "Ease in-…" on a bar with two hundred spare pixels. The row
                wraps instead now, which is what the spare room is for. */}
            <label
              /* The whole row on a phone, its own width on a desk. Stacked but
                 still shrink-wrapped, the group could give and did: four
                 easings shared the width of the word "Easing" and every one of
                 them clipped by a few pixels. */
              className="flex w-full flex-col items-start gap-1 text-[0.75rem]
                         sm:w-auto sm:shrink-0 sm:flex-row sm:items-center sm:gap-2.5"
            >
              Motion
              <select
                value={motionMode}
                onChange={(event) => onMotionMode(event.target.value)}
                aria-label="Motion"
                title={mode?.hint}
                className="h-[2rem] w-full rounded-[var(--radius-control)] bg-fill-soft px-4
                           text-[0.78rem] sm:w-auto
                           outline-none transition duration-250 ease-[var(--ease-snap)] hover:bg-fill"
              >
                {MOTION_MODES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>

            {/* One cycle, in seconds.

                The stored value is still a rate, because that is what the
                clock integrates and what a saved session and an export both
                already speak. What it was *shown* as was a multiplier — 1.4x
                of a duration nothing ever stated — which is a number you can
                only use by experiment. Seconds you can decide in advance. */}
            <div className="w-[16rem] shrink-0">
              <Row label="Cycle" value={`${(CYCLE_AT_1X / speed).toFixed(1)}s`}>
                <input
                  type="range"
                  min={0.5}
                  max={20}
                  step={0.5}
                  // Backwards, so that dragging right lengthens the cycle: the
                  // control reads as duration, and duration should grow to the
                  // right however the rate underneath it behaves.
                  value={CYCLE_AT_1X / speed}
                  onChange={(event) => onSpeed(CYCLE_AT_1X / Number(event.target.value))}
                />
              </Row>
            </div>

            <label
              /* The whole row on a phone, its own width on a desk. Stacked but
                 still shrink-wrapped, the group could give and did: four
                 easings shared the width of the word "Easing" and every one of
                 them clipped by a few pixels. */
              className="flex w-full flex-col items-start gap-1 text-[0.75rem]
                         sm:w-auto sm:shrink-0 sm:flex-row sm:items-center sm:gap-2.5"
            >
              Easing
              <Segmented
                fit
                className="h-[2rem] w-full sm:w-auto"
                options={EASINGS}
                value={easing}
                onChange={onEasing}
              />
            </label>

            <label
              /* The whole row on a phone, its own width on a desk. Stacked but
                 still shrink-wrapped, the group could give and did: four
                 easings shared the width of the word "Easing" and every one of
                 them clipped by a few pixels. */
              className="flex w-full flex-col items-start gap-1 text-[0.75rem]
                         sm:w-auto sm:shrink-0 sm:flex-row sm:items-center sm:gap-2.5"
            >
              Export
              <Segmented
                fit
                className="h-[2rem] w-full sm:w-auto"
                options={availableFormats()}
                value={clipFormat}
                onChange={onClipFormat}
              />
            </label>
          </div>

          <Note className="text-ink-soft">
            {mode?.hint}
            {easing !== 'linear' &&
              ' — only Linear leaves a wrapping loop seamless, so Loop, Ripple and Radial jolt at the seam.'}
          </Note>
        </Panel>
      )}

    </header>
  );
}

function Panel({ children }) {
  return (
    <div className="absolute inset-x-0 top-full z-50 border-t border-rule-soft bg-page shadow-[0_20px_40px_rgb(0_0_0/0.22)]">
      <div className="mx-auto flex max-w-[110rem] flex-col gap-5 px-5 py-5 lg:px-8">{children}</div>
    </div>
  );
}

/**
 * A colour well.
 *
 * Round, because the palette swatches beside it are round and they are the
 * same kind of object. The hex sits under the label rather than beside it, so
 * the row keeps its height as the value changes width.
 */
function Well({ label, value, onChange, disabled }) {
  return (
    <label className={`flex cursor-pointer items-center gap-2.5 ${disabled ? 'opacity-35' : ''}`}>
      <input
        type="color"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        className="h-[1.8rem] w-[1.8rem] shrink-0"
      />
      <span className="flex flex-col leading-tight">
        <span className="text-[0.75rem]">{label}</span>
        <span className="font-mono text-[0.6rem] text-ink-soft uppercase">{value}</span>
      </span>
    </label>
  );
}
