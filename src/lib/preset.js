/**
 * The whole state of a drawing, small enough to put in a link.
 *
 * Twenty-two styles with a handful of sliders each is a few thousand
 * characters of JSON, which is more than a URL wants to carry. Compressing it
 * would work and would also make the link opaque to the version that has to
 * read it back — a slider renamed or removed becomes a decode failure rather
 * than a value nobody claims.
 *
 * So what travels is the *difference from the defaults*. Almost nobody has
 * touched more than a dozen controls, so the payload is normally a couple of
 * hundred characters; and because everything absent falls back to whatever the
 * current defaults are, a link made before a style existed still opens, and a
 * link naming a style that has since gone is simply ignored. That is the same
 * layering the saved session already relies on.
 *
 * The image is not in here. A bitmap cannot go in a URL, so a link made from
 * an image opens with the settings and asks for the file again.
 */

import { defaultParams } from './params.js';

/** Only what differs, and only for keys the defaults still recognise. */
function diff(current, defaults) {
  const out = {};
  for (const [key, value] of Object.entries(current)) {
    if (!(key in defaults)) continue;
    if (JSON.stringify(value) !== JSON.stringify(defaults[key])) out[key] = value;
  }
  return out;
}

function toBase64Url(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text) {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function decodePreset(fragment) {
  if (!fragment) return null;
  try {
    const payload = JSON.parse(fromBase64Url(fragment.replace(/^#/, '')));
    if (!payload || typeof payload !== 'object') return null;
    const { p, ...rest } = payload;
    if (!p) return rest;

    // Layered over the current defaults, so a preset that predates a slider
    // gets that slider's default rather than undefined.
    const base = defaultParams();
    const params = {};
    for (const [id, values] of Object.entries(base)) {
      params[id] = p[id] ? { ...values, ...p[id] } : values;
    }
    return { ...rest, params };
  } catch {
    return null; // someone edited the URL, or it was never a preset
  }
}
