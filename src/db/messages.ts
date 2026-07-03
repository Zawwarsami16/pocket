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

// Read a user message's content + attachments, then delete it (and everything
// after) so the caller can re-send it as a fresh turn. Returns null if the id
// is missing or the target isn't a user message — the regen button lives only
// on user bubbles, so a non-user hit means the row was already deleted (double
// click) or the caller mis-targeted.
export async function takeUserMessageForRegen(
  id: string
): Promise<{ content: string; attachmentIds: string[] } | null> {
  const msg = await db.messages.get(id);
  if (!msg || msg.role !== 'user') return null;
  const snapshot = { content: msg.content, attachmentIds: msg.attachmentIds ?? [] };
  await deleteFrom(id);
  return snapshot;
}
