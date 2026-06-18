import { describe, it, expect, vi, afterEach } from 'vitest';
import { chatOAI } from '../src/providers/openai_compat';
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
  modelId: 'gpt-4o-mini',
  messages: [{ role: 'user', parts: [{ kind: 'text', text: 'hi' }] }],
};

function run(): AsyncGenerator<ChatChunk> {
  return chatOAI(REQ, 'sk-test', { baseUrl: 'https://api.example.com/v1' });
}

afterEach(() => vi.unstubAllGlobals());

describe('chatOAI streaming', () => {
  it('yields text deltas, then usage + done', async () => {
    stubFetch(
      sseResponse([
        'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
        'data: {"choices":[],"usage":{"prompt_tokens":5,"completion_tokens":2}}\n\n',
        'data: [DONE]\n\n',
      ])
    );
    const out = await collect(run());
    expect(out).toEqual([
      { type: 'delta', text: 'Hel' },
      { type: 'delta', text: 'lo' },
      { type: 'usage', inTokens: 5, outTokens: 2 },
      { type: 'done' },
    ]);
  });

  it('surfaces a non-OK HTTP response as an error chunk', async () => {
    stubFetch(
      sseResponse(['{"error":{"message":"bad key"}}'], { status: 401 })
    );
    const out = await collect(run());
    expect(out).toEqual([{ type: 'error', error: '401: bad key' }]);
  });

  it('surfaces a mid-stream error event instead of silently truncating', async () => {
    // After a 200 + stream start, OpenAI-compatible endpoints (OpenAI,
    // OpenRouter, Groq, Together) deliver a post-start failure as an SSE
    // data event carrying an `error` object, not via HTTP status.
    stubFetch(
      sseResponse([
        'data: {"choices":[{"delta":{"content":"partial"}}]}\n\n',
        'data: {"error":{"message":"upstream timed out","type":"server_error"}}\n\n',
        'data: [DONE]\n\n',
      ])
    );
    const out = await collect(run());
    expect(out).toContainEqual({ type: 'delta', text: 'partial' });
    expect(out).toContainEqual({
      type: 'error',
      error: 'upstream timed out',
    });
    // Must not masquerade as a clean completion.
    expect(out.some((c) => c.type === 'done')).toBe(false);
  });
});
