import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db/schema';
import { appendMessage, listMessages, updateMessage, deleteMessage, deleteFrom } from '../src/db/messages';

beforeEach(async () => {
  await db.messages.clear();
  await db.sessions.clear();
});

describe('appendMessage', () => {
  it('persists a message and bumps the session updatedAt', async () => {
    await db.sessions.put({
      id: 's1', title: 't', createdAt: 1, updatedAt: 1,
      providerId: 'p', modelId: 'm', pinned: 0
    });
    const m = await appendMessage('s1', 'user', 'hello');
    expect(m.id).toBeTruthy();
    expect(m.role).toBe('user');
    expect(m.content).toBe('hello');
    expect((await db.messages.get(m.id))!.content).toBe('hello');
    expect((await db.sessions.get('s1'))!.updatedAt).toBeGreaterThan(1);
  });

  it('carries extras (attachmentIds, token counts, modelId) through', async () => {
    const m = await appendMessage('s1', 'assistant', 'hi', {
      attachmentIds: ['a1'], tokensIn: 3, tokensOut: 4, modelId: 'gpt'
    });
    const back = (await db.messages.get(m.id))!;
    expect(back.attachmentIds).toEqual(['a1']);
    expect(back.tokensIn).toBe(3);
    expect(back.tokensOut).toBe(4);
    expect(back.modelId).toBe('gpt');
  });
});

describe('listMessages', () => {
  it('returns only the session in createdAt order', async () => {
    await appendMessage('s1', 'user', 'first', { createdAt: 100 });
    await appendMessage('s2', 'user', 'other session', { createdAt: 150 });
    await appendMessage('s1', 'assistant', 'second', { createdAt: 200 });
    const out = await listMessages('s1');
    expect(out.map((m) => m.content)).toEqual(['first', 'second']);
  });
});

describe('updateMessage / deleteMessage', () => {
  it('patches in place and deletes by id', async () => {
    const m = await appendMessage('s1', 'assistant', '', { createdAt: 1 });
    await updateMessage(m.id, { content: 'streamed', tokensOut: 7 });
    const back = (await db.messages.get(m.id))!;
    expect(back.content).toBe('streamed');
    expect(back.tokensOut).toBe(7);
    await deleteMessage(m.id);
    expect(await db.messages.get(m.id)).toBeUndefined();
  });
});

describe('deleteFrom', () => {
  it('deletes the target message and everything after it', async () => {
    await appendMessage('s1', 'user', 'a', { id: 'm1', createdAt: 100 });
    await appendMessage('s1', 'assistant', 'b', { id: 'm2', createdAt: 200 });
    await appendMessage('s1', 'user', 'c', { id: 'm3', createdAt: 300 });
    await deleteFrom('m2');
    expect((await listMessages('s1')).map((m) => m.id)).toEqual(['m1']);
  });

  it('is a no-op for an unknown id', async () => {
    await appendMessage('s1', 'user', 'a', { id: 'm1', createdAt: 100 });
    await deleteFrom('nope');
    expect((await listMessages('s1')).map((m) => m.id)).toEqual(['m1']);
  });

  it('keeps a same-ms message that sorts BEFORE the target in display order', async () => {
    // chat.ts appends the user turn and its assistant placeholder back-to-back,
    // so they routinely share a Date.now() ms. listMessages breaks the tie by
    // primary key, so the user prompt (id 'AAA') displays before the reply
    // (id 'BBB'). Deleting "from the reply" must not take the prompt with it.
    await appendMessage('s1', 'user', 'prompt', { id: 'AAA', createdAt: 1000 });
    await appendMessage('s1', 'assistant', 'reply', { id: 'BBB', createdAt: 1000 });
    await appendMessage('s1', 'user', 'next', { id: 'CCC', createdAt: 2000 });

    const order = (await listMessages('s1')).map((m) => m.id);
    expect(order).toEqual(['AAA', 'BBB', 'CCC']); // tie broken by id, prompt first

    await deleteFrom('BBB');
    expect((await listMessages('s1')).map((m) => m.id)).toEqual(['AAA']);
  });
});
