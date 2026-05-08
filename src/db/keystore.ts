import { db, type Setting } from './schema';

export interface KeyEntry {
  providerId: string;
  apiKey: string;
  baseUrl?: string;
  addedAt: number;
}

const KEYS_KEY = 'apiKeys';
const ACTIVE_KEY = 'activeProvider';
const ACTIVE_MODEL = 'activeModel';

async function read<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key);
  return (row?.value as T) ?? fallback;
}

async function write(key: string, value: unknown) {
  const row: Setting = { key, value };
  await db.settings.put(row);
}

export async function getKeys(): Promise<KeyEntry[]> {
  return read<KeyEntry[]>(KEYS_KEY, []);
}

export async function setKey(entry: KeyEntry) {
  const all = await getKeys();
  const idx = all.findIndex((k) => k.providerId === entry.providerId);
  if (idx >= 0) all[idx] = entry; else all.push(entry);
  await write(KEYS_KEY, all);
}

export async function removeKey(providerId: string) {
  const all = await getKeys();
  await write(KEYS_KEY, all.filter((k) => k.providerId !== providerId));
}

export async function getKey(providerId: string): Promise<KeyEntry | undefined> {
  const all = await getKeys();
  return all.find((k) => k.providerId === providerId);
}

export async function getActive(): Promise<{ providerId?: string; modelId?: string }> {
  const [providerId, modelId] = await Promise.all([
    read<string | undefined>(ACTIVE_KEY, undefined),
    read<string | undefined>(ACTIVE_MODEL, undefined)
  ]);
  return { providerId, modelId };
}

export async function setActive(providerId: string, modelId: string) {
  await write(ACTIVE_KEY, providerId);
  await write(ACTIVE_MODEL, modelId);
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  return read(key, fallback);
}

export async function setSetting(key: string, value: unknown) {
  await write(key, value);
}
