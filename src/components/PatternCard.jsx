import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { buildTextSource } from '../lib/sources/text.js';
import { buildSVG } from '../lib/svgBuilder.js';
import { recordLoop, supportsVideoExport } from '../lib/animate.js';
import {
  downloadBlob,
  downloadPNG,
  downloadSVG,
  pngDimensions,
  pngScale,
  slugify,
} from '../lib/download.js';
import { animateParams, paramsFor, typeParamsFor } from '../lib/params.js';
import { STILL, motionEffect } from '../lib/motion.js';
import { useFont } from '../lib/useFont.js';
import Slider from './Slider.jsx';
import { Button, Note } from './ui/Controls.jsx';
import { pageInk, paperOf } from '../lib/folders.js';

let uidSeed = 0;
const CAN_RECORD = supportsVideoExport();

/**
 * One style variation: live preview, its controls, and its exports.
 *
 * Memoised and given a stable `params` object per card, so dragging a slider
 * on one card re-renders that card alone.
 */
function PatternCard({
  index,
  pattern,
  sourceKind,
  text,
  familyId,
  source,
  params,
  type,
  onType,
  fg,
  bg,
  transparent,
  phase,
  playing,
  motionMode,
  easing,
  clipFormat,
  total,
  near = true,
  onParam,
  onRandomize,
  onRandomizeParams,
  focused,
  onRecorder,
}) {
  // Own id namespace so every <clipPath> on the page stays distinct.
  const [uid] = useState(() => `${pattern.id}-${++uidSeed}`);
  const [busy, setBusy] = useState(null);
  const [progress, setProgress] = useState(0);

  // Animating every card at once costs more than a frame is worth: eleven of
  // them push the main thread past 60ms, and most are off screen anyway. Cards
  // out of view hold still and pick the animation back up on the shared clock
  // when they scroll in.
  const ref = useRef(null);
  const [onScreen, setOnScreen] = useState(true);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting), {
      rootMargin: '250px',
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  const isText = sourceKind === 'text';
  const { font, error } = useFont(familyId, type.weight);

  // Sliders read `params` directly, so the thumb and its readout track the
  // pointer with no delay. The artwork is rebuilt from the deferred copy, so a
  // fast drag over an expensive pattern coalesces into fewer renders instead
  // of blocking the input on every tick.
  const draft = useDeferredValue(params);
  const draftType = useDeferredValue(type);

  const textSource = useMemo(
    () =>
      isText && font
        ? buildTextSource({
            font,
            text,
            tracking: draftType.tracking,
            leading: draftType.leading,
            align: draftType.align,
            // Every card shares the same type settings now, so they share one
            // source — and, more usefully, one tone field instead of a dozen.
            cacheKey: `${familyId}|${draftType.weight}|${draftType.tracking}|${draftType.leading}|${draftType.align}|${text}`,
          })
        : null,
    [
      isText,
      font,
      text,
      draftType.tracking,
      draftType.weight,
      draftType.leading,
      draftType.align,
      familyId,
    ],
  );

  const geo = isText ? textSource : source;

  const running = playing && onScreen && near;
  const looping = running && motionMode === 'loop';

  const live = useMemo(
    () => (looping && pattern.motion ? animateParams(pattern, draft, phase) : draft),
    [looping, pattern, draft, phase],
  );
  const fx = useMemo(
    () => (running ? motionEffect(motionMode, phase, easing) : STILL),
    [running, motionMode, phase, easing],
  );

  // Only the cards within reach of the turn are drawn. Thirty-four dense
  // patterns built on load is several seconds of main thread for thirty-three
  // pictures nobody is looking at; three is instant, and a card is always
  // built before it is far enough round to be read.
  const svg = useMemo(
    () => (geo && near ? buildSVG({ geo, pattern, params: live, fg, bg, transparent, uid, font, fx }) : ''),
    [geo, near, pattern, live, fg, bg, transparent, uid, font, fx],
  );

  const baseName = isText ? slugify(text) : 'image';
  const exportName = `${baseName}-${pattern.id}`;

  // Exports read the same values the frame on screen was built from, so a file
  // can never pair a stale silhouette with fresh pattern values.
  const frame = useCallback(
    (p, effect = STILL) =>
      buildSVG({ geo, pattern, params: p, fg, bg, transparent, uid, font, fx: effect, sized: true }),
    [geo, pattern, fg, bg, transparent, uid, font],
  );

  const handleSVG = useCallback(() => {
    if (geo) downloadSVG(frame(live), `${exportName}.svg`);
  }, [geo, frame, live, exportName]);

  const handlePNG = useCallback(async () => {
    if (!geo) return;
    setBusy('png');
    try {
      await downloadPNG(frame(live), geo.box, `${exportName}.png`);
    } catch (err) {
      console.error(err);
      alert(`PNG export failed: ${err.message}`);
    } finally {
      setBusy(null);
    }
  }, [geo, frame, live, exportName]);

  /**
   * The recorder, which no longer has a button of its own.
   *
   * MP4 sat in the export rank beside SVG and PNG, and it did not belong
   * there: those two take away what is on the screen and this one takes away
   * something that only exists while the artwork is moving. It is in the
   * Animate panel now, next to Play and the format it writes.
   *
   * The work stays here, because this is where the geometry and the frame
   * builder are. The focused card lends the function upward and the panel calls
   * it, passing in something to report progress to — which is why that is an
   * argument rather than local state now.
   */
  const handleVideo = useCallback(async (report = () => {}) => {
    if (!geo) return;
    try {
      // Half the still-export scale: video files grow fast, and 25 frames of a
      // dense pattern at full resolution is a lot of encoder work for no gain.
      const scale = Math.max(1, pngScale(geo.box) / 2);
      const { blob, extension } = await recordLoop({
        frameSVG:
          motionMode === 'loop'
            ? (t) => frame(animateParams(pattern, live, t))
            : (t) => frame(live, motionEffect(motionMode, t, easing)),
        width: Math.round(geo.box.width * scale),
        height: Math.round(geo.box.height * scale),
        background: transparent ? null : bg,
        fg,
        format: clipFormat,
        onProgress: report,
      });
      downloadBlob(blob, `${exportName}.${extension}`);
    } catch (err) {
      console.error(err);
      alert(`Video export failed: ${err.message}`);
      throw err;
    }
  }, [geo, pattern, frame, live, transparent, bg, fg, exportName, motionMode, easing, clipFormat]);

  const png = geo ? pngDimensions(geo.box) : null;
  const canRecord = CAN_RECORD && (Boolean(pattern.motion) || motionMode !== 'loop');

  // Lent upward while this is the card on screen, and taken back when it is
  // not — so the panel's button always records what you are looking at.
  useEffect(() => {
    if (!focused || !onRecorder) return undefined;
    onRecorder(canRecord && geo ? handleVideo : null);
    return () => onRecorder(null);
  }, [focused, canRecord, geo, handleVideo, onRecorder]);


  return (
    /**
     * One card in the file.
     *
     * Artwork above, everything you can do to it below — and all of it on the
     * card, so a card is a complete record of one idea rather than a picture
     * that needs a control panel somewhere else to mean anything. It is also
     * what makes the turn read: the whole thing swings, the way a card does.
     *
     * The controls scroll inside their own region when a style has more of
     * them than the screen has room for. The card itself must stay exactly one
     * screen tall whatever is on it — a card that grows is a card whose hinge
     * is in a different place from its neighbours'.
     */
    <article ref={ref} data-index={index} id={`style-${pattern.id}`} className="leaf">
      {/* The paper *is* the folder's colour, and everything printed on it takes
          an ink measured against that colour. The artwork's own panel keeps the
          standard ground, so the picture is never fighting the card. */}
      <div
        className="leaf-sheet"
        style={{ '--sheet': paperOf(index), '--sheet-ink': pageInk(index) }}
      >
        {/* Four punches, matching the four rings. Dark because what shows
            through a real one is whatever is behind the page, and behind this
            one is the desk. The near half of each ring is drawn over them,
            which is the last thing that makes a page read as hanging from a
            binding rather than floating in front of it. */}
        {[14, 38, 62, 86].map((at) => (
          <span key={at} className="leaf-hole" style={{ left: `${at}%` }} aria-hidden />
        ))}

        {/* Everything below the punches, carrying the last third of the bend.
            Three hinges rather than two — see Rolodex.jsx — because two put all
            the curvature into one crease at the binding, and paper does not
            have a hinge in it. */}
        <div className="leaf-bend flex min-h-0 flex-1 flex-col gap-2.5 px-5 pt-4 pb-4 lg:gap-3 lg:px-8 lg:pb-5">
        {/* Formats left, name centred, Shuffle right.

            Three groups rather than two, and the split is by what the button
            does to what you are looking at. The formats take the page away
            with them and change nothing; Shuffle changes everything on it.
            Sitting them together made a rank of four in which the one that
            alters your work looked like a fourth way of saving it.

            The name is centred out of the flow rather than balanced against a
            spacer. The formats are a different width on every card — MP4 comes
            and goes with the style — and anything that reserves room for them
            puts the title a little off centre on each one.

            Below a wide window it all comes back into the flow and the name
            takes its own line. The threshold is `lg` and not `sm` because the
            test is whether the name *clears* the buttons, not whether there is
            a second line to be had: at 800px the sheet is narrow enough that a
            centred ISOMETRIC lay straight across MP4, with both still legible
            and neither usable. */}
        <div className="relative flex shrink-0 flex-wrap items-center justify-center gap-x-2 gap-y-2 sm:gap-x-3 lg:justify-between">
          <div className="order-2 flex flex-wrap items-center justify-center gap-2 lg:order-none">
            {/* The floor on the width is so PNG does not jump when it turns
                into an ellipsis mid-export. On a phone that floor is what made
                the three of them 3px too wide for the sheet — and 3px bought a
                whole second row, which is worth more than a button that holds
                still for a second. */}
            <Button onClick={handleSVG} disabled={!geo || busy} className="min-w-[3.4rem] sm:min-w-[4.6rem]">
              SVG
            </Button>
            <Button onClick={handlePNG} disabled={!geo || busy} className="min-w-[3.4rem] sm:min-w-[4.6rem]">
              {busy === 'png' ? '…' : 'PNG'}
            </Button>
          </div>

          <h2 className="leaf-title order-1 lg:absolute lg:left-1/2 lg:order-none lg:-translate-x-1/2">
            {pattern.label}
          </h2>

          {/* Two rolls, and the difference between them is the typeface.
              A pattern is stamped *through* a letterform, so half of what you
              get is the letterform — which makes "another take on this" two
              different questions. One asks for another picture; the other asks
              what else this face can be made to do, and needs the face held
              still to answer. */}
          {pattern.params.length > 0 && (
            <div className="order-3 flex items-center gap-2 lg:order-none">
              <Button
                onClick={() => onRandomizeParams(pattern)}
                title="Randomise this pattern's controls, keeping the typeface"
              >
                Sliders
              </Button>
              <Button
                onClick={() => onRandomize(pattern)}
                variant="violet"
                title="Randomise this pattern's controls and the typeface"
              >
                Shuffle
              </Button>
            </div>
          )}
        </div>

      <div
        className={`artboard min-h-0 flex-1 ${transparent ? 'checkerboard' : ''}`}
        style={transparent ? undefined : { background: bg }}
      >
        {svg ? (
          <div className="preview-svg h-full w-full" dangerouslySetInnerHTML={{ __html: svg }} />
        ) : (
          <span className="flex h-full items-center justify-center px-4 text-center font-mono text-[0.7rem] text-ink-soft">
            {error ??
              (isText ? (font ? 'Type something to begin' : 'Loading typeface…') : 'Add an image to begin')}
          </span>
        )}
      </div>

      {/* Its own scroller, so a style with eleven sliders is still one screen
          tall. Nothing is hidden — the region just gives when the card cannot.

          Capped tighter on a phone than the controls would like. At 46% a
          style with eleven sliders took 223px of a 597px sheet and the picture
          got 222 — the subject exactly as big as the knobs for setting it.
          The cap only bites on the crowded styles, and what it costs there is
          a short flick inside a region that was already built to be flicked. */}
      <div className="max-h-[34%] shrink-0 overflow-y-auto sm:max-h-[38%]">
        <div className="grid gap-x-6 gap-y-2.5 pr-1 md:grid-cols-2 xl:grid-cols-3">
          {pattern.typography &&
            isText &&
            typeParamsFor(text).map((param) => (
              <Slider
                key={param.key}
                param={param}
                value={type[param.key]}
                familyId={familyId}
                onChange={(value) => onType({ ...type, [param.key]: value })}
              />
            ))}
          {paramsFor(pattern).map((param) => (
            <Slider
              key={param.key}
              param={param}
              value={params[param.key]}
              familyId={familyId}
              animated={looping && pattern.motion?.key === param.key}
              onChange={(value) => onParam(pattern.id, { [param.key]: value })}
            />
          ))}
          </div>
        </div>
        </div>
      </div>
    </article>
  );
}

export default memo(PatternCard);
