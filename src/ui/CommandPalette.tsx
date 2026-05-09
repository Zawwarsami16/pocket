import { useEffect, useMemo, useRef, useState } from 'react';
import { db } from '../db/schema';
import { createSession } from '../db/sessions';
import { setStoredTheme, getStoredTheme, type Theme } from './theme';
import { X } from './icons';

interface Result {
  kind: 'session' | 'message' | 'fact' | 'action';
  label: string;
  hint?: string;
  sessionId?: string;
  action?: () => void | Promise<void>;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSelectSession: (id: string) => void;
  onOpenSettings: () => void;
  defaultProvider?: string;
  defaultModel?: string;
}

export function CommandPalette({ open, onClose, onSelectSession, onOpenSettings, defaultProvider, defaultModel }: Props) {
  const [q, setQ] = useState('');
  const [pool, setPool] = useState<Result[]>([]);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) { setQ(''); setCursor(0); return; }
    inputRef.current?.focus();
    (async () => {
      const [sessions, messages, facts] = await Promise.all([
        db.sessions.orderBy('updatedAt').reverse().limit(50).toArray(),
        db.messages.orderBy('createdAt').reverse().limit(500).toArray(),
        db.facts.orderBy('hits').reverse().limit(50).toArray()
      ]);
      const items: Result[] = [];
      items.push({
        kind: 'action',
        label: 'New chat',
        hint: '⏎',
        action: async () => {
          if (!defaultProvider || !defaultModel) { onOpenSettings(); return; }
          const s = await createSession({ providerId: defaultProvider, modelId: defaultModel });
          onSelectSession(s.id);
        }
      });
      items.push({ kind: 'action', label: 'Open settings', action: onOpenSettings });
      const t = getStoredTheme();
      const next: Theme = t === 'dark' ? 'light' : t === 'light' ? 'system' : 'dark';
      items.push({ kind: 'action', label: `Switch theme → ${next}`, action: () => setStoredTheme(next) });

      for (const s of sessions) {
        items.push({ kind: 'session', label: s.title, hint: new Date(s.updatedAt).toLocaleDateString(), sessionId: s.id });
      }
      for (const m of messages) {
        if (!m.content?.trim()) continue;
        const session = sessions.find((x) => x.id === m.sessionId);
        items.push({
          kind: 'message',
          label: m.content.slice(0, 100),
          hint: session ? `in "${session.title}"` : undefined,
          sessionId: m.sessionId
        });
      }
      for (const f of facts) {
        items.push({ kind: 'fact', label: f.text, hint: `recalled ${f.hits}×` });
      }
      setPool(items);
    })();
  }, [open, defaultProvider, defaultModel]);

  const results = useMemo(() => {
    if (!q.trim()) return pool.slice(0, 12);
    const needle = q.toLowerCase();
    return pool
      .filter((r) => r.label.toLowerCase().includes(needle) || r.hint?.toLowerCase().includes(needle))
      .slice(0, 30);
  }, [q, pool]);

  useEffect(() => { setCursor(0); }, [q]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-start pt-[10vh] px-4 bg-black/60 backdrop-blur-sm fade-in" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl rounded-xl border border-[var(--bg-750)] bg-[var(--bg-900)] elev-4 overflow-hidden fade-in-up">
        <div className="flex items-center px-4 py-3 border-b border-[var(--bg-800)]">
          <svg viewBox="0 0 24 24" className="w-4 h-4 text-[var(--fg-500)] shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, results.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
              else if (e.key === 'Enter') {
                e.preventDefault();
                const r = results[cursor];
                if (!r) return;
                if (r.action) { r.action(); onClose(); }
                else if (r.sessionId) { onSelectSession(r.sessionId); onClose(); }
              } else if (e.key === 'Escape') onClose();
            }}
            placeholder="Search chats, messages, facts… or pick an action"
            className="flex-1 bg-transparent outline-none px-3 text-sm placeholder-[var(--fg-500)] text-[var(--fg-100)]"
          />
          <button onClick={onClose} className="text-[var(--fg-400)] hover:text-[var(--fg-100)]"><X className="w-4 h-4" /></button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {results.length === 0 && <div className="px-4 py-6 text-center text-sm text-[var(--fg-500)]">No matches.</div>}
          {results.map((r, i) => (
            <button
              key={i}
              onMouseEnter={() => setCursor(i)}
              onClick={() => {
                if (r.action) { r.action(); onClose(); }
                else if (r.sessionId) { onSelectSession(r.sessionId); onClose(); }
              }}
              className={`w-full text-left px-4 py-2.5 flex items-center gap-3 relative ${i === cursor ? 'bg-[var(--bg-850)]' : ''}`}>
              {i === cursor && <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-[var(--gold)]" />}
              <span className={`text-[9px] uppercase tracking-[0.1em] font-medium w-16 shrink-0 ${
                r.kind === 'action' ? 'text-[var(--gold-bright)]' :
                r.kind === 'session' ? 'text-emerald-400' :
                r.kind === 'fact' ? 'text-purple-400' : 'text-[var(--fg-500)]'
              }`}>{r.kind}</span>
              <span className="flex-1 truncate text-sm text-[var(--fg-100)]">{r.label}</span>
              {r.hint && <span className="text-[10px] text-[var(--fg-500)] shrink-0 truncate max-w-[40%]">{r.hint}</span>}
            </button>
          ))}
        </div>
        <div className="px-4 py-2 border-t border-[var(--bg-800)] text-[10px] text-[var(--fg-500)] flex justify-between">
          <span>↑↓ navigate · ⏎ select · esc close</span>
          <span>{results.length} results</span>
        </div>
      </div>
    </div>
  );
}
