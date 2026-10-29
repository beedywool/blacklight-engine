// Publishing rehearsal without accounts: packages the extension with vsce, lists what the package
// holds, and uploads it with ovsx to a local stand-in for the Open VSX registry (port 5372). The
// real publish steps (Marketplace and Open VSX tokens) are in MANUAL_TESTS.md.
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, resolve } from 'node:path';

const here = resolve(import.meta.dirname, '..');
const bin = (name) =>
  join(here, 'node_modules', '.bin', process.platform === 'win32' ? `${name}.cmd` : name);
const vsix = join(here, 'dist', 'blacklight.vsix');
const manifest = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8'));

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: here,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed`);
}

run(bin('vsce'), ['package', '--no-dependencies', '--out', vsix]);
run(bin('vsce'), ['ls', '--no-dependencies']);

let uploaded = 0;
const registry = createServer((request, response) => {
  const chunks = [];
  request.on('data', (chunk) => chunks.push(chunk));
  request.on('end', () => {
    response.setHeader('Content-Type', 'application/json');
    if (request.method === 'POST' && request.url?.startsWith('/api/-/publish')) {
      const body = Buffer.concat(chunks);
      uploaded = body.length;
      // A VSIX is a zip: it starts with "PK".
      if (body[0] !== 0x50 || body[1] !== 0x4b) {
        response.statusCode = 400;
        response.end(JSON.stringify({ error: 'Not a VSIX package.' }));
        return;
      }
      response.end(
        JSON.stringify({
          namespace: manifest.publisher,
          name: manifest.name,
          version: manifest.version,
          targetPlatform: 'universal',
        }),
      );
      return;
    }
    response.statusCode = 404;
    response.end('{}');
  });
});
await new Promise((ready) => registry.listen(5372, '127.0.0.1', ready));
try {
  // Not spawnSync: the stand-in registry answers from this process's event loop.
  const args = [
    'publish',
    '--packagePath',
    vsix,
    '--registryUrl',
    'http://127.0.0.1:5372',
    '--pat',
    'dry-run',
  ];
  const code = await new Promise((done) =>
    spawn(bin('ovsx'), args, {
      cwd: here,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    }).on('exit', done),
  );
  if (code !== 0) throw new Error(`ovsx publish failed (exit ${code})`);
} finally {
  registry.close();
}
console.log(
  `Dry run done: ${vsix} (${uploaded} bytes uploaded to the local stand-in registry). Nothing was published.`,
);
