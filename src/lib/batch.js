import { buildSVG } from './svgBuilder.js';
import { randomizeParams } from './params.js';
import { createZip } from './zip.js';
import { STILL } from './motion.js';

/** Wide enough to use, small enough that two hundred of them finish. */
const WIDTH = 1400;

async function renderPNG(svg, width, height) {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('Could not rasterise a variation'));
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(image, 0, 0, width, height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Rolls the dice `perPattern` times on every style and returns the lot as one
 * archive.
 *
 * Each variation is built through the same `buildSVG` the cards use, so what
 * lands in the zip is the same artwork the app would have shown had you
 * pressed Shuffle yourself. Yielding to the event loop between renders keeps
 * the progress readout moving rather than freezing the tab for a minute.
 */
export async function batchExport({
  patterns,
  params,
  geoFor,
  fg,
  bg,
  transparent,
  font,
  perPattern = 10,
  onProgress,
}) {
  const files = [];
  const total = patterns.length * perPattern;
  let done = 0;

  for (const pattern of patterns) {
    const geo = geoFor(pattern);
    if (!geo) continue;

    const width = Math.round(WIDTH);
    const height = Math.max(1, Math.round((geo.box.height / geo.box.width) * WIDTH));

    for (let take = 0; take < perPattern; take++) {
      // The first take is the pattern as it stands on the card, so the set
      // always contains the settings you actually chose.
      const values =
        take === 0 ? params[pattern.id] : randomizeParams(pattern, params[pattern.id]);

      const svg = buildSVG({
        geo,
        pattern,
        params: values,
        fg,
        bg,
        transparent,
        uid: `batch-${pattern.id}-${take}`,
        font,
        fx: STILL,
        sized: true,
      });

      files.push({
        name: `${String(take + 1).padStart(2, '0')}-${pattern.id}.png`,
        data: await renderPNG(svg, width, height),
      });

      done += 1;
      onProgress?.(done / total);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  return { blob: createZip(files), count: files.length };
}
