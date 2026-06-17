import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../src/db/schema';
import { getKeys, setKey, type KeyEntry } from '../src/db/keystore';
import { decryptString, type EncryptedBlob } from '../src/lib/crypto';
import {
  isVaultEnabled,
  isLocked,
  setupVault,
  unlockVault,
  lockVault,
  disableVault,
  setKeyEncrypted,
  removeKeyEncrypted
} from '../src/db/vault';

const key = (providerId: string, apiKey: string, addedAt = 1): KeyEntry => ({
  providerId,
  apiKey,
  addedAt
});

async function storedBlob(): Promise<EncryptedBlob | null> {
  const row = await db.settings.get('vaultBlob');
  return (row?.value as EncryptedBlob | null) ?? null;
}

beforeEach(async () => {
  await db.settings.clear();
  lockVault(); // reset module-level passphrase + timer between tests
});

afterEach(() => {
  lockVault(); // never leak the 30-min auto-lock timer into the next test
});

describe('isVaultEnabled / isLocked defaults', () => {
  it('reports disabled and unlocked before any setup', async () => {
    expect(await isVaultEnabled()).toBe(false);
    // a vault that was never enabled is never "locked" — nothing to protect
    expect(await isLocked()).toBe(false);
  });
});

describe('setupVault', () => {
  it('enables the vault and leaves it unlocked', async () => {
    await setKey(key('openai', 'sk-secret-12345'));
    await setupVault('hunter2');
    expect(await isVaultEnabled()).toBe(true);
    expect(await isLocked()).toBe(false);
  });

  it('encrypts the current keys at rest (plaintext key absent from blob)', async () => {
    await setKey(key('openai', 'sk-secret-12345'));
    await setupVault('hunter2');
    const blob = await storedBlob();
    expect(blob?.v).toBe(1);
    expect(typeof blob?.salt).toBe('string');
    expect(typeof blob?.iv).toBe('string');
    expect(JSON.stringify(blob)).not.toContain('sk-secret-12345');
    // and the ciphertext really decrypts back to the stored key
    const json = await decryptString(blob!, 'hunter2');
    expect(JSON.parse(json)[0].apiKey).toBe('sk-secret-12345');
  });
});

describe('lockVault', () => {
  it('locks an enabled vault', async () => {
    await setupVault('hunter2');
    expect(await isLocked()).toBe(false);
    lockVault();
    expect(await isLocked()).toBe(true);
  });
});

describe('unlockVault', () => {
  it('rehydrates the keystore from the encrypted blob and unlocks', async () => {
    await setKey(key('openai', 'sk-secret-12345'));
    await setupVault('hunter2');
    lockVault();

    // simulate a fresh device whose keystore was wiped but the blob survives
    await db.settings.delete('apiKeys');
    expect(await getKeys()).toHaveLength(0);

    const restored = await unlockVault('hunter2');
    expect(restored).toHaveLength(1);
    expect(restored[0].apiKey).toBe('sk-secret-12345');
    expect((await getKeys())[0].apiKey).toBe('sk-secret-12345');
    expect(await isLocked()).toBe(false);
  });

  it('throws on a wrong passphrase and stays locked', async () => {
    await setKey(key('openai', 'sk-secret-12345'));
    await setupVault('hunter2');
    lockVault();
    await expect(unlockVault('wrong-passphrase')).rejects.toThrow();
    expect(await isLocked()).toBe(true);
  });

  it('throws when the vault was never initialized', async () => {
    await expect(unlockVault('whatever')).rejects.toThrow('Vault not initialized');
  });
});

describe('setKeyEncrypted / removeKeyEncrypted', () => {
  it('re-persists the encrypted blob so new keys survive a re-unlock', async () => {
    await setKey(key('openai', 'sk-secret-12345'));
    await setupVault('hunter2');

    await setKeyEncrypted(key('groq', 'gsk-new'));
    const blob = await storedBlob();
    const json = await decryptString(blob!, 'hunter2');
    const ids = JSON.parse(json).map((e: KeyEntry) => e.providerId);
    expect(ids).toContain('openai');
    expect(ids).toContain('groq');
  });

  it('removes a key from both the keystore and the encrypted blob', async () => {
    await setKey(key('openai', 'sk-secret-12345'));
    await setKey(key('groq', 'gsk-new', 2));
    await setupVault('hunter2');

    await removeKeyEncrypted('openai');
    expect((await getKeys()).map((k) => k.providerId)).toEqual(['groq']);
    const json = await decryptString((await storedBlob())!, 'hunter2');
    expect(JSON.parse(json).map((e: KeyEntry) => e.providerId)).toEqual(['groq']);
  });

  it('does not write a blob when the vault is disabled', async () => {
    await setKey(key('openai', 'sk-secret-12345'));
    await setKeyEncrypted(key('groq', 'gsk-new')); // vault never enabled
    expect(await storedBlob()).toBeNull();
  });
});

describe('disableVault', () => {
  it('clears the enabled flag and wipes the encrypted blob', async () => {
    await setKey(key('openai', 'sk-secret-12345'));
    await setupVault('hunter2');
    expect(await storedBlob()).not.toBeNull();

    await disableVault();
    expect(await isVaultEnabled()).toBe(false);
    expect(await storedBlob()).toBeNull();
    expect(await isLocked()).toBe(false);
  });
});

describe('auto-lock timer', () => {
  it('locks the vault after the 30-minute idle window', async () => {
    // Fake only the timer surface armLockTimer uses; leave the microtask /
    // nextTick machinery real so awaited crypto promises still resolve.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      await setupVault('hunter2');
      expect(await isLocked()).toBe(false);
      vi.advanceTimersByTime(30 * 60 * 1000);
      expect(await isLocked()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
