// Build-time switch of the NF-02 regression proof (e2e/cold-start.spec.ts); the same shape as
// Vite's own client types, so both can be loaded together.
interface ImportMetaEnv {
  /** Busy work, in milliseconds, before the entry scene's first frame. Unset in normal builds. */
  readonly VITE_BENCH_STARTUP_DELAY_MS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
