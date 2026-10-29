// Copies the repository's templates/ into the package so the published scaffolder is self-contained.
import { cpSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const from = fileURLToPath(new URL('../../../templates', import.meta.url));
const to = fileURLToPath(new URL('../templates', import.meta.url));
const skip = /[\\/](node_modules|dist|\.blacklight)([\\/]|$)/;

rmSync(to, { recursive: true, force: true });
cpSync(from, to, { recursive: true, filter: (src) => !skip.test(src.slice(from.length)) });
