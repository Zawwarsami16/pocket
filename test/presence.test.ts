import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db/schema';
import { getPresence, setPresence, DEFAULT_PRESENCE } from '../src/ai/presence';

beforeEach(async () => {
  await db.settings.clear();
});

describe('getPresence', () => {
  it('returns the default persona when nothing has been stored', async () => {
    expect(await getPresence()).toBe(DEFAULT_PRESENCE);
  });

  it('returns a previously saved persona verbatim', async () => {
    await setPresence('You are a terse assistant.');
    expect(await getPresence()).toBe('You are a terse assistant.');
  });
});

describe('setPresence', () => {
  it('trims surrounding whitespace before saving', async () => {
    await setPresence('   spaced out   ');
    expect(await getPresence()).toBe('spaced out');
  });

  it('falls back to the default when given an empty string', async () => {
    await setPresence('something');
    await setPresence('');
    expect(await getPresence()).toBe(DEFAULT_PRESENCE);
  });

  it('falls back to the default when given whitespace only (never blanks the persona)', async () => {
    await setPresence('something');
    await setPresence('   \n\t  ');
    expect(await getPresence()).toBe(DEFAULT_PRESENCE);
  });

  it('overwrites an existing persona in place', async () => {
    await setPresence('first');
    await setPresence('second');
    expect(await getPresence()).toBe('second');
  });
});

describe('DEFAULT_PRESENCE', () => {
  it('preserves the MEMORIZE memory contract the rest of the pipeline depends on', async () => {
    expect(DEFAULT_PRESENCE).toContain('MEMORIZE:');
  });
});
