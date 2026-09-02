/**
 * The idea board's storage.
 *
 * A board where everyone sees what everyone else asked for needs somewhere
 * outside the browser to keep it. This app is a static bundle with no server,
 * so there are two modes and the difference between them is not hidden: with
 * an endpoint configured the board is shared, and without one it is a private
 * notebook that says so on its face. Shipping a local list that *looks* shared
 * would be worse than shipping nothing — someone would post an idea into a
 * void and believe it had been sent.
 *
 * The remote shape is deliberately plain REST so any backend satisfies it. The
 * one it was written against is Supabase, which needs no server code at all —
 * a table and three policies. See the README.
 *
 *   GET  {base}/ideas?select=id,text,votes,created_at&order=votes.desc
 *   POST {base}/ideas                      { text }
 *   POST {base}/rpc/bump_idea              { idea }
 *
 * Configure with VITE_IDEAS_URL and VITE_IDEAS_KEY in a .env file.
 */

const BASE = import.meta.env.VITE_IDEAS_URL?.replace(/\/+$/, '') ?? '';
const KEY = import.meta.env.VITE_IDEAS_KEY ?? '';

export const isShared = Boolean(BASE && KEY);

/** One vote per idea per browser. Weak, and the only thing possible without accounts. */
const VOTED = 'untypo.ideas.voted';
const LOCAL = 'untypo.ideas.local';
const ADMIN = 'untypo.ideas.admin';

/**
 * The same three under the name the app used to have.
 *
 * Votes, unsent ideas and the moderator's secret. Losing the secret means the
 * owner has to go and find the admin link again; losing the votes means the
 * board quietly lets someone vote twice. Both are cheap to carry and awkward
 * to explain, so they are carried.
 */
for (const [now, was] of [
  [VOTED, 'halftype.ideas.voted'],
  [LOCAL, 'halftype.ideas.local'],
  [ADMIN, 'halftype.ideas.admin'],
]) {
  try {
    if (localStorage.getItem(now) === null) {
      const carried = localStorage.getItem(was);
      if (carried !== null) {
        localStorage.setItem(now, carried);
        localStorage.removeItem(was);
      }
    }
  } catch {
    // Private browsing. The board works without any of this.
  }
}

/**
 * Moderation without an account, and where the check actually lives.
 *
 * The owner opens the board once with `#admin=<secret>` on the end of the URL.
 * The secret is kept in this browser and taken straight back out of the
 * address bar, so it is not left sitting in history or in a link that gets
 * shared by accident.
 *
 * What that buys is a *button*. It is not the protection. This bundle is
 * public and anyone can read it, so the delete endpoint has to assume the
 * caller is hostile: the secret is checked by a database function that runs as
 * its owner and compares against a row nobody else can read. Calling the
 * endpoint without the secret does nothing, whatever the page is showing. The
 * README has the four lines of SQL.
 */
(function claimAdminKey() {
  const found = /[#&]admin=([^&]+)/.exec(window.location.hash);
  if (!found) return;
  try {
    localStorage.setItem(ADMIN, decodeURIComponent(found[1]));
  } catch {
    /* private browsing: the key simply will not stick */
  }
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
})();

function adminKey() {
  try {
    return localStorage.getItem(ADMIN) || '';
  } catch {
    return '';
  }
}

export function isAdmin() {
  return Boolean(adminKey());
}

/** Forgets the key on this browser. The board itself is untouched. */
export function signOutAdmin() {
  try {
    localStorage.removeItem(ADMIN);
  } catch {
    /* nothing worth interrupting for */
  }
}

export const MAX_LENGTH = 280;

function readVoted() {
  try {
    const raw = JSON.parse(localStorage.getItem(VOTED) ?? '[]');
    return new Set(Array.isArray(raw) ? raw : []);
  } catch {
    return new Set();
  }
}

function writeVoted(set) {
  try {
    localStorage.setItem(VOTED, JSON.stringify([...set]));
  } catch {
    // Private browsing. Losing the record only means a second vote is possible.
  }
}

export function hasVoted(id) {
  return readVoted().has(String(id));
}

function headers(extra = {}) {
  return {
    'Content-Type': 'application/json',
    apikey: KEY,
    Authorization: `Bearer ${KEY}`,
    ...extra,
  };
}

async function request(path, options = {}) {
  const response = await fetch(`${BASE}${path}`, { ...options, headers: headers(options.headers) });
  if (!response.ok) {
    throw new Error(`The board answered ${response.status}. ${await response.text()}`.trim());
  }
  return response.status === 204 ? null : response.json();
}

/* ---------- local fallback ---------- */

function readLocal() {
  try {
    const raw = JSON.parse(localStorage.getItem(LOCAL) ?? '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function writeLocal(list) {
  try {
    localStorage.setItem(LOCAL, JSON.stringify(list));
  } catch {
    /* nothing worth interrupting for */
  }
}

/** Most wanted first, and the newest first among ideas on equal votes. */
function rank(list) {
  return [...list].sort((a, b) => b.votes - a.votes || (a.created_at < b.created_at ? 1 : -1));
}

/* ---------- the interface the board actually uses ---------- */

export async function listIdeas() {
  if (!isShared) return rank(readLocal());
  const rows = await request(
    '/ideas?select=id,text,votes,created_at&order=votes.desc,created_at.desc&limit=200',
  );
  return rows ?? [];
}

export async function addIdea(text) {
  const clean = text.trim().slice(0, MAX_LENGTH);
  if (!clean) throw new Error('Nothing to send');

  if (!isShared) {
    const list = readLocal();
    const idea = {
      id: `local-${Date.now()}`,
      text: clean,
      votes: 1,
      created_at: new Date().toISOString(),
    };
    writeLocal([idea, ...list]);
    // Posting is agreeing with yourself, so it counts as your one vote.
    writeVoted(readVoted().add(idea.id));
    return idea;
  }

  const rows = await request('/ideas', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ text: clean }),
  });
  const idea = Array.isArray(rows) ? rows[0] : rows;
  if (idea) writeVoted(readVoted().add(String(idea.id)));
  return idea;
}

export async function deleteIdea(id) {
  const key = adminKey();
  if (!key) throw new Error('No moderator key on this browser');

  if (!isShared) {
    writeLocal(readLocal().filter((i) => String(i.id) !== String(id)));
    return;
  }
  // The server decides. A refusal comes back as an error rather than as a
  // silent no-op, so a wrong key says so instead of looking like a bug.
  await request('/rpc/delete_idea', {
    method: 'POST',
    body: JSON.stringify({ idea: id, secret: key }),
  });
}

export async function voteIdea(id) {
  const key = String(id);
  const voted = readVoted();
  if (voted.has(key)) return false;

  if (!isShared) {
    writeLocal(readLocal().map((i) => (String(i.id) === key ? { ...i, votes: i.votes + 1 } : i)));
  } else {
    // A read-modify-write would lose votes cast between the two calls, so the
    // increment happens in one statement on the server.
    await request('/rpc/bump_idea', { method: 'POST', body: JSON.stringify({ idea: id }) });
  }

  writeVoted(voted.add(key));
  return true;
}
