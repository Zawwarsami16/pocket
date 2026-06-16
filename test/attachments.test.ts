import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db/schema';
import { addAttachment, getAttachment, getAttachments, blobToBase64, blobToText } from '../src/db/attachments';

beforeEach(async () => { await db.attachments.clear(); });

function file(content: string, name = 'f.txt', type = 'text/plain'): File {
  return new File([new TextEncoder().encode(content)], name, { type });
}

async function sha256(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

describe('addAttachment', () => {
  it('stores a file and classifies its kind from the mime type', async () => {
    const img = await addAttachment('s1', file('a', 'p.png', 'image/png'));
    const pdf = await addAttachment('s1', file('b', 'd.pdf', 'application/pdf'));
    const txt = await addAttachment('s1', file('c', 't.txt', 'text/plain'));
    const json = await addAttachment('s1', file('d', 'd.json', 'application/json'));
    const other = await addAttachment('s1', file('e', 'b.bin', 'application/octet-stream'));
    expect(img.kind).toBe('image');
    expect(pdf.kind).toBe('pdf');
    expect(txt.kind).toBe('text');
    expect(json.kind).toBe('text');
    expect(other.kind).toBe('other');
  });

  it('falls back to application/octet-stream when the file has no type', async () => {
    const a = await addAttachment('s1', new File([new Uint8Array([1, 2, 3])], 'noext'));
    expect(a.mime).toBe('application/octet-stream');
    expect(a.kind).toBe('other');
  });

  it('dedups the same content within a session and returns the existing row (stable id)', async () => {
    const first = await addAttachment('s1', file('same bytes'));
    const second = await addAttachment('s1', file('same bytes', 'renamed.txt'));
    expect(second.id).toBe(first.id);
    expect(await db.attachments.where('sessionId').equals('s1').count()).toBe(1);
  });

  it('keeps separate rows for the same content in different sessions', async () => {
    const a = await addAttachment('s1', file('shared'));
    const b = await addAttachment('s2', file('shared'));
    expect(b.id).not.toBe(a.id);
    expect(a.hash).toBe(b.hash);
  });

  it('re-adding the same content to a session never duplicates, even when it first appeared in another session', async () => {
    // s1 holds the content under an id that sorts first in the hash index,
    // so a per-session lookup that only inspects the first row by hash sees s1, not s2.
    const content = 'cross-session content';
    const hash = await sha256(content);
    await db.attachments.put({
      id: '0000-first', sessionId: 's1', name: 'a.txt', mime: 'text/plain',
      size: content.length, blob: new Blob([new TextEncoder().encode(content)], { type: 'text/plain' }),
      hash, kind: 'text', createdAt: Date.now()
    });
    await addAttachment('s2', file(content));
    await addAttachment('s2', file(content));
    await addAttachment('s2', file(content));
    expect(await db.attachments.where('sessionId').equals('s2').count()).toBe(1);
  });
});

describe('getAttachment / getAttachments', () => {
  it('returns undefined for a missing id and filters missing ids from the batch', async () => {
    const a = await addAttachment('s1', file('one'));
    expect(await getAttachment('nope')).toBeUndefined();
    expect(await getAttachments([])).toEqual([]);
    const rows = await getAttachments([a.id, 'missing']);
    expect(rows.map((r) => r.id)).toEqual([a.id]);
  });
});

describe('blob helpers', () => {
  it('round-trips text and base64 from a stored blob', async () => {
    const a = await addAttachment('s1', file('hello, pocket'));
    expect(await blobToText(a.blob)).toBe('hello, pocket');
    expect(await blobToBase64(a.blob)).toBe(btoa('hello, pocket'));
  });
});
