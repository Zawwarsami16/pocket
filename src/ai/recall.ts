import { db, type Message, type Session } from '../db/schema';

const STOP = new Set(['the','a','an','to','of','and','or','for','on','in','with','at','by','is','are','was','were','be','been','this','that','it','as','if','from','i','you','he','she','they','we','me','my','your','our','do','does','did','have','has','had','can','will','would','should','could','may','might','about','into','than','then','so','no','not','yes','what','when','where','who','why','how','all','any','some','more','less','also','just','very','really','here','there','now','today','okay','ok','please','thanks','thank','hi','hello','hey','bro','yaar','jani'].map((s) => s));

function tokenize(s: string): string[] {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9_\s]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t && t.length > 2 && !STOP.has(t));
}

interface ScoredSnippet {
  sessionId: string;
  sessionTitle: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: number;
  score: number;
}

export interface RecallOpts {
  excludeSessionId?: string;
  perSnippetChars?: number;
  maxSnippets?: number;
  scanLimit?: number;
}

export async function recallAcrossSessions(
  query: string,
  opts: RecallOpts = {}
): Promise<ScoredSnippet[]> {
  const tokens = tokenize(query);
  if (!tokens.length) return [];
  const tokenSet = new Set(tokens);

  const scanLimit = opts.scanLimit ?? 5000;
  const messages = (await db.messages.orderBy('createdAt').reverse().limit(scanLimit).toArray()) as Message[];
  if (!messages.length) return [];

  const sessionIds = Array.from(new Set(messages.map((m) => m.sessionId)));
  const sessions = await db.sessions.bulkGet(sessionIds);
  const sessionMap = new Map<string, Session>();
  for (const s of sessions) if (s) sessionMap.set(s.id, s);

  const perSnippetChars = opts.perSnippetChars ?? 360;
  const maxSnippets = opts.maxSnippets ?? 5;

  const bySession = new Map<string, ScoredSnippet[]>();

  for (const m of messages) {
    if (!m.content || !m.content.trim()) continue;
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    if (opts.excludeSessionId && m.sessionId === opts.excludeSessionId) continue;
    const session = sessionMap.get(m.sessionId);
    if (!session) continue;

    const msgTokens = tokenize(m.content);
    if (!msgTokens.length) continue;
    let overlap = 0;
    for (const t of msgTokens) if (tokenSet.has(t)) overlap++;
    if (!overlap) continue;

    const recencyBoost = 1 + Math.max(0, 30 - (Date.now() - m.createdAt) / 86_400_000) * 0.02;
    const score = (overlap / Math.sqrt(msgTokens.length)) * recencyBoost;

    const arr = bySession.get(m.sessionId) || [];
    arr.push({
      sessionId: m.sessionId,
      sessionTitle: session.title,
      role: m.role,
      text: m.content.slice(0, perSnippetChars).trim() + (m.content.length > perSnippetChars ? '…' : ''),
      createdAt: m.createdAt,
      score
    });
    bySession.set(m.sessionId, arr);
  }

  // Keep the two highest-scoring snippets per session (for cross-session
  // diversity), then sort globally. Capping during the newest-first scan
  // instead would drop a session's best match in favour of weaker-but-newer
  // ones, defeating the scoring.
  const scored: ScoredSnippet[] = [];
  for (const arr of bySession.values()) {
    arr.sort((a, b) => b.score - a.score);
    scored.push(...arr.slice(0, 2));
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxSnippets);
}

export function formatRecallBlock(snippets: ScoredSnippet[]): string {
  if (!snippets.length) return '';
  // Group by sessionId, not title: the default titles ("New chat"/"Untitled")
  // collide constantly, so grouping by title merges unrelated conversations
  // under one heading. Keep the title only for display.
  const groups = new Map<string, { title: string; items: ScoredSnippet[] }>();
  for (const s of snippets) {
    const group = groups.get(s.sessionId) || { title: s.sessionTitle, items: [] };
    group.items.push(s);
    groups.set(s.sessionId, group);
  }
  const lines: string[] = ['Relevant context from your other chats with this user (cross-session memory):'];
  for (const { title, items } of groups.values()) {
    lines.push(`\n— from "${title}":`);
    for (const s of items) {
      lines.push(`  ${s.role === 'user' ? 'they said' : 'you said'}: ${s.text}`);
    }
  }
  return lines.join('\n');
}
