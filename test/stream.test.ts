import { describe, it, expect } from 'vitest';
import { sseLines, parseSseEvent, sseEvents } from '../src/ai/stream';

function resp(chunks: string[]): Response {
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(ch));
      c.close();
    },
  });
  return new Response(stream);
}

async function collect<T>(g: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of g) out.push(x);
  return out;
}

describe('sseLines', () => {
  it('splits on newlines, strips trailing CR, and emits a final empty line', async () => {
    expect(await collect(sseLines(resp(['a\r\nb\n'])))).toEqual(['a', 'b', '']);
  });

  it('reassembles a line split across two read chunks', async () => {
    expect(await collect(sseLines(resp(['da', 'ta: x\n\n'])))).toEqual(['data: x', '', '']);
  });

  it('flushes a trailing buffer with no terminating newline before the final empty line', async () => {
    expect(await collect(sseLines(resp(['tail'])))).toEqual(['tail', '']);
  });

  it('throws when the response has no body', async () => {
    await expect(collect(sseLines(new Response(null)))).rejects.toThrow('no body');
  });

  it('aborts when the signal is already aborted', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(collect(sseLines(resp(['x\n']), ctrl.signal))).rejects.toThrow('aborted');
  });
});

describe('parseSseEvent', () => {
  it('reads the event name and strips exactly one space after data:', () => {
    expect(parseSseEvent(['event: msg', 'data: hello', 'data:  world'])).toEqual({
      event: 'msg',
      data: 'hello\n world',
    });
  });

  it('joins multiple data lines with newlines and leaves event undefined', () => {
    expect(parseSseEvent(['data: a', 'data: b'])).toEqual({ event: undefined, data: 'a\nb' });
  });

  it('returns undefined data when no data line is present', () => {
    expect(parseSseEvent(['event: ping'])).toEqual({ event: 'ping', data: undefined });
  });

  it('ignores lines that are neither event: nor data:', () => {
    expect(parseSseEvent([': keep-alive', 'id: 7', 'data: x'])).toEqual({
      event: undefined,
      data: 'x',
    });
  });
});

describe('sseEvents', () => {
  it('groups lines into events on blank-line boundaries and skips comment lines', async () => {
    const events = await collect(sseEvents(resp([': comment\nevent: a\ndata: 1\n\ndata: 2\n\n'])));
    expect(events).toEqual([{ event: 'a', data: '1' }, { event: undefined, data: '2' }]);
  });

  it('yields a final unterminated block that has no trailing blank line', async () => {
    expect(await collect(sseEvents(resp(['data: end'])))).toEqual([
      { event: undefined, data: 'end' },
    ]);
  });
});
