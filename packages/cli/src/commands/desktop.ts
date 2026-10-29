import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { ResolvedGameConfig } from '@blacklight/core/config';
import type { CAC } from 'cac';
import { createServer } from 'vite';
import { loadGameConfig } from '../project';
import {
  buildDesktop,
  desktopViteConfig,
  hostOs,
  loadNative,
  type DesktopOs,
} from '../targets/desktop';
import { bundleNatives, copyAddon } from '../targets/natives';
import { runners } from '../targets/runners';

const OSES: DesktopOs[] = ['win', 'mac', 'linux'];

function osList(target: string | undefined): DesktopOs[] {
  if (!target) return OSES;
  if (!(OSES as string[]).includes(target)) {
    throw new Error(`Unknown target "${target}" for signing: use win, mac or linux.`);
  }
  return [target as DesktopOs];
}

/**
 * Prints (dry run) or applies the signing plan. Signing happens while packaging, so without
 * `--dry-run` this rebuilds the packages with signing on.
 *
 * @returns The printed lines (tests read them).
 */
export async function signCommand(
  root: string,
  options: { target?: string; dryRun?: boolean },
  env: NodeJS.ProcessEnv = process.env,
): Promise<string[]> {
  const { build: native } = await loadNative(root);
  const lines: string[] = [];
  for (const os of osList(options.target)) {
    const artifact =
      os === 'mac' ? 'release/mac/<Game>.app' : os === 'win' ? 'release/win/<Game> Setup.exe' : '';
    const plan = native.signingPlan(os, env, artifact);
    lines.push(`${os}: ${plan.summary}`);
    for (const step of plan.steps) lines.push(`  ${options.dryRun ? '[dry-run] ' : ''}${step}`);
    if (plan.missing.length > 0 && os !== 'linux')
      lines.push(`  missing: ${plan.missing.join('; ')}`);
    if (!options.dryRun && plan.sign) {
      await buildDesktop(os, { root, sign: true, flags: { sign: true } });
    }
  }
  if (!options.dryRun && osList(options.target).every((os) => !native.signingPlan(os, env).sign)) {
    throw new Error(
      'No signing certificate is configured. Set the variables listed above, or run `blacklight sign --dry-run` to check.',
    );
  }
  return lines;
}

/**
 * Uploads the Steam build with steamcmd, or checks it (`--dry-run`: the command is printed and
 * nothing leaves the machine).
 */
export async function uploadCommand(
  root: string,
  options: { target?: string; dryRun?: boolean },
): Promise<string[]> {
  if ((options.target ?? 'steam') !== 'steam') {
    throw new Error(`Uploads go through stores only; supported: steam. Got "${options.target}".`);
  }
  const config = (await loadGameConfig(root)) as unknown as ResolvedGameConfig;
  if (!config.steam) throw new Error('Set `steam: { appId }` in game.config.ts first.');
  const steamDir = join(root, 'release', 'steam');
  const script = join(steamDir, 'scripts', `app_build_${config.steam.appId}.vdf`);
  if (!existsSync(script)) {
    throw new Error(
      `No Steam build in ${steamDir}: run \`blacklight build --target steam\` first.`,
    );
  }
  const { build: native } = await loadNative(root);
  const command = native.steamUploadCommand(script, {
    username: process.env.STEAM_USERNAME,
    dryRun: options.dryRun,
    cwd: steamDir,
  });
  const lines = [`${options.dryRun ? '[dry-run] ' : ''}${command.display}`];
  if (options.dryRun) return lines;
  if (!process.env.STEAM_USERNAME) {
    throw new Error(
      'Set STEAM_USERNAME to a Steamworks builder account, then run the upload again.',
    );
  }
  const run = spawnSync(command.command, command.args, { cwd: steamDir, stdio: 'inherit' });
  if (run.error)
    throw new Error(
      `steamcmd could not start (${run.error.message}): install the Steamworks SDK's steamcmd.`,
    );
  if (run.status !== 0) throw new Error(`steamcmd failed with exit code ${run.status}.`);
  return lines;
}

/**
 * Runs the game in Electron with hot reload: the Vite dev server serves the page, the desktop app
 * (dev mode: security off, F12 opens developer tools) shows it.
 *
 * @returns A function that stops Electron and the server.
 */
export async function runDesktop(
  root: string,
  options: { port?: number; electronArgs?: string[] } = {},
): Promise<{ stop(): Promise<void>; exited: Promise<number | null> }> {
  const dir = resolve(root);
  const native = await loadNative(dir);
  const config = (await loadGameConfig(dir)) as unknown as ResolvedGameConfig;
  const server = await createServer(
    desktopViteConfig(dir, native.index, join(dir, 'dist'), { port: options.port ?? 5173 }),
  );
  await server.listen();
  const url = server.resolvedUrls?.local[0] ?? `http://localhost:${options.port ?? 5173}/`;
  const appDir = join(dir, '.blacklight', 'desktop');
  const natives = await bundleNatives(
    dir,
    Object.keys(config.modules ?? {}),
    join(appDir, '..', 'desktop-natives'),
  );
  native.build.stageApp({
    appDir,
    manifest: native.build.appManifest(config, { release: false, devServer: url }),
    link: true,
    steam: !!config.steam,
    natives: natives.bundles,
  });
  for (const addon of natives.addons)
    copyAddon(addon.name, addon.importer, join(appDir, 'native_modules'));
  const electron = spawn(native.build.electronBinary(), [appDir, ...(options.electronArgs ?? [])], {
    stdio: 'inherit',
  });
  const exited = new Promise<number | null>((done) => electron.on('exit', (code) => done(code)));
  void exited.then(() => server.close());
  return {
    exited,
    async stop() {
      electron.kill();
      await server.close();
    },
  };
}

/**
 * `blacklight run --target win|mac|linux|steam`: the game in the desktop app with hot reload, on
 * this machine (a desktop app runs on the OS it is built for).
 */
for (const target of ['win', 'mac', 'linux', 'steam'] as const) {
  runners[target] = async ({ root, port }) => {
    if (target !== 'steam' && target !== hostOs()) {
      throw new Error(
        `The ${target} app runs on ${target === 'win' ? 'Windows' : target === 'mac' ? 'macOS' : 'Linux'} only; on this machine use \`blacklight run --target ${hostOs()}\`.`,
      );
    }
    const app = await runDesktop(root, { port: port || undefined });
    process.exitCode = (await app.exited) ?? 0;
  };
}

/** sign, upload, desktop. */
export function registerDesktopCommands(cli: CAC): void {
  cli
    .command(
      'sign [root]',
      'Sign and notarize desktop builds with the certificates in the environment',
    )
    .option('--target <target>', 'win, mac or linux (default: all)')
    .option('--dry-run', 'Check the certificates and print the steps without running them')
    .action(async (root: string | undefined, options: { target?: string; dryRun?: boolean }) => {
      for (const line of await signCommand(resolve(root ?? '.'), options)) console.log(line);
    });

  cli
    .command('upload [root]', 'Upload a store build (Steam depots through steamcmd)')
    .option('--target <target>', 'steam', { default: 'steam' })
    .option('--dry-run', 'Print the steamcmd command without uploading')
    .action(async (root: string | undefined, options: { target?: string; dryRun?: boolean }) => {
      for (const line of await uploadCommand(resolve(root ?? '.'), options)) console.log(line);
    });

  cli
    .command(
      'desktop [root]',
      `Run the game in the desktop app (Electron) with hot reload (${hostOs()})`,
    )
    .option('--port <port>', 'Port of the dev server', { default: 5173 })
    .option('--devtools', 'Open the developer tools at start')
    .action(async (root: string | undefined, options: { port?: number; devtools?: boolean }) => {
      const app = await runDesktop(resolve(root ?? '.'), {
        port: options.port,
        electronArgs: options.devtools ? ['--devtools'] : [],
      });
      process.exitCode = (await app.exited) ?? 0;
    });
}
