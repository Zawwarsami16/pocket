import { describe, it, expect } from 'vitest';
import { harvestMemorize } from '../src/db/facts';
import { formatRecallBlock } from '../src/ai/recall';

describe('harvestMemorize', () => {
  it('pulls MEMORIZE lines out of the body and returns them as facts', () => {
    const input = 'Sure, I can help.\nMEMORIZE: user prefers dark mode\nLet me know if you need more.';
    const { cleaned, facts } = harvestMemorize(input);
    expect(facts).toEqual(['user prefers dark mode']);
    expect(cleaned).not.toContain('MEMORIZE');
    expect(cleaned).toContain('Sure, I can help.');
    expect(cleaned).toContain('Let me know if you need more.');
  });

  it('harvests multiple MEMORIZE lines and is case-insensitive', () => {
    const input = 'memorize: fact one\ntext\nMEMORIZE:   fact two  ';
    const { facts } = harvestMemorize(input);
    expect(facts).toEqual(['fact one', 'fact two']);
  });

  it('collapses the blank lines left behind by removed directives', () => {
    const input = 'before\nMEMORIZE: a\nMEMORIZE: b\nafter';
    const { cleaned } = harvestMemorize(input);
    expect(cleaned).not.toMatch(/\n{3,}/);
  });

  it('returns no facts when there is no directive', () => {
    const { cleaned, facts } = harvestMemorize('just a normal reply');
    expect(facts).toEqual([]);
    expect(cleaned).toBe('just a normal reply');
  });
});

describe('formatRecallBlock', () => {
  const snippet = (sessionTitle: string, role: 'user' | 'assistant', text: string) => ({
    sessionId: sessionTitle,
    sessionTitle,
    role,
    text,
    createdAt: 0,
    score: 1
  });

  it('returns an empty string when there are no snippets', () => {
    expect(formatRecallBlock([])).toBe('');
  });

  it('groups snippets by session title and labels speakers', () => {
    const block = formatRecallBlock([
      snippet('Trip planning', 'user', 'I want to visit Kyoto'),
      snippet('Trip planning', 'assistant', 'Kyoto is great in autumn'),
      snippet('Cooking', 'user', 'How do I sear tofu')
    ]);
    expect(block).toContain('from "Trip planning":');
    expect(block).toContain('from "Cooking":');
    expect(block).toContain('they said: I want to visit Kyoto');
    expect(block).toContain('you said: Kyoto is great in autumn');
    // a single grouping header per session
    expect(block.match(/from "Trip planning":/g)).toHaveLength(1);
  });
});
