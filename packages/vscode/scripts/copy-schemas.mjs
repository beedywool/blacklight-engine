// Copies the engine's JSON Schemas next to the extension: `jsonValidation` needs files inside the
// extension package (games may not be installed yet when a file is opened).
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const from = join(import.meta.dirname, '..', '..', 'core', 'schema');
const to = join(import.meta.dirname, '..', 'schema');
mkdirSync(to, { recursive: true });
for (const file of readdirSync(from))
  if (file.endsWith('.schema.json')) copyFileSync(join(from, file), join(to, file));
