import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

/**
 * The file itself: one card to a screen, hinged at the top.
 *
 * A Rolodex card hangs from the axle. Turning the knob lifts the front card,
 * swings it up and over, and drops the next one into its place — so the two
 * cards occupy the same air for the length of the turn, one leaving as the
 * other arrives. That overlap is the whole effect, and it is also the thing
 * that rules out the obvious implementation: a column of full-height sections
 * never has two of them on screen at once, so its cards can only slide past
 * each other, never through.
 *
 * So the cards do not live in the scroll at all. A tall track provides the
 * length, a sticky stage holds every card stacked in the same place, and the
 * scroll position is read as a single number — 0 is the first card square on,
 * 1 the second, 0.5 the middle of a turn with both edge-on. Everything the
 * cards do is a function of that number.
 *
 * ON HINGING AT THE TOP
 *   `transform-origin: 50% 0` puts the axle along the card's top edge, which is
 *   where the real one is. Rotate about the centre instead and the cards spin
 *   like a coin, which is a different object entirely.
 *
 *   Which way they turn took getting wrong first. The cards on one of these
 *   hang from the axle and fan: the ones you have read lean *toward* you at
 *   the front, the ones you have not lean away at the back, and reading is
 *   taking a card from the back pile up to vertical and letting the last one
 *   fall forward. So a card you are leaving swings out over the camera and a
 *   card you are arriving at rises from behind. Turning them the other way —
 *   the next card swinging up at you — magnifies its bottom edge until it
 *   fills the screen, which is a page being thrown at you rather than a file
 *   being read.
 *
 * ON THE SCROLL STAYING THE USER'S
 *   Nothing here captures the wheel. The track is real scrollable length with
 *   real snap points, so a trackpad, a wheel, a swipe, Page Down, Home, End and
 *   the scrollbar all work without knowing this component exists — and a turn
 *   can be taken slowly, or stopped half way and reversed, which a hijacked
 *   one-flip-per-gesture cannot do.
 *
 * ON MEASURING RATHER THAN ASSUMING
 *   The step is read off a snap stop's own height instead of from
 *   `innerHeight`. On a phone those two disagree the moment the address bar
 *   starts collapsing, and a scroll whose arithmetic disagrees with its layout
 *   drifts a little further out of true with every card.
 */

/**
 * The two ends of the turn.
 *
 * `OVER` is where a card you have finished with ends up: lifted off the stack
 * and swung up and over toward you, past edge-on and gone. `FAN` is where the
 * cards you have not reached wait — leaning back off the bar, receding, with
 * their tabs combed above the one you are reading.
 *
 * Which way each of them goes is the whole thing, and it took getting wrong
 * twice. Fan the unread cards *forward* and they are nearer the eye than the
 * card you are reading, so perspective makes them larger and they frame it in
 * white on three sides — the stack you have not got to obscuring the one you
 * are on. Fanned back they recede, which is both what a stack does and the
 * only arrangement in which the tabs stand above rather than below.
 *
 * That leaves the read card only one way out that is genuinely upward: it
 * lifts, swings over the top toward the camera, and `backface-visibility`
 * takes it at ninety degrees. It never crosses the back stack, because it
 * goes the other way round.
 *
 * The two numbers are deliberately different and the motion is deliberately
 * not symmetric. On the object, reading a card is one big movement — the front
 * one lifts and goes over — and the card underneath barely moves, because it
 * was already nearly where it needed to be. Give both half the sweep and you
 * get a revolving door.
 */
const OVER = 168;
const FAN = 9;

/** Where the four punches sit across the width of the page. */
const HOLES = [0.14, 0.38, 0.62, 0.86];

/**
 * The fasteners.
 *
 * Two parts, and only one of them is on the paper. The eyelet is the punched
 * hole with its metal collar, and it belongs to the page — it is drawn on the
 * sheet, so it turns with it. The wire is the thing the page hangs from: a
 * narrow loop rising off the binding edge, and it belongs to the binder, so it
 * stays put while pages turn under it.
 *
 * Splitting them that way is what the whole illusion rests on. A ring drawn as
 * one object either turns with the paper, which is a ring falling off the
 * binder, or stays still with its lower half sitting on top of the page, which
 * is a ring lying on it. The hole moves, the wire does not.
 *
 * It is also why they are small. In a photograph of one of these the paper is
 * nearly all of the picture and the metal is a few millimetres of it; drawn at
 * the size furniture wants to be drawn, the binding stops being a detail of a
 * page and becomes the subject.
 */
function Wires() {
  return (
    <div className="binder-wires">
      {HOLES.map((at) => (
        <svg key={at} className="binder-wire" viewBox="0 0 26 40" style={{ left: `${at * 100}%` }}>
          {/* A narrow loop standing on the eyelet: up one side, over, down the
              other. Narrow because a wide one reads as a paperclip — two long
              parallel legs on white paper are a paperclip whatever is at the
              top of them, and the only part of this that should be legible is
              the bend. */}
          <path d="M8 40 L8 15 A5 5 0 0 1 18 15 L18 40" className="binder-wire-band" />
          <path d="M9.2 18 A4.4 4.4 0 0 1 13 12.6" className="binder-wire-light" />
        </svg>
      ))}
    </div>
  );
}

/**
 * How far a card stays on the stage, ahead and behind.
 *
 * Asymmetric, because the two directions are different piles. Cards you have
 * not reached recede into a stack you can see the edges of, which is most of
 * what makes this read as an object; cards you have read swing forward over
 * the camera and there is nothing to be gained by watching them go.
 */
const BEHIND = 11;
const AHEAD = 0.95;

/**
 * One spare stop before the first page and one after the last.
 *
 * A scroll container cannot be scrolled past either of its own ends, so a file
 * that has to keep going in both directions needs somewhere to go. These two
 * are it: turning down off the last page lands on the spare at the foot, which
 * is already showing page one, and the scroll is quietly moved back to page
 * one's real stop the moment it comes to rest. Turning up off the first page
 * does the same at the head. Nothing is drawn on either — they are length, not
 * pages, and the arithmetic everywhere else just carries the offset.
 */
const LEAD = 1;

/**
 * The curve the turn travels on.
 *
 * Slow away, quick through the middle, long settle — the same shape as
 * everything else that moves in this app, and the reason a jump of one page
 * and a jump of fifteen both read as one gesture rather than as a cut.
 *
 * Stated as a cubic-bezier because that is the vocabulary the rest of the
 * design is written in, and solved here rather than handed to CSS: what is
 * being animated is a scroll position, and there is no CSS property for that
 * which a snapping container will leave alone.
 *
 * Chosen on the peak speed rather than by eye. Across the candidates the
 * numbers that matter are how fast the turn ever gets and how long it takes to
 * stop, and this one has the lowest peak of the five tried — 2.62 times the
 * average against 2.86 for a symmetric ease-in-out — while still covering
 * three quarters of the distance in the first half of the time, which is what
 * leaves it a long settle. A lower peak is a turn that never appears to snatch.
 */
const TURN = [0.45, 0, 0.25, 1];

/**
 * y at a given x on a cubic-bezier with endpoints (0,0) and (1,1).
 *
 * The curve is parametric, so x has to be inverted before y can be read off:
 * Newton first, because it converges in two or three steps over almost all of
 * the range, and a bisection fallback for the flat parts where its derivative
 * is small enough to send it somewhere useless.
 */
function ease(x, [x1, y1, x2, y2] = TURN) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const cx = (t) => ((1 - t) ** 3 * 0 + 3 * (1 - t) ** 2 * t * x1 + 3 * (1 - t) * t * t * x2 + t ** 3);
  const cy = (t) => ((1 - t) ** 3 * 0 + 3 * (1 - t) ** 2 * t * y1 + 3 * (1 - t) * t * t * y2 + t ** 3);
  const dx = (t) =>
    3 * (1 - t) ** 2 * x1 + 6 * (1 - t) * t * (x2 - x1) + 3 * t * t * (1 - x2);

  let t = x;
  for (let i = 0; i < 4; i++) {
    const err = cx(t) - x;
    if (Math.abs(err) < 1e-5) return cy(t);
    const slope = dx(t);
    if (Math.abs(slope) < 1e-6) break;
    t -= err / slope;
  }
  let lo = 0;
  let hi = 1;
  t = x;
  for (let i = 0; i < 20; i++) {
    const err = cx(t) - x;
    if (Math.abs(err) < 1e-5) break;
    if (err > 0) hi = t;
    else lo = t;
    t = (lo + hi) / 2;
  }
  return cy(t);
}

/** How long a turn takes, in milliseconds, for a jump of `pages`. */
function duration(pages) {
  // Not proportional. A jump across the whole file would take six seconds at a
  // fixed speed per page, and a one-page turn would be over before the eye
  // caught it; the square root gives a long jump more time without giving it
  // all of it.
  return Math.min(1050, 300 + Math.sqrt(pages) * 240);
}

export default function Rolodex({ count, index, onIndex, children }) {
  const track = useRef(null);
  const stage = useRef(null);
  // Progress in cards, fractional through a turn. Held in a ref rather than in
  // state because the transforms are written straight to the DOM: putting a
  // number that changes every frame through React would re-render every card
  // on the stage for a scroll nobody has finished yet.
  const progress = useRef(index);
  const settled = useRef(index);
  const wanted = useRef(index);

  const step = useCallback(
    () => track.current?.querySelector('.rolodex-stop')?.offsetHeight || window.innerHeight,
    [],
  );

  /**
   * Gliding to a page, rather than arriving at it.
   *
   * Written by hand, and this is the second attempt. The first used the
   * browser's own `scrollTo({ behavior: 'smooth' })` and had to be taken out:
   * inside a `mandatory` snap container the two fight, and the browser
   * abandoned the scroll part-way — it stopped at sixteen with the index
   * claiming one. Snap is not a suggestion; while it is on, every scroll
   * position the container is given is a position it will argue with.
   *
   * So the snap is switched off for the length of the turn and switched back
   * on at the end, and the position is stepped by hand each frame. Nothing
   * argues, and it can be interrupted — which the browser's own version could
   * not be, and which is what a scroll has to be.
   */
  const gliding = useRef(0);

  const stopGlide = useCallback(() => {
    if (!gliding.current) return;
    cancelAnimationFrame(gliding.current);
    gliding.current = 0;
    if (track.current) track.current.style.scrollSnapType = '';
  }, []);

  const glideTo = useCallback(
    (top) => {
      const el = track.current;
      if (!el) return;
      stopGlide();
      const from = el.scrollTop;
      const delta = top - from;

      /**
       * Three reasons to arrive instead of travel.
       *
       * Under a pixel is not a journey. Someone who has asked for less motion
       * has asked for this in particular — a page sliding for a second is the
       * clearest possible case of it. And a hidden tab gets no animation
       * frames at all, so a glide started there would never finish: the file
       * would quietly stop navigating for as long as it was in the background,
       * and be found mid-turn on the way back.
       */
      if (
        Math.abs(delta) < 1 ||
        document.hidden ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ) {
        el.scrollTop = top;
        return;
      }
      const ms = duration(Math.abs(delta) / step());
      el.style.scrollSnapType = 'none';
      const began = performance.now();
      const frame = (now) => {
        const through = Math.min(1, (now - began) / ms);
        el.scrollTop = from + delta * ease(through);
        if (through < 1) {
          gliding.current = requestAnimationFrame(frame);
          return;
        }
        gliding.current = 0;
        // Landed exactly, and only then is snap allowed an opinion again.
        el.scrollTop = top;
        el.style.scrollSnapType = '';
      };
      gliding.current = requestAnimationFrame(frame);
    },
    [step, stopGlide],
  );

  const apply = useCallback(() => {
    const stageEl = stage.current;
    if (!stageEl) return;
    const p = progress.current;

    for (const leaf of stageEl.children) {
      const i = Number(leaf.dataset.index);
      /**
       * The file is a ring, so a page has more than one place it could be.
       *
       * Every page is somewhere on the wheel at all times, and which copy of
       * it you are looking at is whichever is nearest — half a turn ahead at
       * most, half a turn behind at worst. That one line is the whole loop:
       * standing on the last page, the first is at d = 1, which is to say
       * directly underneath, which is where the next page goes. Nothing else
       * in here needs to know the file ever ends.
       */
      let d = i - p;
      const half = count / 2;
      if (d > half) d -= count;
      else if (d < -half) d += count;
      const away = Math.abs(d);
      const far = d > BEHIND || d < -AHEAD;
      leaf.style.visibility = far ? 'hidden' : 'visible';
      // A layer only where one is about to be needed. `will-change` is a
      // standing promise to the compositor and it costs a layer to keep it, so
      // twenty-two pages holding one permanently is memory spent on the twenty
      // nobody can see. Six are visible at a time.
      leaf.style.willChange = far ? 'auto' : 'transform';
      // Only the card square on takes input. A slider you can catch edge-on is
      // a slider you will catch by accident.
      // The card square on takes input everywhere; the ones fanned behind it
      // take it on their tab alone, which is the only part of them you can
      // see. A slider you can catch edge-on is a slider you catch by accident.
      /**
       * Only the card square on takes input.
       *
       * There is no `transform-style` here any more, on this or on anything
       * inside it. It was needed to compose the bend, and the bend is gone; a
       * single rotation needs the perspective on the stage and nothing else.
       * That is worth being glad about rather than tidy about — a standing 3D
       * context is answered on a click by the wrapper instead of by the
       * control inside it, which is a card that looks completely normal and
       * does nothing, and it is the fault that came back three times.
       */
      const settled = away < 0.04;
      leaf.style.pointerEvents = settled ? 'auto' : 'none';
      leaf.setAttribute('aria-hidden', away < 0.5 ? 'false' : 'true');
      if (far) continue;

      /**
       * The turn, the way a pad is actually turned.
       *
       * The binding is at the head and the pages lie under it, so reading the
       * next one means taking this one by its foot, lifting it *toward* you,
       * and carrying it over the top to rest face down behind the pad. That is
       * a rotation toward the camera, and it was going the other way — the
       * page sank backwards, which is a page being swallowed rather than
       * turned.
       *
       * Sending it at the camera magnifies it — perspective does that to
       * anything that comes closer — and the answer used to be a `translateZ`
       * pushing the page back as it turned. That is wrong, and it is the thing
       * that was making it look unhinged: a translate moves the *whole*
       * element, the punched holes with it, so the page slid off the rings it
       * is supposed to be locked to. Nothing may move the hinge.
       *
       * So the swelling is paid for with the lens instead. A long perspective
       * flattens the whole scene, and at the distance set on the stage the
       * worst magnification through the turn is small enough to read as a page
       * lifting rather than as one being thrown. The hinge stays exactly on
       * the rings, which is the only thing that cannot be traded.
       *
       * It passes edge-on a little past halfway, and `backface-visibility`
       * takes it the moment its blank back comes round.
       */
      const swing = d <= 0 ? -d * OVER : -Math.min(1, d) * FAN;
      // Only the pages you have not reached move in depth, and they recede.
      // The one turning does not translate at all.
      const depth = d > 0 ? -Math.min(d, BEHIND) * 16 : 0;
      // A settled page carries no transform at all, rather than an identity
      // one: `rotateX(0deg)` is still a transform, and it still makes the
      // element a containing block and a stacking context.
      const turning = Math.abs(swing) > 0.4 || depth !== 0;
      leaf.style.transform = !turning
        ? ''
        : depth
          ? `translateZ(${depth}px) rotateX(${swing}deg)`
          : `rotateX(${swing}deg)`;

      /**
       * The page turns as one, and that is now the whole of it.
       *
       * It used to bend. Four hinges down the sheet, each taking back a share
       * of the turn, so the paper was steep where it was held and curled at
       * the free edge — which is what a lifted page really does, and it did
       * look right.
       *
       * It cost more than it was worth, and not in a way that was visible.
       * A page here is not paper: it holds live sliders and a live SVG, and
       * the only way to bend something you cannot cut into strips is to rotate
       * its own boxes. The last two hinges were, in plain terms, the controls
       * region and the grid of sliders inside it — the thing being bent was
       * the thing you use. Every one of those rotations left a transform
       * behind when the page stopped, and a transformed element inside a
       * `preserve-3d` ancestor is answered by its wrapper on a click rather
       * than by itself, so the card looked perfectly ordinary and its controls
       * did nothing. That is the bug that came back three times.
       *
       * So the page is a rigid leaf pivoting on its rings. Less true to paper
       * and entirely true to what it has to be: a card whose every control
       * works the moment it arrives.
       *
       * The two things worth keeping from the bend are kept, because neither
       * needs a transform. The content fades over the last third of the turn,
       * where flat facets used to catch the light — what is on screen there is
       * blank turning paper. And the sheet still throws a shadow.
       */
      const sheet = leaf.lastElementChild;
      if (sheet) {
        const band = sheet.lastElementChild;
        if (band) {
          band.style.opacity = swing > 70 ? String(Math.max(0, 1 - (swing - 70) / 38)) : '1';
        }
        // How much shadow the page is throwing. Nothing at rest, most of it at
        // the top of the swing — a page lifted off a stack darkens the one
        // under it, and a page that turns without throwing anything is a
        // picture changing rather than a page moving. The stylesheet turns
        // this into an offset, a blur and an opacity, so the shape of the
        // shadow lives with the rest of the design.
        const cast = swing > 0 ? Math.sin((Math.min(swing, 90) * Math.PI) / 180) : 0;
        sheet.style.setProperty('--cast', cast.toFixed(3));

      }
      leaf.style.opacity = '1';
      // What you have read is in front, which is where it physically is.
      leaf.style.zIndex = String(500 - Math.round(d * 40));
    }
  }, [count]);

  useLayoutEffect(() => {
    const el = track.current;
    if (!el) return undefined;

    let frame = 0;
    const read = (arrived = false) => {
      frame = 0;
      const p = Math.max(-LEAD, Math.min(count - 1 + LEAD, el.scrollTop / step() - LEAD));
      progress.current = p;
      apply();
      // The tabs and the saved session only want the card you have arrived at,
      // so they hear about whole numbers rather than about every frame — and
      // the number they hear is on the ring, so the spare stop past the end
      // reports the first page rather than a twenty-third one.
      const at = (((Math.round(p) % count) + count) % count);
      if (at !== settled.current) {
        settled.current = at;
        wanted.current = at;
        onIndex(at);
      }

      /**
       * Coming to rest on a spare stop: put the scroll back on the real one.
       *
       * Both spares show exactly what their real counterpart shows — page one
       * square on at the foot, the last page square on at the head — because
       * `apply` places the pages on a ring and does not care which stop you
       * are standing at. So the scroll can be moved between the two without
       * anything on screen changing by a pixel, and the file has no end.
       *
       * Only once the scrolling has stopped. Doing it on any frame that
       * happens to sample the spare would snatch the scroll out from under a
       * fling that was still in flight, and the browser would fight it.
       */
      if (!arrived) return;
      if (p <= -LEAD + 0.01) el.scrollTop = (count - 1 + LEAD) * step();
      else if (p >= count - 1 + LEAD - 0.01) el.scrollTop = LEAD * step();
    };
    /**
     * One more read once the scrolling has stopped.
     *
     * Animation frames coalesce scroll events, and the last event of a smooth
     * scroll can land in a frame that never runs. The page then settles at an
     * exact stop still wearing the transform it had while it was moving — flat
     * on screen, `pointer-events: none`, and every control on it dead. It was
     * measured at `away = 0.0003` with input switched off, which is a page that
     * looks perfectly finished and does nothing.
     *
     * A short quiet period after the last event costs one timer and is the
     * difference between a page you can use and a page you cannot.
     */
    let rest = 0;
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(() => read());
      clearTimeout(rest);
      rest = setTimeout(() => read(true), 120);
    };

    /**
     * Land on the page the session left off at.
     *
     * Set once and then checked, because once is not reliable: on the first
     * layout pass the track can still have no height, the assignment clamps to
     * zero, and the file opens on page one while everything else in the app
     * still believes it is on page twenty-two. Nothing catches that afterwards
     * — the scroll never moved, so no scroll event ever fires to reconcile it.
     *
     * So the position is re-asserted on the next two ticks, and only if it has
     * actually drifted more than half a page. Cheap, and it is the difference
     * between a restored session and a restored session that lies.
     */
    const land = () => {
      const want = (index + LEAD) * step();
      if (Math.abs(el.scrollTop - want) > step() / 2) el.scrollTop = want;
      read();
    };
    land();
    const settle = [setTimeout(land, 0), setTimeout(land, 160)];

    /**
     * A hand on the wheel outranks a turn in flight.
     *
     * Without this a glide and a scroll fight for the same number sixty times
     * a second and the page judders between them. Anything that means "I am
     * scrolling this myself" stops the glide where it stands, which is also
     * what makes it feel like a scroll rather than a cutscene.
     */
    el.addEventListener('wheel', stopGlide, { passive: true });
    el.addEventListener('touchstart', stopGlide, { passive: true });

    el.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', read);
    // A hidden tab gets no animation frames, so a scroll that happened while
    // it was away — a restored session, a browser putting the scroll back —
    // leaves every card wearing the transform it had before. Reading once on
    // the way back in is what stops the file reappearing half-turned.
    document.addEventListener('visibilitychange', read);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      settle.forEach(clearTimeout);
      clearTimeout(rest);
      el.removeEventListener('wheel', stopGlide);
      el.removeEventListener('touchstart', stopGlide);
      el.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', read);
      document.removeEventListener('visibilitychange', read);
    };
    // Deliberately not depending on `index`: this sets the starting position
    // once. Moving there afterwards is the tab handler's job below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, apply, onIndex, step, stopGlide]);

  /**
   * Jumping from a tab.
   *
   * Set outright, never glided — and this took two goes to get right.
   *
   * A smooth scroll fights this component on both ends. The frame loop reports
   * the page it passes, so the tabs and the counter can follow the *user*, and
   * during a long glide it reported every page on the way: each one came back
   * as a new `index`, the effect saw a target it had not set, and somewhere in
   * that argument the browser abandoned the scroll — it stopped at sixteen
   * with the index claiming one. Guarding the reports fixed the long jumps and
   * broke the short ones instead: a one-page smooth scroll inside a
   * `mandatory` snap container never moved at all, while the tab and the page
   * count had already changed. The card and its label disagreed, which is
   * worse than either.
   *
   * The answer was to set it outright and let the turn be animated only under
   * the user's own scroll. That was the right fix for the wrong problem: what
   * was broken was the *browser's* smooth scroll, which cannot be interrupted
   * and cannot be reconciled with a snapping container. A turn written by hand
   * has neither difficulty — see glideTo — so the jump is a glide again, and
   * the guard below is what keeps the two from arguing: the frame loop reports
   * every page the glide passes over, and each report would otherwise come
   * back here as a new target while the last one was still being travelled to.
   */
  useEffect(() => {
    const el = track.current;
    if (!el || index === wanted.current) return;
    wanted.current = index;
    settled.current = index;
    glideTo((index + LEAD) * step());
  }, [index, step, glideTo]);

  return (
    <div
      ref={track}
      className="rolodex"
      style={{ '--stops': count + LEAD * 2 }}
      // A scrollable div is only keyboard-scrollable in some browsers unless it
      // can take focus. Page Down, the arrows, Home and End are the whole
      // keyboard story here, and they are free once this is focusable.
      tabIndex={0}
      /**
       * And the keyboard turns pages, rather than scrolling by a line.
       *
       * Native keyboard scrolling on a snap container moves by an arbitrary
       * amount and then snaps, which is a jump with a stutter in front of it.
       * Taking the keys means the arrows travel the same curve a tab click
       * does, which is the only way the two can feel like the same app.
       *
       * Only the keys that mean "go somewhere". Anything else — tab, space
       * while a control has focus, a letter into the text field — is left
       * alone, and the handler does nothing at all unless the scroller itself
       * is what has focus.
       */
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        const last = count - 1;
        const to =
          event.key === 'ArrowDown' || event.key === 'PageDown'
            ? Math.min(last, index + 1)
            : event.key === 'ArrowUp' || event.key === 'PageUp'
              ? Math.max(0, index - 1)
              : event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? last
                  : null;
        if (to === null) return;
        event.preventDefault();
        if (to !== index) onIndex(to);
      }}
      aria-label="Styles, one card to a screen"
    >
      <div className="rolodex-track">
        <div className="rolodex-stage">
          {/* `apply` walks the stage's children to place them, so the stage
              can hold cards and nothing else. The machine is a sibling inside
              the same sticky box: out in the track it inherited none of the
              sizes the axle is measured from, and it scrolled away with the
              length instead of staying put like the object it is. */}
          <div className="rolodex-cards" ref={stage}>
            {children}
          </div>


          {/* The binding.
              Drawn once and never rotated: it is the thing that stays still
              while the cards move, and the reason the turn reads as a card
              being turned rather than as a panel being animated. The axle sits
              exactly on the hinge the cards rotate about, so a card leaving
              visibly pivots on the bar it hangs from — get that line wrong by
              a few pixels and the illusion goes.

              In front of the cards, because on the real object the bar and the
              hooks pass over the front of the stack. */}
          <div className="binder" aria-hidden>
            {/* The pages still under this one. Depth is the count, so the slab
                thins as the file does and the last page sits on nothing. */}
            <span className="binder-stack" style={{ '--left': Math.max(0, count - index - 1) }} />

            {/* Only the wire. The eyelets are on the sheet, because a punched
                hole belongs to the paper and has to turn with it — see Wires
                for why splitting the fastener in two is the whole illusion. */}
            <Wires />
          </div>
        </div>

        {/* The length, and the snap points. Empty on purpose: they exist to be
            scrolled through, and everything you can see is up on the stage.
            Two more than there are pages — see LEAD, which is what lets the
            file come round again instead of stopping. */}
        {Array.from({ length: count + LEAD * 2 }, (_, i) => (
          <div key={i} className="rolodex-stop" style={{ top: `calc(${i} * 100%/var(--stops))` }} aria-hidden />
        ))}
      </div>
    </div>
  );
}
