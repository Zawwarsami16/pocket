import { db, uid, now, type Message, type Role } from './schema';
import { touchSession } from './sessions';

export async function appendMessage(sessionId: string, role: Role, content: string, extras: Partial<Message> = {}): Promise<Message> {
  const msg: Message = {
    id: uid(),
    sessionId,
    role,
    content,
    createdAt: now(),
    ...extras
  };
  await db.messages.put(msg);
  await touchSession(sessionId);
  return msg;
}

export async function listMessages(sessionId: string): Promise<Message[]> {
  return db.messages.where('[sessionId+createdAt]').between([sessionId, 0], [sessionId, Infinity]).toArray();
}

export async function updateMessage(id: string, patch: Partial<Message>) {
  await db.messages.update(id, patch);
}

export async function deleteMessage(id: string) {
  await db.messages.delete(id);
}

export async function deleteFrom(id: string) {
  const msg = await db.messages.get(id);
  if (!msg) return;
  // Delete by display-order position, not raw timestamp range: messages that
  // share this one's createdAt (e.g. a user turn and its reply, appended in the
  // same ms) but sort *before* it in listMessages must be kept.
  const ordered = await listMessages(msg.sessionId);
  const from = ordered.findIndex((m) => m.id === id);
  if (from === -1) return;
  const ids = ordered.slice(from).map((m) => m.id);
  await db.messages.bulkDelete(ids);
}
