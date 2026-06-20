import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db/schema';
import { rememberFact, recallFacts, topFacts } from '../src/db/facts';

beforeEach(async () => {
  await db.facts.clear();
});

describe('rememberFact', () => {
  it('stores a fact with tokenized tags', async () => {
    const f = await rememberFact('User lives in Mississauga');
    expect(f).not.toBeNull();
    expect(f!.tags).toContain('user');
    expect(f!.tags).toContain('lives');
    expect(f!.tags).toContain('mississauga');
    expect(f!.tags).not.toContain('in'); // stop word
  });

  it('rejects empty or oversized text', async () => {
    expect(await rememberFact('   ')).toBeNull();
    expect(await rememberFact('x'.repeat(601))).toBeNull();
  });

  it('deduplicates identical text and bumps hits instead of inserting', async () => {
    await rememberFact('Favorite language is Rust');
    const again = await rememberFact('favorite language is rust'); // case-insensitive match
    expect(again!.hits).toBe(1);
    expect(await db.facts.count()).toBe(1);
  });
});

describe('recallFacts', () => {
  it('only returns facts whose tags actually overlap the query', async () => {
    await rememberFact('User enjoys hiking in the mountains');
    await rememberFact('User dislikes spicy food');
    await rememberFact('The capital of France is Paris');

    const hits = await recallFacts('what mountains can I hike');
    const texts = hits.map((f) => f.text);
    expect(texts).toContain('User enjoys hiking in the mountains');
    expect(texts).not.toContain('User dislikes spicy food');
    expect(texts).not.toContain('The capital of France is Paris');
  });

  it('returns an empty array when nothing overlaps', async () => {
    await rememberFact('User dislikes spicy food');
    expect(await recallFacts('quantum chromodynamics')).toEqual([]);
  });

  it('returns an empty array for a query of only stop words', async () => {
    await rememberFact('User dislikes spicy food');
    expect(await recallFacts('the a an of to')).toEqual([]);
  });

  it('ranks higher-overlap facts first', async () => {
    await rememberFact('Rust memory safety guarantees');
    await rememberFact('Rust is fast and Rust is safe for memory work');
    const hits = await recallFacts('rust memory safety');
    expect(hits[0].text).toContain('Rust memory safety guarantees');
  });

  it('increments hit counts on recalled facts', async () => {
    const f = await rememberFact('User owns a kayak');
    await recallFacts('kayak');
    const reread = await db.facts.get(f!.id);
    expect(reread!.hits).toBe(1);
  });

  it('returns facts with already-incremented hit counts (not stale pre-update values)', async () => {
    await rememberFact('User owns a kayak');
    const hits = await recallFacts('kayak');
    // The returned objects must reflect the increment written to the DB,
    // matching the contract of rememberFact which also returns the updated value.
    expect(hits).toHaveLength(1);
    expect(hits[0].hits).toBe(1);
  });
});

describe('topFacts', () => {
  it('orders by hits then recency', async () => {
    const a = await rememberFact('alpha fact about kayak');
    await rememberFact('beta fact about kayak');
    await recallFacts('kayak'); // bumps both to 1 hit
    await recallFacts('alpha'); // bumps alpha to 2 hits
    const top = await topFacts(5);
    expect(top[0].id).toBe(a!.id);
  });
});
