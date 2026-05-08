import type { Provider, ChatRequest, ChatChunk, ChatTurn, ModelInfo } from './types';
import { sseEvents } from '../ai/stream';

const DEFAULT_BASE = 'https://api.anthropic.com';
const VERSION = '2023-06-01';

const STATIC_MODELS: ModelInfo[] = [
  { id: 'claude-opus-4-7', label: 'Claude Opus 4.7', contextWindow: 200_000, vision: true, supportsPdf: true },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', contextWindow: 200_000, vision: true, supportsPdf: true },
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', contextWindow: 200_000, vision: true, supportsPdf: true },
  { id: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5', contextWindow: 200_000, vision: true, supportsPdf: true },
  { id: 'claude-3-5-sonnet-latest', label: 'Claude 3.5 Sonnet', contextWindow: 200_000, vision: true, supportsPdf: true }
];

function turnToBlocks(t: ChatTurn) {
  const out: any[] = [];
  for (const p of t.parts) {
    if (p.kind === 'text' && p.text) out.push({ type: 'text', text: p.text });
    else if (p.kind === 'image' && p.base64 && p.mime) out.push({ type: 'image', source: { type: 'base64', media_type: p.mime, data: p.base64 } });
    else if (p.kind === 'pdf' && p.base64) out.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: p.base64 } });
  }
  return out;
}

export const anthropic: Provider = {
  id: 'anthropic',
  label: 'Anthropic',
  detect: (k) => k.startsWith('sk-ant-'),
  defaultBaseUrl: DEFAULT_BASE,
  corsStatus: 'ok',
  notes: 'Browser-direct via dangerous-direct-browser-access header. Native vision + PDFs.',

  async listModels(key, baseUrl) {
    try {
      const res = await fetch(`${baseUrl || DEFAULT_BASE}/v1/models`, {
        headers: {
          'x-api-key': key,
          'anthropic-version': VERSION,
          'anthropic-dangerous-direct-browser-access': 'true'
        }
      });
      if (!res.ok) return STATIC_MODELS;
      const j = await res.json();
      const live = (j.data || []).map((m: any): ModelInfo => ({
        id: m.id,
        label: m.display_name || m.id,
        contextWindow: 200_000,
        vision: true,
        supportsPdf: true
      }));
      return live.length ? live : STATIC_MODELS;
    } catch {
      return STATIC_MODELS;
    }
  },

  async *chat(req: ChatRequest, key: string, baseUrl?: string, signal?: AbortSignal): AsyncGenerator<ChatChunk> {
    const messages = req.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role, content: turnToBlocks(m) }));

    const system: any = req.system
      ? (req.cacheSystem
          ? [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }]
          : req.system)
      : undefined;

    const body = {
      model: req.modelId,
      max_tokens: req.maxTokens ?? 4096,
      temperature: req.temperature ?? 0.7,
      stream: true,
      ...(system ? { system } : {}),
      messages
    };

    const res = await fetch(`${baseUrl || DEFAULT_BASE}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': VERSION,
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify(body),
      signal
    });

    if (!res.ok) {
      const errText = await res.text();
      yield { type: 'error', error: `Anthropic ${res.status}: ${errText.slice(0, 400)}` };
      return;
    }

    let inTok = 0, outTok = 0;
    for await (const ev of sseEvents(res, signal)) {
      if (!ev.data) continue;
      if (ev.data === '[DONE]') break;
      try {
        const j = JSON.parse(ev.data);
        if (j.type === 'content_block_delta' && j.delta?.type === 'text_delta') {
          yield { type: 'delta', text: j.delta.text };
        } else if (j.type === 'message_start' && j.message?.usage) {
          inTok = j.message.usage.input_tokens || 0;
        } else if (j.type === 'message_delta' && j.usage) {
          outTok = j.usage.output_tokens || 0;
        }
      } catch {}
    }
    yield { type: 'usage', inTokens: inTok, outTokens: outTok };
    yield { type: 'done' };
  }
};
