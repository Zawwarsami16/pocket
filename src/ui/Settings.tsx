import { useEffect, useState } from 'react';
import { PROVIDERS, detectProvider, getProvider } from '../providers/registry';
import { getKeys, getActive, setActive, getSetting, setSetting } from '../db/keystore';
import { setKeyEncrypted as setKey, removeKeyEncrypted as removeKey, isVaultEnabled, setupVault, disableVault, lockVault } from '../db/vault';
import { getStoredTheme, setStoredTheme, type Theme } from './theme';
import type { ModelInfo } from '../providers/types';
import { listFacts, deleteFact } from '../db/facts';
import { clearAll, listSessions } from '../db/sessions';
import { db, type Session } from '../db/schema';
import { Eye, EyeOff, X } from './icons';
import type { CompressMode } from '../ai/compress';
import { getPresence, setPresence, DEFAULT_PRESENCE } from '../ai/presence';

interface Props {
  open: boolean;
  onClose: () => void;
  onApply: (providerId: string, modelId: string) => void;
}

export function Settings({ open, onClose, onApply }: Props) {
  const [tab, setTab] = useState<'keys' | 'presence' | 'memory' | 'threads' | 'tokens' | 'appearance' | 'data'>('keys');
  const [theme, setThemeLocal] = useState<Theme>('dark');
  const [vaultOn, setVaultOn] = useState(false);
  const [newPass, setNewPass] = useState('');
  const [presence, setPresenceText] = useState<string>(DEFAULT_PRESENCE);
  const [presenceDirty, setPresenceDirty] = useState(false);
  const [pasteKey, setPasteKey] = useState('');
  const [pasteBaseUrl, setPasteBaseUrl] = useState('');
  const [pickedProviderId, setPickedProviderId] = useState<string | null>(null);
  const [keys, setKeys] = useState<{ providerId: string; apiKey: string; baseUrl?: string }[]>([]);
  const [models, setModels] = useState<Record<string, ModelInfo[]>>({});
  const [active, setActiveLocal] = useState<{ providerId?: string; modelId?: string }>({});
  const [showKey, setShowKey] = useState(false);
  const [loadingModels, setLoadingModels] = useState<string | null>(null);
  const [compressMode, setCompressMode] = useState<CompressMode>('off');
  const [cacheSystem, setCacheSystem] = useState(true);
  const [keepLast, setKeepLast] = useState(16);
  const [crossSession, setCrossSession] = useState(true);
  const [facts, setFacts] = useState<any[]>([]);
  const [filter, setFilter] = useState('');
  const [allSessions, setAllSessions] = useState<Session[]>([]);
  const [sessionCounts, setSessionCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!open) return;
    (async () => {
      const [k, a, cm, cs, kl, xs] = await Promise.all([
        getKeys(),
        getActive(),
        getSetting<CompressMode>('compressMode', 'off'),
        getSetting<boolean>('cacheSystem', true),
        getSetting<number>('keepLast', 16),
        getSetting<boolean>('crossSession', true)
      ]);
      setKeys(k);
      setActiveLocal(a);
      setCompressMode(cm);
      setCacheSystem(cs);
      setKeepLast(kl);
      setCrossSession(xs);
      setThemeLocal(getStoredTheme());
      setVaultOn(await isVaultEnabled());
      setPresenceText(await getPresence());
      setPresenceDirty(false);
      setFacts(await listFacts());
      const ss = await listSessions();
      setAllSessions(ss);
      const counts: Record<string, number> = {};
      for (const s of ss) {
        counts[s.id] = await db.messages.where('sessionId').equals(s.id).count();
      }
      setSessionCounts(counts);
      for (const e of k) {
        const provider = getProvider(e.providerId);
        if (!provider) continue;
        provider.listModels(e.apiKey, e.baseUrl).then((ms) => setModels((m) => ({ ...m, [e.providerId]: ms })));
      }
    })();
  }, [open]);

  const detected = pasteKey ? detectProvider(pasteKey) : null;
  const inferredProvider = detected || (pickedProviderId ? getProvider(pickedProviderId) : null);

  async function addKey() {
    if (!pasteKey.trim() || !inferredProvider) return;
    setLoadingModels(inferredProvider.id);
    const baseUrl = pasteBaseUrl.trim() || undefined;
    await setKey({ providerId: inferredProvider.id, apiKey: pasteKey.trim(), baseUrl, addedAt: Date.now() });
    try {
      const ms = await inferredProvider.listModels(pasteKey.trim(), baseUrl);
      setModels((m) => ({ ...m, [inferredProvider.id]: ms }));
      if (!active.providerId && ms[0]) {
        await setActive(inferredProvider.id, ms[0].id);
        setActiveLocal({ providerId: inferredProvider.id, modelId: ms[0].id });
        onApply(inferredProvider.id, ms[0].id);
      }
    } catch (e) { console.error(e); }
    setKeys(await getKeys());
    setPasteKey('');
    setPasteBaseUrl('');
    setPickedProviderId(null);
    setLoadingModels(null);
  }

  async function pickModel(providerId: string, modelId: string) {
    await setActive(providerId, modelId);
    setActiveLocal({ providerId, modelId });
    onApply(providerId, modelId);
  }

  async function dropKey(providerId: string) {
    await removeKey(providerId);
    setKeys(await getKeys());
    setModels((m) => { const c = { ...m }; delete c[providerId]; return c; });
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 grid place-items-center p-4">
      <div className="bg-[var(--bg-900)] border border-[var(--bg-700)] rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--bg-800)]">
          <div className="font-semibold">Settings</div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-[var(--bg-800)] text-[var(--fg-300)]"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex border-b border-[var(--bg-800)] px-3 text-sm">
          {(['keys', 'presence', 'memory', 'threads', 'tokens', 'appearance', 'data'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-2 capitalize border-b-2 transition-colors ${tab === t ? 'border-[var(--gold)] text-[var(--fg-100)]' : 'border-transparent text-[var(--fg-400)] hover:text-[var(--fg-200)]'}`}>
              {t}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {tab === 'keys' && (
            <>
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-wider text-[var(--fg-400)]">Add a key</div>
                <div className="flex gap-2 items-stretch">
                  <div className="relative flex-1">
                    <input
                      type={showKey ? 'text' : 'password'}
                      placeholder="Paste API key (sk-ant-…, sk-or-…, gsk_…, etc.)"
                      value={pasteKey}
                      onChange={(e) => setPasteKey(e.target.value)}
                      className="w-full bg-[var(--bg-950)] border border-[var(--bg-700)] rounded-lg pl-3 pr-10 py-2 text-sm outline-none focus:border-[var(--bg-600)] font-mono"
                    />
                    <button type="button" onClick={() => setShowKey((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--fg-400)] hover:text-[var(--fg-100)] p-1">
                      {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <button onClick={addKey} disabled={!pasteKey.trim() || !inferredProvider || !!loadingModels}
                    className="px-4 rounded-lg bg-[var(--gold)] hover:bg-[var(--gold-bright)] text-[var(--bg-950)] disabled:opacity-30 text-sm font-medium transition-colors">
                    {loadingModels ? '…' : 'Add'}
                  </button>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {detected ? (
                    <span className="text-[var(--gold)]">Detected: <strong>{detected.label}</strong> · CORS {detected.corsStatus}</span>
                  ) : pasteKey.trim() ? (
                    <span className="text-[var(--fg-400)] flex items-center gap-1.5">
                      Couldn't auto-detect. Pick provider:
                      <select value={pickedProviderId || ''} onChange={(e) => setPickedProviderId(e.target.value || null)}
                        className="bg-[var(--bg-950)] border border-[var(--bg-700)] rounded px-1 py-0.5">
                        <option value="">—</option>
                        {PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                      </select>
                    </span>
                  ) : <span className="text-[var(--fg-500)]">Provider auto-detected from key prefix.</span>}
                </div>
                {(inferredProvider?.id === 'custom' || pickedProviderId === 'custom') && (
                  <input
                    placeholder="Base URL for custom provider (e.g. http://127.0.0.1:7780/v1)"
                    value={pasteBaseUrl}
                    onChange={(e) => setPasteBaseUrl(e.target.value)}
                    className="w-full bg-[var(--bg-950)] border border-[var(--bg-700)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--bg-600)] font-mono"
                  />
                )}
                {inferredProvider && (
                  <div className="text-xs text-[var(--fg-500)] italic">{inferredProvider.notes}</div>
                )}
              </div>

              <div>
                <div className="text-xs uppercase tracking-wider text-[var(--fg-400)] mb-2">Provider status</div>
                <div className="space-y-2">
                  {PROVIDERS.map((p) => {
                    const k = keys.find((x) => x.providerId === p.id);
                    const ms = models[p.id] || [];
                    const isActive = active.providerId === p.id;
                    return (
                      <div key={p.id} className={`border rounded-lg ${isActive ? 'border-[var(--gold-deep)]/40 bg-[var(--gold)]/5' : 'border-[var(--bg-800)]'}`}>
                        <div className="px-3 py-2 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              p.corsStatus === 'ok' ? 'bg-emerald-500' :
                              p.corsStatus === 'partial' ? 'bg-amber-500' : 'bg-red-500'
                            }`} />
                            <span className="text-sm font-medium">{p.label}</span>
                            <span className="text-[10px] uppercase text-[var(--fg-500)]">{p.corsStatus === 'blocked' ? 'CORS blocked' : p.corsStatus === 'partial' ? 'partial' : 'works'}</span>
                          </div>
                          {k ? (
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-[var(--fg-500)] font-mono">…{k.apiKey.slice(-6)}</span>
                              <button onClick={() => dropKey(p.id)} className="text-xs text-[var(--fg-400)] hover:text-red-400">remove</button>
                            </div>
                          ) : (
                            <span className="text-xs text-[var(--fg-500)]">no key</span>
                          )}
                        </div>
                        {k && ms.length > 0 && (
                          <div className="px-3 pb-3">
                            <div className="text-[10px] uppercase text-[var(--fg-500)] mb-1">Models</div>
                            <div className="flex flex-wrap gap-1">
                              {ms.slice(0, 60).map((m) => (
                                <button key={m.id}
                                  onClick={() => pickModel(p.id, m.id)}
                                  className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${
                                    isActive && active.modelId === m.id
                                      ? 'border-[var(--gold)] bg-[var(--gold)]/10 text-[var(--gold-bright)]'
                                      : 'border-[var(--bg-700)] hover:border-[var(--bg-600)] text-[var(--fg-300)]'
                                  }`}>
                                  {m.label || m.id}
                                </button>
                              ))}
                              {ms.length > 60 && <span className="text-[10px] text-[var(--fg-500)] self-center">+{ms.length - 60} more</span>}
                            </div>
                          </div>
                        )}
                        {p.corsStatus === 'blocked' && (
                          <div className="px-3 pb-2 text-[11px] text-amber-400/80">Tip: get an OpenRouter key — it gives you all OpenAI models from the same place.</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {tab === 'memory' && (
            <div className="space-y-3">
              <div className="text-xs text-[var(--fg-400)]">
                Pocket harvests <code>MEMORIZE: …</code> lines from the assistant's replies and stores them locally.
                Top facts are recalled into the system prompt on every turn.
              </div>
              <input
                placeholder="Filter facts…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="w-full bg-[var(--bg-950)] border border-[var(--bg-700)] rounded-lg px-3 py-2 text-sm outline-none"
              />
              <div className="space-y-1 max-h-96 overflow-y-auto">
                {facts.length === 0 && <div className="text-sm text-[var(--fg-500)] italic">No memories yet.</div>}
                {facts
                  .filter((f) => !filter || f.text.toLowerCase().includes(filter.toLowerCase()))
                  .map((f) => (
                  <div key={f.id} className="group flex items-start gap-2 px-3 py-2 bg-[var(--bg-950)] border border-[var(--bg-800)] rounded-lg text-sm">
                    <div className="flex-1">
                      <div>{f.text}</div>
                      <div className="text-[10px] text-[var(--fg-500)] mt-0.5">recalled {f.hits}× · {new Date(f.createdAt).toLocaleDateString()}</div>
                    </div>
                    <button onClick={async () => { await deleteFact(f.id); setFacts(await listFacts()); }}
                      className="opacity-0 group-hover:opacity-100 text-[var(--fg-400)] hover:text-red-400">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'presence' && (
            <div className="space-y-3">
              <div className="text-xs text-[var(--fg-400)]">
                Presence is how Pocket carries itself — its posture, voice, and continuity rules across every model you plug in.
                It's what gets sent first in every system prompt, before the live awareness block and before recalled memory.
              </div>
              <textarea
                value={presence}
                onChange={(e) => { setPresenceText(e.target.value); setPresenceDirty(true); }}
                rows={20}
                className="w-full bg-[var(--bg-950)] border border-[var(--bg-700)] rounded-lg px-3 py-2 text-xs font-mono outline-none focus:border-[var(--bg-600)] leading-relaxed"
              />
              <div className="flex items-center justify-between">
                <button
                  onClick={() => { setPresenceText(DEFAULT_PRESENCE); setPresenceDirty(true); }}
                  className="text-xs text-[var(--fg-400)] hover:text-[var(--fg-200)]">
                  reset to default
                </button>
                <button
                  onClick={async () => { await setPresence(presence); setPresenceDirty(false); }}
                  disabled={!presenceDirty}
                  className="px-3 py-1.5 rounded-lg bg-[var(--gold)] text-[var(--bg-950)] disabled:opacity-30 text-xs font-medium hover:bg-[var(--gold-bright)] transition-colors">
                  {presenceDirty ? 'save presence' : 'saved'}
                </button>
              </div>
            </div>
          )}

          {tab === 'threads' && (
            <div className="space-y-3">
              <div className="text-xs text-[var(--fg-400)]">
                Cross-session memory: when you message any model, Pocket scans every chat in this browser for relevant snippets and includes them as context. So whichever provider/model you switch to, it walks in knowing what you've talked about before.
              </div>
              <Field label="Cross-session recall" hint="Pull relevant snippets from other chats into the system prompt every turn.">
                <input type="checkbox" checked={crossSession}
                  onChange={async (e) => { setCrossSession(e.target.checked); await setSetting('crossSession', e.target.checked); }}
                  className="w-4 h-4 accent-[var(--gold)]" />
              </Field>
              <div className="text-xs uppercase tracking-wider text-[var(--fg-400)] pt-2">All chats stored locally</div>
              <div className="space-y-1 max-h-80 overflow-y-auto">
                {allSessions.length === 0 && <div className="text-sm text-[var(--fg-500)] italic">No chats yet.</div>}
                {allSessions.map((s) => (
                  <div key={s.id} className="flex items-center justify-between px-3 py-2 bg-[var(--bg-950)] border border-[var(--bg-800)] rounded-lg text-sm">
                    <div className="flex-1 min-w-0">
                      <div className="truncate">{s.title}</div>
                      <div className="text-[10px] text-[var(--fg-500)] mt-0.5">
                        {sessionCounts[s.id] || 0} msg · {s.providerId}/{s.modelId.slice(0, 30)} · {new Date(s.updatedAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'tokens' && (
            <div className="space-y-4">
              <Field label="Compression mode" hint="Heuristic compressor on user prompts. light = stopwords, aggressive = stopwords + abbreviations.">
                <select value={compressMode} onChange={async (e) => { const v = e.target.value as CompressMode; setCompressMode(v); await setSetting('compressMode', v); }}
                  className="bg-[var(--bg-950)] border border-[var(--bg-700)] rounded px-2 py-1 text-sm">
                  <option value="off">off</option>
                  <option value="light">light (~10-15%)</option>
                  <option value="aggressive">aggressive (~25-35%)</option>
                </select>
              </Field>
              <Field label="System prompt caching" hint="Anthropic only. Cuts cost on repeated context ~90%.">
                <input type="checkbox" checked={cacheSystem} onChange={async (e) => { setCacheSystem(e.target.checked); await setSetting('cacheSystem', e.target.checked); }}
                  className="w-4 h-4 accent-[var(--gold)]" />
              </Field>
              <Field label="Keep last N turns full" hint="Older turns get compacted into a summary block.">
                <input type="number" min={4} max={64} value={keepLast}
                  onChange={async (e) => { const v = Math.max(4, Math.min(64, +e.target.value || 16)); setKeepLast(v); await setSetting('keepLast', v); }}
                  className="bg-[var(--bg-950)] border border-[var(--bg-700)] rounded px-2 py-1 text-sm w-20" />
              </Field>
            </div>
          )}

          {tab === 'appearance' && (
            <div className="space-y-4">
              <Field label="Theme" hint="System follows your OS preference.">
                <select value={theme} onChange={(e) => { const v = e.target.value as Theme; setThemeLocal(v); setStoredTheme(v); }}
                  className="bg-[var(--bg-950)] border border-[var(--bg-700)] rounded px-2 py-1 text-sm">
                  <option value="dark">dark</option>
                  <option value="light">light</option>
                  <option value="system">system</option>
                </select>
              </Field>
              <Field label="Encrypt API keys at rest" hint="PBKDF2 + AES-GCM. You'll be prompted for the passphrase on each browser session.">
                <input type="checkbox" checked={vaultOn}
                  onChange={async (e) => {
                    if (e.target.checked) {
                      const p = prompt('Set a passphrase to encrypt your stored keys (cannot be recovered if forgotten):') || '';
                      if (p.length < 6) { alert('Passphrase must be at least 6 characters.'); return; }
                      await setupVault(p);
                      setVaultOn(true);
                    } else {
                      if (!confirm('Disable encryption? Keys will be stored as plaintext in IndexedDB again.')) return;
                      await disableVault();
                      setVaultOn(false);
                    }
                  }}
                  className="w-4 h-4 accent-[var(--gold)]" />
              </Field>
              {vaultOn && (
                <div className="flex items-center gap-2">
                  <input type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} placeholder="new passphrase to rotate"
                    className="flex-1 bg-[var(--bg-950)] border border-[var(--bg-700)] rounded px-2 py-1 text-xs font-mono" />
                  <button disabled={newPass.length < 6}
                    onClick={async () => { await setupVault(newPass); setNewPass(''); alert('Passphrase rotated.'); }}
                    className="px-3 py-1 rounded bg-[var(--bg-800)] hover:bg-[var(--bg-700)] text-xs disabled:opacity-30">rotate</button>
                  <button onClick={() => { lockVault(); alert('Vault locked. Refresh to unlock.'); }}
                    className="px-3 py-1 rounded bg-[var(--bg-800)] hover:bg-[var(--bg-700)] text-xs">lock now</button>
                </div>
              )}
              <div className="text-[11px] text-[var(--fg-500)] pt-2 border-t border-[var(--bg-800)]">
                Pocket also installs as a PWA — on mobile use "Add to home screen", on desktop click the install icon in your browser's URL bar.
              </div>
            </div>
          )}

          {tab === 'data' && (
            <div className="space-y-3">
              <div className="text-sm text-[var(--fg-300)]">
                Everything Pocket knows lives in this browser's IndexedDB and localStorage. Clearing browser data wipes it. No copies on any server.
              </div>
              <button onClick={async () => {
                if (!confirm('Wipe all chats, attachments, and memory? This cannot be undone.')) return;
                await clearAll();
                location.reload();
              }} className="text-sm px-3 py-2 rounded-lg bg-red-950/40 border border-red-900/40 text-red-300 hover:bg-red-950/60">
                Wipe all local data
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="text-sm">{label}</div>
        {hint && <div className="text-[11px] text-[var(--fg-500)] mt-0.5">{hint}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}
