import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db/schema';
import {
  getKeys,
  setKey,
  removeKey,
  getKey,
  getActive,
  setActive,
  getSetting,
  setSetting
} from '../src/db/keystore';

beforeEach(async () => {
  await db.settings.clear();
});

describe('getKeys', () => {
  it('returns an empty array when nothing is stored', async () => {
    expect(await getKeys()).toEqual([]);
  });
});

describe('setKey', () => {
  it('inserts new providers in the order they were added', async () => {
    await setKey({ providerId: 'openai', apiKey: 'k1', addedAt: 1 });
    await setKey({ providerId: 'anthropic', apiKey: 'k2', baseUrl: 'https://b', addedAt: 2 });
    expect((await getKeys()).map((k) => k.providerId)).toEqual(['openai', 'anthropic']);
  });

  it('upserts an existing provider in place rather than duplicating it', async () => {
    await setKey({ providerId: 'openai', apiKey: 'k1', addedAt: 1 });
    await setKey({ providerId: 'anthropic', apiKey: 'k2', addedAt: 2 });
    await setKey({ providerId: 'openai', apiKey: 'k1b', addedAt: 3 });

    const all = await getKeys();
    expect(all).toHaveLength(2);
    expect(all.map((k) => k.providerId)).toEqual(['openai', 'anthropic']); // position preserved
    expect((await getKey('openai'))!.apiKey).toBe('k1b'); // fields replaced
  });

  it('round-trips the optional baseUrl', async () => {
    await setKey({ providerId: 'anthropic', apiKey: 'k', baseUrl: 'https://proxy', addedAt: 9 });
    expect((await getKey('anthropic'))!.baseUrl).toBe('https://proxy');
  });
});

describe('getKey', () => {
  it('returns the matching entry or undefined', async () => {
    await setKey({ providerId: 'openai', apiKey: 'k1', addedAt: 1 });
    expect((await getKey('openai'))!.apiKey).toBe('k1');
    expect(await getKey('missing')).toBeUndefined();
  });
});

describe('removeKey', () => {
  it('drops only the named provider', async () => {
    await setKey({ providerId: 'openai', apiKey: 'k1', addedAt: 1 });
    await setKey({ providerId: 'anthropic', apiKey: 'k2', addedAt: 2 });

    await removeKey('anthropic');

    expect((await getKeys()).map((k) => k.providerId)).toEqual(['openai']);
    expect(await getKey('anthropic')).toBeUndefined();
  });

  it('is a no-op when the provider is absent', async () => {
    await setKey({ providerId: 'openai', apiKey: 'k1', addedAt: 1 });
    await removeKey('nope');
    expect(await getKeys()).toHaveLength(1);
  });
});

describe('getActive / setActive', () => {
  it('returns both fields undefined before anything is selected', async () => {
    expect(await getActive()).toEqual({ providerId: undefined, modelId: undefined });
  });

  it('stores and reads back the active provider and model together', async () => {
    await setActive('openai', 'gpt-4');
    expect(await getActive()).toEqual({ providerId: 'openai', modelId: 'gpt-4' });
  });

  it('overwrites a previous selection', async () => {
    await setActive('openai', 'gpt-4');
    await setActive('anthropic', 'claude');
    expect(await getActive()).toEqual({ providerId: 'anthropic', modelId: 'claude' });
  });
});

describe('getSetting / setSetting', () => {
  it('returns the fallback when the key is missing', async () => {
    expect(await getSetting('nope', 'fallback')).toBe('fallback');
  });

  it('round-trips an arbitrary stored value', async () => {
    await setSetting('foo', { a: 1, b: ['x'] });
    expect(await getSetting('foo', null)).toEqual({ a: 1, b: ['x'] });
  });
});
