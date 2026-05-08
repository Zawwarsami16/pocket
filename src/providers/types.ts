export interface ModelInfo {
  id: string;
  label?: string;
  contextWindow?: number;
  vision?: boolean;
  supportsPdf?: boolean;
}

export interface ChatPart {
  kind: 'text' | 'image' | 'pdf';
  text?: string;
  mime?: string;
  base64?: string;
  name?: string;
}

export interface ChatTurn {
  role: 'user' | 'assistant' | 'system';
  parts: ChatPart[];
}

export interface ChatRequest {
  modelId: string;
  system?: string;
  messages: ChatTurn[];
  maxTokens?: number;
  temperature?: number;
  cacheSystem?: boolean;
}

export interface ChatChunk {
  type: 'delta' | 'usage' | 'done' | 'error';
  text?: string;
  inTokens?: number;
  outTokens?: number;
  error?: string;
}

export interface Provider {
  id: string;
  label: string;
  detect(key: string): boolean;
  defaultBaseUrl: string;
  corsStatus: 'ok' | 'partial' | 'blocked';
  listModels(key: string, baseUrl?: string): Promise<ModelInfo[]>;
  chat(req: ChatRequest, key: string, baseUrl?: string, signal?: AbortSignal): AsyncGenerator<ChatChunk>;
  notes?: string;
}
