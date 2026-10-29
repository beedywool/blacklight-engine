// Runs the gate match outside the browser and prints its checksums as JSON:
//   node scripts/gate.ts 3600   (V8)       bun scripts/gate.ts 3600   (JavaScriptCore)
// e2e/net.spec.ts compares the engines.
import { mathFingerprint, runGate } from '../scenes/lobby/gate';

const frames = Number(process.argv[2] ?? 3600);
const result = await runGate({ frames });
const engine =
  typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined'
    ? 'JavaScriptCore (Bun)'
    : 'V8 (Node)';
console.log(
  JSON.stringify({
    engine,
    fingerprint: mathFingerprint(),
    desyncs: result.desyncs.length,
    checksums: result.checksums[0],
  }),
);
