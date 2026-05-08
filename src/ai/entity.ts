import { db } from '../db/schema';
import { topFacts } from '../db/facts';

export interface EntitySnapshot {
  time: string;
  posture: string;
  language?: string;
  online: boolean;
  totalChats: number;
  totalMessages: number;
  totalFacts: number;
  weekChats: number;
  currentSession?: { title: string; modelId: string; messages: number };
  recentTopics: string[];
}

const POSTURES: { hours: [number, number]; label: string }[] = [
  { hours: [0, 5], label: 'late night, quiet' },
  { hours: [5, 9], label: 'early morning' },
  { hours: [9, 12], label: 'morning, fresh' },
  { hours: [12, 17], label: 'afternoon' },
  { hours: [17, 21], label: 'evening' },
  { hours: [21, 24], label: 'night' }
];

function postureFor(hour: number): string {
  for (const p of POSTURES) if (hour >= p.hours[0] && hour < p.hours[1]) return p.label;
  return 'unspecified';
}

export async function snapshotEntity(currentSessionId?: string): Promise<EntitySnapshot> {
  const now = new Date();
  const hour = now.getHours();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const day = now.toLocaleDateString(undefined, { weekday: 'long' });
  const time = `${String(hour).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} ${day} (${tz})`;

  const [totalChats, totalMessages, totalFacts] = await Promise.all([
    db.sessions.count(),
    db.messages.count(),
    db.facts.count()
  ]);

  const weekAgo = Date.now() - 7 * 86_400_000;
  const weekChats = await db.sessions.where('updatedAt').above(weekAgo).count();

  let currentSession: EntitySnapshot['currentSession'];
  if (currentSessionId) {
    const s = await db.sessions.get(currentSessionId);
    if (s) {
      const messages = await db.messages.where('sessionId').equals(s.id).count();
      currentSession = { title: s.title, modelId: s.modelId, messages };
    }
  }

  const facts = await topFacts(5);
  const recentTopics = facts.map((f) => f.text);

  return {
    time,
    posture: postureFor(hour),
    language: navigator?.language,
    online: navigator?.onLine ?? true,
    totalChats,
    totalMessages,
    totalFacts,
    weekChats,
    currentSession,
    recentTopics
  };
}

export function composeAwarenessForPrompt(snap: EntitySnapshot): string {
  const lines: string[] = ['Your current awareness (always-on, derived locally — no API call):'];
  lines.push(`- time: ${snap.time}, posture: ${snap.posture}`);
  if (snap.language) lines.push(`- user's browser language: ${snap.language}`);
  lines.push(`- you have ${snap.totalChats} chats and ${snap.totalFacts} remembered facts about this user`);
  if (snap.weekChats > 0) lines.push(`- ${snap.weekChats} chat${snap.weekChats === 1 ? '' : 's'} touched this past week`);
  if (snap.currentSession) {
    lines.push(`- this thread: "${snap.currentSession.title}" on ${snap.currentSession.modelId}, ${snap.currentSession.messages} messages so far`);
  }
  if (!snap.online) lines.push('- the user is offline right now');
  return lines.join('\n');
}
