import { describe, it, expect, beforeEach } from 'vitest';
import { db, type Role } from '../src/db/schema';
import { recallAcrossSessions, formatRecallBlock } from '../src/ai/recall';

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

async function addMessageAt(sessionId: string, role: Role, content: string, createdAt: number) {
  const id = `m${seq++}`;
  await db.messages.put({ id, sessionId, role, content, createdAt });
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

  it('keeps the highest-scoring snippets per session, not the most recent', async () => {
    // One session, three matches. The OLDEST message is the strongest match
    // (query topic mentioned densely); the two newest are weak (one mention).
    // The per-session cap of 2 must keep the best two by score — dropping the
    // strongest match just because two weaker-but-newer ones were scanned first
    // defeats the scoring the function exists to apply.
    await addSession('s1', 'Busy');
    await addMessageAt('s1', 'user', 'kayak alpha bravo', 3000);
    await addMessageAt('s1', 'user', 'kayak charlie delta', 2000);
    await addMessageAt('s1', 'user', 'kayak kayak kayak kayak', 1000);

    const hits = await recallAcrossSessions('kayak', { maxSnippets: 10 });
    expect(hits).toHaveLength(2);
    // The dense match is the top result and must not have been capped out.
    expect(hits.some((h) => h.text === 'kayak kayak kayak kayak')).toBe(true);
    expect(hits[0].text).toBe('kayak kayak kayak kayak');
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

type Snippet = Parameters<typeof formatRecallBlock>[0][number];
function snippet(over: Partial<Snippet>): Snippet {
  return {
    sessionId: 's1',
    sessionTitle: 'Chat',
    role: 'user',
    text: 'hello',
    createdAt: 0,
    score: 1,
    ...over
  };
}

describe('formatRecallBlock', () => {
  it('returns an empty string when there are no snippets', () => {
    expect(formatRecallBlock([])).toBe('');
  });

  it('labels user vs assistant snippets distinctly', () => {
    const block = formatRecallBlock([
      snippet({ role: 'user', text: 'the kayak is red' }),
      snippet({ role: 'assistant', text: 'noted, red kayak' })
    ]);
    expect(block).toContain('they said: the kayak is red');
    expect(block).toContain('you said: noted, red kayak');
  });

  it('groups snippets from one session under a single heading', () => {
    const block = formatRecallBlock([
      snippet({ sessionId: 's1', sessionTitle: 'Trip', text: 'a' }),
      snippet({ sessionId: 's1', sessionTitle: 'Trip', text: 'b' })
    ]);
    expect(block.match(/— from /g)).toHaveLength(1);
    expect(block).toContain('— from "Trip":');
  });

  it('keeps same-titled but distinct sessions in separate groups', () => {
    // "New chat"/"Untitled" are the default titles, so unrelated sessions
    // routinely share a title; they must not be merged into one heading.
    const block = formatRecallBlock([
      snippet({ sessionId: 's1', sessionTitle: 'New chat', text: 'about kayaks' }),
      snippet({ sessionId: 's2', sessionTitle: 'New chat', text: 'about taxes' })
    ]);
    expect(block.match(/— from "New chat":/g)).toHaveLength(2);
  });

  it('keeps groups in first-seen order of the (score-sorted) snippets', () => {
    const block = formatRecallBlock([
      snippet({ sessionId: 's2', sessionTitle: 'Second', text: 'x' }),
      snippet({ sessionId: 's1', sessionTitle: 'First', text: 'y' })
    ]);
    expect(block.indexOf('Second')).toBeLessThan(block.indexOf('First'));
  });
});
