import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db/schema';
import {
  generateReflection,
  maybeGenerateDailyReflection,
  formatReflection,
  type DailyReflection
} from '../src/ai/reflect';
import { getSetting } from '../src/db/keystore';

const DAY = 86_400_000;
let seq = 0;

async function addSession(id: string, title: string, updatedAt = Date.now()) {
  await db.sessions.put({
    id,
    title,
    createdAt: Date.now(),
    updatedAt,
    providerId: 'openai',
    modelId: 'gpt'
  });
}

async function addMessage(sessionId: string, modelId?: string, createdAt = Date.now()) {
  await db.messages.put({ id: `m${seq++}`, sessionId, role: 'user', content: 'hi', createdAt, modelId });
}

async function addFact(id: string, createdAt = Date.now()) {
  await db.facts.put({ id, text: 'x', tags: [], createdAt, hits: 0 });
}

beforeEach(async () => {
  await db.messages.clear();
  await db.sessions.clear();
  await db.facts.clear();
  await db.settings.clear();
  seq = 0;
});

describe('generateReflection', () => {
  it('reports zeroes on an empty database', async () => {
    const r = await generateReflection();
    expect(r.chats).toBe(0);
    expect(r.messages).toBe(0);
    expect(r.newFacts).toBe(0);
    expect(r.topModels).toEqual([]);
    expect(r.topChats).toEqual([]);
    expect(r.date).toBe(new Date().toISOString().slice(0, 10));
  });

  it('counts only sessions, messages, and facts inside the 24h window', async () => {
    await addSession('recent', 'Recent');
    await addSession('stale', 'Stale', Date.now() - 2 * DAY);
    await addMessage('recent');
    await addMessage('recent', undefined, Date.now() - 2 * DAY);
    await addFact('f-new');
    await addFact('f-old', Date.now() - 2 * DAY);

    const r = await generateReflection();
    expect(r.chats).toBe(1);
    expect(r.messages).toBe(1);
    expect(r.newFacts).toBe(1);
  });

  it('ranks models by message count, descending, capped at three', async () => {
    await addSession('s1', 'Chat');
    for (let i = 0; i < 4; i++) await addMessage('s1', 'gpt');
    for (let i = 0; i < 3; i++) await addMessage('s1', 'claude');
    for (let i = 0; i < 2; i++) await addMessage('s1', 'llama');
    await addMessage('s1', 'mistral');

    const r = await generateReflection();
    expect(r.topModels).toHaveLength(3);
    expect(r.topModels.map((m) => m.modelId)).toEqual(['gpt', 'claude', 'llama']);
    expect(r.topModels[0].count).toBe(4);
  });

  it('ignores messages that carry no modelId in the model ranking', async () => {
    await addSession('s1', 'Chat');
    await addMessage('s1', 'gpt');
    await addMessage('s1'); // no modelId

    const r = await generateReflection();
    expect(r.messages).toBe(2);
    expect(r.topModels).toEqual([{ modelId: 'gpt', count: 1 }]);
  });

  it('lists the three busiest chats with their titles, busiest first', async () => {
    await addSession('s1', 'Alpha');
    await addSession('s2', 'Beta');
    await addSession('s3', 'Gamma');
    await addSession('s4', 'Delta');
    for (let i = 0; i < 4; i++) await addMessage('s1', 'gpt');
    for (let i = 0; i < 3; i++) await addMessage('s2', 'gpt');
    for (let i = 0; i < 2; i++) await addMessage('s3', 'gpt');
    await addMessage('s4', 'gpt');

    const r = await generateReflection();
    expect(r.topChats).toEqual([
      { title: 'Alpha', messages: 4 },
      { title: 'Beta', messages: 3 },
      { title: 'Gamma', messages: 2 }
    ]);
  });
});

describe('maybeGenerateDailyReflection', () => {
  it('returns null when there are no messages in the window', async () => {
    await addSession('s1', 'Chat');
    expect(await maybeGenerateDailyReflection()).toBeNull();
  });

  it('generates once, stamps the date, then suppresses the same day', async () => {
    await addSession('s1', 'Chat');
    await addMessage('s1', 'gpt');

    const first = await maybeGenerateDailyReflection();
    expect(first).not.toBeNull();
    expect(await getSetting('lastReflectionDate', '')).toBe(new Date().toISOString().slice(0, 10));

    expect(await maybeGenerateDailyReflection()).toBeNull();
  });
});

describe('formatReflection', () => {
  const base: DailyReflection = {
    date: '2026-01-01',
    chats: 4,
    messages: 10,
    newFacts: 1,
    topModels: [],
    topChats: [],
    generatedAt: 0
  };

  it('always emits the headline counts and nothing else when there is no detail', () => {
    expect(formatReflection(base)).toBe(
      'In the last 24 hours: 10 messages across 4 chats, 1 new facts remembered.'
    );
  });

  it('appends the models line only when models are present', () => {
    const out = formatReflection({
      ...base,
      topModels: [
        { modelId: 'gpt', count: 5 },
        { modelId: 'claude', count: 3 }
      ]
    });
    expect(out).toContain('Models reached for: gpt (5), claude (3).');
  });

  it('appends the threads line only when chats are present', () => {
    const out = formatReflection({
      ...base,
      topChats: [
        { title: 'Alpha', messages: 4 },
        { title: 'Beta', messages: 3 }
      ]
    });
    expect(out).toContain('Most active threads: "Alpha", "Beta".');
  });

  it('joins all three segments with single spaces when everything is present', () => {
    const out = formatReflection({
      ...base,
      topModels: [{ modelId: 'gpt', count: 5 }],
      topChats: [{ title: 'Alpha', messages: 4 }]
    });
    expect(out).toBe(
      'In the last 24 hours: 10 messages across 4 chats, 1 new facts remembered. ' +
        'Models reached for: gpt (5). Most active threads: "Alpha".'
    );
  });
});
