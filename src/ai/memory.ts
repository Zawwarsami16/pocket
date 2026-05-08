import { rememberFact, recallFacts, harvestMemorize } from '../db/facts';

export async function harvestAndStore(text: string, sessionId?: string): Promise<{ cleaned: string; saved: number }> {
  const { cleaned, facts } = harvestMemorize(text);
  let saved = 0;
  for (const f of facts) {
    const ok = await rememberFact(f, sessionId);
    if (ok) saved++;
  }
  return { cleaned, saved };
}

export async function awarenessBlock(query: string): Promise<string | undefined> {
  const facts = await recallFacts(query, 8);
  if (!facts.length) return undefined;
  const lines = facts.map((f) => `- ${f.text}`);
  return `What you remember about this user (from past chats):\n${lines.join('\n')}`;
}
