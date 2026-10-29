// Save file container. Encrypted and signed saves:
//
//   'BLSV' | u8 container version | u8 flags (1 encrypted, 2 signed) | [IV, 12 bytes]
//   | body (AES-GCM ciphertext + tag, or UTF-8 JSON) | [HMAC-SHA-256, 32 bytes]
//
// The header is the GCM additional data and the HMAC covers everything before it, so changing
// any byte (flags included) is detected. Dev saves are plain, readable JSON without the header.

import type { SaveData } from './config';

const MAGIC = [0x42, 0x4c, 0x53, 0x56]; // "BLSV"
const CONTAINER_VERSION = 1;
const FLAG_ENCRYPTED = 1;
const FLAG_SIGNED = 2;
const IV_LENGTH = 12;
const MAC_LENGTH = 32;

/** What a save file holds once decoded. */
export interface SavePayload {
  /** Format version of `data` (`save.version` when it was written). */
  version: number;
  meta: SaveMeta;
  data: SaveData;
}

/** Shown in save/load screens without loading the save. */
export interface SaveMeta {
  /** When it was written, ms since 1970. */
  date: number;
  /** Total play time in ms. */
  playTime: number;
  /** Scene running when it was written. */
  scene?: string;
  /** Free text (chapter, place). */
  label?: string;
  /** Small image of the game (data URL). */
  thumbnail?: string;
}

/** Why a save could not be read. */
export type SaveErrorCode =
  'missing' | 'corrupted' | 'tampered' | 'version' | 'password' | 'invalid-slot';

/**
 * A save that cannot be loaded. `hasBackup` tells whether the previous version of the slot can be
 * loaded instead (`game.save.load(slot, { backup: true })`).
 */
export class SaveError extends Error {
  hasBackup = false;
  constructor(
    readonly code: SaveErrorCode,
    message: string,
    readonly slot?: string,
  ) {
    super(message);
    this.name = 'SaveError';
  }
}

/** How files are written: release builds encrypt and sign, dev builds write plain JSON. */
export interface SaveCodec {
  encryption: boolean;
  integrity: boolean;
  /** AES-GCM key from `platform.saveKey()`. */
  key: () => Promise<CryptoKey>;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Plain `Uint8Array<ArrayBuffer>` for WebCrypto, whatever buffer the input views. */
function bytes(data: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(data);
}

const hmacKeys = new WeakMap<CryptoKey, Promise<CryptoKey>>();

/**
 * HMAC key derived from the save key. `platform.saveKey()` returns a non-extractable AES key, so
 * the HMAC key is one AES-GCM block stream under a reserved all-zero IV (never used for data: data
 * IVs are random, a collision is a 2⁻⁹⁶ event): secret, stable, and lost with the save key.
 */
function hmacKey(key: CryptoKey): Promise<CryptoKey> {
  let derived = hmacKeys.get(key);
  if (!derived) {
    derived = crypto.subtle
      .encrypt(
        { name: 'AES-GCM', iv: new Uint8Array(IV_LENGTH) },
        key,
        encoder.encode('blacklight save integrity key v1'),
      )
      .then((stream) =>
        crypto.subtle.importKey(
          'raw',
          stream.slice(0, 32),
          { name: 'HMAC', hash: 'SHA-256' },
          false,
          ['sign', 'verify'],
        ),
      );
    hmacKeys.set(key, derived);
  }
  return derived;
}

/** Serializes a payload with the codec's protection. */
export async function encodeSave(payload: SavePayload, codec: SaveCodec): Promise<Uint8Array> {
  if (!codec.encryption && !codec.integrity) {
    return encoder.encode(`${JSON.stringify(payload, null, 2)}\n`);
  }
  const key = await codec.key();
  const flags = (codec.encryption ? FLAG_ENCRYPTED : 0) | (codec.integrity ? FLAG_SIGNED : 0);
  const iv = codec.encryption ? crypto.getRandomValues(new Uint8Array(IV_LENGTH)) : undefined;
  const header = new Uint8Array([...MAGIC, CONTAINER_VERSION, flags, ...(iv ?? [])]);
  const json = encoder.encode(JSON.stringify(payload));
  const body = iv
    ? new Uint8Array(
        await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: header }, key, json),
      )
    : json;
  const unsigned = concat(header, body);
  if (!codec.integrity) return unsigned;
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(key), bytes(unsigned)));
  return concat(unsigned, mac);
}

/**
 * Reads a save file.
 *
 * @throws {@link SaveError} `tampered` when a signature or the GCM tag does not match, or when the
 * codec requires protection and the file is plain; `corrupted` when it cannot be parsed.
 */
export async function decodeSave(file: Uint8Array, codec: SaveCodec): Promise<SavePayload> {
  if (!hasMagic(file)) {
    if (codec.integrity || codec.encryption) {
      throw new SaveError(
        'tampered',
        'This save is a plain file, but release builds only accept encrypted and signed saves.',
      );
    }
    return parsePayload(decoder.decode(file));
  }
  if (file.length < 6 || file[4] !== CONTAINER_VERSION) {
    throw new SaveError('corrupted', 'This save file has an unknown container version.');
  }
  const flags = file[5]!;
  const encrypted = (flags & FLAG_ENCRYPTED) !== 0;
  const signed = (flags & FLAG_SIGNED) !== 0;
  if ((codec.integrity && !signed) || (codec.encryption && !encrypted)) {
    throw new SaveError(
      'tampered',
      'This save is missing its protection (signature or encryption).',
    );
  }
  const headerLength = 6 + (encrypted ? IV_LENGTH : 0);
  const end = file.length - (signed ? MAC_LENGTH : 0);
  if (end < headerLength) throw new SaveError('corrupted', 'This save file is truncated.');
  const key = await codec.key();
  if (signed) {
    const ok = await crypto.subtle.verify(
      'HMAC',
      await hmacKey(key),
      bytes(file.subarray(end)),
      bytes(file.subarray(0, end)),
    );
    if (!ok) {
      throw new SaveError(
        'tampered',
        'This save was modified outside the game (signature mismatch), or comes from another install.',
      );
    }
  }
  let body = file.subarray(headerLength, end);
  if (encrypted) {
    try {
      body = new Uint8Array(
        await crypto.subtle.decrypt(
          {
            name: 'AES-GCM',
            iv: bytes(file.subarray(6, headerLength)),
            additionalData: bytes(file.subarray(0, headerLength)),
          },
          key,
          bytes(body),
        ),
      );
    } catch {
      throw new SaveError(
        'tampered',
        'This save cannot be decrypted: it was modified, or it was written by another install.',
      );
    }
  }
  return parsePayload(decoder.decode(body));
}

function parsePayload(text: string): SavePayload {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new SaveError('corrupted', 'This save is not valid JSON.');
  }
  const payload = value as Partial<SavePayload> | null;
  if (
    !payload ||
    typeof payload !== 'object' ||
    typeof payload.version !== 'number' ||
    typeof payload.meta !== 'object' ||
    typeof payload.data !== 'object' ||
    payload.data === null
  ) {
    throw new SaveError('corrupted', 'This save does not have the expected fields.');
  }
  return payload as SavePayload;
}

function hasMagic(file: Uint8Array): boolean {
  return MAGIC.every((byte, i) => file[i] === byte);
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}

// Exports protected by a password, to move saves between devices (SV-05):
//   'BLEX' | u8 version | salt (16) | IV (12) | AES-GCM(JSON { game, saves: { slot: payload } })
// with a key from PBKDF2-SHA-256 (600 000 iterations, OWASP 2023).

const EXPORT_MAGIC = [0x42, 0x4c, 0x45, 0x58]; // "BLEX"
const EXPORT_VERSION = 1;
const PBKDF2_ITERATIONS = 600_000;

/** Content of an export file. */
export interface SaveExport {
  /** `id` of the game that wrote it. */
  game: string;
  saves: Record<string, SavePayload>;
}

async function passwordKey(password: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Encrypts saves with a password. */
export async function encodeExport(content: SaveExport, password: string): Promise<Uint8Array> {
  if (password.length === 0) {
    throw new SaveError('password', 'An export needs a password: pass a non-empty string.');
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const header = new Uint8Array([...EXPORT_MAGIC, EXPORT_VERSION, ...salt, ...iv]);
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: header },
    await passwordKey(password, salt),
    encoder.encode(JSON.stringify(content)),
  );
  return concat(header, new Uint8Array(cipher));
}

/**
 * Decrypts an export.
 *
 * @throws {@link SaveError} `password` for a wrong password or a modified file, `corrupted` when it
 * is not an export.
 */
export async function decodeExport(file: Uint8Array, password: string): Promise<SaveExport> {
  const headerLength = 5 + 16 + IV_LENGTH;
  if (!EXPORT_MAGIC.every((byte, i) => file[i] === byte) || file.length <= headerLength) {
    throw new SaveError('corrupted', 'This file is not a Blacklight save export.');
  }
  if (file[4] !== EXPORT_VERSION) {
    throw new SaveError('corrupted', 'This export was made by a newer engine version.');
  }
  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: bytes(file.subarray(21, headerLength)),
        additionalData: bytes(file.subarray(0, headerLength)),
      },
      await passwordKey(password, bytes(file.subarray(5, 21))),
      bytes(file.subarray(headerLength)),
    );
  } catch {
    throw new SaveError('password', 'Wrong password, or the export file was modified.');
  }
  const content = JSON.parse(decoder.decode(plain)) as SaveExport;
  for (const payload of Object.values(content.saves ?? {})) parsePayload(JSON.stringify(payload));
  return content;
}
