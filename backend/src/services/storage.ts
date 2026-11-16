import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { env } from '../config/env';
import { badRequest } from '../lib/errors';

/**
 * Storage abstraction.
 * - LocalDiskStorage: development (files under UPLOAD_DIR).
 * - VercelBlobStorage: production on Vercel (private Blob store; downloads still go through our
 *   authorized /api/attachments/:id/download route, never a public URL).
 */
export interface StorageDriver {
  save(buffer: Buffer, ext: string): Promise<string>;
  read(key: string): Promise<Readable>;
  remove(key: string): Promise<void>;
}

const KEY_RE = /^\d{4}\/\d{2}\/[a-f0-9]{32}\.[a-z0-9]{1,5}$/;

/** Random, non-guessable key; the user's filename is never used as a storage path. */
function newKey(ext: string) {
  const now = new Date();
  return `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${crypto.randomBytes(16).toString('hex')}.${ext}`;
}

export class VercelBlobStorage implements StorageDriver {
  private prefix = 'taskflow/';
  private check(key: string) {
    if (!KEY_RE.test(key)) throw badRequest('Invalid storage key');
    return this.prefix + key;
  }
  async save(buffer: Buffer, ext: string) {
    const { put } = await import('@vercel/blob');
    const key = newKey(ext);
    await put(this.check(key), buffer, {
      access: 'private',
      contentType: CANONICAL_MIME[ext] ?? 'application/octet-stream',
      addRandomSuffix: false,
    });
    return key;
  }
  async read(key: string) {
    const { get } = await import('@vercel/blob');
    const res = await get(this.check(key), { access: 'private' });
    if (!res || res.statusCode !== 200 || !res.stream) throw new Error('Blob not found');
    return Readable.fromWeb(res.stream as Parameters<typeof Readable.fromWeb>[0]);
  }
  async remove(key: string) {
    try {
      const { del } = await import('@vercel/blob');
      await del(this.check(key));
    } catch {
      /* already gone */
    }
  }
}

export class LocalDiskStorage implements StorageDriver {
  private root: string;
  constructor(dir: string) {
    this.root = path.resolve(dir);
  }
  private resolveKey(key: string) {
    if (!KEY_RE.test(key)) throw badRequest('Invalid storage key');
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) throw badRequest('Invalid storage key');
    return full;
  }
  async save(buffer: Buffer, ext: string) {
    const key = newKey(ext);
    const full = this.resolveKey(key);
    await fsp.mkdir(path.dirname(full), { recursive: true });
    await fsp.writeFile(full, buffer, { flag: 'wx' });
    return key;
  }
  async read(key: string) {
    const full = this.resolveKey(key);
    await fsp.access(full);
    return fs.createReadStream(full);
  }
  async remove(key: string) {
    try {
      await fsp.unlink(this.resolveKey(key));
    } catch {
      /* already gone */
    }
  }
}

export const storage: StorageDriver =
  env.storageDriver === 'vercel-blob' ? new VercelBlobStorage() : new LocalDiskStorage(env.isVercel ? '/tmp/uploads' : env.UPLOAD_DIR);

if (env.isVercel && env.storageDriver === 'local') {
  console.warn('[storage] Running on Vercel without a Blob store: uploads go to /tmp and will NOT persist. Connect a private Vercel Blob store.');
}

// ---------------------------------------------------------------------------
// File validation: extension allowlist + MIME check + magic-byte sniffing.
// ---------------------------------------------------------------------------
const ALLOWED: Record<string, { mimes: string[]; magic?: (b: Buffer) => boolean; text?: boolean }> = {
  png: { mimes: ['image/png'], magic: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  jpg: { mimes: ['image/jpeg', 'image/pjpeg'], magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  jpeg: { mimes: ['image/jpeg', 'image/pjpeg'], magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  webp: { mimes: ['image/webp'], magic: (b) => b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' },
  pdf: { mimes: ['application/pdf'], magic: (b) => b.toString('ascii', 0, 5) === '%PDF-' },
  zip: {
    mimes: ['application/zip', 'application/x-zip-compressed', 'application/octet-stream', 'multipart/x-zip'],
    magic: (b) => b[0] === 0x50 && b[1] === 0x4b,
  },
  mp4: { mimes: ['video/mp4', 'application/octet-stream'], magic: (b) => b.toString('ascii', 4, 8) === 'ftyp' },
  txt: { mimes: ['text/plain', 'application/octet-stream'], text: true },
  log: { mimes: ['text/plain', 'text/x-log', 'application/octet-stream', ''], text: true },
  csv: { mimes: ['text/csv', 'text/plain', 'application/vnd.ms-excel', 'application/octet-stream'], text: true },
};

export const ALLOWED_EXTENSIONS = Object.keys(ALLOWED);

export const CANONICAL_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  pdf: 'application/pdf',
  zip: 'application/zip',
  mp4: 'video/mp4',
  txt: 'text/plain',
  log: 'text/plain',
  csv: 'text/csv',
};

export interface ValidFile {
  ext: string;
  mime: string;
  originalName: string;
}

export function validateUpload(file: { originalname: string; mimetype: string; buffer: Buffer; size: number }): ValidFile {
  const originalName = path.basename(file.originalname).replace(/[\u0000-\u001f]/g, '').slice(0, 200) || 'file';
  const ext = path.extname(originalName).slice(1).toLowerCase();
  const rule = ALLOWED[ext];
  if (!rule) {
    throw badRequest(`"${originalName}" is not an allowed file type. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`);
  }
  if (file.size === 0) throw badRequest(`"${originalName}" is empty`);
  if (file.size > env.maxUploadBytes) throw badRequest(`"${originalName}" exceeds ${env.MAX_UPLOAD_MB} MB`);
  if (!rule.mimes.includes(file.mimetype)) {
    throw badRequest(`"${originalName}" has an unexpected content type (${file.mimetype || 'unknown'})`);
  }
  if (rule.magic && !rule.magic(file.buffer)) {
    throw badRequest(`"${originalName}" content does not match its .${ext} extension`);
  }
  if (rule.text && file.buffer.subarray(0, 4096).includes(0)) {
    throw badRequest(`"${originalName}" does not look like a text file`);
  }
  return { ext, mime: CANONICAL_MIME[ext] ?? 'application/octet-stream', originalName };
}
