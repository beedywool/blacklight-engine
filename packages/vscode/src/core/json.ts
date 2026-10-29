/** One-line JSON with spaces, like Prettier prints short values: `{ "x": 1, "f": [0, 1] }`. */
function inline(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(inline).join(', ')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return '{}';
    return `{ ${entries.map(([k, v]) => `${JSON.stringify(k)}: ${inline(v)}`).join(', ')} }`;
  }
  return JSON.stringify(value) ?? 'null';
}

/**
 * Formats JSON for files people also edit by hand: values that fit in `width` columns stay on one
 * line, larger ones are expanded; the top level is always expanded. Ends with a newline.
 *
 * @example
 * ```ts
 * formatJson({ objects: [{ type: 'Coin', x: 1, y: 2 }] });
 * // {
 * //   "objects": [{ "type": "Coin", "x": 1, "y": 2 }]
 * // }
 * ```
 */
export function formatJson(value: unknown, width = 100): string {
  const print = (item: unknown, indent: string, top: boolean, prefix: number): string => {
    const one = inline(item);
    if (!top && indent.length + prefix + one.length <= width) return one;
    const inner = `${indent}  `;
    if (Array.isArray(item)) {
      if (item.length === 0) return '[]';
      return `[\n${item.map((v) => inner + print(v, inner, false, 0)).join(',\n')}\n${indent}]`;
    }
    if (item && typeof item === 'object') {
      const entries = Object.entries(item).filter(([, v]) => v !== undefined);
      if (entries.length === 0) return '{}';
      return `{\n${entries
        .map(([k, v]) => {
          const key = `${JSON.stringify(k)}: `;
          return inner + key + print(v, inner, false, key.length + 1);
        })
        .join(',\n')}\n${indent}}`;
    }
    return one;
  };
  return `${print(value, '', true, 0)}\n`;
}
