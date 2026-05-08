import Dexie, { type Table } from 'dexie';

export interface Session {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  providerId: string;
  modelId: string;
  systemPrompt?: string;
  pinned?: 0 | 1;
}

export type Role = 'user' | 'assistant' | 'system';

export interface Message {
  id: string;
  sessionId: string;
  role: Role;
  content: string;
  createdAt: number;
  attachmentIds?: string[];
  tokensIn?: number;
  tokensOut?: number;
  modelId?: string;
  costUsd?: number;
  error?: string;
}

export interface Attachment {
  id: string;
  sessionId: string;
  name: string;
  mime: string;
  size: number;
  blob: Blob;
  hash: string;
  kind: 'image' | 'pdf' | 'text' | 'other';
  createdAt: number;
}

export interface Fact {
  id: string;
  text: string;
  tags: string[];
  createdAt: number;
  hits: number;
  sessionId?: string;
}

export interface Setting {
  key: string;
  value: unknown;
}

class PocketDB extends Dexie {
  sessions!: Table<Session, string>;
  messages!: Table<Message, string>;
  attachments!: Table<Attachment, string>;
  facts!: Table<Fact, string>;
  settings!: Table<Setting, string>;

  constructor() {
    super('pocket');
    this.version(1).stores({
      sessions: 'id, updatedAt, pinned',
      messages: 'id, sessionId, createdAt, [sessionId+createdAt]',
      attachments: 'id, sessionId, hash',
      facts: 'id, createdAt, hits',
      settings: 'key'
    });
  }
}

export const db = new PocketDB();

export const uid = () =>
  (crypto.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`);
