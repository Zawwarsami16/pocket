import type { Provider } from './types';
import { anthropic } from './anthropic';
import { openrouter } from './openrouter';
import { groq } from './groq';
import { together } from './together';
import { openai } from './openai';
import { custom } from './custom';

export const PROVIDERS: Provider[] = [anthropic, openrouter, groq, together, openai, custom];

export function getProvider(id: string): Provider | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

export function detectProvider(key: string): Provider | undefined {
  const k = key.trim();
  if (!k) return undefined;
  return PROVIDERS.find((p) => p.detect(k));
}
