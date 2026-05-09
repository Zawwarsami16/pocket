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
    <div className="border-b border-[var(--bg-800)] glass">
      <button onClick={() => setOpen((v) => !v)}
        className="w-full px-4 py-1.5 flex items-center gap-2.5 text-[11px] text-[var(--fg-400)] hover:text-[var(--fg-200)]">
        <span className="relative flex">
          <span className={`w-1.5 h-1.5 rounded-full ${snap.online ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          {snap.online && <span className="absolute inset-0 w-1.5 h-1.5 rounded-full bg-emerald-500 pulse-glow" />}
        </span>
        <span className="truncate font-mono">{summary}</span>
        <span className={`ml-auto text-[var(--fg-500)] transition-transform duration-200 ${open ? 'rotate-180' : ''}`} style={{ transitionTimingFunction: 'var(--ease-out-quart)' }}>
          <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="m6 9 6 6 6-6"/></svg>
        </span>
      </button>
      {open && (
        <div className="px-4 pb-3 pt-1 text-xs text-[var(--fg-300)] space-y-3 border-t border-[var(--bg-800)]/60 fade-in-up">
          <Section label="awareness this turn">
            <div className="space-y-0.5">
              <div>posture · <span className="text-[var(--gold-bright)]">{snap.posture}</span></div>
              {snap.currentSession && (
                <div>this thread · "{snap.currentSession.title}" on <span className="font-mono text-[var(--fg-200)]">{snap.currentSession.modelId}</span> · {snap.currentSession.messages} msgs</div>
              )}
              <div>{snap.totalMessages} total msgs · {snap.totalChats} chats · {snap.totalFacts} facts</div>
            </div>
          </Section>
          {facts.length > 0 && (
            <Section label="top of mind">
              <ul className="space-y-0.5">
                {facts.map((f, i) => (
                  <li key={i} className="text-[var(--fg-300)] truncate flex items-baseline gap-2">
                    <span className="text-[var(--gold-deep)] shrink-0">·</span>
                    <span className="truncate flex-1">{f.text}</span>
                    <span className="text-[var(--fg-600)] text-[9px] shrink-0">×{f.hits}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {snippets.length > 0 && (
            <Section label="pulling from past chats">
              <ul className="space-y-1.5">
                {snippets.map((s, i) => (
                  <li key={i} className="border-l-2 border-[var(--gold-deep)] pl-2.5">
                    <div className="text-[var(--gold-bright)]/80 text-[10px] mb-0.5">"{s.title}"</div>
                    <div className="text-[var(--fg-400)] truncate">{s.preview}</div>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {!snippets.length && !facts.length && (
            <div className="text-[var(--fg-500)] italic text-[11px]">Nothing matched this thread yet — keep talking, memory grows.</div>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-[0.1em] text-[var(--fg-500)] font-medium mb-1">{label}</div>
      {children}
    </div>
  );
}
