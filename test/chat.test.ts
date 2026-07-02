import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Provider, ChatChunk } from '../src/providers/types';

// Drive sendTurn against a fake provider so we exercise the real db/window/
// memory pipeline without hitting the network.
let fakeChat: (signal?: AbortSignal) => AsyncGenerator<ChatChunk>;
let capturedChatReq: any = null;

vi.mock('../src/providers/registry', () => ({
  getProvider: (): Provider => ({
    id: 'fake',
    label: 'Fake',
    detect: () => false,
    defaultBaseUrl: '',
    corsStatus: 'ok',
    listModels: async () => [],
    chat: (req: any, _key: string, _baseUrl: string | undefined, signal?: AbortSignal) => {
      capturedChatReq = req;
      return fakeChat(signal);
    }
  })
}));

import { sendTurn } from '../src/ai/chat';
import { db, type Session } from '../src/db/schema';
import { setKey } from '../src/db/keystore';
import { listMessages, appendMessage } from '../src/db/messages';

const session: Session = {
  id: 's1',
  title: 'Chat',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  providerId: 'fake',
  modelId: 'fake-1'
};

function abortError(): Error {
  const e = new Error('aborted');
  e.name = 'AbortError';
  return e;
}

beforeEach(async () => {
  await db.messages.clear();
  await db.sessions.clear();
  await db.settings.clear();
  await db.sessions.put(session);
  await setKey({ providerId: 'fake', apiKey: 'k', addedAt: Date.now() });
});

async function assistantContent(): Promise<string> {
  const msgs = await listMessages(session.id);
  return msgs.filter((m) => m.role === 'assistant').at(-1)?.content ?? '';
}

describe('sendTurn', () => {
  it('streams deltas and persists the final cleaned reply with token counts', async () => {
    fakeChat = async function* () {
      yield { type: 'delta', text: 'Hello' };
      yield { type: 'delta', text: ' world' };
      yield { type: 'usage', inTokens: 12, outTokens: 3 };
    };

    const seen: string[] = [];
    let done = false;
    await sendTurn(session, 'hi', [], {
      onDelta: (t) => seen.push(t),
      onDone: () => { done = true; }
    });

    expect(seen).toEqual(['Hello', ' world']);
    expect(done).toBe(true);
    expect(await assistantContent()).toBe('Hello world');

    const msgs = await listMessages(session.id);
    const reply = msgs.filter((m) => m.role === 'assistant').at(-1)!;
    expect(reply.tokensIn).toBe(12);
    expect(reply.tokensOut).toBe(3);
  });

  it('keeps the [stopped] marker when the user aborts mid-stream', async () => {
    const controller = new AbortController();
    fakeChat = async function* (signal?: AbortSignal) {
      yield { type: 'delta', text: 'Par' };
      yield { type: 'delta', text: 'tial' };
      await new Promise<void>((_resolve, reject) => {
        if (signal?.aborted) return reject(abortError());
        signal?.addEventListener('abort', () => reject(abortError()), { once: true });
      });
      yield { type: 'delta', text: ' more' };
    };

    let deltas = 0;
    await sendTurn(session, 'hi', [], {
      onDelta: () => { if (++deltas === 2) controller.abort(); }
    }, { signal: controller.signal });

    const content = await assistantContent();
    expect(content).toContain('Partial');
    expect(content).not.toContain(' more');
    expect(content).toContain('_[stopped]_');
  });

  it('folds windowed summary into req.system so providers receive the compacted context', async () => {
    // Seed 4 long messages so windowing fires (maxInputTokens=50, keepLast=2).
    // Each 300-char turn is ~75 tokens — well over the 50-token budget.
    for (let i = 0; i < 4; i++) {
      await appendMessage(session.id, i % 2 === 0 ? 'user' : 'assistant', 'x'.repeat(300));
    }
    capturedChatReq = null;
    fakeChat = async function* () { yield { type: 'delta', text: 'ok' }; };

    await sendTurn(session, 'new msg', [], {}, { maxInputTokens: 50, keepLast: 2 });

    expect(capturedChatReq).not.toBeNull();
    // Compacted context must be in the system prompt, not silently dropped.
    expect(capturedChatReq.system).toContain('Earlier conversation (compacted');
    // Providers filter role='system' from req.messages — there must be none there.
    const sysInMsgs = (capturedChatReq.messages as any[]).filter((m) => m.role === 'system');
    expect(sysInMsgs).toHaveLength(0);
    // Tail turns (user/assistant) must still be present.
    expect(capturedChatReq.messages.length).toBeGreaterThan(0);
  });

  it('records an error and does not append the stopped marker on a real failure', async () => {
    fakeChat = async function* () {
      yield { type: 'delta', text: 'oops' };
      throw new Error('network down');
    };

    let err = '';
    await sendTurn(session, 'hi', [], { onError: (e) => { err = e; } });

    expect(err).toBe('network down');
    const msgs = await listMessages(session.id);
    const reply = msgs.filter((m) => m.role === 'assistant').at(-1)!;
    expect(reply.error).toBe('network down');
    expect(reply.content).not.toContain('_[stopped]_');
  });
});
