import type { Provider } from './types';
import { listModelsOAI, chatOAI } from './openai_compat';

const BASE = 'https://api.together.xyz/v1';

export const together: Provider = {
  id: 'together',
  label: 'Together AI',
  detect: () => false,
  defaultBaseUrl: BASE,
  corsStatus: 'ok',
  notes: 'Open weights catalog. Llama, DeepSeek, Qwen, Flux.',

  listModels: (key, baseUrl) => listModelsOAI(key, { baseUrl: baseUrl || BASE }),

  chat: (req, key, baseUrl, signal) => chatOAI(req, key, { baseUrl: baseUrl || BASE }, signal)
};
