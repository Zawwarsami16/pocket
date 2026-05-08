import { useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Message } from '../db/schema';
import { Markdown } from './Markdown';
import { getAttachments } from '../db/attachments';
import { useState } from 'react';

interface Props {
  sessionId: string;
}

export function Thread({ sessionId }: Props) {
  const messages = useLiveQuery(
    () => db.messages.where('[sessionId+createdAt]').between([sessionId, 0], [sessionId, Infinity]).toArray(),
    [sessionId]
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages?.length, messages?.[messages.length - 1]?.content]);

  if (!messages) return <div className="flex-1" />;

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="text-center text-ink-400 max-w-md">
          <div className="text-3xl text-gold-500 mb-3">P</div>
          <div className="text-sm">Drop in a key. Pick a model. Talk.</div>
          <div className="text-xs text-ink-500 mt-2">Everything you say, everything it remembers — stays on this device.</div>
        </div>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {messages.map((m) => <Bubble key={m.id} m={m} />)}
      </div>
    </div>
  );
}

function Bubble({ m }: { m: Message }) {
  const [atts, setAtts] = useState<{ name: string; kind: string; url?: string }[]>([]);

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

  if (m.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="bg-ink-800 rounded-2xl rounded-tr-md px-4 py-2.5 max-w-[80%]">
          {atts.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {atts.map((a, i) => a.url ? (
                <img key={i} src={a.url} alt={a.name} className="max-h-48 rounded-lg" />
              ) : (
                <div key={i} className="text-xs bg-ink-900 px-2 py-1 rounded">📎 {a.name}</div>
              ))}
            </div>
          )}
          {m.content && <div className="whitespace-pre-wrap text-sm">{m.content}</div>}
        </div>
      </div>
    );
  }

  if (m.role === 'assistant') {
    return (
      <div className="flex gap-3">
        <div className="w-7 h-7 shrink-0 rounded-lg bg-ink-800 grid place-items-center text-gold-500 text-sm font-semibold">P</div>
        <div className="flex-1 min-w-0">
          {m.error ? (
            <div className="text-sm text-red-400 bg-red-950/30 border border-red-900/40 rounded-lg px-3 py-2">⚠ {m.error}</div>
          ) : m.content ? (
            <Markdown source={m.content} />
          ) : (
            <div className="text-ink-500 text-sm flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-ink-500 rounded-full animate-pulse" />
              <span className="w-1.5 h-1.5 bg-ink-500 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
              <span className="w-1.5 h-1.5 bg-ink-500 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
            </div>
          )}
          {(m.tokensIn || m.tokensOut) && (
            <div className="text-[10px] text-ink-500 mt-1.5">
              {m.modelId} · in {m.tokensIn || 0} / out {m.tokensOut || 0}
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}
