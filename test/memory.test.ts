import { describe, it, expect, beforeEach } from 'vitest';
import { db, type Role } from '../src/db/schema';
import { rememberFact } from '../src/db/facts';
import { harvestAndStore, awarenessBlock } from '../src/ai/memory';

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
  await db.facts.clear();
  await db.messages.clear();
  await db.sessions.clear();
  seq = 0;
});

describe('harvestAndStore', () => {
  it('strips MEMORIZE lines from the reply and reports how many were saved', async () => {
    const { cleaned, saved } = await harvestAndStore(
      'hello there\nMEMORIZE: user likes kayaking\nMEMORIZE: user lives in Berlin\nbye',
      's1'
    );
    expect(saved).toBe(2);
    expect(cleaned).not.toContain('MEMORIZE');
    expect(cleaned).toContain('hello there');
    expect(cleaned).toContain('bye');
  });

  it('counts a duplicate fact as saved (bumps its hit count rather than rejecting)', async () => {
    await harvestAndStore('MEMORIZE: user likes kayaking', 's1');
    const { saved } = await harvestAndStore('MEMORIZE: user likes kayaking', 's1');
    expect(saved).toBe(1);
    const all = await db.facts.toArray();
    expect(all).toHaveLength(1);
    expect(all[0].hits).toBe(1);
  });

  it('saves nothing and returns the text untouched when there is no MEMORIZE line', async () => {
    const { cleaned, saved } = await harvestAndStore('just a plain message', 's1');
    expect(saved).toBe(0);
    expect(cleaned).toBe('just a plain message');
    expect(await db.facts.count()).toBe(0);
  });

  it('does not count an empty MEMORIZE payload as saved', async () => {
    const { saved } = await harvestAndStore('MEMORIZE:   ', 's1');
    expect(saved).toBe(0);
  });
});

describe('awarenessBlock', () => {
  it('returns undefined when there are no matching facts and no cross-session hits', async () => {
    expect(await awarenessBlock('zzzqqq nonexistent', { crossSessionRecall: false })).toBeUndefined();
  });

  it('renders matching facts under the saved-facts header', async () => {
    await rememberFact('user likes kayaking', 's1');
    const out = await awarenessBlock('kayaking', { crossSessionRecall: false });
    expect(out).toBeDefined();
    expect(out).toContain('What you remember about this user (saved facts):');
    expect(out).toContain('- user likes kayaking');
    expect(out).not.toContain('cross-session memory');
  });

  it('includes a cross-session recall block when other chats overlap the query', async () => {
    await addSession('s2', 'Past');
    await addMessage('s2', 'user', 'we discussed mountain climbing gear extensively');
    const out = await awarenessBlock('mountain climbing', {});
    expect(out).toBeDefined();
    expect(out).toContain('Relevant context from your other chats');
    expect(out).toContain('mountain climbing gear');
  });

  it('combines facts and cross-session recall, facts first', async () => {
    await rememberFact('user enjoys mountain climbing', 's9');
    await addSession('s2', 'Past');
    await addMessage('s2', 'user', 'we discussed mountain climbing gear extensively');
    const out = await awarenessBlock('mountain climbing', {});
    expect(out).toBeDefined();
    const factsIdx = out!.indexOf('saved facts');
    const recallIdx = out!.indexOf('other chats');
    expect(factsIdx).toBeGreaterThanOrEqual(0);
    expect(recallIdx).toBeGreaterThan(factsIdx);
  });

  it('skips cross-session recall when crossSessionRecall is false', async () => {
    await addSession('s2', 'Past');
    await addMessage('s2', 'user', 'we discussed mountain climbing gear extensively');
    const out = await awarenessBlock('mountain climbing', { crossSessionRecall: false });
    expect(out).toBeUndefined();
  });

  it('runs cross-session recall by default when crossSessionRecall is left unset', async () => {
    await addSession('s2', 'Past');
    await addMessage('s2', 'user', 'we discussed mountain climbing gear extensively');
    const out = await awarenessBlock('mountain climbing');
    expect(out).toContain('other chats');
  });
});
