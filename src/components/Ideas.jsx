import { useCallback, useEffect, useState } from 'react';
import {
  MAX_LENGTH,
  addIdea,
  deleteIdea,
  hasVoted,
  isAdmin,
  isShared,
  listIdeas,
  signOutAdmin,
  voteIdea,
} from '../lib/ideas.js';

/**
 * The idea board.
 *
 * Anyone can ask for something without an account, everyone sees what everyone
 * else asked for, and the most wanted rises to the top. No names anywhere —
 * an idea stands on the votes it gets.
 *
 * Optimistic on the vote and honest on the send: a vote is a counter and
 * putting it back if the request fails costs nothing, but an idea that was
 * never stored must not sit in the list looking as though it was.
 */
export default function Ideas({ onClose }) {
  const [ideas, setIdeas] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    listIdeas()
      .then(setIdeas)
      .catch((err) => {
        setError(err.message);
        setIdeas([]);
      });
  }, []);

  useEffect(load, [load]);

  // Escape closes it, the way every other panel here behaves.
  useEffect(() => {
    const onKey = (event) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const send = async (event) => {
    event.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await addIdea(text);
      setText('');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const vote = async (id) => {
    setIdeas((prev) => prev.map((i) => (i.id === id ? { ...i, votes: i.votes + 1 } : i)));
    try {
      await voteIdea(id);
    } catch (err) {
      setError(err.message);
      setIdeas((prev) => prev.map((i) => (i.id === id ? { ...i, votes: i.votes - 1 } : i)));
    }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this idea?')) return;
    const kept = ideas;
    setIdeas((prev) => prev.filter((i) => i.id !== id));
    try {
      await deleteIdea(id);
    } catch (err) {
      setError(err.message);
      setIdeas(kept);
    }
  };

  const moderator = isAdmin();
  const left = MAX_LENGTH - text.length;

  return (
    // Its own colour, so that opening it is unmistakably going somewhere
    // rather than a dialog appearing over the work.
    //
    // Black ink on the green, not white. White is the obvious choice on a
    // colour this loud and it comes to 2.3:1, which reads fine on the monitor
    // it was designed on and disappears on a laptop outdoors; black is 9:1.
    // The controls are then translucent *black*, which keeps them reading as
    // the same family of pills as everywhere else on the page.
    <div className="fixed inset-0 z-[60] flex flex-col bg-signal-green text-ink">
      <div className="mx-auto flex h-full w-full max-w-[52rem] flex-col px-5 py-6 lg:px-8 lg:py-10">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 className="type-style-name tracking-display leading-none">
              What should it do next
            </h2>
            <p className="mt-2 max-w-prose text-[0.85rem] leading-relaxed text-ink/70">
              Ask for anything, no account and no name. Vote for what you also
              want — the most wanted sits at the top.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-[var(--radius-control)] bg-black/10 px-4 py-[0.32rem] text-[0.78rem]
                       transition duration-250 ease-[var(--ease-snap)] hover:bg-black/16"
          >
            Close
          </button>
        </div>

        {!isShared && (
          <p className="mb-5 rounded-[var(--radius-field)] bg-black/10 px-4 py-2.5 font-mono text-[0.7rem] leading-relaxed">
            <strong className="font-normal">This board is only on this browser.</strong>{' '}
            <span className="text-ink/65">
              No backend is configured, so nothing here is sent anywhere and nobody
              else can see it. Set <code className="font-mono">VITE_IDEAS_URL</code> and{' '}
              <code className="font-mono">VITE_IDEAS_KEY</code> to make it shared — the README
              has the table it expects.
            </span>
          </p>
        )}

        <form onSubmit={send} className="mb-6">
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value.slice(0, MAX_LENGTH))}
            rows={3}
            placeholder="A pattern, an export format, something that annoys you…"
            className="w-full resize-none rounded-[var(--radius-field)] bg-black/10 px-4 py-3 text-[1rem]
                       leading-snug outline-none placeholder:text-ink/45"
          />
          <div className="mt-2 flex items-center gap-4">
            <button
              type="submit"
              disabled={!text.trim() || busy}
              className="rounded-[var(--radius-control)] bg-ink px-5 py-[0.35rem] text-[0.8rem] text-page
                         transition duration-250 ease-[var(--ease-snap)] hover:bg-[#2a2a2a]
                         disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? 'Sending…' : 'Send it'}
            </button>
            <span className="font-mono text-[0.7rem] text-ink/65">{left} left</span>
          </div>
        </form>

        {error && (
          <p className="mb-4 rounded-[var(--radius-field)] bg-black/10 px-4 py-2.5 font-mono text-[0.7rem] leading-relaxed">{error}</p>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto border-t border-black/22">
          {ideas === null && <p className="py-6 font-mono text-[0.7rem] text-ink/65">Loading…</p>}
          {ideas?.length === 0 && (
            <p className="py-6 font-mono text-[0.7rem] text-ink/65">Nothing yet. Be the first.</p>
          )}
          <ul>
            {ideas?.map((idea) => {
              const voted = hasVoted(idea.id);
              return (
                <li key={idea.id} className="flex gap-4 border-b border-black/14 py-4">
                  <button
                    type="button"
                    onClick={() => !voted && vote(idea.id)}
                    disabled={voted}
                    aria-label={voted ? 'Already voted' : 'Vote for this'}
                    title={voted ? 'You have voted for this' : 'Vote for this'}
                    className={`flex h-[2.9rem] w-[2.9rem] shrink-0 flex-col items-center justify-center
                                rounded-[var(--radius-control)] text-[0.65rem] leading-none
                                transition duration-250 ease-[var(--ease-snap)]
                                ${voted ? 'bg-ink text-page' : 'bg-black/10 hover:bg-black/16'}`}
                  >
                    <span className="text-[0.8rem]">▲</span>
                    <span className="mt-[3px] font-mono">{idea.votes}</span>
                  </button>
                  <p className="min-w-0 flex-1 self-center text-[0.9rem] leading-relaxed break-words">
                    {idea.text}
                  </p>
                  {moderator && (
                    <button
                      type="button"
                      onClick={() => remove(idea.id)}
                      aria-label="Delete this idea"
                      title="Delete this idea"
                      className="shrink-0 self-center rounded-[var(--radius-control)] px-2.5 py-1 text-[0.8rem]
                                 text-ink/60 transition duration-250 ease-[var(--ease-snap)]
                                 hover:bg-black/10 hover:text-ink"
                    >
                      ✕
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
