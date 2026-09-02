/**
 * Finding the subject when there is no ground to flood.
 *
 * cutout.js identifies the background as a *region*: it floods from the frame's
 * border and keeps whatever that flood never reached. That handles a subject on
 * a card, a wall, a sweep, a gradient — anything with a continuous ground — and
 * it is instant, offline and exact. What it cannot do is a street, a desk, a
 * crowd. Nothing in it knows what a subject *is*; it only knows what the border
 * is connected to, and a cluttered picture has nothing to flood.
 *
 * Knowing what a subject is takes a model that has been shown a great many of
 * them. That is a different kind of dependency and the difference is worth
 * stating plainly rather than burying:
 *
 *   - the weights are about forty megabytes, fetched from a CDN the first time
 *     and cached by the browser after that;
 *   - so the first cut needs a network, and the app stops being a thing that
 *     works entirely offline the moment this path is taken;
 *   - inference is seconds, not milliseconds.
 *
 * Which is why it is opt-in and never the default. The flood fill stays the
 * first thing tried, because when it works it is better on every axis.
 */

let loader = null;

/** Loaded once and kept, so a second image does not pay the download again. */
function library() {
  loader ??= import('@imgly/background-removal');
  return loader;
}

let cached = null;

/**
 * @param onProgress (fraction 0..1) — the download dominates the wait, so
 *                   something has to say so or the button looks broken
 * @returns a canvas with everything but the subject made transparent, which is
 *          the same shape cutout.js returns and drops into the same pipeline
 */
export async function segmentSubject(bitmap, { onProgress } = {}) {
  const key = `${bitmap.width}x${bitmap.height}`;
  if (cached && cached.bitmap === bitmap && cached.key === key) return cached.canvas;

  const source = document.createElement('canvas');
  source.width = bitmap.width;
  source.height = bitmap.height;
  source.getContext('2d').drawImage(bitmap, 0, 0);

  const blob = await new Promise((resolve, reject) => {
    source.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not read that image'))), 'image/png');
  });

  const { removeBackground } = await library();
  const cut = await removeBackground(blob, {
    // Reported in two phases — fetching, then computing — and both are worth
    // showing, because the first one is where nearly all the time goes.
    progress: (key_, current, total) => {
      if (total) onProgress?.(Math.min(1, current / total));
    },
  });

  const image = await createImageBitmap(cut);
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  canvas.getContext('2d').drawImage(image, 0, 0);
  image.close?.();

  cached = { bitmap, key, canvas };
  return canvas;
}
