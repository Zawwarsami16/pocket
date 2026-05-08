import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { createSession, deleteSession, renameSession, togglePinned } from '../db/sessions';
import { useState } from 'react';
import { Pin, PinOff, Plus, Settings as SettingsIcon, Trash2 } from './icons';

interface Props {
  activeId?: string;
  onSelect: (id: string) => void;
  onSettings: () => void;
  defaultProvider?: string;
  defaultModel?: string;
}

export function Sidebar({ activeId, onSelect, onSettings, defaultProvider, defaultModel }: Props) {
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
  }

  const pinned = sessions.filter((s) => s.pinned);
  const rest = sessions.filter((s) => !s.pinned);

  return (
    <div className="flex flex-col h-full bg-ink-900 border-r border-ink-800 w-64 shrink-0">
      <div className="p-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg bg-ink-800 grid place-items-center text-gold-500 font-semibold">P</span>
          <span className="font-semibold tracking-tight">Pocket</span>
        </div>
        <button onClick={onSettings} className="p-1.5 rounded hover:bg-ink-800 text-ink-300" title="Settings">
          <SettingsIcon className="w-4 h-4" />
        </button>
      </div>

      <button onClick={newChat} className="mx-3 mb-2 px-3 py-2 rounded-lg bg-ink-800 hover:bg-ink-700 text-sm flex items-center gap-2 transition-colors">
        <Plus className="w-4 h-4 text-gold-500" />
        New chat
      </button>

      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-3">
        {pinned.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-ink-500 px-2 py-1">Pinned</div>
            {pinned.map((s) => (
              <Row key={s.id} session={s} active={activeId === s.id} editing={editing === s.id}
                draft={draft} setDraft={setDraft}
                onSelect={() => onSelect(s.id)}
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
          {pinned.length > 0 && <div className="text-[10px] uppercase tracking-wider text-ink-500 px-2 py-1">Recent</div>}
          {rest.length === 0 && pinned.length === 0 && (
            <div className="text-xs text-ink-500 px-2 py-8 text-center">No chats yet.</div>
          )}
          {rest.map((s) => (
            <Row key={s.id} session={s} active={activeId === s.id} editing={editing === s.id}
              draft={draft} setDraft={setDraft}
              onSelect={() => onSelect(s.id)}
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

      <div className="px-3 py-2 text-[10px] text-ink-500 border-t border-ink-800">
        Everything stays in this browser.
      </div>
    </div>
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
    <div className={`group flex items-center gap-1 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${active ? 'bg-ink-800' : 'hover:bg-ink-800/60'}`}
      onClick={onSelect}
      onDoubleClick={(e) => { e.stopPropagation(); onStartEdit(); }}>
      {editing ? (
        <input
          autoFocus
          className="flex-1 bg-ink-950 px-2 py-1 rounded text-sm outline-none border border-ink-700"
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
        <span className="flex-1 truncate text-sm">{session.title}</span>
      )}
      <button onClick={(e) => { e.stopPropagation(); onPin(); }} className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-ink-700 text-ink-400" title={session.pinned ? 'Unpin' : 'Pin'}>
        {session.pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
      </button>
      <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-ink-700 text-ink-400" title="Delete">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
