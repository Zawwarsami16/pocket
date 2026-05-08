import { rememberFact, recallFacts, harvestMemorize } from '../db/facts';
import { recallAcrossSessions, formatRecallBlock } from './recall';

export async function harvestAndStore(text: string, sessionId?: string): Promise<{ cleaned: string; saved: number }> {
  const { cleaned, facts } = harvestMemorize(text);
  let saved = 0;
  for (const f of facts) {
    const ok = await rememberFact(f, sessionId);
    if (ok) saved++;
  }
  return { cleaned, saved };
}

export interface AwarenessOpts {
  crossSessionRecall?: boolean;
  excludeSessionId?: string;
}

export async function awarenessBlock(query: string, opts: AwarenessOpts = {}): Promise<string | undefined> {
  const parts: string[] = [];

  const facts = await recallFacts(query, 8);
  if (facts.length) {
    const lines = facts.map((f) => `- ${f.text}`);
    parts.push(`What you remember about this user (saved facts):\n${lines.join('\n')}`);
  }

  if (opts.crossSessionRecall !== false) {
    const snippets = await recallAcrossSessions(query, {
      excludeSessionId: opts.excludeSessionId,
      maxSnippets: 5,
      perSnippetChars: 360
    });
    const block = formatRecallBlock(snippets);
    if (block) parts.push(block);
  }

  return parts.length ? parts.join('\n\n') : undefined;
}
