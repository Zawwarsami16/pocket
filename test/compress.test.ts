import { describe, it, expect } from 'vitest';
import {
  compress,
  compressLight,
  compressAggressive,
  estimateSavings,
} from '../src/ai/compress';

describe('compressLight', () => {
  it('drops filler words but keeps the surrounding sentence intact', () => {
    expect(compressLight('this is really just a very simple test')).toBe(
      'this is a simple test',
    );
  });

  it('leaves a sentence with no filler untouched', () => {
    expect(compressLight('the cat sat')).toBe('the cat sat');
  });

  it('collapses runs of spaces and blank lines', () => {
    expect(compressLight('a    b\n\n\n\nc')).toBe('a b c');
  });

  it('handles filler at the start and end of the string', () => {
    expect(compressLight('really fast')).toBe('fast');
  });
});

describe('compressAggressive', () => {
  it('abbreviates known words after stripping filler', () => {
    expect(compressAggressive('this is really because of the application')).toBe(
      'this is bc of the app',
    );
  });

  it('abbreviates technical vocabulary', () => {
    expect(
      compressAggressive('the configuration of the database environment'),
    ).toBe('the config of the db env');
  });

  it('matches abbreviations case-insensitively and emits the lowercase form', () => {
    expect(compressAggressive('Because Configuration')).toBe('bc config');
  });

  it('abbreviates words adjacent to punctuation', () => {
    expect(compressAggressive('about, without')).toBe('abt, w/o');
  });

  it('leaves words with no abbreviation untouched', () => {
    expect(compressAggressive('the cat sat')).toBe('the cat sat');
  });
});

describe('compress dispatcher', () => {
  it('returns the input verbatim in off mode', () => {
    expect(compress('really just testing', 'off')).toBe('really just testing');
  });

  it('returns empty input verbatim regardless of mode', () => {
    expect(compress('', 'aggressive')).toBe('');
    expect(compress('', 'light')).toBe('');
  });

  it('routes light mode through compressLight (no abbreviations)', () => {
    expect(compress('really the configuration', 'light')).toBe(
      'the configuration',
    );
  });

  it('routes aggressive mode through compressAggressive (abbreviations applied)', () => {
    expect(compress('really the configuration', 'aggressive')).toBe(
      'the config',
    );
  });
});

describe('estimateSavings', () => {
  it('reports characters saved and the rounded percentage', () => {
    expect(estimateSavings('aaaaaaaaaa', 'aaaaa')).toEqual({ saved: 5, pct: 50 });
  });

  it('reports zero savings for an empty original without dividing by zero', () => {
    expect(estimateSavings('', '')).toEqual({ saved: 0, pct: 0 });
  });

  it('rounds the percentage rather than truncating', () => {
    // 3 of 7 chars removed → 42.857% → rounds to 43
    expect(estimateSavings('abcdefg', 'abcd')).toEqual({ saved: 3, pct: 43 });
  });
});
