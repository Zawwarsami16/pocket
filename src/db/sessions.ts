import { db, uid, now, type Session } from './schema';

export async function createSession(opts: { providerId: string; modelId: string; title?: string; systemPrompt?: string }): Promise<Session> {
  const ts = now();
  const s: Session = {
    id: uid(),
    title: opts.title?.trim() || 'New chat',
    createdAt: ts,
    updatedAt: ts,
    providerId: opts.providerId,
    modelId: opts.modelId,
    systemPrompt: opts.systemPrompt,
    pinned: 0
  };
  await db.sessions.put(s);
  return s;
}

export async function listSessions(): Promise<Session[]> {
  return db.sessions.orderBy('updatedAt').reverse().toArray();
}

export async function getSession(id: string): Promise<Session | undefined> {
  return db.sessions.get(id);
}

export async function renameSession(id: string, title: string) {
  await db.sessions.update(id, { title: title.trim() || 'Untitled', updatedAt: now() });
}

export async function touchSession(id: string) {
  await db.sessions.update(id, { updatedAt: now() });
}

export async function setSessionModel(id: string, providerId: string, modelId: string) {
  await db.sessions.update(id, { providerId, modelId, updatedAt: now() });
}

export async function togglePinned(id: string) {
  const s = await db.sessions.get(id);
  if (!s) return;
  await db.sessions.update(id, { pinned: s.pinned ? 0 : 1, updatedAt: now() });
}

export async function deleteSession(id: string) {
  await db.transaction('rw', db.sessions, db.messages, db.attachments, async () => {
    await db.messages.where('sessionId').equals(id).delete();
    await db.attachments.where('sessionId').equals(id).delete();
    await db.sessions.delete(id);
  });
}

export async function clearAll() {
  await db.transaction('rw', db.sessions, db.messages, db.attachments, db.facts, async () => {
    await db.sessions.clear();
    await db.messages.clear();
    await db.attachments.clear();
    await db.facts.clear();
  });
}
