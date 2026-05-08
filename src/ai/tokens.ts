/* Heuristic token estimator. Real tokenizer (tiktoken-wasm) can be plugged in later;
   for live cost meters this gets within ~10-15% of real counts for English/code. */

export function estimateTokens(text: string): number {
  if (!text) return 0;
  const chars = text.length;
  const words = text.trim().split(/\s+/).length;
  return Math.max(Math.ceil(chars / 4), Math.ceil(words * 1.33));
}

export function estimateMessagesTokens(turns: { role: string; content: string }[]): number {
  let n = 0;
  for (const t of turns) n += estimateTokens(t.content) + 4;
  return n + 2;
}
