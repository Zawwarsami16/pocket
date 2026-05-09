import { useEffect, useState } from 'react';
import { snapshotEntity, type EntitySnapshot } from '../ai/entity';
import { recallAcrossSessions } from '../ai/recall';
import { recallFacts } from '../db/facts';

interface Props {
  sessionId?: string;
  lastUserText?: string;
}

export function AwarenessHud({ sessionId, lastUserText }: Props) {
  const [snap, setSnap] = useState<EntitySnapshot | null>(null);
  const [open, setOpen] = useState(false);
  const [snippets, setSnippets] = useState<{ title: string; preview: string }[]>([]);
  const [facts, setFacts] = useState<{ text: string; hits: number }[]>([]);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const s = await snapshotEntity(sessionId);
      if (alive) setSnap(s);
    };
    tick();
    const t = setInterval(tick, 30_000);
    return () => { alive = false; clearInterval(t); };
  }, [sessionId]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      const probe = lastUserText?.trim() || snap?.recentTopics?.join(' ') || '';
      const [snips, fs] = await Promise.all([
        probe ? recallAcrossSessions(probe, { excludeSessionId: sessionId, maxSnippets: 4, perSnippetChars: 180 }) : Promise.resolve([]),
        probe ? recallFacts(probe, 6) : Promise.resolve([])
      ]);
      if (!alive) return;
      setSnippets(snips.map((s) => ({ title: s.sessionTitle, preview: s.text.slice(0, 160) })));
      setFacts(fs.map((f) => ({ text: f.text, hits: f.hits })));
    })();
    return () => { alive = false; };
  }, [open, lastUserText, sessionId, snap?.totalFacts]);

  if (!snap) return null;

  const summary = [
    snap.time.split(' (')[0],
    `${snap.totalChats} chats`,
    `${snap.totalFacts} facts`,
    snap.weekChats > 0 ? `${snap.weekChats} this week` : null
  ].filter(Boolean).join(' · ');

  return (
    <div className="border-b border-[var(--bg-800)] bg-[var(--bg-900)]/40">
      <button onClick={() => setOpen((v) => !v)}
        className="w-full px-4 py-1.5 flex items-center gap-2 text-[11px] text-[var(--fg-400)] hover:text-[var(--fg-200)] transition-colors">
        <span className={`w-1.5 h-1.5 rounded-full ${snap.online ? 'bg-emerald-500' : 'bg-amber-500'} ${open ? '' : 'animate-pulse'}`} />
        <span className="truncate">{summary}</span>
        <span className="ml-auto opacity-60">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="px-4 pb-3 pt-1 text-xs text-[var(--fg-300)] space-y-3 border-t border-[var(--bg-800)]/50">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[var(--fg-500)] mb-1">Awareness this turn</div>
            <div className="text-[var(--fg-300)] leading-relaxed">
              <div>posture: <span className="text-[var(--gold-bright)]">{snap.posture}</span></div>
              {snap.currentSession && (
                <div>this thread: "{snap.currentSession.title}" on <span className="font-mono text-[var(--fg-200)]">{snap.currentSession.modelId}</span> · {snap.currentSession.messages} msgs</div>
              )}
              <div>{snap.totalMessages} total messages across {snap.totalChats} chats · {snap.totalFacts} facts remembered</div>
            </div>
          </div>
          {facts.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--fg-500)] mb-1">Top of mind right now</div>
              <ul className="space-y-0.5">
                {facts.map((f, i) => (
                  <li key={i} className="text-[var(--fg-300)] truncate">· {f.text} <span className="text-[var(--fg-600)]">×{f.hits}</span></li>
                ))}
              </ul>
            </div>
          )}
          {snippets.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--fg-500)] mb-1">Pulling from past chats</div>
              <ul className="space-y-1">
                {snippets.map((s, i) => (
                  <li key={i}>
                    <div className="text-[var(--gold-bright)]/80 text-[10px]">"{s.title}"</div>
                    <div className="text-[var(--fg-400)] truncate">{s.preview}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!snippets.length && !facts.length && (
            <div className="text-[var(--fg-500)] italic">Nothing matched the current thread yet — keep talking, memory grows.</div>
          )}
        </div>
      )}
    </div>
  );
}
