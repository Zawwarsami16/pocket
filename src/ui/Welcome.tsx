interface Props {
  onAddKey: () => void;
}

export function Welcome({ onAddKey }: Props) {
  return (
    <div className="flex-1 grid place-items-center px-6 relative overflow-hidden">
      <div
        className="absolute inset-0 pointer-events-none opacity-30"
        style={{
          background: 'radial-gradient(ellipse 50% 40% at 50% 30%, var(--gold-mute), transparent 70%)'
        }}
      />
      <div className="max-w-md text-center relative fade-in-up">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[var(--bg-800)] to-[var(--bg-925)] text-3xl font-semibold mb-6 ring-soft elev-2">
          <span className="gold-text-gradient">P</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight mb-3 text-[var(--fg-100)]">
          <span className="gold-text-gradient">Pocket</span>
        </h1>
        <p className="text-sm text-[var(--fg-300)] leading-relaxed mb-8 max-w-sm mx-auto">
          One key. Any model. Browser-only AI chat that remembers you across every conversation, without a server holding any of it.
        </p>
        <div className="grid gap-2.5 text-left mb-8 text-sm">
          <Bullet>One key, any model. Auto-detected from prefix.</Bullet>
          <Bullet>Cross-session memory. Switch models, keep continuity.</Bullet>
          <Bullet>No server. No account. Clear browser data → forgotten.</Bullet>
        </div>
        <button onClick={onAddKey}
          className="px-5 py-2.5 rounded-lg bg-gradient-to-br from-[var(--gold-bright)] to-[var(--gold-deep)] text-[var(--bg-950)] text-sm font-medium elev-2 hover:elev-3">
          Add your first key
        </button>
        <div className="text-[11px] text-[var(--fg-500)] mt-5">
          Press <kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-800)] border border-[var(--bg-750)] font-mono">⌘K</kbd> any time to search.
        </div>
      </div>
    </div>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-1 h-1 rounded-full bg-[var(--gold)] mt-2.5 shrink-0" />
      <span className="text-[var(--fg-200)]">{children}</span>
    </div>
  );
}
