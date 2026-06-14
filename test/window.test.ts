import { describe, it, expect } from 'vitest';
import { applyWindow } from '../src/ai/window';
import type { ChatTurn } from '../src/providers/types';

function userTurn(text: string): ChatTurn {
  return { role: 'user', parts: [{ kind: 'text', text }] };
}

// estimateTokens ≈ ceil(chars / 4), so a 400-char turn ≈ 100 tokens.
function bigTurn(): ChatTurn {
  return userTurn('x'.repeat(400));
}

describe('applyWindow', () => {
  it('returns the turns untouched when there are no more than keepLast', () => {
    const turns = [userTurn('a'), userTurn('b'), userTurn('c')];
    const out = applyWindow(turns, { maxInputTokens: 1, keepLast: 4 });
    expect(out.messages).toBe(turns);
    expect(out.summarizedCount).toBe(0);
  });

  it('returns the turns untouched when they fit within the token budget', () => {
    const turns = [userTurn('a'), userTurn('b'), userTurn('c'), userTurn('d')];
    const out = applyWindow(turns, { maxInputTokens: 10_000, keepLast: 2 });
    expect(out.messages).toBe(turns);
    expect(out.summarizedCount).toBe(0);
  });

  it('compacts the head into one system summary and keeps the last keepLast turns', () => {
    const turns = [bigTurn(), bigTurn(), bigTurn(), userTurn('recent-1'), userTurn('recent-2')];
    const out = applyWindow(turns, { maxInputTokens: 50, keepLast: 2 });

    // One synthetic summary + the two preserved tail turns.
    expect(out.messages).toHaveLength(3);
    expect(out.summarizedCount).toBe(3);

    const [summary, ...tail] = out.messages;
    expect(summary.role).toBe('system');
    expect(summary.parts[0].text).toContain('compacted, 3 turns');
    expect(tail.map((t) => t.parts[0].text)).toEqual(['recent-1', 'recent-2']);
  });

  it('represents non-text parts as placeholders in the compacted summary', () => {
    const turns: ChatTurn[] = [
      { role: 'user', parts: [{ kind: 'image', base64: 'aaa' }] },
      { role: 'assistant', parts: [{ kind: 'pdf', base64: 'bbb' }] },
      bigTurn(),
      userTurn('keep'),
    ];
    const out = applyWindow(turns, { maxInputTokens: 50, keepLast: 1 });

    const summaryText = out.messages[0].parts[0].text!;
    expect(summaryText).toContain('[image]');
    expect(summaryText).toContain('[pdf]');
    expect(out.summarizedCount).toBe(3);
  });

  it('caps each compacted head turn at 240 characters', () => {
    const longLine = 'y'.repeat(1000);
    const turns = [userTurn(longLine), bigTurn(), userTurn('tail')];
    const out = applyWindow(turns, { maxInputTokens: 50, keepLast: 1 });

    const summaryText = out.messages[0].parts[0].text!;
    // The role prefix ("user: ") plus a 240-char slice — never the full 1000.
    expect(summaryText).not.toContain('y'.repeat(241));
    expect(summaryText).toContain('y'.repeat(240));
  });
});
