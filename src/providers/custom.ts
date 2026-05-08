import type { Provider } from './types';
import { listModelsOAI, chatOAI } from './openai_compat';

export const custom: Provider = {
  id: 'custom',
  label: 'Custom (OpenAI-compatible)',
  detect: () => false,
  defaultBaseUrl: '',
  corsStatus: 'partial',
  notes: 'Any OpenAI-compatible endpoint. xAI, local llama.cpp, vLLM, ZAI shim — paste base URL + key.',

  async listModels(key, baseUrl) {
    if (!baseUrl) return [];
    return listModelsOAI(key, { baseUrl });
  },

  chat(req, key, baseUrl, signal) {
    if (!baseUrl) {
      return (async function* () {
        yield { type: 'error' as const, error: 'No base URL set for custom provider.' };
      })();
    }
    return chatOAI(req, key, { baseUrl }, signal);
  }
};
