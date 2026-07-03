import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '../src/db/schema';
import { appendMessage, listMessages, updateMessage, deleteMessage, deleteFrom, takeUserMessageForRegen } from '../src/db/messages';

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

describe('takeUserMessageForRegen', () => {
  // The regen button lives on EVERY user bubble. App.tsx's handler used to
  // discard the id and always re-send the LAST user message — so regenerating
  // a mid-thread user turn (or the "save & regen" edit flow) silently replayed
  // an earlier one instead of the target. This helper is the fix's contract.

  it('returns the target user message content + attachmentIds and deletes from that message onward', async () => {
    await appendMessage('s1', 'user', 'first ask', { id: 'u1', createdAt: 100, attachmentIds: ['a1'] });
    await appendMessage('s1', 'assistant', 'first reply', { id: 'a1r', createdAt: 200 });
    await appendMessage('s1', 'user', 'second ask', { id: 'u2', createdAt: 300, attachmentIds: ['a2', 'a3'] });
    await appendMessage('s1', 'assistant', 'second reply', { id: 'a2r', createdAt: 400 });

    const snap = await takeUserMessageForRegen('u2');
    expect(snap).toEqual({ content: 'second ask', attachmentIds: ['a2', 'a3'] });
    // u2 and everything after must be gone; u1 and a1r must remain.
    expect((await listMessages('s1')).map((m) => m.id)).toEqual(['u1', 'a1r']);
  });

  it('regenerates a mid-thread turn (not the latest one)', async () => {
    // The concrete bug it fixes: click regen on user #1 of two, do NOT replay #2.
    await appendMessage('s1', 'user', 'mid ask', { id: 'u1', createdAt: 100 });
    await appendMessage('s1', 'assistant', 'mid reply', { id: 'a1r', createdAt: 200 });
    await appendMessage('s1', 'user', 'later ask', { id: 'u2', createdAt: 300 });
    await appendMessage('s1', 'assistant', 'later reply', { id: 'a2r', createdAt: 400 });

    const snap = await takeUserMessageForRegen('u1');
    expect(snap?.content).toBe('mid ask');
    // deleteFrom cascades — u1 and everything after it (a1r/u2/a2r) all gone.
    expect(await listMessages('s1')).toEqual([]);
  });

  it('returns empty attachmentIds when the message had none', async () => {
    await appendMessage('s1', 'user', 'plain', { id: 'u1', createdAt: 100 });
    const snap = await takeUserMessageForRegen('u1');
    expect(snap).toEqual({ content: 'plain', attachmentIds: [] });
  });

  it('returns null for an unknown id and leaves the store untouched', async () => {
    await appendMessage('s1', 'user', 'a', { id: 'u1', createdAt: 100 });
    const snap = await takeUserMessageForRegen('missing');
    expect(snap).toBeNull();
    expect((await listMessages('s1')).map((m) => m.id)).toEqual(['u1']);
  });

  it('returns null for an assistant message and leaves the row alone', async () => {
    // The button is on user bubbles only, but this is a public helper — a
    // non-user id must be a no-op, not silently drop an assistant reply.
    await appendMessage('s1', 'user', 'q', { id: 'u1', createdAt: 100 });
    await appendMessage('s1', 'assistant', 'a', { id: 'a1', createdAt: 200 });
    const snap = await takeUserMessageForRegen('a1');
    expect(snap).toBeNull();
    expect((await listMessages('s1')).map((m) => m.id)).toEqual(['u1', 'a1']);
  });
});

describe('appendMessage monotonic clock', () => {
  it('stamps back-to-back calls with strictly increasing createdAt so user turn always sorts before assistant placeholder', async () => {
    // Regression: appendMessage used Date.now() which can return the same value
    // for two calls within one ms. sendTurn appends user then assistant placeholder
    // in rapid succession — same createdAt left the listMessages ordering
    // nondeterministic, so turns.slice(0,-1) could drop the user turn instead of
    // the placeholder. now() bumps by 1ms on collision, making it strictly monotonic.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(1_000_000);
    try {
      await db.sessions.put({ id: 'sx', title: 't', createdAt: 0, updatedAt: 0, providerId: 'p', modelId: 'm' });
      const user = await appendMessage('sx', 'user', 'q');
      const asst = await appendMessage('sx', 'assistant', '');
      // The assistant placeholder must come strictly after the user message
      expect(asst.createdAt).toBeGreaterThan(user.createdAt);
      const msgs = await listMessages('sx');
      expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant']);
    } finally {
      vi.useRealTimers();
    }
  });
});
