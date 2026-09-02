import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildImageSource, decodeImageFile } from './sources/image.js';
import { segmentSubject } from './sources/segment.js';

/**
 * Holds the decoded bitmap and rebuilds the source whenever the adjustments
 * change. One source is shared by every card, so the threshold, the trace and
 * the tone field are each computed once per change rather than a dozen times.
 */
export function useImageSource(settings) {
  const [bitmap, setBitmap] = useState(null);
  const [name, setName] = useState('');
  const [error, setError] = useState(null);
  // The model's output, kept beside the original so switching back to the
  // flood fill does not throw the download away.
  const [cut, setCut] = useState(null);
  const [cutting, setCutting] = useState(null);

  const load = useCallback(async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('That file is not an image');
      return;
    }
    try {
      const decoded = await decodeImageFile(file);
      setBitmap(decoded);
      setName(file.name.replace(/\.[^.]+$/, ''));
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const clear = useCallback(() => {
    setBitmap(null);
    setName('');
    setError(null);
    setCut(null);
  }, []);

  useEffect(() => () => bitmap?.close?.(), [bitmap]);

  const {
    mode, threshold, smoothing, invert, brightness, contrast, edgeSmoothing, edgeGain,
    cutout, cutTolerance, cutFeather,
  } = settings;

  // Segmentation is the one step that cannot happen inside the synchronous
  // build, so it happens here and hands the build a bitmap that is already cut.
  useEffect(() => {
    if (!bitmap || cutout !== 'subject') return undefined;
    let live = true;
    setCutting(0);
    setError(null);
    segmentSubject(bitmap, { onProgress: (p) => live && setCutting(p) })
      .then((canvas) => live && setCut({ from: bitmap, canvas }))
      .catch((err) => live && setError(`Could not find a subject: ${err.message}`))
      .finally(() => live && setCutting(null));
    return () => {
      live = false;
    };
  }, [bitmap, cutout]);

  const effective = cutout === 'subject' && cut?.from === bitmap ? cut.canvas : bitmap;
  const source = useMemo(
    () =>
      effective
        ? buildImageSource({
            bitmap: effective, mode, threshold, smoothing, invert, brightness, contrast,
            edgeSmoothing, edgeGain, cutout, cutTolerance, cutFeather,
          })
        : null,
    [
      effective, mode, threshold, smoothing, invert, brightness, contrast, edgeSmoothing, edgeGain,
      cutout, cutTolerance, cutFeather,
    ],
  );

  return { source, bitmap, name, error, load, clear, cutting };
}
