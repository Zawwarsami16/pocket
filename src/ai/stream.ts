export async function* sseLines(res: Response, signal?: AbortSignal): AsyncGenerator<string> {
  if (!res.body) throw new Error('no body');
  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buf = '';
  try {
    while (true) {
      if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, idx).replace(/\r$/, '');
        buf = buf.slice(idx + 1);
        if (line) yield line;
      }
    }
    if (buf.trim()) yield buf.trim();
  } finally {
    try { reader.releaseLock(); } catch {}
  }
}

export function parseSseEvent(lines: string[]): { event?: string; data?: string } {
  let event: string | undefined;
  const dataParts: string[] = [];
  for (const ln of lines) {
    if (ln.startsWith('event:')) event = ln.slice(6).trim();
    else if (ln.startsWith('data:')) dataParts.push(ln.slice(5).trim());
  }
  return { event, data: dataParts.length ? dataParts.join('\n') : undefined };
}

export async function* sseEvents(res: Response, signal?: AbortSignal): AsyncGenerator<{ event?: string; data?: string }> {
  let block: string[] = [];
  for await (const line of sseLines(res, signal)) {
    if (line === '') {
      if (block.length) {
        yield parseSseEvent(block);
        block = [];
      }
      continue;
    }
    block.push(line);
  }
  if (block.length) yield parseSseEvent(block);
}
