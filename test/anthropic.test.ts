import { describe, it, expect, vi, afterEach } from 'vitest';
import { anthropic } from '../src/providers/anthropic';
import type { ChatChunk, ChatRequest } from '../src/providers/types';

function sseResponse(chunks: string[], init?: ResponseInit): Response {
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(ch));
      c.close();
    },
  });
  return new Response(stream, init);
}

function stubFetch(res: Response) {
  vi.stubGlobal('fetch', vi.fn(async () => res));
}

async function collect<T>(g: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of g) out.push(x);
  return out;
}

const REQ: ChatRequest = {
  modelId: 'claude-haiku-4-5-20251001',
  messages: [{ role: 'user', parts: [{ kind: 'text', text: 'hi' }] }],
};

function run(): AsyncGenerator<ChatChunk> {
  return anthropic.chat(REQ, 'sk-ant-test');
}

afterEach(() => vi.unstubAllGlobals());

describe('anthropic streaming', () => {
  it('yields text deltas, sums cache tokens into input, then usage + done', async () => {
    stubFetch(
      sseResponse([
        'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":10,"cache_read_input_tokens":3,"cache_creation_input_tokens":4}}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hel"}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"lo"}}\n\n',
        'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":5}}\n\n',
        'event: message_stop\ndata: {"type":"message_stop"}\n\n',
      ])
    );
    const out = await collect(run());
    // input = 10 + 3 (cache read) + 4 (cache creation) = 17, all billed input.
    expect(out).toContainEqual({ type: 'usage', inTokens: 17, outTokens: 5 });
    expect(out.filter((c) => c.type === 'delta' && c.text).map((c: any) => c.text)).toEqual(['Hel', 'lo']);
    expect(out.at(-1)).toEqual({ type: 'done' });
  });

  it('surfaces a non-OK HTTP response as an error chunk, no done', async () => {
    stubFetch(
      sseResponse(['{"error":{"message":"invalid x-api-key"}}'], { status: 401 })
    );
    const out = await collect(run());
    expect(out).toEqual([{ type: 'error', error: 'Anthropic 401: invalid x-api-key' }]);
  });

  it('surfaces a mid-stream error event instead of completing', async () => {
    // After 200 + stream start, Anthropic delivers overload/server failures as
    // an SSE `event: error` envelope, not via HTTP status.
    stubFetch(
      sseResponse([
        'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"part"}}\n\n',
        'event: error\ndata: {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}\n\n',
      ])
    );
    const out = await collect(run());
    expect(out).toContainEqual({ type: 'delta', text: 'part' });
    expect(out).toContainEqual({ type: 'error', error: 'Anthropic stream error: Overloaded' });
    expect(out.some((c) => c.type === 'done')).toBe(false);
  });

  it('flags an unexpected stop_reason as an error, no done', async () => {
    stubFetch(
      sseResponse([
        'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"x"}}\n\n',
        'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"refusal"},"usage":{"output_tokens":2}}\n\n',
        'event: message_stop\ndata: {"type":"message_stop"}\n\n',
      ])
    );
    const out = await collect(run());
    expect(out).toContainEqual({ type: 'error', error: 'Stopped: refusal' });
    expect(out.some((c) => c.type === 'done')).toBe(false);
  });

  it('treats max_tokens as a clean stop (truncated, not an error)', async () => {
    stubFetch(
      sseResponse([
        'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"x"}}\n\n',
        'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"max_tokens"},"usage":{"output_tokens":2}}\n\n',
      ])
    );
    const out = await collect(run());
    expect(out).toContainEqual({ type: 'usage', inTokens: 0, outTokens: 2 });
    expect(out.at(-1)).toEqual({ type: 'done' });
    expect(out.some((c) => c.type === 'error')).toBe(false);
  });

  it('maps text/image/pdf parts to Anthropic content blocks, filters system turns, and caches the system prompt', async () => {
    let body: any = null;
    let url = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (u: any, init: any) => {
        url = u;
        body = JSON.parse(init.body);
        return sseResponse(['event: message_stop\ndata: {"type":"message_stop"}\n\n']);
      })
    );
    const req: ChatRequest = {
      modelId: 'claude-opus-4-7',
      system: 'You are helpful',
      cacheSystem: true,
      temperature: 0.3,
      maxTokens: 1000,
      messages: [
        { role: 'system', parts: [{ kind: 'text', text: 'ignored' }] },
        {
          role: 'user',
          parts: [
            { kind: 'text', text: 'look' },
            { kind: 'image', base64: 'AAAA', mime: 'image/png' },
            { kind: 'pdf', base64: 'BBBB' },
          ],
        },
      ],
    };
    await collect(anthropic.chat(req, 'sk-ant-xyz', 'https://proxy.test'));

    expect(url).toBe('https://proxy.test/v1/messages');
    expect(body.system).toEqual([
      { type: 'text', text: 'You are helpful', cache_control: { type: 'ephemeral' } },
    ]);
    expect(body.temperature).toBe(0.3);
    expect(body.max_tokens).toBe(1000);
    // The system-role turn is dropped; only the user turn survives.
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].content).toEqual([
      { type: 'text', text: 'look' },
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } },
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'BBBB' } },
    ]);
  });
});
