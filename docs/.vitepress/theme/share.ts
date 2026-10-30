// Playground links: the project's files as JSON, deflated, in base64url, after `#project=`.
// Everything stays in the URL fragment, which browsers never send to the server.
import type { ProjectFiles } from '../../runner/protocol';

const PREFIX = '#project=';
const VERSION = 1;

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const output = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(output).arrayBuffer());
}

/** The URL fragment holding `files`. */
export async function encodeProject(files: ProjectFiles): Promise<string> {
  const json = JSON.stringify({ v: VERSION, files });
  const packed = await pipe(new TextEncoder().encode(json), new CompressionStream('deflate-raw'));
  return PREFIX + toBase64Url(packed);
}

/**
 * The files of a `#project=` fragment, or `undefined` when the fragment holds no project.
 *
 * @throws Error when the fragment is damaged (cut while copying, edited by hand).
 */
export async function decodeProject(hash: string): Promise<ProjectFiles | undefined> {
  if (!hash.startsWith(PREFIX)) return undefined;
  try {
    const bytes = await pipe(
      fromBase64Url(hash.slice(PREFIX.length)),
      new DecompressionStream('deflate-raw'),
    );
    const data = JSON.parse(new TextDecoder().decode(bytes)) as { v: number; files: ProjectFiles };
    if (data.v !== VERSION || typeof data.files !== 'object') throw new Error('unknown format');
    for (const value of Object.values(data.files))
      if (typeof value !== 'string') throw new Error('a file is not text');
    return data.files;
  } catch (error) {
    throw new Error(
      `This playground link is damaged (${(error as Error).message}). Ask for the link again, or reset the playground.`,
      { cause: error },
    );
  }
}
