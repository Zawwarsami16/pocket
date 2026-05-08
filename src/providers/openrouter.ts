import type { Provider } from './types';
import { listModelsOAI, chatOAI } from './openai_compat';

const BASE = 'https://openrouter.ai/api/v1';

const headers = () => ({
  'HTTP-Referer': typeof location !== 'undefined' ? location.origin : 'https://pocket.local',
  'X-Title': 'Pocket'
});

export const openrouter: Provider = {
  id: 'openrouter',
  label: 'OpenRouter',
  detect: (k) => k.startsWith('sk-or-'),
  defaultBaseUrl: BASE,
  corsStatus: 'ok',
  notes: 'Aggregator. One key, hundreds of models including OpenAI, Gemini, Llama, Mistral.',

  listModels: (key, baseUrl) => listModelsOAI(key, { baseUrl: baseUrl || BASE, extraHeaders: headers() }),

  chat: (req, key, baseUrl, signal) => chatOAI(req, key, { baseUrl: baseUrl || BASE, extraHeaders: headers() }, signal)
};
