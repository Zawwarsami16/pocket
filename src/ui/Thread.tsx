import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Message } from '../db/schema';
import { Markdown } from './Markdown';
import { getAttachments } from '../db/attachments';
import { deleteFrom, deleteMessage, updateMessage } from '../db/messages';

interface Props {
  sessionId: string;
  onRegenerate?: (fromUserMessageId: string) => void;
}

export function Thread({ sessionId, onRegenerate }: Props) {
  const messages = useLiveQuery(
    () => db.messages.where('[sessionId+createdAt]').between([sessionId, 0], [sessionId, Infinity]).toArray(),
    [sessionId]
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      stickRef.current = el.scrollHeight - el.clientHeight - el.scrollTop < 80;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !stickRef.current) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages?.length, messages?.[messages.length - 1]?.content]);

  if (!messages) return <div className="flex-1" />;

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="text-center text-[var(--fg-400)] max-w-md fade-in-up">
          <div className="text-3xl text-[var(--gold)] mb-3">P</div>
          <div className="text-sm">Drop in a key. Pick a model. Talk.</div>
          <div className="text-xs text-[var(--fg-500)] mt-2">Everything you say, everything it remembers — stays on this device.</div>
        </div>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {messages.map((m) => <Bubble key={m.id} m={m} onRegenerate={onRegenerate} />)}
      </div>
    </div>
  );
}

function Bubble({ m, onRegenerate }: { m: Message; onRegenerate?: (fromUserMessageId: string) => void }) {
  const [atts, setAtts] = useState<{ name: string; kind: string; url?: string }[]>([]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(m.content);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!m.attachmentIds?.length) { setAtts([]); return; }
    (async () => {
      const list = await getAttachments(m.attachmentIds!);
      const out = list.map((a) => ({
        name: a.name,
        kind: a.kind,
        url: a.kind === 'image' ? URL.createObjectURL(a.blob) : undefined
      }));
      if (!cancelled) setAtts(out);
    })();
    return () => {
      cancelled = true;
      atts.forEach((a) => a.url && URL.revokeObjectURL(a.url));
    };
  }, [m.id]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(m.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  async function saveEdit() {
    await updateMessage(m.id, { content: draft });
    setEditing(false);
  }

  async function regenerate() {
    if (!onRegenerate) return;
    await deleteFrom(m.id);
    onRegenerate(m.id);
  }

  if (m.role === 'user') {
    return (
      <div className="flex justify-end group fade-in-up">
        <div className="max-w-[85%] md:max-w-[80%]">
          <div className="bg-[var(--bg-800)] rounded-2xl rounded-tr-md px-4 py-2.5">
            {atts.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {atts.map((a, i) => a.url ? (
                  <img key={i} src={a.url} alt={a.name} className="max-h-48 rounded-lg" />
                ) : (
                  <div key={i} className="text-xs bg-[var(--bg-900)] px-2 py-1 rounded">📎 {a.name}</div>
                ))}
              </div>
            )}
            {editing ? (
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={Math.max(2, draft.split('\n').length)}
                className="w-full bg-[var(--bg-950)] outline-none text-sm rounded p-1"
              />
            ) : m.content ? (
              <div className="whitespace-pre-wrap text-sm text-[var(--fg-100)]">{m.content}</div>
            ) : null}
          </div>
          <div className="flex gap-1 justify-end mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {editing ? (
              <>
                <ActionBtn onClick={saveEdit}>save</ActionBtn>
                <ActionBtn onClick={() => { setEditing(false); setDraft(m.content); }}>cancel</ActionBtn>
                {onRegenerate && <ActionBtn onClick={async () => { await saveEdit(); regenerate(); }}>save & regen</ActionBtn>}
              </>
            ) : (
              <>
                <ActionBtn onClick={copy}>{copied ? 'copied' : 'copy'}</ActionBtn>
                <ActionBtn onClick={() => setEditing(true)}>edit</ActionBtn>
                {onRegenerate && <ActionBtn onClick={regenerate}>regenerate from here</ActionBtn>}
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (m.role === 'assistant') {
    return (
      <div className="flex gap-3 group fade-in-up">
        <div className="w-7 h-7 shrink-0 rounded-lg bg-[var(--bg-800)] grid place-items-center text-[var(--gold)] text-sm font-semibold">P</div>
        <div className="flex-1 min-w-0">
          {m.error ? (
            <div className="text-sm text-red-400 bg-red-950/30 border border-red-900/40 rounded-lg px-3 py-2">⚠ {m.error}</div>
          ) : m.content ? (
            <Markdown source={m.content} />
          ) : (
            <div className="text-[var(--fg-500)] text-sm flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-[var(--fg-500)] rounded-full pulse-soft" />
              <span className="w-1.5 h-1.5 bg-[var(--fg-500)] rounded-full pulse-soft" style={{ animationDelay: '0.2s' }} />
              <span className="w-1.5 h-1.5 bg-[var(--fg-500)] rounded-full pulse-soft" style={{ animationDelay: '0.4s' }} />
            </div>
          )}
          <div className="flex gap-2 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity items-center">
            {m.content && <ActionBtn onClick={copy}>{copied ? 'copied' : 'copy'}</ActionBtn>}
            {m.content && <ActionBtn onClick={async () => { await deleteMessage(m.id); }}>delete</ActionBtn>}
            {(m.tokensIn || m.tokensOut) && (
              <div className="text-[10px] text-[var(--fg-500)] ml-auto">
                {m.modelId} · in {m.tokensIn || 0} / out {m.tokensOut || 0}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
}

function ActionBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void | Promise<void> }) {
  return (
    <button onClick={onClick}
      className="text-[10px] px-2 py-0.5 rounded text-[var(--fg-400)] hover:text-[var(--fg-100)] hover:bg-[var(--bg-800)] transition-colors">
      {children}
    </button>
  );
}
