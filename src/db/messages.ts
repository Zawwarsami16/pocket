import { db, uid, type Message, type Role } from './schema';
import { touchSession } from './sessions';

export async function appendMessage(sessionId: string, role: Role, content: string, extras: Partial<Message> = {}): Promise<Message> {
  const msg: Message = {
    id: uid(),
    sessionId,
    role,
    content,
    createdAt: Date.now(),
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
  await db.messages
    .where('[sessionId+createdAt]')
    .between([msg.sessionId, msg.createdAt], [msg.sessionId, Infinity])
    .delete();
}
