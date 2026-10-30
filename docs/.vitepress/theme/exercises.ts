// Checks of the tutorial exercises: `docs/examples/tutorials/<topic>/checks.ts` maps exercise
// names to a check. Only types cross into the page; the check functions are a few lines each.
import type { Check, Checks } from '../../examples/tutorials/check';

const modules = import.meta.glob('../../examples/tutorials/*/checks.ts', {
  eager: true,
  import: 'checks',
}) as Record<string, Checks>;

/** The check of `tutorials/<topic>/<exercise>`, if it has one. */
export function checkOf(src: string): Check | undefined {
  const match = /^tutorials\/([\w-]+)\/([\w-]+)$/.exec(src);
  if (!match) return undefined;
  return modules[`../../examples/tutorials/${match[1]}/checks.ts`]?.[match[2]!];
}
