import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Session } from '../db/schema';
import { createSession, deleteSession, renameSession, togglePinned } from '../db/sessions';
import { useMemo, useState } from 'react';
import { Pin, PinOff, Plus, Settings as SettingsIcon, Trash2, X } from './icons';

interface Props {
  activeId?: string;
  onSelect: (id: string) => void;
  onSettings: () => void;
  onCommandPalette: () => void;
  defaultProvider?: string;
  defaultModel?: string;
  open: boolean;
  onClose: () => void;
}

const dayMs = 86_400_000;

function bucketFor(updatedAt: number): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const ts = updatedAt;
  if (ts >= today) return 'Today';
  if (ts >= today - dayMs) return 'Yesterday';
  if (ts >= today - 7 * dayMs) return 'This week';
  if (ts >= today - 30 * dayMs) return 'This month';
  return 'Earlier';
}

const BUCKET_ORDER = ['Today', 'Yesterday', 'This week', 'This month', 'Earlier'];

export function Sidebar({ activeId, onSelect, onSettings, onCommandPalette, defaultProvider, defaultModel, open, onClose }: Props) {
  const sessions = useLiveQuery(() => db.sessions.orderBy('updatedAt').reverse().toArray()) ?? [];
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [filter, setFilter] = useState('');

  async function newChat() {
    if (!defaultProvider || !defaultModel) {
      onSettings();
      return;
    }
    const s = await createSession({ providerId: defaultProvider, modelId: defaultModel });
    onSelect(s.id);
    onClose();
  }

  const filtered = useMemo(() => {
    if (!filter.trim()) return sessions;
    const needle = filter.toLowerCase();
    return sessions.filter((s) => s.title.toLowerCase().includes(needle));
  }, [sessions, filter]);

  const pinned = filtered.filter((s) => s.pinned);
  const rest = filtered.filter((s) => !s.pinned);

  const grouped = useMemo(() => {
    const map = new Map<string, Session[]>();
    for (const s of rest) {
      const b = bucketFor(s.updatedAt);
      if (!map.has(b)) map.set(b, []);
      map.get(b)!.push(s);
    }
    return BUCKET_ORDER.filter((b) => map.has(b)).map((b) => ({ bucket: b, items: map.get(b)! }));
  }, [rest]);

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm md:hidden fade-in" onClick={onClose} />
      )}
      <aside className={`fixed md:relative inset-y-0 left-0 z-40 w-72 md:w-64 shrink-0 flex flex-col bg-[var(--bg-900)] border-r border-[var(--bg-800)] transition-transform duration-300 md:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ transitionTimingFunction: 'var(--ease-out-expo)' }}>
        <div className="px-3 pt-3 pb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-[var(--bg-750)] to-[var(--bg-850)] grid place-items-center text-[var(--gold)] font-semibold text-sm ring-soft">P</span>
            <span className="font-semibold tracking-tight text-[var(--fg-100)]">Pocket</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={onCommandPalette} className="p-1.5 rounded hover:bg-[var(--bg-800)] text-[var(--fg-300)] hidden md:block" title="Search ⌘K">
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
            </button>
            <button onClick={onSettings} className="p-1.5 rounded hover:bg-[var(--bg-800)] text-[var(--fg-300)]" title="Settings">
              <SettingsIcon className="w-4 h-4" />
            </button>
            <button onClick={onClose} className="md:hidden p-1.5 rounded hover:bg-[var(--bg-800)] text-[var(--fg-300)]" title="Close">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="px-3 mb-2">
          <button onClick={newChat} className="w-full px-3 py-2 rounded-lg bg-[var(--bg-800)] hover:bg-[var(--bg-750)] text-sm flex items-center gap-2 text-[var(--fg-100)] ring-soft">
            <Plus className="w-4 h-4 text-[var(--gold)]" />
            <span>New chat</span>
            <kbd className="ml-auto text-[10px] text-[var(--fg-500)] font-mono">⌘⇧N</kbd>
          </button>
        </div>

        <div className="px-3 mb-2">
          <div className="relative">
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--fg-500)]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter chats…"
              className="w-full bg-[var(--bg-850)] border border-[var(--bg-800)] rounded-lg pl-8 pr-2 py-1.5 text-xs outline-none text-[var(--fg-200)] placeholder-[var(--fg-500)] focus:border-[var(--bg-700)]"
            />
            {filter && (
              <button onClick={() => setFilter('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--fg-500)] hover:text-[var(--fg-200)]">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {pinned.length > 0 && (
            <div className="mb-3">
              <Header label="Pinned" />
              {pinned.map((s) => (
                <Row key={s.id} session={s} active={activeId === s.id} editing={editing === s.id}
                  draft={draft} setDraft={setDraft}
                  onSelect={() => { onSelect(s.id); onClose(); }}
                  onStartEdit={() => { setEditing(s.id); setDraft(s.title); }}
                  onCommitEdit={async () => { await renameSession(s.id, draft); setEditing(null); }}
                  onPin={() => togglePinned(s.id)}
                  onDelete={async () => {
                    if (confirm(`Delete "${s.title}"?`)) {
                      await deleteSession(s.id);
                      if (activeId === s.id) onSelect('');
                    }
                  }} />
              ))}
            </div>
          )}
          {grouped.length === 0 && pinned.length === 0 && (
            <div className="text-xs text-[var(--fg-500)] px-2 py-12 text-center">
              {filter ? 'No matches.' : 'No chats yet.'}
            </div>
          )}
          {grouped.map(({ bucket, items }) => (
            <div key={bucket} className="mb-3">
              <Header label={bucket} />
              {items.map((s) => (
                <Row key={s.id} session={s} active={activeId === s.id} editing={editing === s.id}
                  draft={draft} setDraft={setDraft}
                  onSelect={() => { onSelect(s.id); onClose(); }}
                  onStartEdit={() => { setEditing(s.id); setDraft(s.title); }}
                  onCommitEdit={async () => { await renameSession(s.id, draft); setEditing(null); }}
                  onPin={() => togglePinned(s.id)}
                  onDelete={async () => {
                    if (confirm(`Delete "${s.title}"?`)) {
                      await deleteSession(s.id);
                      if (activeId === s.id) onSelect('');
                    }
                  }} />
              ))}
            </div>
          ))}
        </div>

        <div className="px-3 py-2.5 text-[10px] text-[var(--fg-500)] border-t border-[var(--bg-800)] flex items-center justify-between">
          <span>Local-only</span>
          <span className="flex items-center gap-1">
            <span className="w-1 h-1 rounded-full bg-emerald-500 pulse-glow" />
            <span>{sessions.length} chats</span>
          </span>
        </div>
      </aside>
    </>
  );
}

function Header({ label }: { label: string }) {
  return <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--fg-500)] font-medium px-2 pt-1.5 pb-1">{label}</div>;
}

interface RowProps {
  session: Session;
  active: boolean;
  editing: boolean;
  draft: string;
  setDraft: (s: string) => void;
  onSelect: () => void;
  onStartEdit: () => void;
  onCommitEdit: () => void;
  onPin: () => void;
  onDelete: () => void;
}

function Row({ session, active, editing, draft, setDraft, onSelect, onStartEdit, onCommitEdit, onPin, onDelete }: RowProps) {
  return (
    <div className={`group relative flex items-center gap-1 px-2 py-1.5 rounded-md cursor-pointer ${active ? 'bg-[var(--bg-800)] ring-soft' : 'hover:bg-[var(--bg-850)]'}`}
      onClick={onSelect}
      onDoubleClick={(e) => { e.stopPropagation(); onStartEdit(); }}>
      {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-[var(--gold)]" />}
      {editing ? (
        <input
          autoFocus
          className="flex-1 bg-[var(--bg-950)] px-2 py-1 rounded text-sm outline-none border border-[var(--bg-700)]"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onBlur={onCommitEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onCommitEdit();
            if (e.key === 'Escape') onCommitEdit();
          }}
        />
      ) : (
        <span className={`flex-1 truncate text-sm ${active ? 'text-[var(--fg-100)] font-medium' : 'text-[var(--fg-200)]'}`}>{session.title}</span>
      )}
      <button onClick={(e) => { e.stopPropagation(); onPin(); }} className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-[var(--bg-700)] text-[var(--fg-400)]" title={session.pinned ? 'Unpin' : 'Pin'}>
        {session.pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
      </button>
      <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-[var(--bg-700)] text-[var(--fg-400)] hover:text-red-400" title="Delete">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
