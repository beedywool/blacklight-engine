import { resolve } from 'node:path';
import { build } from 'vite';
import { createViteConfig } from '../vite';
import { mobileTargets } from './mobile';

/** Options every target builder receives. */
export interface TargetOptions {
  /** Game folder. */
  root: string;
  /** Sign the build when certificates are configured. */
  sign?: boolean;
  /** Prepare signing / upload steps without running them. */
  dryRun?: boolean;
  /** Extra flags from the command line. */
  flags: Record<string, unknown>;
}

/** Builds a game for one target. */
export type TargetBuilder = (options: TargetOptions) => Promise<void>;

/** The web build: every other target starts from it. */
export async function buildWeb({ root }: Pick<TargetOptions, 'root'>): Promise<void> {
  await build(createViteConfig(resolve(root)));
}

/**
 * Build targets by name. Platform areas add theirs here (desktop: win, mac, linux, steam;
 * mobile: android, ios), each in its own file under `targets/`.
 */
export const targets: Record<string, TargetBuilder> = {
  web: (options) => buildWeb(options),
  ...mobileTargets,
};

/** Every target the engine supports, implemented or not. */
export const ALL_TARGETS = ['web', 'win', 'mac', 'linux', 'android', 'ios', 'steam'] as const;
