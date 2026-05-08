import { useEffect, useRef, useState } from 'react';
import { Paperclip, Send, StopCircle, X } from './icons';
import { addAttachment } from '../db/attachments';
import { compress, estimateSavings, type CompressMode } from '../ai/compress';

interface Props {
  sessionId: string;
  busy: boolean;
  onSend: (text: string, attachmentIds: string[]) => void;
  onStop: () => void;
  compressMode: CompressMode;
}

export function Composer({ sessionId, busy, onSend, onStop, compressMode }: Props) {
  const [text, setText] = useState('');
  const [pending, setPending] = useState<{ id: string; name: string; kind: string }[]>([]);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setText('');
    setPending([]);
  }, [sessionId]);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 280) + 'px';
  }, [text]);

  async function handleFiles(files: FileList | null) {
    if (!files) return;
    for (const f of Array.from(files)) {
      const a = await addAttachment(sessionId, f);
      setPending((p) => [...p, { id: a.id, name: a.name, kind: a.kind }]);
    }
  }

  function trySend() {
    if (busy) return;
    if (!text.trim() && !pending.length) return;
    onSend(text, pending.map((p) => p.id));
    setText('');
    setPending([]);
  }

  const compressed = compressMode !== 'off' ? compress(text, compressMode) : text;
  const savings = compressMode !== 'off' && text ? estimateSavings(text, compressed) : null;

  return (
    <div className="border-t border-ink-800 bg-ink-900/80 backdrop-blur p-3">
      <div className="max-w-3xl mx-auto">
        {pending.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {pending.map((p) => (
              <div key={p.id} className="flex items-center gap-1 bg-ink-800 px-2 py-1 rounded text-xs">
                <span className="text-gold-500">{p.kind === 'image' ? '🖼' : p.kind === 'pdf' ? '📄' : '📎'}</span>
                <span className="truncate max-w-[180px]">{p.name}</span>
                <button onClick={() => setPending((arr) => arr.filter((x) => x.id !== p.id))} className="text-ink-400 hover:text-ink-100">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2 bg-ink-800 rounded-2xl p-2 border border-ink-700 focus-within:border-ink-600">
          <label className="p-2 rounded-full hover:bg-ink-700 cursor-pointer text-ink-300" title="Attach file">
            <Paperclip className="w-5 h-5" />
            <input type="file" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
          </label>
          <textarea
            ref={taRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                trySend();
              }
            }}
            placeholder="Message Pocket…"
            className="flex-1 bg-transparent outline-none resize-none py-2 px-1 text-sm placeholder-ink-500 max-h-[280px]"
            rows={1}
          />
          {busy ? (
            <button onClick={onStop} className="p-2 rounded-full bg-ink-700 hover:bg-ink-600 text-ink-100" title="Stop">
              <StopCircle className="w-5 h-5" />
            </button>
          ) : (
            <button onClick={trySend} disabled={!text.trim() && !pending.length} className="p-2 rounded-full bg-gold-500 hover:bg-gold-400 disabled:opacity-30 disabled:cursor-not-allowed text-ink-950 transition-colors" title="Send (Enter)">
              <Send className="w-5 h-5" />
            </button>
          )}
        </div>
        {savings && savings.pct > 0 && (
          <div className="text-[10px] text-ink-500 mt-1.5 text-right">
            compress {compressMode}: -{savings.saved} chars (~{savings.pct}%)
          </div>
        )}
      </div>
    </div>
  );
}
