import type { Provider } from './types';
import { listModelsOAI, chatOAI } from './openai_compat';

const BASE = 'https://api.groq.com/openai/v1';

export const groq: Provider = {
  id: 'groq',
  label: 'Groq',
  detect: (k) => k.startsWith('gsk_'),
  defaultBaseUrl: BASE,
  corsStatus: 'ok',
  notes: 'Fast Llama / Mixtral / Whisper inference.',

  listModels: (key, baseUrl) => listModelsOAI(key, { baseUrl: baseUrl || BASE }),

  chat: (req, key, baseUrl, signal) => chatOAI(req, key, { baseUrl: baseUrl || BASE }, signal)
};
