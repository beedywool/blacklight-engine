/**
 * 1-based numbers of the lines of `after` that are not in `before` (longest common subsequence),
 * blank lines left out: what a solution changed, without the hunks of a full diff.
 *
 * @example
 * changedLineNumbers('a\nb\nc', 'a\nB\nc') // [2]
 */
export function changedLineNumbers(before: string, after: string): number[] {
  const a = before.split('\n');
  const b = after.split('\n');
  const common = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      common[i]![j] =
        a[i] === b[j]
          ? common[i + 1]![j + 1]! + 1
          : Math.max(common[i + 1]![j]!, common[i]![j + 1]!);
  const changed: number[] = [];
  for (let i = 0, j = 0; j < b.length;) {
    if (i < a.length && a[i] === b[j]) {
      i++;
      j++;
    } else if (i < a.length && common[i + 1]![j]! >= common[i]![j + 1]!) i++;
    else {
      if (b[j]!.trim()) changed.push(j + 1);
      j++;
    }
  }
  return changed;
}
