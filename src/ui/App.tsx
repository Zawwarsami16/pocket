import { useEffect, useRef, useState, useCallback } from 'react';
import { Sidebar } from './Sidebar';
import { Thread } from './Thread';
import { Composer } from './Composer';
import { Settings } from './Settings';
import { AwarenessHud } from './AwarenessHud';
import { CommandPalette } from './CommandPalette';
import { Welcome } from './Welcome';
import { Toasts, type Toast } from './Toasts';
import { getActive, getSetting } from '../db/keystore';
import { getProvider } from '../providers/registry';
import { sendTurn } from '../ai/chat';
import { db } from '../db/schema';
import { setSessionModel } from '../db/sessions';
import type { CompressMode } from '../ai/compress';
import { useLiveQuery } from 'dexie-react-hooks';
import { initTheme } from './theme';
import { listMessages } from '../db/messages';
import { maybeGenerateDailyReflection, formatReflection } from '../ai/reflect';
import { isVaultEnabled, isLocked, unlockVault } from '../db/vault';

export default function App() {
  const [activeId, setActiveId] = useState<string>('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [defaultProvider, setDefaultProvider] = useState<string | undefined>();
  const [defaultModel, setDefaultModel] = useState<string | undefined>();
  const [compressMode, setCompressMode] = useState<CompressMode>('off');
  const [cacheSystem, setCacheSystem] = useState(true);
  const [keepLast, setKeepLast] = useState(16);
  const [crossSession, setCrossSession] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [lastUserText, setLastUserText] = useState<string>('');
  const abortRef = useRef<AbortController | null>(null);

  const session = useLiveQuery(async () => {
    if (!activeId) return undefined;
    return db.sessions.get(activeId);
  }, [activeId]);

  const pushToast = useCallback((kind: Toast['kind'], text: string) => {
    setToasts((arr) => [...arr, { id: crypto.randomUUID?.() ?? String(Date.now() + Math.random()), kind, text }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((arr) => arr.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    initTheme();
    (async () => {
      if (await isVaultEnabled() && await isLocked()) {
        let attempts = 0;
        while (await isLocked() && attempts < 5) {
          const p = prompt('Pocket is locked. Enter passphrase:') || '';
          if (!p) break;
          try { await unlockVault(p); } catch { attempts++; }
        }
      }
      const a = await getActive();
      if (a.providerId) setDefaultProvider(a.providerId);
      if (a.modelId) setDefaultModel(a.modelId);
      setCompressMode(await getSetting<CompressMode>('compressMode', 'off'));
      setCacheSystem(await getSetting<boolean>('cacheSystem', true));
      setKeepLast(await getSetting<number>('keepLast', 16));
      setCrossSession(await getSetting<boolean>('crossSession', true));
      const sessions = await db.sessions.orderBy('updatedAt').reverse().toArray();
      if (sessions[0]) setActiveId(sessions[0].id);
      else if (!a.providerId) setSettingsOpen(true);

      const refl = await maybeGenerateDailyReflection();
      if (refl) pushToast('info', `Daily reflection · ${formatReflection(refl)}`);
    })();
  }, [pushToast]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isCmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k';
      if (isCmdK) { e.preventDefault(); setPaletteOpen((v) => !v); }
      const isNew = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n' && e.shiftKey;
      if (isNew) {
        e.preventDefault();
        if (defaultProvider && defaultModel) {
          import('../db/sessions').then(({ createSession }) =>
            createSession({ providerId: defaultProvider, modelId: defaultModel }).then((s) => setActiveId(s.id))
          );
        } else setSettingsOpen(true);
      }
      if (e.key === '/' && !(e.target as HTMLElement)?.matches?.('input,textarea')) {
        e.preventDefault();
        setPaletteOpen(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [defaultProvider, defaultModel]);

  async function send(text: string, attachmentIds: string[]) {
    if (!session) return;
    const provider = getProvider(session.providerId);
    if (!provider) { setSettingsOpen(true); return; }
    setBusy(true);
    setLastUserText(text);
    abortRef.current = new AbortController();

    if (session.title === 'New chat') {
      const newTitle = text.slice(0, 48).replace(/\s+/g, ' ').trim() || 'New chat';
      await db.sessions.update(session.id, { title: newTitle });
    }

    await sendTurn(session, text, attachmentIds, {
      onError: (e) => { console.error('chat error:', e); pushToast('error', e); },
      onDone: () => { setBusy(false); abortRef.current = null; },
      onMemorySaved: (n) => pushToast('success', `+${n} remembered`)
    }, {
      compressMode,
      cacheSystem,
      keepLast,
      crossSessionRecall: crossSession,
      signal: abortRef.current.signal
    });
  }

  function stop() {
    abortRef.current?.abort();
    setBusy(false);
  }

  async function regenerateFrom(_userMessageId: string) {
    if (!session) return;
    const msgs = await listMessages(session.id);
    const lastUser = [...msgs].reverse().find((m) => m.role === 'user');
    if (!lastUser) return;
    const { deleteFrom } = await import('../db/messages');
    await deleteFrom(lastUser.id);
    await send(lastUser.content, lastUser.attachmentIds || []);
  }

  async function applySettings(providerId: string, modelId: string) {
    setDefaultProvider(providerId);
    setDefaultModel(modelId);
    if (session && (session.providerId !== providerId || session.modelId !== modelId)) {
      await setSessionModel(session.id, providerId, modelId);
    }
  }

  return (
    <div className="flex h-full bg-[var(--bg-950)]">
      <Sidebar
        activeId={activeId}
        onSelect={setActiveId}
        onSettings={() => setSettingsOpen(true)}
        onCommandPalette={() => setPaletteOpen(true)}
        defaultProvider={defaultProvider}
        defaultModel={defaultModel}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="flex-1 flex flex-col min-w-0">
        {session ? (
          <>
            <header className="border-b border-[var(--bg-800)] glass px-3 md:px-5 py-2.5 flex items-center gap-3 text-sm pt-safe">
              <button onClick={() => setSidebarOpen(true)} className="md:hidden p-1.5 rounded hover:bg-[var(--bg-800)] text-[var(--fg-300)]" title="Menu">
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
              </button>
              <div className="truncate font-medium flex-1 text-[var(--fg-100)] tracking-tight">{session.title}</div>
              <ModelChip session={session} onClick={() => setSettingsOpen(true)} />
            </header>
            <AwarenessHud sessionId={session.id} lastUserText={lastUserText} />
            <Thread sessionId={session.id} onRegenerate={regenerateFrom} />
            <Composer sessionId={session.id} busy={busy} onSend={send} onStop={stop} compressMode={compressMode} />
          </>
        ) : (
          <Welcome onAddKey={() => setSettingsOpen(true)} />
        )}
      </div>
      <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)} onApply={applySettings} />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onSelectSession={(id) => setActiveId(id)}
        onOpenSettings={() => setSettingsOpen(true)}
        defaultProvider={defaultProvider}
        defaultModel={defaultModel}
      />
      <Toasts toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

function ModelChip({ session, onClick }: { session: any; onClick: () => void }) {
  const provider = getProvider(session.providerId);
  return (
    <button onClick={onClick}
      className="text-xs text-[var(--fg-300)] hover:text-[var(--fg-100)] bg-[var(--bg-850)] hover:bg-[var(--bg-800)] border border-[var(--bg-750)] hover:border-[var(--bg-700)] px-2.5 py-1 rounded-md font-mono max-w-[55vw] truncate flex items-center gap-1.5">
      <span className="w-1.5 h-1.5 rounded-full bg-[var(--gold)]" />
      <span className="hidden sm:inline text-[var(--fg-500)]">{provider?.label || session.providerId} ·</span>
      <span>{session.modelId}</span>
    </button>
  );
}
