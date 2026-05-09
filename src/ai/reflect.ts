import { db } from '../db/schema';
import { getSetting, setSetting } from '../db/keystore';

export interface DailyReflection {
  date: string;
  chats: number;
  messages: number;
  newFacts: number;
  topModels: { modelId: string; count: number }[];
  topChats: { title: string; messages: number }[];
  generatedAt: number;
}

export async function generateReflection(): Promise<DailyReflection> {
  const dayMs = 86_400_000;
  const since = Date.now() - dayMs;

  const [allMessages, allFacts, allSessions] = await Promise.all([
    db.messages.where('createdAt').above(since).toArray(),
    db.facts.where('createdAt').above(since).count(),
    db.sessions.where('updatedAt').above(since).toArray()
  ]);

  const modelCount = new Map<string, number>();
  const sessionCount = new Map<string, number>();
  for (const m of allMessages) {
    if (m.modelId) modelCount.set(m.modelId, (modelCount.get(m.modelId) || 0) + 1);
    sessionCount.set(m.sessionId, (sessionCount.get(m.sessionId) || 0) + 1);
  }

  const topModels = [...modelCount.entries()]
    .map(([modelId, count]) => ({ modelId, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  const topChats: DailyReflection['topChats'] = [];
  for (const [sessionId, count] of [...sessionCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)) {
    const s = allSessions.find((x) => x.id === sessionId) || (await db.sessions.get(sessionId));
    if (s) topChats.push({ title: s.title, messages: count });
  }

  return {
    date: new Date().toISOString().slice(0, 10),
    chats: allSessions.length,
    messages: allMessages.length,
    newFacts: allFacts,
    topModels,
    topChats,
    generatedAt: Date.now()
  };
}

const LAST_REFLECTION = 'lastReflectionDate';

export async function maybeGenerateDailyReflection(): Promise<DailyReflection | null> {
  const last = await getSetting<string>(LAST_REFLECTION, '');
  const today = new Date().toISOString().slice(0, 10);
  if (last === today) return null;
  const r = await generateReflection();
  if (r.messages === 0) return null;
  await setSetting(LAST_REFLECTION, today);
  return r;
}

export function formatReflection(r: DailyReflection): string {
  const lines: string[] = [];
  lines.push(`In the last 24 hours: ${r.messages} messages across ${r.chats} chats, ${r.newFacts} new facts remembered.`);
  if (r.topModels.length) {
    lines.push(`Models reached for: ${r.topModels.map((m) => `${m.modelId} (${m.count})`).join(', ')}.`);
  }
  if (r.topChats.length) {
    lines.push(`Most active threads: ${r.topChats.map((c) => `"${c.title}"`).join(', ')}.`);
  }
  return lines.join(' ');
}
