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
    ? 'bg-red-950/90 border-red-900/60 text-red-200'
    : toast.kind === 'success'
    ? 'bg-emerald-950/90 border-emerald-900/60 text-emerald-200'
    : 'bg-[var(--bg-900)] border-[var(--bg-700)] text-[var(--fg-200)]';

  return (
    <div className={`pointer-events-auto px-4 py-2.5 rounded-lg border backdrop-blur shadow-2xl text-xs flex items-start gap-2 slide-in-right ${styles}`}>
      <span className="shrink-0">{toast.kind === 'error' ? '⚠' : toast.kind === 'success' ? '✦' : 'ℹ'}</span>
      <span className="flex-1 break-words font-mono">{toast.text}</span>
      <button onClick={() => onDismiss(toast.id)} className="shrink-0 opacity-70 hover:opacity-100">×</button>
    </div>
  );
}
