import { useEffect, useState } from 'react';
import { loadFont, snapWeight } from './fonts.js';

/**
 * Loads and parses a font file. Requests are deduped and cached in fonts.js,
 * so all eight cards asking for the same family/weight costs one fetch.
 */
export function useFont(familyId, weight) {
  const snapped = snapWeight(familyId, weight);
  const key = `${familyId}-${snapped}`;
  const [state, setState] = useState({ key: null, font: null, error: null });

  useEffect(() => {
    let active = true;
    loadFont(familyId, snapped)
      .then((font) => active && setState({ key, font, error: null }))
      .catch((error) => active && setState({ key, font: null, error: error.message }));
    return () => {
      active = false;
    };
  }, [familyId, snapped, key]);

  // Nothing at all while a different family is still loading, rather than the
  // one before it.
  //
  // The caller keys its geometry cache by family id. Handing it the previous
  // font under the new id files a drawing of the wrong typeface under the new
  // name — and when the right font finally arrives, the rebuild finds that
  // entry and returns it. The picture then stays on the old face until
  // something else moves the key, which is why changing the font used to do
  // nothing until you also changed the text.
  return state.key === key ? { font: state.font, error: state.error } : { font: null, error: null };
}
