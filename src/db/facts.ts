import { db, uid, type Fact } from './schema';

const STOP = new Set(['the','a','an','to','of','and','or','for','on','in','with','at','by','is','are','was','were','be','been','this','that','it','as','if','from','i','you','he','she','they','we','me','my','your','our']);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9#_\s]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t && t.length > 2 && !STOP.has(t));
}

export async function rememberFact(text: string, sessionId?: string): Promise<Fact | null> {
  const t = text.trim();
  if (!t || t.length > 600) return null;
  const tags = [...new Set(tokenize(t))];
  const dup = await db.facts.filter((f) => f.text.trim().toLowerCase() === t.toLowerCase()).first();
  if (dup) {
    await db.facts.update(dup.id, { hits: (dup.hits || 0) + 1 });
    return { ...dup, hits: (dup.hits || 0) + 1 };
  }
  const f: Fact = { id: uid(), text: t, tags, createdAt: Date.now(), hits: 0, sessionId };
  await db.facts.put(f);
  return f;
}

export async function recallFacts(query: string, limit = 8): Promise<Fact[]> {
  const tokens = tokenize(query);
  if (!tokens.length) return [];
  const all = await db.facts.toArray();
  const scored = all
    .map((f) => {
      const overlap = tokens.filter((t) => f.tags.includes(t)).length;
      return { f, overlap, score: overlap + (f.hits || 0) * 0.1 };
    })
    .filter((x) => x.overlap > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.f);
  await db.facts.bulkUpdate(scored.map((f) => ({ key: f.id, changes: { hits: (f.hits || 0) + 1 } })));
  return scored;
}

export async function topFacts(limit = 20): Promise<Fact[]> {
  const all = await db.facts.toArray();
  return all
    .sort((a, b) => (b.hits || 0) - (a.hits || 0) || b.createdAt - a.createdAt)
    .slice(0, limit);
}

export async function listFacts(): Promise<Fact[]> {
  return db.facts.orderBy('createdAt').reverse().toArray();
}

export async function deleteFact(id: string) {
  await db.facts.delete(id);
}

const MEMORIZE_RE = /^\s*MEMORIZE:\s*(.+?)\s*$/gim;

export function harvestMemorize(text: string): { cleaned: string; facts: string[] } {
  const facts: string[] = [];
  const cleaned = text.replace(MEMORIZE_RE, (_m, line) => {
    facts.push(String(line).trim());
    return '';
  });
  return { cleaned: cleaned.replace(/\n{3,}/g, '\n\n').trim(), facts };
}
