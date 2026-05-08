const FILLER = new Set([
  'really','very','just','quite','actually','basically','literally','honestly','probably','perhaps','maybe','somewhat','rather','simply','essentially','definitely','obviously','certainly','clearly','please','kindly'
]);

const ABBREV: Record<string, string> = {
  'because': 'bc',
  'before': 'b4',
  'between': 'btw',
  'about': 'abt',
  'with': 'w/',
  'without': 'w/o',
  'should': 'shd',
  'would': 'wd',
  'could': 'cd',
  'through': 'thru',
  'though': 'tho',
  'application': 'app',
  'function': 'fn',
  'parameter': 'param',
  'parameters': 'params',
  'configuration': 'config',
  'response': 'resp',
  'request': 'req',
  'database': 'db',
  'documentation': 'docs',
  'message': 'msg',
  'messages': 'msgs',
  'information': 'info',
  'environment': 'env',
  'development': 'dev',
  'production': 'prod',
  'reference': 'ref',
  'directory': 'dir'
};

function stripFiller(s: string): string {
  return s
    .split(/(\s+)/)
    .filter((tok) => {
      if (/^\s+$/.test(tok)) return true;
      return !FILLER.has(tok.toLowerCase());
    })
    .join('')
    .replace(/\s{2,}/g, ' ');
}

function applyAbbrev(s: string): string {
  return s.replace(/\b([A-Za-z]+)\b/g, (m) => {
    const lower = m.toLowerCase();
    return ABBREV[lower] ?? m;
  });
}

function collapseWhitespace(s: string): string {
  return s.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

export function compressLight(s: string): string {
  return collapseWhitespace(stripFiller(s));
}

export function compressAggressive(s: string): string {
  return collapseWhitespace(applyAbbrev(stripFiller(s)));
}

export type CompressMode = 'off' | 'light' | 'aggressive';

export function compress(s: string, mode: CompressMode): string {
  if (mode === 'off' || !s) return s;
  return mode === 'light' ? compressLight(s) : compressAggressive(s);
}

export function estimateSavings(original: string, compressed: string): { saved: number; pct: number } {
  const o = original.length;
  const c = compressed.length;
  return { saved: o - c, pct: o ? Math.round(((o - c) / o) * 100) : 0 };
}
