interface Props {
  onAddKey: () => void;
}

export function Welcome({ onAddKey }: Props) {
  return (
    <div className="flex-1 grid place-items-center px-6 fade-in-up">
      <div className="max-w-md text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[var(--bg-800)] text-[var(--gold)] text-3xl font-semibold mb-6">P</div>
        <h1 className="text-3xl font-semibold tracking-tight mb-3 text-[var(--fg-100)]">Pocket</h1>
        <p className="text-sm text-[var(--fg-300)] leading-relaxed mb-8">
          Browser-only AI chat. Drop in any provider's key —
          Anthropic, OpenRouter, Groq, Together, or a custom endpoint —
          and Pocket auto-detects the provider, loads its models,
          and keeps every chat, file, and remembered fact on this device alone.
        </p>
        <div className="grid gap-3 text-left mb-8 text-sm">
          <Bullet>One key, any model. Detection is automatic.</Bullet>
          <Bullet>Cross-session memory: switch models, keep continuity.</Bullet>
          <Bullet>No server, no account. Clear browser data → Pocket forgets you.</Bullet>
        </div>
        <button onClick={onAddKey}
          className="px-5 py-2.5 rounded-lg bg-[var(--gold)] text-[var(--bg-950)] hover:bg-[var(--gold-bright)] text-sm font-medium transition-colors">
          Add your first key
        </button>
        <div className="text-[11px] text-[var(--fg-500)] mt-4">
          Press <kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-800)] border border-[var(--bg-700)] font-mono">⌘K</kbd> any time to search.
        </div>
      </div>
    </div>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-1.5 h-1.5 rounded-full bg-[var(--gold)] mt-2 shrink-0" />
      <span className="text-[var(--fg-200)]">{children}</span>
    </div>
  );
}
