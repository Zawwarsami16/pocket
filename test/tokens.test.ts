import { describe, it, expect } from 'vitest';
import { estimateTokens, estimateMessagesTokens } from '../src/ai/tokens';

describe('estimateTokens', () => {
  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('uses the char/4 estimate when it dominates', () => {
    // 20 chars / 4 = 5; one word * 1.33 -> 2; max = 5
    expect(estimateTokens('a'.repeat(20))).toBe(5);
  });

  it('uses the word*1.33 estimate when it dominates', () => {
    // "hello": 5 chars -> ceil(5/4)=2; 1 word -> ceil(1.33)=2; max = 2
    expect(estimateTokens('hello')).toBe(2);
  });

  it('counts a multi-word sentence by the larger of the two heuristics', () => {
    // "the quick brown fox": 19 chars -> ceil(19/4)=5; 4 words -> ceil(5.32)=6; max = 6
    expect(estimateTokens('the quick brown fox')).toBe(6);
  });

  it('treats a whitespace-only string as one (trimmed) word', () => {
    // not empty, so guard is skipped: 3 chars -> 1; trim()->"" splits to [""] -> 1 word -> 2
    expect(estimateTokens('   ')).toBe(2);
  });
});

describe('estimateMessagesTokens', () => {
  it('returns the base overhead for an empty conversation', () => {
    expect(estimateMessagesTokens([])).toBe(2);
  });

  it('adds 4 per-turn overhead plus content estimate plus 2 base', () => {
    // "hi": 2 chars -> 1; 1 word -> 2; estimate 2. +4 turn +2 base = 8
    expect(estimateMessagesTokens([{ role: 'user', content: 'hi' }])).toBe(8);
  });

  it('accumulates across multiple turns', () => {
    // two turns of estimate 2 each: (2+4) + (2+4) + 2 = 14
    expect(
      estimateMessagesTokens([
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'yo' }
      ])
    ).toBe(14);
  });
});
