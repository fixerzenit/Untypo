import { encodeGIF } from './gif.js';

/**
 * Clip export.
 *
 * Frames are rasterised from the same SVG the preview uses, one parameter
 * value at a time. Video formats then go through MediaRecorder on a canvas
 * capture stream; `captureStream(0)` means no frame is emitted until we ask,
 * so the encoder gets exactly the frames we drew rather than whatever the
 * display happened to be doing.
 *
 * GIF skips MediaRecorder entirely and encodes the pixels directly, because no
 * browser will produce one.
 */

const VIDEO_MIMES = {
  webm: ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'],
  mp4: ['video/mp4;codecs=avc1.640028', 'video/mp4;codecs=avc1', 'video/mp4'],
};

/**
 * GIF holds every frame in memory as RGBA before encoding, so it gets its own
 * ceiling — 30 frames at 720px is about 60MB, which is the most worth asking a
 * tab to hold for a preview clip.
 */
const GIF_LIMITS = { maxWidth: 720, frames: 30, fps: 15 };

/**
 * Ceiling on a video frame.
 *
 * MediaRecorder timestamps against the wall clock, so a frame that takes
 * longer to draw than its slot does not drop — it stretches the clip. At full
 * still-export resolution a dense pattern took 137ms a frame and turned a
 * three-second loop into ten. Capping the width brings drawing back inside the
 * budget, and 1280px is more than a share clip needs.
 */
const VIDEO_MAX_WIDTH = 1280;

function pickMime(format) {
  return VIDEO_MIMES[format]?.find((m) => MediaRecorder.isTypeSupported(m));
}

export function availableFormats() {
  const formats = [];
  const canRecord =
    typeof MediaRecorder !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.captureStream === 'function';

  // WebM is dropped on purpose rather than for want of support. It is the one
  // format here that most places will not take — no Keynote, no Premiere
  // without a plugin, no iPhone — so offering it mostly bought people a file
  // they had to convert. MP4 goes everywhere and GIF goes everywhere else.
  if (canRecord && pickMime('mp4')) formats.push({ value: 'mp4', label: 'MP4' });
  formats.push({ value: 'gif', label: 'GIF' }); // always available; we encode it
  return formats;
}

export function supportsVideoExport() {
  return availableFormats().length > 0;
}

async function drawFrame(svg, ctx, width, height, background) {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('Could not rasterise a frame'));
      image.src = url;
    });
    ctx.clearRect(0, 0, width, height);
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, height);
    }
    ctx.drawImage(image, 0, 0, width, height);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * @param frameSVG   (t) => SVG string, t running 0..1 through one loop
 * @param format     'webm' | 'mp4' | 'gif'
 * @returns a Blob, and the extension it should be saved with
 */
export async function recordLoop({
  frameSVG,
  width,
  height,
  fps = 25,
  seconds = 3,
  background,
  fg,
  format = 'webm',
  onProgress,
}) {
  if (format === 'gif') {
    return recordGIF({ frameSVG, width, height, background, fg, onProgress });
  }

  const mime = pickMime(format);
  if (!mime) throw new Error(`This browser cannot record ${format.toUpperCase()}`);

  const fit = Math.min(1, VIDEO_MAX_WIDTH / width);
  const w = Math.max(2, Math.round(width * fit));
  const h = Math.max(2, Math.round(height * fit));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  const stream = canvas.captureStream(0);
  const track = stream.getVideoTracks()[0];
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 16_000_000 });

  const chunks = [];
  recorder.ondataavailable = (event) => event.data.size && chunks.push(event.data);
  const finished = new Promise((resolve) => {
    recorder.onstop = resolve;
  });

  recorder.start();
  const total = Math.max(2, Math.round(fps * seconds));
  const frameMs = 1000 / fps;

  try {
    for (let i = 0; i < total; i++) {
      // MediaRecorder timestamps frames against the wall clock, so the cadence
      // here *is* the playback speed. Drawing has to come out of the frame's
      // budget, not be added on top of it, or the clip runs slow.
      const started = performance.now();
      await drawFrame(frameSVG(i / total), ctx, w, h, background);
      track.requestFrame();
      onProgress?.((i + 1) / total);
      const remaining = frameMs - (performance.now() - started);
      if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
    }
  } finally {
    recorder.stop();
    track.stop();
  }

  await finished;
  return { blob: new Blob(chunks, { type: mime }), extension: format };
}

async function recordGIF({ frameSVG, width, height, background, fg, onProgress }) {
  // No encoder to feed in real time, so the clip is sized for memory instead.
  const scale = Math.min(1, GIF_LIMITS.maxWidth / width);
  const w = Math.max(2, Math.round(width * scale));
  const h = Math.max(2, Math.round(height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  const frames = [];
  for (let i = 0; i < GIF_LIMITS.frames; i++) {
    await drawFrame(frameSVG(i / GIF_LIMITS.frames), ctx, w, h, background);
    frames.push(ctx.getImageData(0, 0, w, h).data);
    onProgress?.(((i + 1) / GIF_LIMITS.frames) * 0.85);
  }

  const blob = encodeGIF({
    frames,
    width: w,
    height: h,
    delayMs: 1000 / GIF_LIMITS.fps,
    // The palette is a ramp between the two colours the artwork is actually
    // made of, which is what keeps a 64-entry table enough.
    fg,
    bg: background ?? '#ffffff',
    transparent: !background,
  });
  onProgress?.(1);
  return { blob, extension: 'gif' };
}
