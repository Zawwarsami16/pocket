import type { ChatTurn } from '../providers/types';
import { getProvider } from '../providers/registry';
import { listMessages, appendMessage, updateMessage } from '../db/messages';
import { getAttachments, blobToBase64 } from '../db/attachments';
import { getKey } from '../db/keystore';
import { compress, type CompressMode } from './compress';
import { applyWindow } from './window';
import { harvestAndStore, awarenessBlock } from './memory';
import { estimateMessagesTokens } from './tokens';
import type { Session } from '../db/schema';

const DEFAULT_SYSTEM = `You are Pocket — a fast, plain-spoken assistant. Reply directly. No preamble, no closers.

If the user shares something worth remembering across sessions (preferences, facts, projects, names, recurring patterns), end your reply with one or more lines like:
  MEMORIZE: <short fact>
These lines are stripped from the user-visible reply and saved to a local fact store.`;

export interface ChatHandlers {
  onDelta?: (text: string) => void;
  onUsage?: (inTok: number, outTok: number) => void;
  onError?: (err: string) => void;
  onDone?: () => void;
}

export interface SendOpts {
  compressMode?: CompressMode;
  maxInputTokens?: number;
  keepLast?: number;
  cacheSystem?: boolean;
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

  const recall = await awarenessBlock(userText);
  const baseSys = (session.systemPrompt?.trim() || DEFAULT_SYSTEM);
  const system = recall ? `${baseSys}\n\n${recall}` : baseSys;

  const inputEst = estimateMessagesTokens(windowed.messages.map((t) => ({ role: t.role, content: t.parts.map((p) => p.text || '').join(' ') })));

  let buffer = '';
  let inTok = 0, outTok = 0;
  let errored = false;

  try {
    for await (const chunk of provider.chat(
      {
        modelId: session.modelId,
        system,
        messages: windowed.messages,
        cacheSystem: opts.cacheSystem ?? true
      },
      keyEntry.apiKey,
      keyEntry.baseUrl,
      opts.signal
    )) {
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
    if (e?.name === 'AbortError') {
      await updateMessage(placeholder.id, { content: buffer + '\n\n_[stopped]_' });
    } else {
      errored = true;
      handlers.onError?.(e?.message || String(e));
      await updateMessage(placeholder.id, { error: e?.message || String(e) });
    }
  }

  if (!errored) {
    const { cleaned } = await harvestAndStore(buffer, session.id);
    await updateMessage(placeholder.id, {
      content: cleaned,
      tokensIn: inTok || inputEst,
      tokensOut: outTok
    });
  }

  handlers.onDone?.();
}
