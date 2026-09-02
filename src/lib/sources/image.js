import { UNIT_HEIGHT } from '../constants.js';
import { edgeField, imageField } from '../tone.js';
import { traceField } from './trace.js';
import { cutSubject } from './cutout.js';

/**
 * A bitmap as a pattern source, in one of two modes.
 *
 * SILHOUETTE thresholds the image and traces the result into real outlines, so
 * the patterns clip and mosaic against a shape exactly as they do against a
 * letterform. Made for logos, icons and cut-outs.
 *
 * TONAL keeps the full range of greys and lets it drive the marks — dots grow,
 * rules thicken, blocks dither. This is a print screen, and it is what makes
 * photographs work; a threshold would flatten them to mud.
 *
 * EDGES throws away brightness altogether and keeps only where the picture
 * changes. It is the answer to the fact that both modes above start from "how
 * light is this pixel" — which loses every boundary between two things that
 * happen to be the same shade. Detail a threshold cannot see at any setting
 * comes back as line work.
 *
 * Any of the three can be given the subject alone rather than the whole
 * picture. That step runs first and hands the rest of the pipeline a bitmap
 * with the ground made transparent — imageField already multiplies by alpha,
 * so nothing after this point has to know it happened.
 *
 * Both normalise to UNIT_HEIGHT so slider values carry over from the text side.
 */
export function buildImageSource({
  bitmap,
  mode = 'silhouette',
  threshold = 0.5,
  smoothing = 0.4,
  invert = false,
  brightness = 0,
  contrast = 1,
  edgeSmoothing = 1.2,
  edgeGain = 1.6,
  cutout = 'edges',
  cutTolerance = 0.35,
  cutFeather = 1,
}) {
  if (!bitmap) return null;

  // 'subject' has already been cut, by a model, before this was called — it is
  // async and this is not. 'edges' is the flood fill, which is synchronous and
  // cheap enough to run on every settings change. A session saved before this
  // was a choice stored a boolean, so those still mean what they meant.
  const wantsFlood = cutout === 'edges' || cutout === true;
  const subject = wantsFlood
    ? cutSubject(bitmap, { tolerance: cutTolerance, feather: cutFeather })
    : bitmap;
  const aspect = bitmap.width / bitmap.height;
  const box = {
    x: 0,
    y: 0,
    width: Math.round(UNIT_HEIGHT * aspect * 100) / 100,
    height: UNIT_HEIGHT,
  };

  const base = imageField(subject, box, { invert, brightness, contrast });
  const edges = mode === 'edges';
  const tone = edges ? edgeField(base, { smoothing: edgeSmoothing, gain: edgeGain }) : base;
  // Edges behave like a tonal source: the value is continuous and weights each
  // mark, it just measures change rather than darkness.
  const tonal = mode === 'tonal' || edges;

  // Tonal work has no silhouette to speak of, so the frame is the shape: the
  // clip becomes a no-op and the greys do the drawing.
  const d = tonal
    ? `M0 0H${box.width}V${box.height}H0Z`
    : traceField(tone, threshold, smoothing);

  if (!d) return null;

  return {
    kind: 'image',
    mode,
    d,
    box,
    viewBox: `0 0 ${box.width} ${box.height}`,
    tone,
    // Tonal keeps a low floor so highlights still register as small marks;
    // edges lift it a little to drop the faint gradient that survives a blur;
    // silhouette cuts at the threshold the outline was traced from.
    floor: edges ? 0.09 : tonal ? 0.04 : threshold,
    tonal,
  };
}

/** Decodes a File into something canvas can draw. */
export async function decodeImageFile(file) {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file);
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('Could not read that image'));
      image.src = url;
    });
    return image;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}
