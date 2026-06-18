import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '../src/db/schema';
import {
  createSession,
  listSessions,
  getSession,
  renameSession,
  touchSession,
  setSessionModel,
  togglePinned,
  deleteSession,
  clearAll
} from '../src/db/sessions';

const blob = (s: string) => new Blob([s], { type: 'text/plain' });

beforeEach(async () => {
  await db.sessions.clear();
  await db.messages.clear();
  await db.attachments.clear();
  await db.facts.clear();
  await db.settings.clear();
});

describe('createSession', () => {
  it('defaults title to "New chat", starts unpinned, stamps equal created/updated', async () => {
    const s = await createSession({ providerId: 'p', modelId: 'm' });
    expect(s.id).toBeTruthy();
    expect(s.title).toBe('New chat');
    expect(s.pinned).toBe(0);
    expect(s.createdAt).toBe(s.updatedAt);
    expect((await getSession(s.id))!.providerId).toBe('p');
  });

  it('trims a given title and falls back to "New chat" when blank', async () => {
    expect((await createSession({ providerId: 'p', modelId: 'm', title: '  hi  ' })).title).toBe('hi');
    expect((await createSession({ providerId: 'p', modelId: 'm', title: '   ' })).title).toBe('New chat');
  });

  it('persists the systemPrompt when supplied', async () => {
    const s = await createSession({ providerId: 'p', modelId: 'm', systemPrompt: 'be terse' });
    expect((await getSession(s.id))!.systemPrompt).toBe('be terse');
  });
});

describe('listSessions', () => {
  it('returns newest-updated first', async () => {
    const a = await createSession({ providerId: 'p', modelId: 'm' });
    const b = await createSession({ providerId: 'p', modelId: 'm' });
    const c = await createSession({ providerId: 'p', modelId: 'm' });
    expect((await listSessions()).map((s) => s.id)).toEqual([c.id, b.id, a.id]);
  });

  it('keeps newest-first deterministically when created within the same clock tick', async () => {
    // Pin Date.now so every createSession lands in one millisecond — the real
    // case of rapid "new chat" clicks. Without a monotonic stamp these tie on
    // updatedAt and the index falls back to random-UUID order, flipping the
    // sidebar between reads.
    const spy = vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    try {
      const a = await createSession({ providerId: 'p', modelId: 'm' });
      const b = await createSession({ providerId: 'p', modelId: 'm' });
      const c = await createSession({ providerId: 'p', modelId: 'm' });
      const order = (await listSessions()).map((s) => s.id);
      expect(order).toEqual([c.id, b.id, a.id]);
      // and stable across repeated reads
      expect((await listSessions()).map((s) => s.id)).toEqual(order);
    } finally {
      spy.mockRestore();
    }
  });

  it('reorders when a session is touched', async () => {
    const a = await createSession({ providerId: 'p', modelId: 'm' });
    await createSession({ providerId: 'p', modelId: 'm' });
    await new Promise((r) => setTimeout(r, 2));
    await touchSession(a.id);
    expect((await listSessions())[0].id).toBe(a.id);
  });
});

describe('renameSession', () => {
  it('trims the new title and bumps updatedAt', async () => {
    const s = await createSession({ providerId: 'p', modelId: 'm' });
    const before = s.updatedAt;
    await new Promise((r) => setTimeout(r, 2));
    await renameSession(s.id, '  Renamed  ');
    const back = (await getSession(s.id))!;
    expect(back.title).toBe('Renamed');
    expect(back.updatedAt).toBeGreaterThan(before);
  });

  it('falls back to "Untitled" for a blank title', async () => {
    const s = await createSession({ providerId: 'p', modelId: 'm' });
    await renameSession(s.id, '   ');
    expect((await getSession(s.id))!.title).toBe('Untitled');
  });
});

describe('setSessionModel', () => {
  it('swaps provider + model and bumps updatedAt', async () => {
    const s = await createSession({ providerId: 'p', modelId: 'm' });
    const before = s.updatedAt;
    await new Promise((r) => setTimeout(r, 2));
    await setSessionModel(s.id, 'p2', 'm2');
    const back = (await getSession(s.id))!;
    expect(back.providerId).toBe('p2');
    expect(back.modelId).toBe('m2');
    expect(back.updatedAt).toBeGreaterThan(before);
  });
});

describe('togglePinned', () => {
  it('flips 0 -> 1 -> 0', async () => {
    const s = await createSession({ providerId: 'p', modelId: 'm' });
    await togglePinned(s.id);
    expect((await getSession(s.id))!.pinned).toBe(1);
    await togglePinned(s.id);
    expect((await getSession(s.id))!.pinned).toBe(0);
  });

  it('is a no-op for an unknown id', async () => {
    await expect(togglePinned('missing')).resolves.toBeUndefined();
  });
});

describe('deleteSession', () => {
  it('cascades the session, its messages and attachments, leaving other sessions intact', async () => {
    const a = await createSession({ providerId: 'p', modelId: 'm' });
    const b = await createSession({ providerId: 'p', modelId: 'm' });
    await db.messages.put({ id: 'm1', sessionId: a.id, role: 'user', content: 'x', createdAt: 1 });
    await db.messages.put({ id: 'm2', sessionId: b.id, role: 'user', content: 'y', createdAt: 1 });
    await db.attachments.put({
      id: 'at1', sessionId: a.id, name: 'f', mime: 'text/plain',
      size: 1, blob: blob('z'), hash: 'h', kind: 'text', createdAt: 1
    });

    await deleteSession(a.id);

    expect(await getSession(a.id)).toBeUndefined();
    expect(await db.messages.where('sessionId').equals(a.id).count()).toBe(0);
    expect(await db.attachments.where('sessionId').equals(a.id).count()).toBe(0);
    expect(await db.messages.get('m2')).toBeDefined();
    expect(await getSession(b.id)).toBeDefined();
  });
});

describe('clearAll', () => {
  it('wipes chats/messages/attachments/facts but preserves settings', async () => {
    const s = await createSession({ providerId: 'p', modelId: 'm' });
    await db.messages.put({ id: 'm1', sessionId: s.id, role: 'user', content: 'x', createdAt: 1 });
    await db.attachments.put({
      id: 'at1', sessionId: s.id, name: 'f', mime: 'text/plain',
      size: 1, blob: blob('z'), hash: 'h', kind: 'text', createdAt: 1
    });
    await db.facts.put({ id: 'f1', text: 't', tags: [], createdAt: 1, hits: 0 });
    await db.settings.put({ key: 'k', value: 1 });

    await clearAll();

    expect(await db.sessions.count()).toBe(0);
    expect(await db.messages.count()).toBe(0);
    expect(await db.attachments.count()).toBe(0);
    expect(await db.facts.count()).toBe(0);
    expect(await db.settings.count()).toBe(1);
  });
});
