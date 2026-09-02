# Untypo

Type a word and get it back in twenty-two generative pattern styles, one to a
page in a ring binder you turn. Every variation exports as SVG, PNG, or a looping
clip as MP4 or GIF. The session is kept in localStorage, so reopening lands on
the card you left off at.

The footer is out for the moment, and the idea board with it — the board still
builds and still works, nothing is wired to it.

Image sources are out of the interface for the moment. The pipeline and the
panel are still here and still work — nothing is wired to them, and they are
coming back.

**Share** copies a link that reopens exactly what is on screen. What travels is
the difference from the defaults, not the whole state — twenty-two styles with
a handful of sliders each is a few thousand characters of JSON, and almost
nobody has touched more than a dozen controls, so an edited drawing comes to
about 250 characters. Everything absent falls back to whatever the defaults
currently are, which means a link made before a style existed still opens, and
one naming a style that has since gone is simply ignored.

The typeface list sets every name in its own face. A native `<select>` is the
better mobile control almost everywhere and is the wrong one here: no browser
lets an `<option>` be set in a font the page has not loaded as CSS, and
loading twenty-one webfonts to letter a menu would cost more than the artwork
does. So the names are drawn the way everything else here is drawn — as
outlines, from the same parsed fonts the patterns use. Nothing extra is
fetched and it looks the same in every browser rather than working in two of
them. The picker is never behind the mobile disclosure: the typeface is the
first thing you reach for after the word itself.

**Own…** takes a TTF or OTF from your own machine and adds it to the list
under *Yours*. It names itself from the font's own metadata and ships the one
weight the file contains, so the weight slider disables itself rather than
pretending to interpolate something that is not there. It lasts for the
session only — a font is megabytes of binary, too much to keep in localStorage
and still gone on another device — and a link never carries one, because the
other end has never seen it.

## The mark

The wordmark is the word set in one of the app's own styles — Blocks — rather
than in the interface face. It is the only place here that has to say what this
makes, and saying it by doing it costs one file. It is applied as a CSS mask
rather than as an `<img>`, so it takes `currentColor` and inherits the ink the
way every other piece of type here does, and so it cannot be dragged off the
page as a picture.

The favicon is the letter h from the same drawing. A square crop of a wordmark
that wide pulls the neighbouring letter in beside it, so the h is clipped to
its own columns — found by scanning the ink for empty ones, the same trick the
Sampler style uses to find letters — and then centred in the square.

`og.png` is the link preview. It is the one raster asset here, because X, Slack
and Facebook all refuse SVG for a card. There is no SVG converter on this
machine, so it is rendered with `qlmanage`, which always hands back a *square*
thumbnail whatever it was given: a 1200x630 source came back padded and
cropping the band out of it landed on the wrong rows twice. Feeding it a square
to begin with makes the arithmetic exact — render square, crop the middle
630/1200, scale to the card.

## Interface

Black on white, one grey for filled surfaces, and a handful of flat saturated
colours that are never mixed and never shaded. Tokens live at the top of
`src/index.css`.

### The file

One page to a screen, in a ring binder. The page is nine tenths of the window,
which is the proportion the thing is actually in: in a photograph of one of
these the paper is nearly all of the picture and the metal is a few
millimetres of it. Everything the binding gets is height the artwork is not
getting, so it gets as little as it can be given.

**The fastener is two things, and only one of them is on the paper.** The
eyelet is the punched hole with its collar, and it is drawn on the sheet, so it
turns with it. The wire is what the page hangs from, and it is drawn on the
binder, so it stays put while pages turn under it. Drawn as one object it
either turns with the paper — a ring falling off the binder — or stays still
with its lower half sitting on top of the page, which is a ring lying on it.
The hole moves, the wire does not.

The loop is narrow on purpose. Two long parallel legs on white paper are a
paperclip whatever is at the top of them; the only part of this that should be
legible is the bend.

**The pages are not in the scroll.** Turning one lifts it, swings it up and
over, and drops the next into its place, so the two share the same air for the
length of the turn. That overlap is the
whole effect and it rules out the obvious build — a column of full-height
sections never has two of them on screen at once, so its cards can only slide
past each other, never through. Instead a tall track supplies the length, a
sticky stage holds every card stacked in one place, and the scroll position is
read as a single number: 0 is the first card square on, 0.5 the middle of a
turn. Everything the cards do is a function of that number.

**A page bends, in three stages.** One rotation about the rings is a rigid
plate pivoting, which is what a Rolodex card does and what a notebook page does
not. Two was better and still wrong in a way you can see: two angles is one
crease, and a page that creases once is folded, not bent.

Three angles is a curve. The leaf turns at the rings; the sheet takes a fifth
of it back about the same line, which starts the paper leaving the crease; and
the band of content below the punch strip takes another quarter back about
*its* own top, a good way down the page. At a 90° turn that is 90° at the
rings, 72° below the holes and 50° at the foot — steep where it is held,
shallow at the free edge, bending the whole way between. The lower band also
turns a few degrees about its right edge, so the free corner lifts further than
the bound one: in the reference it is a corner that curls, not an edge. Splitting the page into strips is how you would do this
properly and it is not available: the page holds live sliders and a live SVG,
and they cannot be cut into bands.

**Which way they turn** took getting wrong twice. Fan the cards you have not
reached *forward* and they are nearer the eye than the one you are reading, so
perspective makes them larger and they frame it in white on three sides — the
stack you have not got to obscuring the card you are on. Fanned back they
recede, which is both what a stack does and the only arrangement in which the
tabs stand above the card rather than below it.

**A page turns toward you.** The binding is at the head and the pages lie
under it, so reading the next one means taking this one by its foot, lifting it
toward you, and carrying it over the top to rest face down behind the pad.
Sending it backwards instead is a page being swallowed, not turned.

**Nothing may move the hinge.** Sending the page at the camera magnifies it —
perspective does that to anything that comes closer — and the answer for a
while was a `translateZ` pushing it back as it turned. That is wrong, and it is
what made the page look unhinged: a translate moves the *whole* element, the
punched holes with it, so the page slid off the rings it is supposed to be
locked to.

So the swelling is paid for with the lens instead. At a perspective of 6000px
the worst point of the turn measures **1.15×**, where the 1500px the stage
started on would have given 2.27×. The hinge stays exactly on the rings, which
is the one thing that cannot be traded, and the page comes up off the pad with
a swell small enough to read as lifting rather than as being thrown.

**Why this is CSS and not Three.js.** A page mesh in WebGL would bend properly
— a real grid of vertices instead of two nested rotations — and it would cost
the thing the page is for. The page holds live sliders, live segmented
controls and a live SVG; putting it on a mesh means rendering all of that to a
texture, and a texture is not a control. You would get a better curve and lose
the ability to drag anything on it, and the artwork would be resampled bitmap
rather than the vector it is everywhere else in this app. The bend is the
cheaper half of the illusion; the interactivity is the product.

The two movements are deliberately not symmetric — turning a page is one big
movement, and the page underneath barely moves because it was already nearly
where it needed to be. Give both half the sweep and you get a revolving door.

**Nothing cross-fades.** Paper is opaque, and the moment you can see through it
the whole thing stops being an object and becomes two pictures. Depth, z-order
and `backface-visibility` do all the separating, which is what does it on a
desk — a card past ninety degrees is showing a back with nothing on it, so it
leaves the screen without ever having been semi-transparent. Rotation stops
fanning at one card out but depth does not, so what stands behind the card you
are reading is a stack of edges going back into the file.

**Nothing captures the wheel.** The track is real scrollable length with real
snap points, so a trackpad, Page Down, Home, End, a swipe and the scrollbar all
work without knowing any of this exists — and a turn can be taken slowly, or
stopped half way and reversed, which a hijacked one-flip-per-gesture cannot do.
The step is measured off a snap stop rather than taken from `innerHeight`,
because on a phone those two disagree the moment the address bar collapses and
a scroll whose arithmetic disagrees with its layout drifts further out of true
with every card.

**Three bands that must not share space.** The binding takes a thin strip at
the head, the page takes everything it can, and the index hangs off the foot.
They were measured off one number for a while and they overlapped — the rings
landed on the tabs and the second row of tabs landed on the page.

**Do not name a class after a utility.** The wires were `.ring`, which is
Tailwind's focus-halo utility — `box-shadow: 0 0 0 1px currentColor` — so all
four wore a one-pixel black box that took three passes to find, because nothing
in this stylesheet draws one.

**A restored position has to be checked, not just set.** On the first layout
pass the track can still have no height, so `scrollTop = index * step` clamps to
zero and the file opens on page one while everything else in the app believes it
is on page twenty-two. Nothing catches that afterwards, because the scroll never
moved and so no scroll event ever fires to reconcile it. The position is
re-asserted on the next two ticks, and only if it has actually drifted more than
half a page.

### Index tabs

Two rows in the masthead. They hung off the foot of the page for a while, like
the dividers in a real file, and they read better up here for a plain reason:
this is where you look to find out where you are, and the page below is then
only ever the artwork. At the foot they were competing with the controls for
the bottom of the screen and were the first thing to go on a short window.

A tab belongs to its page, so passing a page takes its tab with it and the rack
empties as you work through the file. But *removing* a tab from the row is a
different thing from hiding it: the row repacks, and every remaining tab slides
left to fill the gap. Turn one page and the whole index moves — which is the
one thing an index may never do, because the only reason to look at it twice is
that Voronoi is where Voronoi was a moment ago. So a passed tab goes invisible
and keeps its slot; the rack empties in place, from the left, and nothing still
in it ever moves.

A tab holds a fixed slot rather than a share of the row for the same reason.
Sharing it out gave the rack *wider* tabs as the file emptied — five enormous
ones on the last page, which says the opposite of what a thinning index is
for.

Every tab gets exactly one slot and no more, which is why four names got
shorter rather than getting an ellipsis: Concentric rings became Rings, Circle
packing became Packing, Empty circles became Circles and Cross-stitch became
Stitch. The longest label left is nine characters, which fits a slot down to a
tablet. Nothing is truncated at any width the file is usable at.

The sheets are punched: two holes near the top edge, dark because what shows
through a real one is the machine and the machine here is black, with the hooks
passing over them. The hooks are measured against the *card*, not the stage —
at 40% and 60% of the frame they sat a centimetre inboard of the holes they
were supposed to be passing through, which is the one misalignment that stops a
card reading as hanging from the bar.

**The page is rounded the same on all four corners**, and at a third of what
the panels use. Two big radii at the foot and square at the head is a card, not
a sheet of paper.

**The stack under the card is the page count.** Its depth is how many are left,
so the last card sits on nothing and the first sits on twenty-one. It was a
fixed slab before, saying "plenty" as loudly on the last card as on the first,
which is the one thing a stack of edges is there to tell you. It also grows
*down* from the card's bottom edge: anchored to the bottom of the stage it grew
up into the card, and since the machine draws over the cards, a full file
buried the last two rows of controls under a pile of paper.

### One card, not two

**Squares** was outlined squares on a rotatable lattice, each sized by the ink
under it. **8-bit** was solid blocks on a fixed grid, dithered. Everything that
made them different is a setting one of them can carry: outlined rather than
filled, a screen angle, and a response that keeps the grey instead of
quantising it. Two cards that differ by three settings are one card with three
settings, so Squares is now `8-bit / Outlined / By size / angle`.

The screen angle turns the *sampling*, not the grid: each cell asks the tone
field where it would be if the whole screen were turned, and one group
transform turns the drawing to match. Rotating the grid itself would rotate the
dither too, and Floyd's error diffusion is defined on rows and columns —
pushing error into a neighbour that is no longer to your right is a different
algorithm.

### Everything else

**One shape for everything you touch.** A stadium — radius half its own
height. With a hundred controls on a page and no borders, dividers or shadows
anywhere, the outline *is* the affordance, and one outline everywhere means a
control is recognisable before its label has been read.

**Nothing casts a shadow.** Depth comes from a filled ground against an empty
one, which survives being screenshotted, printed or projected.

**Colour is a label, not a mood.** Each signal colour belongs to a place, and
each is paired with the ink measured to survive on it — white on the bright
green is 2.3:1, fine in a mockup and unreadable on a laptop outdoors, so that
field takes black at 9:1.

**Name and value are set flush.** `Weight400`, not `Weight: 400`. Everything
the interface says about *itself* is set in the mono, so the sans is only ever
used for things you put there.

The masthead is one slim rank, because every row up here is a row taken off the
artwork and it does not scroll away. What has earned its place is what you
reach for between cards: the word, the face it is set in, and a link to what
you are looking at. The colours open from a swatch and everything about how the
letters are set and how they move is behind Settings; both open *over* the file
rather than pushing it down, because a bar that changes height moves the hinge
every card is rotating about.

```bash
npm install
npm run dev     # http://localhost:5176
```

## How the rendering works

The word is converted to real outline data with **opentype.js** and drawn as
`<path>` geometry — it is never set as live `<text>`. That one decision buys
three things:

- exported SVGs open correctly in Illustrator, Figma, Inkscape or a cutter with
  no font installed and nothing to embed;
- PNG export cannot race the webfont, because there is no webfont to load;
- patterns can be sampled against the actual silhouette.

Everything works in one coordinate space: the word is laid out at a nominal
200 units per em and framed by its own ink bounding box, so a grid spacing of
"15" means the same thing whether the word is `HI` or `SYNCHRONISED`.

`buildSVG()` is the single source of truth. The live preview injects its
output, `Download SVG` writes it to disk, and `Download PNG` rasterises it — so
a card's preview and its two exports cannot drift apart.

### One question, asked of everything

Words and images both reduce to a **tone field** — a grid of ink values in
0..1, answered with a box average via a summed-area table. A letterform answers
0 or 1; a photograph answers everything in between. Patterns never learn which
they are drawing, which is why every style works on both.

Averaging over the cell rather than sampling its centre matters twice: it keeps
a mosaic edge smooth, and on a detailed photo it stops fine texture aliasing
into noise.

### The other question

A threshold can only say whether there is ink at a point, which is enough to
fill a shape and not enough for anything that depends on *where in* the shape
you are. So there is a second field: signed distance to the nearest edge,
negative inside the ink and positive outside it, built with an exact
linear-time transform rather than a chamfer mask — a chamfer's error is
directional, and a contour drawn through it comes out visibly octagonal.

**Circle packing** reads that field as the largest circle that fits, so the
marks grow through the open parts of the letters and fall to a grain along
their outlines — large through a stem, a grain along its edge. That cannot be
done from the tone field alone: a threshold knows there is ink here, not how
much room there is.

### Both polar axes

**Concentric rings** is the polar version of hatching's *spacing*: circles
where hatching has parallels. **Rays** is the other axis — lines that all pass
through one point instead of never meeting. Spans are measured rather than
clipped, exactly as in `hatch()`, so spokes get the same real caps and the same
refusal to break over a detail too small to be worth it.

One thing is geometry rather than choice: spokes are 2πr/count apart, so near
the centre there is less room between them than the line is wide and they merge
into a blot. The width is capped at the room actually available, which fixes it
at any count and any thickness — and leaves `taper` free to be a look rather
than a workaround.

### Marks that know about each other

Most styles here draw marks that do not: a dot does not care what the next dot
did, and the picture is their sum. Two are built the other way round.

**Maze** is one connected structure — a spanning tree over the cells the word
covers, so there is exactly one route between any two points inside a letter.
Randomised depth-first search rather than a random-edge method, because it
commits to a direction until it runs out of room, and that is what makes the
result read as corridors instead of as texture. Each letter is its own
component; the search restarts from every cell it has not reached, so a counter
enclosed by its own stroke gets a maze rather than a blank.

**Beads** is the only one that draws the boundary rather than what it encloses.
Every other style asks "is there ink here" and puts something down where the
answer is yes; this one only cares where the answer *changes*. The outline is
traced once and then walked by arc length rather than by vertex — the tracer's
vertices are wherever the curve happened to bend, and spacing beads on those
crowds them at every corner and strands them along every straight.

**Slices** is the one style that cuts the source instead of laying marks on it,
and the only one that uses a clip on purpose. Nothing is being trimmed to
flatter the outline: the outline itself is what is being taken apart.

**Isometric** is the only style with a third dimension, and getting there took
rejecting the obvious construction. Projecting the *grid* isometrically — the
textbook version, where a cube's three faces are equal and (col − row) goes
across while (col + row) goes down — turns a word set horizontally into a
diagonal band across the corner of the frame. It is correct and it is
unreadable. So the front face stays square and on the page and only the depth
is pushed off at an angle, which is an oblique projection rather than a true
isometric and is what extruded lettering has always actually been.

Occlusion is free: the extrusion goes up and right, so the viewer stands to the
lower left and a cube hides whatever is above-right of it. Sorting on
(col − row) descending draws the far ones first. On a word every column is the
same height; on a photograph the height follows the darkness, so the same code
turns a picture into a relief map without being told which it is looking at.

### Something that grows

**Physarum** is the one style that is not drawn but simulated. Slime mould has
no brain and no plan and reliably solves a maze: each agent looks a little way
ahead to the left, straight on and to the right, turns toward whichever smells
strongest, moves, and leaves a trail. The trail spreads a little and fades a
little between steps. Out of that comes the branching, reinforcing,
self-pruning network the organism actually builds.

This is what the abandoned reaction-diffusion attempt was reaching for.
Turing patterns live in a narrow band of feed and kill rates and give a dead
field or a flooded one a step outside it, which is what that attempt produced
over and over. There is no such cliff here — any sane sensor angle and decay
give a network, and the settings change what kind, not whether.

How *little* food the word should be is the whole difficulty, and four
attempts got it wrong in both directions. Keeping the letters topped up so
they stay the strongest smell gives a solid word with a texture on it and no
network at all, because a uniform blanket has no gradient in it: inside a
filled letter every cell smells the same, so agents mill about and fill it
rather than finding paths through it. Painting the word back in underneath
afterwards is worse still. The network only exists when the colony's own trail
is what it follows, so the word does two small things — it decides where the
agents start, and it adds a light bias that keeps bringing them back. That
slider stops early on purpose.

The trail is a field like any other by the time it is drawn, so it goes
through the same marching squares as an image silhouette and comes out as real
outlines. Cells times steps is the entire cost: at a quarter of a million
cell-steps a run took five seconds, which is not a live preview of anything.
A separable box blur and a smaller grid bring it to about 400ms, and the run
is cached so only the threshold moves cheaply.

### Ending with the space

Two styles used to draw a rectangle whether there was anything to say in it or
not. Threads gave every thread a floor width, so each one ruled the frame edge
to edge and the word sat inside a drawn box; Neon ruled its scanlines across
the whole frame, so the sign sat inside a rectangle of stripes that had nothing
to do with it. The frame is not part of the artwork.

At a floor of zero a thread closes to nothing away from the ink and the piece
ends where the type does; `falloff` decides how it gets there, by widening the
box each sample averages over — a wider box bleeds the ink outward, so the
taper lengthens without anything having to know where the edges are. The runs
where a thread has width are emitted separately, so a page of frame-wide paths
carrying nothing never reaches an editor.

### Four ways round an outline

**Thorns**, **Ribbon** and **Beads** all walk the silhouette by arc length and
differ only in what they leave behind: a mark, a spine, or a strip of tape.
That walk is `outline.js`, and pulling it out of beads was worth doing for one
reason — spacing measured by arc length is spacing you can reason about,
whereas spacing measured in traced vertices bunches wherever the tracer
happened to put a point.

The lesson from that walk is to keep lengths and directions apart. Thorns
first took its root width and its lean from the raw span between a point's two
neighbours, which is a vector whose *length* is the local point spacing — so
every width was secretly a multiple of the sampling rate. Roots came out
hairline and tips flew tens of pixels sideways into slivers. Normalising the
tangent first, and multiplying by a real length, fixed both at once.

**Spikes** takes the other route: a level curve of the distance field is a
smooth offset of the letterform, so redrawing one as a zigzag turns it into a
saw, and nesting several gives rings of teeth inside rings of teeth. The field
is negative inside the letter, so the levels have to *descend* to move inward —
ascending grows the rings outward instead, and four of them at this spacing is
a halo wider than the strokes, which fills the counters and merges the words
into a ball.

**Blocks** rebuilds the word out of a builder's yard: every cell is sampled in
quarters and filled with whichever primitive — bar, wedge, quarter round, half
disc, square — best matches the ink under it. So the diagonals and the curves
land where they belong, and the edge is assembled rather than stair-stepped.

What each piece covers is *measured* off its own drawing, by filling it into a
32x32 canvas once and counting alpha, rather than written down beside it. The
first version did write it down, and three of fourteen entries disagreed with
their own geometry — a quarter round with the bite in the wrong corner matches
cells it does not fit, and two of the wedges were the same triangle twice.
Deriving it also means adding a piece needs nothing else.

### Whole marks, whole lines

The obvious way to fill a shape is an SVG `<pattern>` painted through a
`clipPath`. It gives a perfect outline and ruins everything else — it slices
marks in half where the outline crosses them, cuts a round cap back to a square
edge, and will snap a rule in two to preserve a sliver of counter.

So nothing is clipped. `motifGrid()` stamps a complete mark in every lattice
cell carrying enough ink, and `hatch()` marches each rule and measures the
spans where it genuinely crosses the shape. The pattern stays exact and the
silhouette is what gives.

That is what the **Continuity** slider is for: gaps below it are bridged, so a
rule stays whole instead of breaking over a detail too small to be worth it.
**Noise** then nudges the span ends off the outline so the edge stops reading
as machine-cut.

### Tone drives the marks

`motifGrid` hands each motif an `ink` value — 1 for a word or a traced
silhouette, the local darkness for a tonal image. Sizing a mark by `sqrt(ink)`
makes its *area* proportional to darkness, which is what a real print screen
does and why photographs come out reading correctly. The **Screen angle**
slider rotates the lattice, the way cyan, magenta and black sit 15°, 75° and
45° apart to avoid moiré.

### Images

**Silhouette** thresholds the bitmap and traces it with marching squares plus
Douglas–Peucker into real outlines, so exports stay pure vector — no raster
inside the SVG. For logos, icons and cut-outs.

**Tonal** keeps the greys and lets them drive the marks: dots grow, rules
thicken, blocks dither. For photographs, where a threshold would flatten
everything to mud.

**Cut out** runs before any of the three and hands them the subject alone. All
three start from "how light is this pixel", which quietly assumes the subject
is the dark part and the ground is the white part — put the same object on a
grey card and the whole picture reads as ink, put it on black and it inverts.

So the ground is found as a *region* rather than as a brightness: a flood fill
starts at the frame's own border and spreads through whatever is continuous
with it. That buys three things a threshold cannot. The ground can be any
colour. A gradient is followed, because the reference is a plane fitted to the
border rather than one colour — a ground shading white to charcoal is described
exactly. And a part of the subject that happens to match the ground survives,
because it is not *connected* to the border: a white shirt in a portrait
against a white wall is the case a threshold always ruins.

Two things it took two attempts to get right. The fill reasons about a blurred
copy, so film grain and a textured wall do not stop it, while the original
pixels are what finally get written. And the reference plane is *fixed* — an
earlier version let it drift along with the fill, which removes the only
barrier there is: the fill finds the one point where a disc's boundary runs
tangent to its direction of travel, the blur has flattened the step there, and
it floods the entire interior through it.

What it cannot do is find a subject in a cluttered photograph. Nothing here
knows what a subject *is*, only what the border is connected to; a street scene
has no ground to flood. That needs a learned segmentation model, which is a
different kind of dependency — a few megabytes of weights to download.

**Edges** drops brightness entirely and keeps only where the picture changes —
Sobel gradient magnitude over a blurred copy. Both modes above start from "how
light is this pixel", which loses every boundary between two things that happen
to be the same shade; this is what gets that detail back, as line work.

## Adding a pattern

Append one object to `PATTERNS` in [`src/lib/patterns/index.js`](src/lib/patterns/index.js).
Its card, sliders, live preview and both exports appear on their own — no other
file changes.

```js
{
  id: 'rings',
  label: 'Concentric rings',
  blurb: 'Shown under the card title.',
  params: [
    { key: 'gap', label: 'Ring gap', min: 2, max: 40, step: 1, def: 12 },
  ],
  motion: { key: 'gap', from: 2, to: 40, loop: 'pingpong' },
  render: ({ p, geo, fg, ids, build }) => ({
    body: `<g stroke="${fg}" fill="none">…</g>`,
    // defs: optional <defs> markup; use `ids` for document-unique ids
    // clip: false to opt out of the silhouette clip-path
  }),
}
```

Param fields: `key, label, min, max, step, def`, plus optional `unit` (suffix),
`ratio: true` (value is a fraction of the cell, displayed as a %),
`zeroLabel` (what to show at 0, e.g. `solid`) and `kind: 'select'` with
`options` for discrete choices. Add `motion: { key, from, to, loop }` to say
which slider animates.

Helpers in [`patterns/helpers.js`](src/lib/patterns/helpers.js): `motifGrid()`
for whole marks on a rotatable lattice, `hatch()` for parallel rules measured
as spans, `rings()` for the same in polar, `ditherCells()` for quantised
blocks, `hashRandom()` for reproducible scatter, `num()` to keep coordinates
tidy. Styles with their own geometry get their own module beside them —
`distance.js`, `voronoi.js`, `packing.js`, `maze.js`, `isometric.js`,
`physarum.js`, `beads.js`, `blocks.js`, `weave.js`,
`captcha.js`, `sampler.js`, `blots.js`, `threads.js`, `blur.js` — and `outline.js`, which several of
them share. Every
generator takes the same `fx` object, which is how a new pattern inherits all
fourteen motion modes without writing any animation code.

## Layout

```
src/
  lib/
    fonts.js          font catalog + cached, deduped loading
    tone.js           shape or bitmap -> ink field, with a summed-area table
    sources/
      text.js         word   -> outlines + tone field
      image.js        bitmap -> outlines or greys + tone field
      trace.js        marching squares + Douglas-Peucker
      cutout.js       the ground flood-filled away from the border
      segment.js      the subject lifted out of a cluttered photograph
    patterns/
      distance.js     signed distance to the outline (exact, linear-time)
      outline.js      the shared arc-length walk, with outward normals
      maze.js         a spanning tree over the cells the word covers
      isometric.js    the word extruded, with the depth pushed off at an angle
      physarum.js     an agent colony grown on the word, traced to outlines
      threads.js      ribbons whose width follows the ink
      beads.js        marks threaded along the outline by arc length
      blocks.js       a builder's yard, each cell matched to a primitive
      weave.js        straps over and under, an under drawn as an absence
      captcha.js      warp, bleed and bite, all done to the field
      sampler.js      a fill per letter, letters found by column profile
      blots.js        discs walked uphill onto the stroke's spine
      packing.js      circles sized by the room they have
      voronoi.js      cells claimed by a scatter of sites
      blur.js         a softened copy, for the ditherer to quantise
      index.js        the registry; helpers.js the shared generators
    params.js         shared sliders, defaults, randomise, motion
    svgBuilder.js     assembles the SVG (preview and every export)
    download.js       SVG + PNG export, DPR-aware scaling
    motion.js         the fourteen motion modes and their effect on the marks
    animate.js        MP4 and GIF recording from rasterised frames
    persist.js        session save/restore, layered over current defaults
    preset.js         the state as a link: the difference from the defaults
    useFont.js, useImage.js
  components/         TopBar, Rolodex, RolodexTabs, PatternCard, Slider, Ideas
    ui/               Button, Segmented, Row, Switch — the shared vocabulary
public/
  fonts/              the vendored static TTFs, checked in
```

## Notes

**Fonts.** The typefaces live in `public/fonts/` and are checked in — 21
families across six categories, subset to Latin, about 2.7 MB. They are static
TTFs rather than WOFF2 because opentype.js parses TTF and OTF and cannot read
WOFF2. Only the selected family and weight is ever fetched by the browser, and
a reader can drop in a TTF or OTF of their own without any of this.

Adding a family means putting its TTFs in `public/fonts/` and listing it in
`src/lib/fonts.js`. There is no fetch step: the files are part of the
repository, so a clone runs without one.

**Clip formats.** MP4 and GIF. WebM was dropped on purpose rather than for
want of support — it is the one format most places will not take, so offering
it mostly bought people a file they had to convert. A saved session still
naming it falls back rather than leaving the control pointing at nothing.

**Animation.** Fourteen modes, and four timing curves. `Loop` cycles each
pattern's marked slider — the only one a pattern has to opt into. The other
thirteen act on the marks themselves, so they work everywhere for free: `Build`
draws in mark by mark in shuffled order, `Wipe` sweeps a front across the frame
(cutting rules and contours at the edge rather than dropping them whole), and
`Ripple` sends a travelling sine through the mark weights.

The displacing modes split into random and coherent. `Scatter` and `Jitter`
take their direction from each mark's own hash, so neighbours move
independently and the field reads as noise; `Wave` and `Glitch` take theirs
from where the mark is in the frame, so neighbours move together and the field
reads as one surface being disturbed. `Wave` is the counterpart to `Ripple` —
same travelling sine, moving the marks instead of weighting them.

`Twinkle` cost no generator any code. `Build` already shuffles marks with a
fixed seed so the frame it settles on matches the still one; twinkling is the
same share showing with a different selection each tick, so the seed moved onto
the effect object and `Twinkle` varies that instead of the share.

All record through a canvas capture stream — `captureStream(0)` means no frame
is emitted until we ask, so the recording is deterministic rather than whatever
the display happened to be doing.

**Font weight** snaps to the weights a family actually ships — static fonts have
no in-between. Single-weight families (Anton, Pacifico, Great Vibes …) disable
the slider rather than pretend.

**Responsiveness.** Sliders read state directly so the thumb tracks the pointer,
while the artwork rebuilds from a `useDeferredValue` copy — a fast drag over an
expensive pattern coalesces instead of blocking input. Cards are `memo`ised with
stable callbacks, so moving one slider re-renders one card. A cell budget
coarsens the grid rather than stalling when a long word meets the tightest
spacing; ordinary words never reach it.

**Shuffle** rolls a style's sliders, but not across their whole range. Both
ends of a slider are where a pattern stops describing the word — spacing so
coarse the letters lose their edges, marks so fine the page reads blank — and
sampling uniformly returns those as often as anything else. Each roll is a
triangular draw centred on the default, reaching a little under half the range,
so a batch of five is five usable variations rather than three and two misses.
Measured over 2,800 rolls, the sparsest result any style produced was 26 marks;
none came back empty. Seeds are exempt: which arrangement you get has no
bearing on whether you can read it.

**PNG export** targets 2000 px wide multiplied by `devicePixelRatio`, clamped so
a 3× display and a long word cannot ask for an unallocatable canvas. The button
tooltip shows the exact pixel dimensions.

## The idea board

The footer opens a board where anyone can ask for something without an account
and vote for what someone else asked for. Most wanted at the top, ties broken
by the newest.

It needs somewhere outside the browser to keep the list, and this app is a
static bundle with no server — so there are two modes, and the difference is
not hidden. **Without an endpoint configured the board is a private notebook
and says so on its face.** A local list that looked shared would be worse than
no board at all: someone would post into a void and believe it had been sent.

To make it shared, set two variables in a `.env` file:

```
VITE_IDEAS_URL=https://<project>.supabase.co/rest/v1
VITE_IDEAS_KEY=<anon key>
```

Any backend answering three plain REST calls will do — see the contract at the
top of [`src/lib/ideas.js`](src/lib/ideas.js). Supabase is the one it was
written against because it needs no server code, only a table and three
policies:

```sql
create table ideas (
  id         bigint generated always as identity primary key,
  text       text not null check (char_length(text) between 1 and 280),
  votes      integer not null default 1,
  created_at timestamptz not null default now()
);

-- One statement, so two votes arriving together cannot lose one of each other.
create function bump_idea(idea bigint) returns void
  language sql security definer as
  $$ update ideas set votes = votes + 1 where id = idea $$;

alter table ideas enable row level security;
create policy "anyone can read"  on ideas for select using (true);
create policy "anyone can post"  on ideas for insert with check (true);
grant execute on function bump_idea to anon;
```

### Moderating it without a login

Open the board once with `#admin=<secret>` on the end of the URL. The key is
kept in that browser and taken straight back out of the address bar, so it is
not left in history or in a link shared by accident. A delete button then
appears beside every idea.

That button is not the protection. This bundle is public and anyone can read
it, so the delete endpoint has to assume the caller is hostile — the check
belongs in the database, and hiding the button is only tidiness:

```sql
create table admin (secret text not null);
insert into admin values ('pick something long and random');
-- No policies, so `anon` cannot read this table at all.
alter table admin enable row level security;

-- security definer runs as the owner, which is how the function can read a
-- table the caller cannot.
create function delete_idea(idea bigint, secret text) returns void
  language plpgsql security definer as $$
  begin
    if not exists (select 1 from admin a where a.secret = delete_idea.secret) then
      raise exception 'not allowed';
    end if;
    delete from ideas where id = idea;
  end $$;

grant execute on function delete_idea to anon;
```

Calling that endpoint without the secret does nothing, whatever the page is
showing. What it does not do is rate-limit: a long random secret is what stands
between the board and someone patient. If that stops being enough, the answer
is real authentication, not a longer string.

**One vote per idea per browser**, remembered in localStorage. That is as far
as anonymous voting can go without accounts, and it is weak: clearing storage
or opening a private window gets another vote. If the board ever attracts
enough traffic for that to matter, it needs a real identity check, not a
better client.
