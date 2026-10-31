/** Edit distance where swapping two adjacent letters counts as one edit ("titel" → "title"). */
function distance(a: string, b: string): number {
  const rows = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(rows[i - 1]![j]! + 1, rows[i]![j - 1]! + 1, rows[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, rows[i - 2]![j - 2]! + 1);
      }
      rows[i]![j] = best;
    }
  }
  return rows[a.length]![b.length]!;
}

/**
 * Returns the candidates close to `name` (case-insensitive edit distance), best first. Used in
 * "unknown name" errors so a typo points at the right name.
 *
 * @example
 * ```ts
 * import { suggest } from '@blacklight/core';
 *
 * suggest('titel', ['title', 'level', 'credits']); // ['title']
 * ```
 */
export function suggest(name: string, candidates: Iterable<string>, max = 3): string[] {
  const target = name.toLowerCase();
  const limit = Math.max(1, Math.floor(target.length / 4));
  return [...candidates]
    .map((candidate) => ({ candidate, score: distance(target, candidate.toLowerCase()) }))
    .filter(({ candidate, score }) => score <= limit || candidate.toLowerCase().includes(target))
    .sort((a, b) => a.score - b.score)
    .slice(0, max)
    .map(({ candidate }) => candidate);
}

/**
 * "Did you mean …?" sentence, or an empty string when nothing is close. Append it to an error
 * message about an unknown name.
 *
 * @example
 * ```ts
 * import { didYouMean } from '@blacklight/core';
 *
 * throw new Error(`Unknown scene "titel".${didYouMean('titel', ['title', 'level'])}`);
 * // Unknown scene "titel". Did you mean "title"?
 * ```
 */
export function didYouMean(name: string, candidates: Iterable<string>): string {
  const close = suggest(name, candidates);
  return close.length > 0 ? ` Did you mean ${close.map((c) => `"${c}"`).join(' or ')}?` : '';
}
