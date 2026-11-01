// Universal macOS apps (x64 + arm64 in one .app, the Steam depot for macOS). electron-builder packs
// the staged app once per architecture and @electron/universal merges the two: Mach-O files that
// differ are joined with lipo, identical ones must already be universal or be listed in
// `x64ArchFiles`. So the staged app carries both architectures itself: the SDL binding is made
// universal here, and the main process is compiled to bytecode by an Electron of each architecture.

import { execFileSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  closeSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { electronBinary, electronVersion } from './stage';

/** Architectures of a universal macOS app, in the order electron-builder packs them. */
export const UNIVERSAL_ARCHES = ['x64', 'arm64'] as const;

/**
 * `x64ArchFiles` of @electron/universal: Mach-O files that are the same in both builds on purpose.
 * steamworks.js ships one addon per architecture and loads the one of `process.arch`.
 */
export const UNIVERSAL_X64_ARCH_FILES =
  '**/native_modules/steamworks.js/dist/osx/steamworksjs.darwin-{x64,arm64}.node';

const MACHO_MAGICS = new Set([0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe]);
const FAT_MAGICS = new Set([0xcafebabe, 0xbebafeca, 0xcafebabf, 0xbfbafeca]);

/**
 * Kind of binary a file starts with: a single-architecture Mach-O, a universal ("fat") one, or
 * neither.
 *
 * @example
 * ```ts
 * import { readFileSync } from 'node:fs';
 * import { machOKind } from '@blacklight/native/build';
 *
 * machOKind(readFileSync('sdl.node')); // 'thin' before lipo, 'universal' after
 * ```
 */
export function machOKind(head: Uint8Array): 'thin' | 'universal' | undefined {
  if (head.length < 4) return undefined;
  const magic = Buffer.from(head.buffer, head.byteOffset, 4).readUInt32BE(0);
  if (MACHO_MAGICS.has(magic)) return 'thin';
  if (FAT_MAGICS.has(magic)) return 'universal';
  return undefined;
}

function fileHead(path: string): Buffer {
  const head = Buffer.alloc(4);
  const fd = openSync(path, 'r');
  try {
    readSync(fd, head, 0, 4, 0);
  } finally {
    closeSync(fd);
  }
  return head;
}

/** The other architecture of a universal app. */
function otherArch(arch: string = process.arch): string {
  if (arch !== 'x64' && arch !== 'arm64') {
    throw new Error(`A universal macOS app is built on an x64 or arm64 Mac, not on ${arch}.`);
  }
  return arch === 'x64' ? 'arm64' : 'x64';
}

/** Downloads of other architectures, kept between builds. */
function cacheDir(...parts: string[]): string {
  return join(homedir(), 'Library', 'Caches', 'blacklight', ...parts);
}

/**
 * URL of @kmamal/sdl's prebuilt binding (with its SDL library) for macOS on `arch`: the file its
 * install script downloads for the machine it runs on.
 *
 * @example
 * ```ts
 * import { sdlPrebuildUrl } from '@blacklight/native/build';
 *
 * sdlPrebuildUrl('0.11.13', 'x64'); // …/v0.11.13/sdl.node-v0.11.13-darwin-x64.tar.gz
 * ```
 */
export function sdlPrebuildUrl(version: string, arch: string): string {
  return `https://github.com/kmamal/node-sdl/releases/download/v${version}/sdl.node-v${version}-darwin-${arch}.tar.gz`;
}

/**
 * Makes the SDL binding staged in `appDir` universal: the installed binding is for this Mac's
 * architecture, so the other one's prebuild is downloaded (cached in
 * `~/Library/Caches/blacklight/`) and every Mach-O file of `dist/` is joined with `lipo`.
 *
 * @throws Error when the prebuild cannot be downloaded or `lipo` fails (Xcode command line tools).
 *
 * @example
 * ```ts
 * import { makeSdlUniversal, stageApp } from '@blacklight/native/build';
 *
 * stageApp({ appDir, manifest, webDist: 'dist', steam: true });
 * await makeSdlUniversal(appDir); // dist/sdl.node now holds x86_64 and arm64
 * ```
 */
export async function makeSdlUniversal(appDir: string): Promise<void> {
  const sdl = join(appDir, 'native_modules', '@kmamal', 'sdl');
  const { version } = JSON.parse(readFileSync(join(sdl, 'package.json'), 'utf8')) as {
    version: string;
  };
  const arch = otherArch();
  const other = cacheDir(`sdl-${version}-darwin-${arch}`);
  if (!existsSync(join(other, 'sdl.node'))) {
    const url = sdlPrebuildUrl(version, arch);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Cannot download the ${arch} SDL binding for the universal app (${url}: HTTP ${response.status}); check the network or build one architecture with --arch.`,
      );
    }
    rmSync(other, { recursive: true, force: true });
    mkdirSync(other, { recursive: true });
    const archive = join(other, 'prebuild.tar.gz');
    writeFileSync(archive, Buffer.from(await response.arrayBuffer()));
    execFileSync('tar', ['-xzf', archive, '-C', other]);
    rmSync(archive);
  }
  const dist = join(sdl, 'dist');
  for (const name of readdirSync(dist)) {
    const file = join(dist, name);
    if (!lstatSync(file).isFile() || machOKind(fileHead(file)) !== 'thin') continue;
    const counterpart = join(other, name);
    if (!existsSync(counterpart)) {
      throw new Error(
        `The ${arch} SDL prebuild has no ${name}: @kmamal/sdl ${version} cannot be made universal.`,
      );
    }
    execFileSync('lipo', ['-create', file, counterpart, '-output', file]);
  }
}

/**
 * Electron executables of both architectures, for compiling bytecode per architecture: this Mac's
 * is the installed one; the other is downloaded with @electron/get (same version, cached by it)
 * and unpacked with `ditto`. An x64 Electron runs under Rosetta 2 on Apple silicon; the reverse does
 * not exist, so this needs an Apple silicon Mac.
 *
 * @throws Error on an Intel Mac.
 *
 * @example
 * ```ts
 * import { compileMainToBytecode, universalElectrons } from '@blacklight/native/build';
 *
 * await compileMainToBytecode(appDir, await universalElectrons());
 * ```
 */
export async function universalElectrons(): Promise<Record<string, string>> {
  const arch = otherArch();
  if (arch === 'arm64') {
    // Rosetta runs x64 code on Apple silicon; nothing runs arm64 code on an Intel Mac.
    throw new Error(
      'The arm64 bytecode of a universal app is compiled by an arm64 Electron, which an Intel Mac cannot run: build on an Apple silicon Mac, or pass --arch x64.',
    );
  }
  const version = electronVersion();
  const { downloadArtifact } = await import('@electron/get');
  const zip = await downloadArtifact({
    version,
    platform: 'darwin',
    arch,
    artifactName: 'electron',
  });
  const dir = join(dirname(zip), `blacklight-electron-v${version}-darwin-${arch}`);
  const binary = join(dir, 'Electron.app', 'Contents', 'MacOS', 'Electron');
  if (!existsSync(binary)) {
    rmSync(dir, { recursive: true, force: true });
    execFileSync('ditto', ['-x', '-k', zip, dir]);
  }
  return { [process.arch]: electronBinary(), [arch]: binary };
}
