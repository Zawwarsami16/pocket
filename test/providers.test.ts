import { describe, it, expect } from 'vitest';
import { PROVIDERS, getProvider, detectProvider } from '../src/providers/registry';
import { detectZhubBaseUrl, manifestUrlFromBase } from '../src/providers/zhub';

describe('detectProvider — key auto-detection', () => {
  it('detects Anthropic keys (sk-ant-)', () => {
    expect(detectProvider('sk-ant-api03-abcdEFGH1234567890_ZZ')?.id).toBe('anthropic');
  });

  it('detects OpenRouter keys (sk-or-) and not OpenAI', () => {
    expect(detectProvider('sk-or-v1-0123456789abcdef0123456789abcdef')?.id).toBe('openrouter');
  });

  it('detects Groq keys (gsk_)', () => {
    expect(detectProvider('gsk_0123456789abcdefABCDEFGH')?.id).toBe('groq');
  });

  it('detects zhub keys (zk_)', () => {
    expect(detectProvider('zk_live_0123456789abcdef')?.id).toBe('zhub');
  });

  it('detects classic OpenAI keys (sk-…)', () => {
    expect(detectProvider('sk-' + 'A'.repeat(48))?.id).toBe('openai');
  });

  it('detects OpenAI project keys (sk-proj-…)', () => {
    expect(detectProvider('sk-proj-' + 'b'.repeat(40))?.id).toBe('openai');
  });

  it('does not confuse an Anthropic key for OpenAI even though it starts with sk-', () => {
    // sk-ant- also satisfies the OpenAI char-class regex; precedence + guard must win.
    expect(detectProvider('sk-ant-api03-' + 'c'.repeat(30))?.id).toBe('anthropic');
  });

  it('does not confuse an OpenRouter key for OpenAI', () => {
    expect(detectProvider('sk-or-v1-' + 'd'.repeat(30))?.id).toBe('openrouter');
  });

  it('returns undefined for keys with no recognizable shape', () => {
    // Together keys (bare 64-hex) are intentionally not auto-detected.
    expect(detectProvider('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef')).toBeUndefined();
    expect(detectProvider('not-a-real-key')).toBeUndefined();
  });

  it('returns undefined for empty or whitespace-only input', () => {
    expect(detectProvider('')).toBeUndefined();
    expect(detectProvider('   ')).toBeUndefined();
  });

  it('trims surrounding whitespace before matching', () => {
    expect(detectProvider('  sk-ant-api03-' + 'e'.repeat(30) + '  ')?.id).toBe('anthropic');
    expect(detectProvider('\tgsk_' + 'f'.repeat(20) + '\n')?.id).toBe('groq');
  });

  it('rejects a too-short sk- key (below OpenAI minimum length)', () => {
    expect(detectProvider('sk-short')).toBeUndefined();
  });
});

describe('getProvider — lookup by id', () => {
  it('returns the matching provider for every known id', () => {
    for (const p of PROVIDERS) {
      expect(getProvider(p.id)?.id).toBe(p.id);
    }
  });

  it('returns undefined for an unknown id', () => {
    expect(getProvider('does-not-exist')).toBeUndefined();
  });
});

describe('detectZhubBaseUrl — URL-shape hint', () => {
  it('accepts a zhub-shaped /<name>/v1 URL, with or without trailing slash', () => {
    expect(detectZhubBaseUrl('https://hub.example.com/zai/v1')).toBe(true);
    expect(detectZhubBaseUrl('https://hub.example.com/zai/v1/')).toBe(true);
  });

  it('rejects an empty or v1-less URL', () => {
    expect(detectZhubBaseUrl('')).toBe(false);
    expect(detectZhubBaseUrl('https://api.anthropic.com')).toBe(false);
  });
});

describe('manifestUrlFromBase', () => {
  it('swaps the trailing /v1 for /manifest.json', () => {
    expect(manifestUrlFromBase('https://hub.example.com/zai/v1')).toBe('https://hub.example.com/zai/manifest.json');
    expect(manifestUrlFromBase('https://hub.example.com/zai/v1/')).toBe('https://hub.example.com/zai/manifest.json');
  });
});
