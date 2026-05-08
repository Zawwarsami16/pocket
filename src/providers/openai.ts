import type { Provider } from './types';
import { listModelsOAI, chatOAI } from './openai_compat';

const BASE = 'https://api.openai.com/v1';

export const openai: Provider = {
  id: 'openai',
  label: 'OpenAI',
  detect: (k) => /^sk-(proj-)?[A-Za-z0-9_-]{20,}/.test(k) && !k.startsWith('sk-ant-') && !k.startsWith('sk-or-'),
  defaultBaseUrl: BASE,
  corsStatus: 'blocked',
  notes: 'OpenAI does not allow browser-direct calls (no CORS). Use OpenRouter for GPT-5 / 4o / o1 access.',

  listModels: (key, baseUrl) => listModelsOAI(key, { baseUrl: baseUrl || BASE }),
  chat: (req, key, baseUrl, signal) => chatOAI(req, key, { baseUrl: baseUrl || BASE }, signal)
};
