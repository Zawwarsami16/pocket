import type { Provider, ModelInfo } from './types';
import { listModelsOAI, chatOAI } from './openai_compat';

/**
 * zhub provider — first-class support for AIs published via zhub
 * (https://github.com/Zawwarsami16/zhub).
 *
 * Speaks the same OpenAI-compatible Chat Completions wire format as
 * `custom`, but with three additions:
 *   1. Detect zhub-shaped base URLs (ending in /name/v1) so the user gets the
 *      right provider auto-selected when they paste the URL.
 *   2. Detect zhub-shaped api keys (`zk_...`).
 *   3. Expose `fetchManifest()` so the Settings UI can show the publisher's
 *      manifest (description, capabilities, signed status, public key).
 *
 * The chat path delegates to `chatOAI` — zhub serves chat completions in
 * the canonical OpenAI shape, including SSE streaming.
 */

export interface ZhubManifest {
  schema_version?: string;
  name: string;
  description?: string;
  accepts?: string;
  auth?: { type?: string };
  rate_limit?: string;
  capabilities?: Array<{ name: string; description?: string }>;
  public?: boolean;
  operator?: string;
  contact?: string;
  signature?: string;
  public_key?: string;
  endpoints?: Record<string, string>;
  connections?: Array<{ connection_id: string; client_manifest: any; connected_for_seconds: number }>;
}

/**
 * Detects whether a base URL looks like a zhub publisher endpoint.
 * Accepts URLs ending in /<name>/v1 — e.g. hub.example.com/zai/v1.
 */
export function detectZhubBaseUrl(baseUrl: string): boolean {
  if (!baseUrl) return false;
  // Must end in /<name>/v1 (no trailing slash) or /<name>/v1/
  return /\/[A-Za-z0-9_-]+\/v1\/?$/.test(baseUrl.trim());
}

/**
 * Strip the trailing /v1 to reach the manifest endpoint.
 * `hub.example.com/zai/v1` becomes `hub.example.com/zai/manifest.json`.
 */
export function manifestUrlFromBase(baseUrl: string): string {
  const stripped = baseUrl.trim().replace(/\/v1\/?$/, '');
  return `${stripped}/manifest.json`;
}

/**
 * Fetch the publisher's manifest from the hub. No authentication required —
 * manifests are public for discovery. Returns null on any fetch / parse error.
 */
export async function fetchManifest(baseUrl: string, signal?: AbortSignal): Promise<ZhubManifest | null> {
  try {
    const res = await fetch(manifestUrlFromBase(baseUrl), { signal });
    if (!res.ok) return null;
    return (await res.json()) as ZhubManifest;
  } catch {
    return null;
  }
}

const ZHUB_KEY_PREFIX = 'zk_';

export const zhub: Provider = {
  id: 'zhub',
  label: 'zhub-published AI',
  // Detect by api-key prefix; URL-shape detection lives on detectZhubBaseUrl
  // and is consulted by the Settings UI when a base URL is being entered.
  detect: (key: string) => key.trim().startsWith(ZHUB_KEY_PREFIX),
  defaultBaseUrl: '',
  corsStatus: 'partial',
  notes:
    'Any AI published via zhub (github.com/Zawwarsami16/zhub). ' +
    'Base URL must include /v1 — e.g. https://hub.example.com/zai/v1. ' +
    'Keys start with zk_. Manifest preview surfaces description, capabilities, and signed status.',

  async listModels(key: string, baseUrl?: string): Promise<ModelInfo[]> {
    if (!baseUrl) return [];

    // Try the manifest first — it tells us the publisher's name, which is the
    // canonical "model id" for zhub. Fall back to /models if the manifest is
    // unavailable (older zhub versions or non-zhub endpoints).
    const manifest = await fetchManifest(baseUrl);
    if (manifest && manifest.name) {
      return [
        {
          id: manifest.name,
          label: manifest.description ? `${manifest.name} — ${manifest.description}` : manifest.name,
        },
      ];
    }

    return listModelsOAI(key, { baseUrl });
  },

  chat(req, key, baseUrl, signal) {
    if (!baseUrl) {
      return (async function* () {
        yield { type: 'error' as const, error: 'No base URL set for zhub provider.' };
      })();
    }
    return chatOAI(req, key, { baseUrl }, signal);
  },
};
