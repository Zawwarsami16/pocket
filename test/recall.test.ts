import { describe, it, expect, beforeEach } from 'vitest';
import { db, type Role } from '../src/db/schema';
import { recallAcrossSessions } from '../src/ai/recall';

let seq = 0;

async function addSession(id: string, title: string) {
  const now = Date.now();
  await db.sessions.put({
    id,
    title,
    createdAt: now,
    updatedAt: now,
    providerId: 'openai',
    modelId: 'gpt'
  });
}

async function addMessage(sessionId: string, role: Role, content: string) {
  const id = `m${seq++}`;
  await db.messages.put({ id, sessionId, role, content, createdAt: Date.now() + seq });
}

beforeEach(async () => {
  await db.messages.clear();
  await db.sessions.clear();
  seq = 0;
});

describe('recallAcrossSessions', () => {
  it('returns an empty array for a query of only stop words', async () => {
    await addSession('s1', 'Chat');
    await addMessage('s1', 'user', 'I love hiking mountains');
    expect(await recallAcrossSessions('the a of to')).toEqual([]);
  });

  it('only surfaces messages that overlap the query tokens', async () => {
    await addSession('s1', 'Outdoors');
    await addMessage('s1', 'user', 'I love hiking in the mountains');
    await addMessage('s1', 'assistant', 'Pasta carbonara needs guanciale');

    const hits = await recallAcrossSessions('mountain hiking trip');
    expect(hits).toHaveLength(1);
    expect(hits[0].text).toContain('hiking');
  });

  it('excludes the current session when excludeSessionId is set', async () => {
    await addSession('s1', 'Past');
    await addSession('s2', 'Current');
    await addMessage('s1', 'user', 'remember the kayak detail');
    await addMessage('s2', 'user', 'remember the kayak detail');

    const hits = await recallAcrossSessions('kayak', { excludeSessionId: 's2' });
    expect(hits.every((h) => h.sessionId === 's1')).toBe(true);
  });

  it('skips system messages', async () => {
    await addSession('s1', 'Chat');
    await addMessage('s1', 'system', 'kayak system prompt');
    await addMessage('s1', 'user', 'kayak question');
    const hits = await recallAcrossSessions('kayak');
    expect(hits.every((h) => h.role !== 'system')).toBe(true);
    expect(hits).toHaveLength(1);
  });

  it('takes at most two snippets from a single session', async () => {
    await addSession('s1', 'Busy');
    for (let i = 0; i < 5; i++) await addMessage('s1', 'user', `kayak note number ${i}`);
    const hits = await recallAcrossSessions('kayak', { maxSnippets: 10 });
    expect(hits).toHaveLength(2);
  });

  it('caps the total number of snippets to maxSnippets', async () => {
    for (let i = 0; i < 6; i++) {
      await addSession(`s${i}`, `Session ${i}`);
      await addMessage(`s${i}`, 'user', `kayak observation ${i}`);
    }
    const hits = await recallAcrossSessions('kayak', { maxSnippets: 3 });
    expect(hits).toHaveLength(3);
  });

  it('truncates long snippets to perSnippetChars with an ellipsis', async () => {
    await addSession('s1', 'Long');
    await addMessage('s1', 'user', 'kayak ' + 'x'.repeat(500));
    const hits = await recallAcrossSessions('kayak', { perSnippetChars: 40 });
    expect(hits[0].text.endsWith('…')).toBe(true);
    expect(hits[0].text.length).toBeLessThanOrEqual(41);
  });
});
