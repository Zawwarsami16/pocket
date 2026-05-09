import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { createSession, deleteSession, renameSession, togglePinned } from '../db/sessions';
import { useState } from 'react';
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

export function Sidebar({ activeId, onSelect, onSettings, onCommandPalette, defaultProvider, defaultModel, open, onClose }: Props) {
  const sessions = useLiveQuery(() => db.sessions.orderBy('updatedAt').reverse().toArray()) ?? [];
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  async function newChat() {
    if (!defaultProvider || !defaultModel) {
      onSettings();
      return;
    }
    const s = await createSession({ providerId: defaultProvider, modelId: defaultModel });
    onSelect(s.id);
    onClose();
  }

  const pinned = sessions.filter((s) => s.pinned);
  const rest = sessions.filter((s) => !s.pinned);

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={onClose} />
      )}
      <aside className={`fixed md:relative inset-y-0 left-0 z-40 w-72 md:w-64 shrink-0 flex flex-col bg-[var(--bg-900)] border-r border-[var(--bg-800)] transition-transform md:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-[var(--bg-800)] grid place-items-center text-[var(--gold)] font-semibold">P</span>
            <span className="font-semibold tracking-tight text-[var(--fg-100)]">Pocket</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={onSettings} className="p-1.5 rounded hover:bg-[var(--bg-800)] text-[var(--fg-300)]" title="Settings">
              <SettingsIcon className="w-4 h-4" />
            </button>
            <button onClick={onClose} className="md:hidden p-1.5 rounded hover:bg-[var(--bg-800)] text-[var(--fg-300)]" title="Close">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <button onClick={newChat} className="mx-3 mb-2 px-3 py-2 rounded-lg bg-[var(--bg-800)] hover:bg-[var(--bg-700)] text-sm flex items-center gap-2 transition-colors text-[var(--fg-100)]">
          <Plus className="w-4 h-4 text-[var(--gold)]" />
          New chat
        </button>

        <button onClick={onCommandPalette}
          className="mx-3 mb-2 px-3 py-1.5 rounded-lg border border-[var(--bg-800)] hover:bg-[var(--bg-800)] text-xs text-[var(--fg-400)] flex items-center justify-between transition-colors">
          <span>Search…</span>
          <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-950)] border border-[var(--bg-800)] font-mono">⌘K</kbd>
        </button>

        <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-3">
          {pinned.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--fg-500)] px-2 py-1">Pinned</div>
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
          <div>
            {pinned.length > 0 && <div className="text-[10px] uppercase tracking-wider text-[var(--fg-500)] px-2 py-1">Recent</div>}
            {rest.length === 0 && pinned.length === 0 && (
              <div className="text-xs text-[var(--fg-500)] px-2 py-8 text-center">No chats yet.</div>
            )}
            {rest.map((s) => (
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
        </div>

        <div className="px-3 py-2 text-[10px] text-[var(--fg-500)] border-t border-[var(--bg-800)]">
          Everything stays in this browser.
        </div>
      </aside>
    </>
  );
}

interface RowProps {
  session: any;
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
    <div className={`group flex items-center gap-1 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${active ? 'bg-[var(--bg-800)]' : 'hover:bg-[var(--bg-800)]/60'}`}
      onClick={onSelect}
      onDoubleClick={(e) => { e.stopPropagation(); onStartEdit(); }}>
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
        <span className="flex-1 truncate text-sm text-[var(--fg-200)]">{session.title}</span>
      )}
      <button onClick={(e) => { e.stopPropagation(); onPin(); }} className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-[var(--bg-700)] text-[var(--fg-400)]" title={session.pinned ? 'Unpin' : 'Pin'}>
        {session.pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
      </button>
      <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-[var(--bg-700)] text-[var(--fg-400)]" title="Delete">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
