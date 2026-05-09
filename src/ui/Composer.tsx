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
  const [focused, setFocused] = useState(false);
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
  const charCount = text.length;

  return (
    <div className="border-t border-[var(--bg-800)] glass-strong px-3 pt-3 pb-3 pb-safe">
      <div className="max-w-3xl mx-auto">
        {pending.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2 fade-in">
            {pending.map((p) => (
              <div key={p.id} className="flex items-center gap-1.5 bg-[var(--bg-800)] border border-[var(--bg-750)] px-2.5 py-1 rounded-md text-xs text-[var(--fg-200)]">
                <span className="text-[var(--gold)]">{p.kind === 'image' ? '🖼' : p.kind === 'pdf' ? '📄' : '📎'}</span>
                <span className="truncate max-w-[180px]">{p.name}</span>
                <button onClick={() => setPending((arr) => arr.filter((x) => x.id !== p.id))} className="text-[var(--fg-500)] hover:text-[var(--fg-100)] -mr-0.5">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className={`flex items-end gap-2 bg-[var(--bg-850)] rounded-2xl p-1.5 border ${focused ? 'border-[var(--bg-650)] elev-2' : 'border-[var(--bg-750)]'}`} style={{ transition: 'border-color 160ms, box-shadow 160ms' }}>
          <label className="p-2 rounded-full hover:bg-[var(--bg-800)] cursor-pointer text-[var(--fg-400)] hover:text-[var(--fg-100)]" title="Attach file">
            <Paperclip className="w-5 h-5" />
            <input type="file" multiple className="hidden" onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }} />
          </label>
          <textarea
            ref={taRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                trySend();
              }
            }}
            placeholder="Message Pocket…"
            className="flex-1 bg-transparent outline-none resize-none py-2 px-1 text-sm placeholder-[var(--fg-500)] max-h-[280px] text-[var(--fg-100)] leading-relaxed"
            rows={1}
          />
          {busy ? (
            <button onClick={onStop} className="p-2 rounded-full bg-[var(--bg-700)] hover:bg-[var(--bg-650)] text-[var(--fg-100)] elev-1" title="Stop">
              <StopCircle className="w-5 h-5" />
            </button>
          ) : (
            <button
              onClick={trySend}
              disabled={!text.trim() && !pending.length}
              className="p-2 rounded-full bg-gradient-to-br from-[var(--gold-bright)] to-[var(--gold-deep)] hover:from-[var(--gold-bright)] hover:to-[var(--gold)] disabled:opacity-30 disabled:cursor-not-allowed text-[var(--bg-950)] elev-1"
              title="Send (Enter)">
              <Send className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="flex items-center justify-between mt-1.5 px-1 text-[10px] text-[var(--fg-500)] min-h-[14px]">
          <div className="flex items-center gap-3">
            {focused && !text && (
              <span className="fade-in">
                <kbd className="px-1 py-px rounded bg-[var(--bg-800)] border border-[var(--bg-750)] font-mono mr-1">↵</kbd>send
                <kbd className="px-1 py-px rounded bg-[var(--bg-800)] border border-[var(--bg-750)] font-mono ml-2 mr-1">⇧↵</kbd>newline
              </span>
            )}
            {savings && savings.pct > 0 && (
              <span className="text-[var(--gold-bright)]">compress {compressMode}: −{savings.pct}%</span>
            )}
          </div>
          {charCount > 0 && <span className="font-mono">{charCount}</span>}
        </div>
      </div>
    </div>
  );
}
