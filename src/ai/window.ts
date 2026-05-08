import type { ChatTurn } from '../providers/types';
import { estimateTokens } from './tokens';

export interface WindowOpts {
  maxInputTokens: number;
  keepLast: number;
}

export function applyWindow(turns: ChatTurn[], opts: WindowOpts): { messages: ChatTurn[]; summarizedCount: number } {
  if (turns.length <= opts.keepLast) return { messages: turns, summarizedCount: 0 };

  const total = (m: ChatTurn[]) => m.reduce((n, t) => n + t.parts.reduce((s, p) => s + estimateTokens(p.text || ''), 0), 0);
  if (total(turns) <= opts.maxInputTokens) return { messages: turns, summarizedCount: 0 };

  const tail = turns.slice(-opts.keepLast);
  const head = turns.slice(0, -opts.keepLast);

  const compactedText = head
    .map((t) => `${t.role}: ${t.parts.map((p) => p.text || (p.kind === 'image' ? '[image]' : p.kind === 'pdf' ? '[pdf]' : '')).join(' ').slice(0, 240)}`)
    .join('\n');

  const summaryTurn: ChatTurn = {
    role: 'system',
    parts: [{ kind: 'text', text: `Earlier conversation (compacted, ${head.length} turns):\n${compactedText}` }]
  };

  return { messages: [summaryTurn, ...tail], summarizedCount: head.length };
}
