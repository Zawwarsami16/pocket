import type { ChatRequest, ChatChunk, ChatTurn, ModelInfo } from './types';
import { sseEvents } from '../ai/stream';

export interface OAICompatConfig {
  baseUrl: string;
  extraHeaders?: Record<string, string>;
  staticModels?: ModelInfo[];
  filterModel?: (m: any) => boolean;
}

function turnToContent(t: ChatTurn) {
  const parts: any[] = [];
  for (const p of t.parts) {
    if (p.kind === 'text' && p.text) parts.push({ type: 'text', text: p.text });
    else if (p.kind === 'image' && p.base64 && p.mime) {
      parts.push({ type: 'image_url', image_url: { url: `data:${p.mime};base64,${p.base64}` } });
    } else if (p.kind === 'pdf' && p.base64) {
      parts.push({ type: 'text', text: `[PDF attachment '${p.name || 'document.pdf'}' — provider does not support native PDFs in this path]` });
    }
  }
  if (parts.length === 1 && parts[0].type === 'text') return parts[0].text;
  return parts;
}

export async function listModelsOAI(key: string, cfg: OAICompatConfig): Promise<ModelInfo[]> {
  try {
    const res = await fetch(`${cfg.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${key}`, ...(cfg.extraHeaders || {}) }
    });
    if (!res.ok) return cfg.staticModels || [];
    const j = await res.json();
    const rows = (j.data || j.models || []) as any[];
    const filtered = cfg.filterModel ? rows.filter(cfg.filterModel) : rows;
    const mapped = filtered.map((m: any): ModelInfo => ({
      id: m.id,
      label: m.name || m.display_name || m.id,
      contextWindow: m.context_length || m.context_window,
      vision: !!(m.architecture?.modality?.includes('image') || m.id?.includes('vision') || m.id?.match(/4o|sonnet|opus|gpt-5|gemini/i)),
      supportsPdf: !!m.architecture?.modality?.includes('document')
    }));
    return mapped.length ? mapped : (cfg.staticModels || []);
  } catch {
    return cfg.staticModels || [];
  }
}

export async function* chatOAI(
  req: ChatRequest,
  key: string,
  cfg: OAICompatConfig,
  signal?: AbortSignal
): AsyncGenerator<ChatChunk> {
  const messages: any[] = [];
  if (req.system) messages.push({ role: 'system', content: req.system });
  for (const t of req.messages) {
    if (t.role === 'system') continue;
    messages.push({ role: t.role, content: turnToContent(t) });
  }

  const body = {
    model: req.modelId,
    messages,
    stream: true,
    temperature: req.temperature ?? 0.7,
    max_tokens: req.maxTokens ?? 4096,
    stream_options: { include_usage: true }
  };

  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${key}`,
      ...(cfg.extraHeaders || {})
    },
    body: JSON.stringify(body),
    signal
  });

  if (!res.ok) {
    const errText = await res.text();
    yield { type: 'error', error: `${res.status}: ${errText.slice(0, 400)}` };
    return;
  }

  let inTok = 0, outTok = 0;
  for await (const ev of sseEvents(res, signal)) {
    if (!ev.data || ev.data === '[DONE]') {
      if (ev.data === '[DONE]') break;
      continue;
    }
    try {
      const j = JSON.parse(ev.data);
      const delta = j.choices?.[0]?.delta?.content;
      if (typeof delta === 'string' && delta) yield { type: 'delta', text: delta };
      else if (Array.isArray(delta)) {
        for (const d of delta) if (d?.text) yield { type: 'delta', text: d.text };
      }
      if (j.usage) {
        inTok = j.usage.prompt_tokens || j.usage.input_tokens || inTok;
        outTok = j.usage.completion_tokens || j.usage.output_tokens || outTok;
      }
    } catch {}
  }
  yield { type: 'usage', inTokens: inTok, outTokens: outTok };
  yield { type: 'done' };
}
