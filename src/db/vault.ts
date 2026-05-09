import { encryptString, decryptString, type EncryptedBlob } from '../lib/crypto';
import { getKeys, setKey as rawSetKey, removeKey as rawRemoveKey, getActive, setActive, type KeyEntry } from './keystore';
import { getSetting, setSetting } from './keystore';

const VAULT_KEY = 'vaultBlob';
const VAULT_ENABLED = 'vaultEnabled';

let unlockedPassphrase: string | null = null;
let lockTimer: ReturnType<typeof setTimeout> | null = null;

export async function isVaultEnabled(): Promise<boolean> {
  return getSetting<boolean>(VAULT_ENABLED, false);
}

export async function isLocked(): Promise<boolean> {
  if (!(await isVaultEnabled())) return false;
  return unlockedPassphrase === null;
}

function armLockTimer() {
  if (lockTimer) clearTimeout(lockTimer);
  lockTimer = setTimeout(() => { unlockedPassphrase = null; }, 30 * 60 * 1000);
}

export async function setupVault(passphrase: string): Promise<void> {
  const existingKeys = await getKeys();
  const blob = await encryptString(JSON.stringify(existingKeys), passphrase);
  await setSetting(VAULT_KEY, blob);
  await setSetting(VAULT_ENABLED, true);
  unlockedPassphrase = passphrase;
  armLockTimer();
}

export async function unlockVault(passphrase: string): Promise<KeyEntry[]> {
  const blob = await getSetting<EncryptedBlob | null>(VAULT_KEY, null);
  if (!blob) throw new Error('Vault not initialized');
  const json = await decryptString(blob, passphrase);
  const entries: KeyEntry[] = JSON.parse(json);
  unlockedPassphrase = passphrase;
  armLockTimer();
  for (const e of entries) await rawSetKey(e);
  return entries;
}

export function lockVault() {
  unlockedPassphrase = null;
  if (lockTimer) clearTimeout(lockTimer);
  lockTimer = null;
}

export async function disableVault(): Promise<void> {
  unlockedPassphrase = null;
  await setSetting(VAULT_ENABLED, false);
  await setSetting(VAULT_KEY, null);
}

export async function persistVaultIfEnabled(): Promise<void> {
  if (!(await isVaultEnabled()) || !unlockedPassphrase) return;
  const keys = await getKeys();
  const blob = await encryptString(JSON.stringify(keys), unlockedPassphrase);
  await setSetting(VAULT_KEY, blob);
  armLockTimer();
}

export async function setKeyEncrypted(entry: KeyEntry): Promise<void> {
  await rawSetKey(entry);
  await persistVaultIfEnabled();
}

export async function removeKeyEncrypted(providerId: string): Promise<void> {
  await rawRemoveKey(providerId);
  await persistVaultIfEnabled();
}

export { getActive, setActive };
