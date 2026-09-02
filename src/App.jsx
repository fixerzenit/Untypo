import { useCallback, useEffect, useRef, useState } from 'react';
import PatternCard from './components/PatternCard.jsx';
import TopBar from './components/TopBar.jsx';
import Rolodex from './components/Rolodex.jsx';
import StyleShelf from './components/StyleShelf.jsx';
import { DEFAULT_FAMILY, fontCatalog } from './lib/fonts.js';
import { PATTERNS } from './lib/patterns/index.js';
import { DEFAULT_TYPE, defaultParams, randomizeParams } from './lib/params.js';
import { useImageSource } from './lib/useImage.js';
import { loadSession, saveSession } from './lib/persist.js';
import { batchExport } from './lib/batch.js';
import { availableFormats } from './lib/animate.js';
import { buildTextSource } from './lib/sources/text.js';
import { loadFont, snapWeight } from './lib/fonts.js';
import { downloadBlob, slugify } from './lib/download.js';
// Only the reader. `encodePreset` had exactly one caller, which was the
// Share button; a link someone already has still opens.
import { decodePreset } from './lib/preset.js';

/**
 * Frames per second for the live animation — not for the exported video, which
 * always records at its own rate.
 *
 * A grid frame means rebuilding every card on screen, and nine dense ones cost
 * 60-140ms on the main thread: asking for 24fps there just queues work that
 * never lands. In the single view one card is cheap, so it gets a real frame
 * rate. Speed is integrated from elapsed time, so the motion runs at the same
 * pace either way — only the smoothness differs.
 */
/**
 * Frames per second for the live animation — not for the exported video, which
 * always records at its own rate.
 *
 * One card is on screen at a time now, so this is the rate for one card. The
 * grid used to run at twelve because a frame meant rebuilding every visible
 * pattern; a single card is cheap enough for a real frame rate. Speed is
 * integrated from elapsed time, so the motion runs at the same pace whatever
 * this is — only the smoothness differs.
 */
const PREVIEW_FPS = 30;

/**
 * Seconds in one cycle at speed 1.
 *
 * The clock divides by this, and the Animate panel multiplies by it to show
 * the cycle in seconds. It was a bare 4 in one place and a named constant in
 * the other, which is the arrangement where the two drift apart and the
 * readout starts lying about the thing it is reading.
 */
export const CYCLE_AT_1X = 4;

/**
 * Shuffled variations per style in a batch export.
 *
 * Ten was a contact sheet you had to sift; five is one you can look at. The
 * rolls are bounded (see SHUFFLE_REACH in params.js) so all five are usable
 * rather than three good ones and two that lost the word.
 */
const PER_PATTERN = 5;

const IMAGE_DEFAULTS = {
  mode: 'silhouette',
  threshold: 0.5,
  smoothing: 0.4,
  invert: false,
  brightness: 0,
  contrast: 1,
  edgeSmoothing: 1.2,
  edgeGain: 1.6,
  cutout: 'edges',
  cutTolerance: 0.35,
  cutFeather: 1,
};

/**
 * What the app starts with.
 *
 * Named rather than scattered through the state initialisers, because two
 * other things need to know them: the preset encoder, which sends only what
 * differs from these, and the restore below, which layers over them.
 */
const DEFAULT_SESSION = {
  sourceKind: 'text',
  text: 'untypo',
  familyId: DEFAULT_FAMILY,
  imageSettings: IMAGE_DEFAULTS,
  fg: '#111111',
  // A neutral grey rather than a tint: the artwork is the only thing on the
  // page with a colour decision in it, and a warm ground was quietly making
  // that decision first.
  bg: '#d2d2d2',
  transparent: false,
  type: DEFAULT_TYPE,
  speed: 1,
  motionMode: 'loop',
  easing: 'linear',
  clipFormat: 'mp4',
  focusId: PATTERNS[3].id,
};

// A link wins over the last session: someone who followed one wants what it
// shows, not what they were doing yesterday. Read once, before any state
// initialiser runs, and then taken out of the address bar so that editing from
// here on behaves like an ordinary session.
const shared = decodePreset(window.location.hash);
if (shared) {
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
}
const saved = shared ?? loadSession();
const restore = (key, fallback) => (saved?.[key] === undefined ? fallback : saved[key]);

export default function App() {
  const [sourceKind, setSourceKind] = useState(() => restore('sourceKind', DEFAULT_SESSION.sourceKind));
  const [text, setText] = useState(() => restore('text', DEFAULT_SESSION.text));
  const [familyId, setFamilyId] = useState(() => restore('familyId', DEFAULT_SESSION.familyId));
  const [imageSettings, setImageSettings] = useState(() => ({
    ...IMAGE_DEFAULTS,
    ...restore('imageSettings', {}),
  }));
  const image = useImageSource(imageSettings);

  const [fg, setFg] = useState(() => restore('fg', DEFAULT_SESSION.fg));
  const [bg, setBg] = useState(() => restore('bg', DEFAULT_SESSION.bg));
  const [transparent, setTransparent] = useState(() => restore('transparent', DEFAULT_SESSION.transparent));

  // One entry per pattern: { weight, tracking, ...pattern-specific }.
  // Cards are independent so each export stands on its own.
  const [params, setParams] = useState(() => saved?.params ?? defaultParams());
  // Shared by every card: the silhouette is the same word in all of them.
  // Layered over the defaults, so a session saved before a setting existed
  // does not leave its control without a value.
  const [type, setType] = useState(() => ({ ...DEFAULT_TYPE, ...restore('type', {}) }));

  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(() => restore('speed', DEFAULT_SESSION.speed));
  const [motionMode, setMotionMode] = useState(() => restore('motionMode', DEFAULT_SESSION.motionMode));
  const [easing, setEasing] = useState(() => restore('easing', DEFAULT_SESSION.easing));
  // A saved session or a shared link can still be carrying `webm`, which is no
  // longer offered; anything unrecognised falls back rather than leaving the
  // segmented control pointing at nothing.
  const [clipFormat, setClipFormat] = useState(() => {
    const saved = restore('clipFormat', DEFAULT_SESSION.clipFormat);
    return availableFormats().some((f) => f.value === saved) ? saved : DEFAULT_SESSION.clipFormat;
  });
  const [focusId, setFocusId] = useState(() => restore('focusId', DEFAULT_SESSION.focusId));
  const [phase, setPhase] = useState(0);
  const [batch, setBatch] = useState(null);

  // Functional updates keep these callbacks stable, which is what lets
  // React.memo skip the cards that did not change.
  const handleParam = useCallback((patternId, patch) => {
    setParams((prev) => ({ ...prev, [patternId]: { ...prev[patternId], ...patch } }));
  }, []);

  /**
   * Shuffle: the pattern's controls and the typeface, together.
   *
   * They go together because they are the same question. A pattern is stamped
   * *through* a letterform, so half of what you get is the letterform — the
   * same settings over Anton and over Cormorant are not variations on a theme,
   * they are two different pictures. Rolling one and holding the other back
   * was offering a shuffle that could only reach half the deck.
   *
   * The current face is excluded from the draw, because a shuffle that lands
   * on what you already had reads as a button that did not work. A dropped
   * font is in the pool like any other: it was chosen on purpose and is the
   * one the user is most likely to want to see under everything.
   */
  const handleRandomize = useCallback(
    (pattern) => {
      setParams((prev) => ({ ...prev, [pattern.id]: randomizeParams(pattern, prev[pattern.id]) }));
      const faces = fontCatalog().filter((f) => f.id !== familyId);
      if (faces.length) setFamilyId(faces[Math.floor(Math.random() * faces.length)].id);
    },
    [familyId],
  );

  /**
   * The clock, paced by what the card can actually draw.
   *
   * This was a `setInterval` at thirty a second, and that is the whole of what
   * was wrong with the animation. A frame here means rebuilding a card's entire
   * SVG from scratch, and the dense ones are not cheap: measured with a long-
   * task observer, one rebuild of Defocus takes 168ms and one of Captcha 174ms.
   * A timer does not care. It asked for a new frame every 33ms, five of them
   * queued behind every one the main thread could finish, and the queue never
   * drained — so the sliders stopped answering, the turn stuttered, and the
   * animation itself crawled. It looked broken because it was: the app was
   * being asked for five times the work it could do.
   *
   * An animation frame cannot queue. The browser calls it when it is ready to
   * paint and not before, so a card that takes 170ms simply gets six frames a
   * second instead of thirty, and nothing piles up behind it.
   *
   * The speed is unaffected, which is the point of integrating real elapsed
   * time rather than counting ticks: a slow card animates at the same pace as
   * a fast one, in fewer steps. The floor stops a 120Hz display rebuilding
   * twice as often as it needs to for motion nobody can see.
   */
  const speedRef = useRef(speed);
  speedRef.current = speed;
  useEffect(() => {
    if (!playing) return undefined;
    const floor = 1000 / PREVIEW_FPS;
    let frame = 0;
    let last = performance.now();
    const tick = (now) => {
      frame = requestAnimationFrame(tick);
      const since = now - last;
      if (since < floor) return;
      last = now;
      setPhase((prev) => (prev + ((since / 1000) * speedRef.current) / CYCLE_AT_1X) % 1);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  // Reopening should land where you left off. Debounced so dragging a slider
  // does not write to storage on every tick.
  useEffect(() => {
    const id = setTimeout(
      () =>
        saveSession({
          sourceKind, text, familyId, imageSettings, fg, bg, transparent,
          params, type, speed, motionMode, easing, clipFormat, focusId,
        }),
      400,
    );
    return () => clearTimeout(id);
  }, [
    sourceKind, text, familyId, imageSettings, fg, bg, transparent,
    params, type, speed, motionMode, easing, clipFormat, focusId,
  ]);

  // Image sources are out of the interface for the moment; the pipeline and
  // the panel are still here and still work, but nothing is wired to them, so
  // every style is available and the source is always the word.
  const imageSource = null;
  const available = PATTERNS;

  // A style the current source cannot draw would be a blank card, so the file
  // falls back to the first one it can.
  const at = Math.max(0, available.findIndex((p) => p.id === focusId));
  const focused = available[at] ?? available[0];

  // The file speaks in positions and everything else speaks in ids. Translating
  // here rather than in the Rolodex keeps that component about the turn and
  // nothing else.
  const goTo = useCallback((position) => {
    setFocusId((prev) => available[position]?.id ?? prev);
  }, [available]);

  /**
   * Shuffle the whole thing: a different style, a different face, and fresh
   * settings for the style it lands on.
   *
   * The card's own Shuffle rolls the controls of the style you are looking at
   * and the typeface under it. This one also rolls *which* style, which is the
   * one thing that button deliberately does not touch — you press it because
   * you want another take on this pattern, and having it turn into a different
   * pattern would make it unusable for that.
   *
   * So they are two buttons rather than one with a modifier: the card's asks
   * "what else can this style do", and the masthead's asks "show me something".
   * Neither can land on what is already on screen — a shuffle that gives back
   * what you had reads as a button that did not work — so both the style and
   * the face are drawn from the pool with the current one taken out.
   */
  /**
   * The same roll as the card's Shuffle, with the typeface held.
   *
   * A pattern is stamped through a letterform, so half of what a shuffle gives
   * back is the letterform — which is exactly why the card's Shuffle rolls both
   * and exactly why there has to be one that does not. Asking "what else can
   * this face do" is a different question from asking for another picture, and
   * it cannot be asked at all if the face moves every time.
   */
  const handleRandomizeParams = useCallback((pattern) => {
    setParams((prev) => ({ ...prev, [pattern.id]: randomizeParams(pattern, prev[pattern.id]) }));
  }, []);

  /**
   * The clip recorder, lent up from whichever card is on screen.
   *
   * The work has to happen on the card — that is where the geometry and the
   * frame builder are — and the button has to be in the Animate panel, because
   * a clip is a thing the motion controls make and not a third way of saving
   * the still. So the card hands its recorder here and the panel calls it.
   */
  const recorder = useRef(null);
  const [clip, setClip] = useState(null);
  // A flag beside the ref, because a ref read while rendering does not make the
  // panel render again — the button would have been permanently disabled on
  // first paint and never noticed the recorder arriving.
  const [canRecord, setCanRecord] = useState(false);
  const takeRecorder = useCallback((fn) => {
    recorder.current = fn;
    setCanRecord(Boolean(fn));
  }, []);
  const handleRecord = useCallback(async () => {
    if (!recorder.current || clip) return;
    setClip({ progress: 0 });
    try {
      await recorder.current((progress) => setClip({ progress }));
    } catch {
      // The card has already said so; this only has to stop showing a percentage.
    } finally {
      setClip(null);
    }
  }, [clip]);

  const handleShuffleAll = useCallback(() => {
    const others = available.filter((p) => p.id !== focusId);
    const pattern = others.length
      ? others[Math.floor(Math.random() * others.length)]
      : available[0];
    if (!pattern) return;
    setFocusId(pattern.id);
    setParams((prev) => ({ ...prev, [pattern.id]: randomizeParams(pattern, prev[pattern.id]) }));
    const faces = fontCatalog().filter((f) => f.id !== familyId);
    if (faces.length) setFamilyId(faces[Math.floor(Math.random() * faces.length)].id);
  }, [available, focusId, familyId]);


  const runBatch = useCallback(async () => {
    setBatch(0);
    try {
      const font = await loadFont(familyId, snapWeight(familyId, type.weight));
      const source =
        sourceKind === 'image'
          ? imageSource
          : buildTextSource({
              font,
              text,
              tracking: type.tracking,
              leading: type.leading,
              align: type.align,
            });
      if (!source) throw new Error('Nothing to render yet');

      const { blob, count } = await batchExport({
        patterns: available,
        params,
        geoFor: () => source,
        fg,
        bg,
        transparent,
        font,
        perPattern: PER_PATTERN,
        onProgress: setBatch,
      });
      const base = sourceKind === 'image' ? 'image' : slugify(text);
      downloadBlob(blob, `${base}-${count}-variations.zip`);
    } catch (err) {
      console.error(err);
      alert(`Batch export failed: ${err.message}`);
    } finally {
      setBatch(null);
    }
  }, [familyId, type, sourceKind, imageSource, text, available, params, fg, bg, transparent]);


  return (
    // The page itself never scrolls. The file inside it does, and it is sized
    // against the bar above it — so the bar is the only fixed thing and the
    // card below is always exactly one screen.
    <div className="flex h-svh flex-col overflow-hidden">
      <TopBar
        text={text}
        onText={setText}
        familyId={familyId}
        onFamily={setFamilyId}
        type={type}
        onType={setType}
        onShuffleAll={handleShuffleAll}
        onRecord={handleRecord}
        canRecord={canRecord}
        clip={clip}
        fg={fg}
        onFg={setFg}
        bg={bg}
        onBg={setBg}
        transparent={transparent}
        onTransparent={setTransparent}
        playing={playing}
        onPlaying={setPlaying}
        speed={speed}
        onSpeed={setSpeed}
        motionMode={motionMode}
        onMotionMode={setMotionMode}
        easing={easing}
        onEasing={setEasing}
        clipFormat={clipFormat}
        onClipFormat={setClipFormat}
      />

      {/* The file, and the drawer it came out of.
          The shelf is a sibling of the scroller rather than something inside
          it, because it is the one part of the index that must not move when
          the file does. It is passed the available styles rather than
          importing them, because only this component knows which ones the
          current source can actually draw: a photograph has no silhouette, so
          several step aside for it and the index has to say so. */}
      <div className="flex min-h-0 flex-1 flex-col bg-[#0b0b0d]">
        <Rolodex count={available.length} index={at} onIndex={goTo}>
        {available.map((pattern, index) => {
          /**
           * Which cards get built. Measured round the ring, because the file
           * comes back to the beginning: after the last style the next page is
           * the first one, and by the straight-line distance that is twenty-one
           * away and would arrive blank.
           */
          const near =
            Math.min(Math.abs(index - at), available.length - Math.abs(index - at)) <= 1;
          return (
          <PatternCard
            key={pattern.id}
            index={index}
            total={available.length}
            pattern={pattern}
            sourceKind={sourceKind}
            text={text}
            familyId={familyId}
            source={imageSource}
            params={params[pattern.id]}
            type={type}
            onType={setType}
            fg={fg}
            bg={bg}
            transparent={transparent}
            /**
             * The clock, but only to the cards that can read it.
             *
             * This ticks thirty times a second, and it was handed to all
             * twenty-two. Nineteen of them are not being drawn — `near` is
             * false, so they build no artwork at all — and every one of them
             * still re-rendered on every tick, because a changed prop is a
             * changed prop and `memo` cannot know the component will ignore it.
             * Six hundred component renders a second to draw three cards.
             *
             * Frozen at zero for the rest, which is a value that does not
             * change, which is what lets `memo` do the thing it is there for.
             */
            phase={near ? phase : 0}
            playing={playing}
            motionMode={motionMode}
            easing={easing}
            clipFormat={clipFormat}
            near={near}
            onParam={handleParam}
            onRandomize={handleRandomize}
            onRandomizeParams={handleRandomizeParams}
            focused={pattern.id === focusId}
            onRecorder={takeRecorder}
          />
          );
        })}
        </Rolodex>

        <StyleShelf patterns={available} index={at} onPick={goTo} />
      </div>
    </div>
  );
}
