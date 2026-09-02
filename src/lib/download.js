/** Export helpers. Both formats start from the exact same SVG string. */

/** Logical width we aim for before the display's pixel ratio is applied. */
const PNG_TARGET_WIDTH = 2000;
/** Canvas guard rail — beyond this, browsers start refusing to allocate. */
const MAX_PNG_EDGE = 8192;

export function slugify(text, fallback = 'untypo') {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug || fallback;
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking synchronously can cancel the download in Safari.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function downloadBlob(blob, filename) {
  saveBlob(blob, filename);
}

export function downloadSVG(svg, filename) {
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n${svg}\n`;
  saveBlob(new Blob([doc], { type: 'image/svg+xml;charset=utf-8' }), filename);
}

/**
 * Scale factor for a PNG export, accounting for the device pixel ratio so the
 * file is as crisp as the screen it was designed on. Clamped so a 3x phone
 * and a very wide word can't ask for a 20k-pixel canvas.
 */
export function pngScale(box) {
  const dpr = window.devicePixelRatio || 1;
  const base = PNG_TARGET_WIDTH / box.width;
  const capped = Math.min(
    base * dpr,
    MAX_PNG_EDGE / box.width,
    MAX_PNG_EDGE / box.height,
  );
  return Math.max(1, capped);
}

export function pngDimensions(box) {
  const scale = pngScale(box);
  return { width: Math.round(box.width * scale), height: Math.round(box.height * scale) };
}

/**
 * Rasterises the SVG through an <img> onto an offscreen canvas.
 *
 * This only works because the SVG is fully self-contained — the word is real
 * <path> data, not <text> in a webfont, so there is no external reference to
 * load and no chance of the font arriving after the snapshot is taken.
 */
export async function downloadPNG(svg, box, filename) {
  const { width, height } = pngDimensions(box);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));

  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('Could not rasterise the SVG'));
      image.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0, width, height);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Canvas produced no PNG data');
    saveBlob(blob, filename);
  } finally {
    URL.revokeObjectURL(url);
  }
}
