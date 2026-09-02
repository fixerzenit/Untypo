import { defaultParams } from './params.js';
import { PATTERNS } from './patterns/index.js';

const KEY = 'untypo.session.v1';
/**
 * What the store was called before the app was renamed.
 *
 * A key is not a name, it is where somebody's work is. Renaming it without
 * looking at the old one would have handed every existing user a factory-fresh
 * app — their word, their colours and every slider they had set, gone, with
 * nothing on screen to say why. It is read once, written forward under the new
 * name, and then never touched again.
 */
const WAS = 'halftype.session.v1';

/**
 * Session persistence.
 *
 * Everything except the bitmap, which cannot be serialised cheaply — reopening
 * with an image source simply asks for the file again. Saved values are always
 * layered over the current defaults rather than trusted wholesale, so adding
 * or removing a pattern never leaves someone with a broken stored session.
 */
export function loadSession() {
  try {
    let raw = localStorage.getItem(KEY);
    if (!raw) {
      raw = localStorage.getItem(WAS);
      // Carried over rather than copied: leaving the old key behind would have
      // it win again the first time the new one failed to write.
      if (raw) {
        localStorage.setItem(KEY, raw);
        localStorage.removeItem(WAS);
      }
    }
    if (!raw) return null;
    const saved = JSON.parse(raw);
    return { ...saved, params: mergeParams(saved.params) };
  } catch {
    return null;
  }
}

export function saveSession(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Private browsing, or a full quota. Losing the session is not worth
    // interrupting the work over.
  }
}

/**
 * Is this a value the control could actually be set to today?
 *
 * A stored number outside a slider's range is not a preference, it is a value
 * from a control that no longer exists in that shape — and the same goes for a
 * select whose stored option has been taken away.
 */
function legal(param, value) {
  if (param.kind === 'select') return param.options.some((o) => o.value === value);
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;
  if (param.min !== undefined && value < param.min) return false;
  if (param.max !== undefined && value > param.max) return false;
  return true;
}

/**
 * Saved values over current defaults — but only the ones that still mean
 * something.
 *
 * This used to spread the stored object wholesale, which is fine while controls
 * only ever get added and quietly wrong the moment one is renamed or rescaled.
 * Both happened at once: Physarum's "Pull of the word" was rescaled from a
 * range of 0 to 1.5 down to 0.004 to 0.2, because the colony only forms a
 * network in that band. A session stored before that carried 0.25 — five times
 * the new maximum, outside anything the slider can now reach — and layering it
 * over the defaults handed a returning user the old solid-letterform look and
 * no way to see that anything had changed.
 *
 * So each stored value is now checked against the control it belongs to, and a
 * value the control could not produce is dropped in favour of the default.
 * Keys for controls that no longer exist go the same way, because only the
 * current parameter list is walked.
 */
function mergeParams(saved) {
  const defaults = defaultParams();
  if (!saved || typeof saved !== 'object') return defaults;

  const merged = {};
  for (const pattern of PATTERNS) {
    const values = { ...defaults[pattern.id] };
    const stored = saved[pattern.id];
    if (stored && typeof stored === 'object') {
      for (const param of pattern.params) {
        const value = stored[param.key];
        if (value !== undefined && legal(param, value)) values[param.key] = value;
      }
    }
    merged[pattern.id] = values;
  }
  return merged;
}
