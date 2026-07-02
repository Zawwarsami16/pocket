import type { ChatTurn } from '../providers/types';
import { getProvider } from '../providers/registry';
import { listMessages, appendMessage, updateMessage } from '../db/messages';
import { getAttachments, blobToBase64 } from '../db/attachments';
import { getKey } from '../db/keystore';
import { compress, type CompressMode } from './compress';
import { applyWindow } from './window';
import { harvestAndStore, awarenessBlock } from './memory';
import { estimateMessagesTokens } from './tokens';
import { getPresence } from './presence';
import { snapshotEntity, composeAwarenessForPrompt } from './entity';
import type { Session } from '../db/schema';

function anySignal(signals: AbortSignal[]): AbortSignal {
  if (typeof (AbortSignal as any).any === 'function') return (AbortSignal as any).any(signals);
  const ctrl = new AbortController();
  for (const s of signals) {
    if (s.aborted) { ctrl.abort((s as any).reason); break; }
    s.addEventListener('abort', () => ctrl.abort((s as any).reason), { once: true });
  }
  return ctrl.signal;
}


export interface ChatHandlers {
  onDelta?: (text: string) => void;
  onUsage?: (inTok: number, outTok: number) => void;
  onError?: (err: string) => void;
  onDone?: () => void;
  onMemorySaved?: (count: number) => void;
}

export interface SendOpts {
  compressMode?: CompressMode;
  maxInputTokens?: number;
  keepLast?: number;
  cacheSystem?: boolean;
  crossSessionRecall?: boolean;
  signal?: AbortSignal;
}

async function buildTurnsFromHistory(sessionId: string): Promise<ChatTurn[]> {
  const msgs = await listMessages(sessionId);
  const out: ChatTurn[] = [];
  for (const m of msgs) {
    if (m.role === 'system') continue;
    const parts: ChatTurn['parts'] = [{ kind: 'text', text: m.content }];
    if (m.attachmentIds?.length) {
      const atts = await getAttachments(m.attachmentIds);
      for (const a of atts) {
        if (a.kind === 'image') {
          const b64 = await blobToBase64(a.blob);
          parts.unshift({ kind: 'image', mime: a.mime, base64: b64, name: a.name });
        } else if (a.kind === 'pdf') {
          const b64 = await blobToBase64(a.blob);
          parts.unshift({ kind: 'pdf', base64: b64, name: a.name });
        } else if (a.kind === 'text') {
          const text = await a.blob.text();
          parts.push({ kind: 'text', text: `\n\n--- ${a.name} ---\n${text.slice(0, 60_000)}` });
        }
      }
    }
    out.push({ role: m.role as 'user' | 'assistant', parts });
  }
  return out;
}

export async function sendTurn(session: Session, userText: string, attachmentIds: string[], handlers: ChatHandlers, opts: SendOpts = {}) {
  const provider = getProvider(session.providerId);
  if (!provider) { handlers.onError?.(`Unknown provider: ${session.providerId}`); return; }
  const keyEntry = await getKey(session.providerId);
  if (!keyEntry?.apiKey) { handlers.onError?.(`No API key set for ${provider.label}.`); return; }

  const compressed = compress(userText, opts.compressMode ?? 'off');

  await appendMessage(session.id, 'user', compressed, { attachmentIds, modelId: session.modelId });
  const placeholder = await appendMessage(session.id, 'assistant', '', { modelId: session.modelId });

  const turns = await buildTurnsFromHistory(session.id);
  const windowed = applyWindow(turns.slice(0, -1), {
    maxInputTokens: opts.maxInputTokens ?? 80_000,
    keepLast: opts.keepLast ?? 16
  });

  // When windowing fired, the first message is a synthetic role='system' summary of
  // the compacted head. Neither chatOAI nor anthropic.chat includes role='system'
  // items from req.messages (they only use req.system), so the summary would be
  // silently dropped. Fold it into the system prompt and pass only the tail turns
  // (non-system) to the provider so the model actually sees the compacted context.
  const compactedCtx: string | null =
    windowed.summarizedCount > 0 && windowed.messages[0]?.role === 'system'
      ? (windowed.messages[0].parts[0]?.text ?? null)
      : null;
  const providerMessages = compactedCtx ? windowed.messages.slice(1) : windowed.messages;

  const [presence, entitySnap, recall] = await Promise.all([
    getPresence(),
    snapshotEntity(session.id),
    awarenessBlock(userText, {
      crossSessionRecall: opts.crossSessionRecall ?? true,
      excludeSessionId: session.id
    })
  ]);
  const entityBlock = composeAwarenessForPrompt(entitySnap);
  const baseSys = session.systemPrompt?.trim() || presence;
  const parts = [baseSys, entityBlock];
  if (recall) parts.push(recall);
  if (compactedCtx) parts.push(compactedCtx);
  const system = parts.join('\n\n');

  const inputEst = estimateMessagesTokens(providerMessages.map((t) => ({ role: t.role, content: t.parts.map((p) => p.text || '').join(' ') })));

  let buffer = '';
  let inTok = 0, outTok = 0;
  let errored = false;
  let stopped = false;

  const watchdog = new AbortController();
  const linkedSignal = opts.signal
    ? anySignal([opts.signal, watchdog.signal])
    : watchdog.signal;
  let stalledTimer: ReturnType<typeof setTimeout> | null = null;
  const resetStall = () => {
    if (stalledTimer) clearTimeout(stalledTimer);
    stalledTimer = setTimeout(() => watchdog.abort(new Error('Response stalled (no chunks for 90s).')), 90_000);
  };
  resetStall();

  try {
    for await (const chunk of provider.chat(
      {
        modelId: session.modelId,
        system,
        messages: providerMessages,
        cacheSystem: opts.cacheSystem ?? true
      },
      keyEntry.apiKey,
      keyEntry.baseUrl,
      linkedSignal
    )) {
      resetStall();
      if (chunk.type === 'delta' && chunk.text) {
        buffer += chunk.text;
        handlers.onDelta?.(chunk.text);
        await updateMessage(placeholder.id, { content: buffer });
      } else if (chunk.type === 'usage') {
        inTok = chunk.inTokens || inputEst;
        outTok = chunk.outTokens || 0;
        handlers.onUsage?.(inTok, outTok);
      } else if (chunk.type === 'error') {
        errored = true;
        handlers.onError?.(chunk.error || 'unknown error');
        await updateMessage(placeholder.id, { error: chunk.error });
      }
    }
  } catch (e: any) {
    if (stalledTimer) clearTimeout(stalledTimer);
    if (e?.name === 'AbortError') {
      if (watchdog.signal.aborted) {
        errored = true;
        const reason = 'Response stalled (no chunks for 90s).';
        handlers.onError?.(reason);
        await updateMessage(placeholder.id, { error: reason });
      } else {
        stopped = true;
      }
    } else {
      errored = true;
      handlers.onError?.(e?.message || String(e));
      await updateMessage(placeholder.id, { error: e?.message || String(e) });
    }
  }
  if (stalledTimer) clearTimeout(stalledTimer);

  if (!errored) {
    const { cleaned, saved } = await harvestAndStore(buffer, session.id);
    await updateMessage(placeholder.id, {
      content: stopped ? cleaned + '\n\n_[stopped]_' : cleaned,
      tokensIn: inTok || inputEst,
      tokensOut: outTok
    });
    if (saved > 0) handlers.onMemorySaved?.(saved);
  }

  handlers.onDone?.();
}
