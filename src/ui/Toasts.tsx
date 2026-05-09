import { useEffect, useState } from 'react';

export interface Toast {
  id: string;
  kind: 'error' | 'success' | 'info';
  text: string;
}

interface Props {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}

export function Toasts({ toasts, onDismiss }: Props) {
  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 max-w-sm pointer-events-none">
      {toasts.map((t) => <Item key={t.id} toast={t} onDismiss={onDismiss} />)}
    </div>
  );
}

function Item({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  useEffect(() => {
    if (toast.kind === 'error') return;
    const t = setTimeout(() => onDismiss(toast.id), 3500);
    return () => clearTimeout(t);
  }, [toast.id, toast.kind, onDismiss]);

  const styles = toast.kind === 'error'
    ? 'bg-red-950/85 border-red-900/50 text-red-200'
    : toast.kind === 'success'
    ? 'bg-emerald-950/85 border-emerald-900/50 text-emerald-100'
    : 'glass-strong border-[var(--bg-700)] text-[var(--fg-200)]';

  const icon = toast.kind === 'error' ? '⚠' : toast.kind === 'success' ? '✦' : '◌';

  return (
    <div className={`pointer-events-auto px-3.5 py-2.5 rounded-lg border elev-3 text-xs flex items-start gap-2.5 slide-in-right ${styles}`}>
      <span className="shrink-0 text-[13px] leading-tight pt-px">{icon}</span>
      <span className="flex-1 break-words leading-snug">{toast.text}</span>
      <button onClick={() => onDismiss(toast.id)} className="shrink-0 opacity-50 hover:opacity-100 -mr-1 p-0.5 leading-none">×</button>
    </div>
  );
}
