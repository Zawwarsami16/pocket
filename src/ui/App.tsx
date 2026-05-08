import { useEffect, useRef, useState } from 'react';
import { Sidebar } from './Sidebar';
import { Thread } from './Thread';
import { Composer } from './Composer';
import { Settings } from './Settings';
import { getActive, getSetting } from '../db/keystore';
import { getProvider } from '../providers/registry';
import { sendTurn } from '../ai/chat';
import { db } from '../db/schema';
import { setSessionModel } from '../db/sessions';
import type { CompressMode } from '../ai/compress';
import { useLiveQuery } from 'dexie-react-hooks';

export default function App() {
  const [activeId, setActiveId] = useState<string>('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [defaultProvider, setDefaultProvider] = useState<string | undefined>();
  const [defaultModel, setDefaultModel] = useState<string | undefined>();
  const [compressMode, setCompressMode] = useState<CompressMode>('off');
  const [cacheSystem, setCacheSystem] = useState(true);
  const [keepLast, setKeepLast] = useState(16);
  const [crossSession, setCrossSession] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const session = useLiveQuery(async () => {
    if (!activeId) return undefined;
    return db.sessions.get(activeId);
  }, [activeId]);

  useEffect(() => {
    (async () => {
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
    })();
  }, []);

  async function send(text: string, attachmentIds: string[]) {
    if (!session) return;
    const provider = getProvider(session.providerId);
    if (!provider) { setSettingsOpen(true); return; }
    setBusy(true);
    abortRef.current = new AbortController();

    if (session.title === 'New chat') {
      const newTitle = text.slice(0, 48).replace(/\s+/g, ' ').trim() || 'New chat';
      await db.sessions.update(session.id, { title: newTitle });
    }

    await sendTurn(session, text, attachmentIds, {
      onError: (e) => { console.error('chat error:', e); setToast(e); },
      onDone: () => { setBusy(false); abortRef.current = null; }
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

  async function applySettings(providerId: string, modelId: string) {
    setDefaultProvider(providerId);
    setDefaultModel(modelId);
    if (session && (session.providerId !== providerId || session.modelId !== modelId)) {
      await setSessionModel(session.id, providerId, modelId);
    }
  }

  return (
    <div className="flex h-full">
      <Sidebar activeId={activeId} onSelect={setActiveId} onSettings={() => setSettingsOpen(true)}
        defaultProvider={defaultProvider} defaultModel={defaultModel} />
      <div className="flex-1 flex flex-col min-w-0">
        {session ? (
          <>
            <header className="border-b border-ink-800 px-4 py-2.5 flex items-center justify-between text-sm">
              <div className="truncate font-medium">{session.title}</div>
              <ModelChip session={session} onClick={() => setSettingsOpen(true)} />
            </header>
            <Thread sessionId={session.id} />
            <Composer sessionId={session.id} busy={busy} onSend={send} onStop={stop} compressMode={compressMode} />
          </>
        ) : (
          <div className="flex-1 grid place-items-center text-center">
            <div>
              <div className="text-4xl text-gold-500 mb-3">Pocket</div>
              <div className="text-sm text-ink-400 mb-6 max-w-sm">Browser-only AI chat. Drop in a key, pick a model, talk.</div>
              <button onClick={() => setSettingsOpen(true)}
                className="px-4 py-2 rounded-lg bg-gold-500 text-ink-950 hover:bg-gold-400 text-sm font-medium">
                Add an API key
              </button>
            </div>
          </div>
        )}
      </div>
      <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)} onApply={applySettings} />
      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 max-w-2xl bg-red-950/90 border border-red-900 text-red-200 text-xs px-4 py-2.5 rounded-lg shadow-2xl backdrop-blur z-50 flex items-start gap-3">
          <span className="font-semibold text-red-300 shrink-0">⚠</span>
          <span className="flex-1 break-words font-mono">{toast}</span>
          <button onClick={() => setToast(null)} className="text-red-300 hover:text-red-100 shrink-0">×</button>
        </div>
      )}
    </div>
  );
}

function ModelChip({ session, onClick }: { session: any; onClick: () => void }) {
  const provider = getProvider(session.providerId);
  return (
    <button onClick={onClick} className="text-xs text-ink-400 hover:text-ink-200 bg-ink-800 hover:bg-ink-700 px-2.5 py-1 rounded-md font-mono">
      {provider?.label || session.providerId} · {session.modelId}
    </button>
  );
}
