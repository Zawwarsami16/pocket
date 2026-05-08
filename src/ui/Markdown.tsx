import { useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import 'highlight.js/styles/github-dark.css';

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('json', json);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('css', css);

marked.setOptions({
  breaks: true,
  gfm: true
});

const renderer = new marked.Renderer();
const baseCode = renderer.code.bind(renderer);
renderer.code = ({ text, lang }: any) => {
  const language = lang && hljs.getLanguage(lang) ? lang : '';
  let highlighted = text;
  try {
    highlighted = language ? hljs.highlight(text, { language }).value : hljs.highlightAuto(text).value;
  } catch {
    return baseCode({ text, lang } as any);
  }
  return `<pre><code class="hljs language-${language || 'plaintext'}">${highlighted}</code></pre>`;
};

export function Markdown({ source }: { source: string }) {
  const html = useMemo(() => {
    const raw = marked.parse(source, { renderer, async: false }) as string;
    return DOMPurify.sanitize(raw);
  }, [source]);
  return <div className="md text-ink-100" dangerouslySetInnerHTML={{ __html: html }} />;
}
