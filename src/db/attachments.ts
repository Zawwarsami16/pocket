import { db, uid, type Attachment } from './schema';

async function sha256(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function classify(mime: string): Attachment['kind'] {
  if (mime.startsWith('image/')) return 'image';
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('text/') || mime.includes('json') || mime.includes('xml')) return 'text';
  return 'other';
}

export async function addAttachment(sessionId: string, file: File): Promise<Attachment> {
  const buf = await file.arrayBuffer();
  const hash = await sha256(buf);
  const existing = await db.attachments.where('hash').equals(hash).first();
  if (existing && existing.sessionId === sessionId) return existing;

  const a: Attachment = {
    id: uid(),
    sessionId,
    name: file.name,
    mime: file.type || 'application/octet-stream',
    size: file.size,
    blob: new Blob([buf], { type: file.type }),
    hash,
    kind: classify(file.type),
    createdAt: Date.now()
  };
  await db.attachments.put(a);
  return a;
}

export async function getAttachment(id: string): Promise<Attachment | undefined> {
  return db.attachments.get(id);
}

export async function getAttachments(ids: string[]): Promise<Attachment[]> {
  if (!ids.length) return [];
  return db.attachments.bulkGet(ids).then((rows) => rows.filter(Boolean) as Attachment[]);
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  let bin = '';
  const arr = new Uint8Array(buf);
  for (let i = 0; i < arr.byteLength; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin);
}

export async function blobToText(blob: Blob): Promise<string> {
  return new Response(blob).text();
}
