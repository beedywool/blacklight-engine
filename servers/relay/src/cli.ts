#!/usr/bin/env node
// `blacklight-relay` command and Docker entry point. Configuration by environment:
//   BLACKLIGHT_RELAY_PORT (5360), BLACKLIGHT_RELAY_HOST (0.0.0.0),
//   BLACKLIGHT_RELAY_MAX_ROOMS (1000), BLACKLIGHT_RELAY_MAX_PEERS (5000).
import { startRelay } from './server';

function numberFrom(name: string): number | undefined {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    console.error(`${name} must be a whole number, got "${raw}".`);
    process.exit(1);
  }
  return value;
}

async function main(): Promise<void> {
  const relay = await startRelay({
    port: numberFrom('BLACKLIGHT_RELAY_PORT'),
    host: process.env.BLACKLIGHT_RELAY_HOST || undefined,
    maxRooms: numberFrom('BLACKLIGHT_RELAY_MAX_ROOMS'),
    maxPeers: numberFrom('BLACKLIGHT_RELAY_MAX_PEERS'),
    log: (line) => console.log(`${new Date().toISOString()} ${line}`),
  });
  console.log(`Blacklight relay listening on port ${relay.port}`);
  for (const url of relay.urls) console.log(`  LAN: ${url}`);
  const stop = () => {
    console.log('Stopping the relay');
    void relay.close().then(() => process.exit(0));
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

// No top-level await: the Docker bundle is CommonJS.
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
