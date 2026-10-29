// Reads and edits `game.config.ts` through the TypeScript syntax tree: edits replace only the
// text of the changed value, so comments, order and formatting of the rest stay as written.
import type * as TS from 'typescript';

type Ts = typeof TS;

/** A value the form can write: what a config literal holds. */
export type ConfigValue = string | number | boolean | string[] | Record<string, string[]>;

/** One field of the form. */
export interface ConfigField {
  /** Dot path in the config object (`resolution.width`). */
  path: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'enum' | 'scene' | 'actions';
  options?: string[];
  description: string;
  /** Required fields cannot be removed from the form. */
  required?: boolean;
}

/** Fields the form shows, in order (SPEC §6.2; other areas add theirs here). */
export const CONFIG_FIELDS: ConfigField[] = [
  {
    path: 'name',
    label: 'Name',
    type: 'string',
    required: true,
    description: 'Display name: window title, store listings.',
  },
  {
    path: 'id',
    label: 'Identifier',
    type: 'string',
    required: true,
    description: 'Reverse-domain id (com.studio.game): app ids, save folders.',
  },
  {
    path: 'version',
    label: 'Version',
    type: 'string',
    required: true,
    description: 'Semver version of the game.',
  },
  {
    path: 'entry',
    label: 'First scene',
    type: 'scene',
    required: true,
    description: 'Scene started first (folder name under scenes/).',
  },
  {
    path: 'resolution.width',
    label: 'Width',
    type: 'number',
    required: true,
    description: 'Design width in virtual pixels.',
  },
  {
    path: 'resolution.height',
    label: 'Height',
    type: 'number',
    required: true,
    description: 'Design height in virtual pixels.',
  },
  {
    path: 'resolution.mode',
    label: 'Fit mode',
    type: 'enum',
    options: ['extend', 'letterbox'],
    description: 'extend shows more of the scene on wide screens; letterbox adds black bars.',
  },
  {
    path: 'resolution.pixelArt',
    label: 'Pixel art',
    type: 'boolean',
    description: 'Nearest-neighbour filtering, integer scaling and positions.',
  },
  {
    path: 'tickRate',
    label: 'Steps per second',
    type: 'number',
    description: 'Fixed logic steps per second (60).',
  },
  {
    path: 'pauseOnBlur',
    label: 'Pause when hidden',
    type: 'boolean',
    description: 'Pause the loop while the window is hidden or unfocused (true).',
  },
  {
    path: 'seed',
    label: 'Random seed',
    type: 'string',
    description: 'Seed of game.random; a new seed each run when empty.',
  },
  {
    path: 'ui.theme',
    label: 'UI theme',
    type: 'string',
    description: 'Default UI theme (blacklight, persona or one you register).',
  },
  {
    path: 'ui.scale',
    label: 'UI scale',
    type: 'number',
    description: 'Default UI scale; the player setting wins.',
  },
  {
    path: 'input.actions',
    label: 'Input actions',
    type: 'actions',
    description: 'Actions and their bindings, merged over the defaults.',
  },
];

/** The object literal passed to `defineConfig(...)` or exported as default. */
function configObject(ts: Ts, file: TS.SourceFile): TS.ObjectLiteralExpression | undefined {
  let found: TS.ObjectLiteralExpression | undefined;
  const visit = (node: TS.Node) => {
    if (found) return;
    if (ts.isExportAssignment(node)) {
      let expression: TS.Expression = node.expression;
      if (ts.isCallExpression(expression) && expression.arguments[0])
        expression = expression.arguments[0];
      while (
        ts.isParenthesizedExpression(expression) ||
        ts.isSatisfiesExpression(expression) ||
        ts.isAsExpression(expression)
      )
        expression = expression.expression;
      if (ts.isObjectLiteralExpression(expression)) found = expression;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

function propertyName(ts: Ts, property: TS.ObjectLiteralElementLike): string | undefined {
  if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property))
    return undefined;
  const name = property.name;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name))
    return name.text;
  return undefined;
}

function findProperty(
  ts: Ts,
  object: TS.ObjectLiteralExpression,
  key: string,
): TS.PropertyAssignment | undefined {
  return object.properties.find(
    (p): p is TS.PropertyAssignment => ts.isPropertyAssignment(p) && propertyName(ts, p) === key,
  );
}

/** Literal value of an expression, `undefined` when it is computed. */
function literal(ts: Ts, node: TS.Expression): ConfigValue | undefined {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (
    ts.isPrefixUnaryExpression(node) &&
    node.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(node.operand)
  )
    return -Number(node.operand.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (ts.isArrayLiteralExpression(node)) {
    const items = node.elements.map((e) => literal(ts, e));
    return items.every((i) => typeof i === 'string') ? (items as string[]) : undefined;
  }
  if (ts.isObjectLiteralExpression(node)) {
    const out: Record<string, string[]> = {};
    for (const p of node.properties) {
      const key = propertyName(ts, p);
      if (!key || !ts.isPropertyAssignment(p)) return undefined;
      const value = literal(ts, p.initializer);
      if (!Array.isArray(value)) return undefined;
      out[key] = value;
    }
    return out;
  }
  return undefined;
}

/** What the form shows: each field's literal value; `computed` lists fields written as code. */
export interface ConfigState {
  values: Record<string, ConfigValue | undefined>;
  computed: string[];
  error?: string;
}

/** Reads the form fields from `game.config.ts` source. */
export function readConfig(ts: Ts, source: string): ConfigState {
  const file = ts.createSourceFile(
    'game.config.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const root = configObject(ts, file);
  if (!root)
    return {
      values: {},
      computed: [],
      error: 'game.config.ts must `export default defineConfig({ ... })` with an object literal.',
    };
  const values: ConfigState['values'] = {};
  const computed: string[] = [];
  for (const field of CONFIG_FIELDS) {
    let object: TS.ObjectLiteralExpression | undefined = root;
    const keys = field.path.split('.');
    let node: TS.PropertyAssignment | undefined;
    for (const [i, key] of keys.entries()) {
      node = object ? findProperty(ts, object, key) : undefined;
      if (!node) break;
      if (i < keys.length - 1)
        object = ts.isObjectLiteralExpression(node.initializer) ? node.initializer : undefined;
    }
    if (!node) continue;
    const value = literal(ts, node.initializer);
    if (value === undefined) computed.push(field.path);
    else values[field.path] = value;
  }
  return { values, computed };
}

/**
 * Prints a value as TypeScript, Prettier style (single quotes). Objects stay on one line when
 * short, unless `expanded` (the value it replaces spanned several lines).
 */
export function printValue(value: ConfigValue, indent: string, expanded = false): string {
  if (typeof value === 'string') return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `[${value.map((v) => printValue(v, indent)).join(', ')}]`;
  const entries = Object.entries(value);
  if (entries.length === 0) return '{}';
  const key = (k: string) => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : `'${k}'`);
  const inline = `{ ${entries.map(([k, v]) => `${key(k)}: ${printValue(v, indent)}`).join(', ')} }`;
  if (!expanded && !inline.includes('\n') && indent.length + inline.length <= 80) return inline;
  const inner = `${indent}  `;
  return `{\n${entries.map(([k, v]) => `${inner}${key(k)}: ${printValue(v, inner, expanded)},`).join('\n')}\n${indent}}`;
}

function lineIndent(source: string, position: number): string {
  const start = source.lastIndexOf('\n', position - 1) + 1;
  return /^[ \t]*/.exec(source.slice(start))![0];
}

interface Edit {
  start: number;
  end: number;
  text: string;
}

/** Adds `key: value` at the end of an object literal, matching its layout. */
function insertProperty(
  source: string,
  object: TS.ObjectLiteralExpression,
  key: string,
  value: ConfigValue,
): Edit {
  const close = object.end - 1;
  const objectIndent = lineIndent(source, object.getStart());
  const last = object.properties.at(-1);
  const multiline = source.slice(object.getStart(), object.end).includes('\n') || !last;
  const propertyIndent = last ? lineIndent(source, last.getStart()) : `${objectIndent}  `;
  if (!last)
    return {
      start: object.getStart(),
      end: object.end,
      text: `{\n${propertyIndent}${key}: ${printValue(value, propertyIndent)},\n${objectIndent}}`,
    };
  const hasComma = object.properties.hasTrailingComma;
  if (!multiline) {
    return { start: last.end, end: last.end, text: `, ${key}: ${printValue(value, objectIndent)}` };
  }
  const text = `${hasComma ? '' : ','}\n${propertyIndent}${key}: ${printValue(value, propertyIndent)},`;
  // After the last property (and its comma), before the closing line.
  const after = hasComma ? source.indexOf(',', last.end) + 1 : last.end;
  return { start: after, end: Math.min(after, close), text };
}

/** Removes a property and its comma. */
function removeProperty(
  source: string,
  object: TS.ObjectLiteralExpression,
  property: TS.PropertyAssignment,
): Edit {
  const index = object.properties.indexOf(property);
  const start = property.getFullStart();
  let end = property.end;
  if (index < object.properties.length - 1 || object.properties.hasTrailingComma) {
    end = source.indexOf(',', end) + 1;
  } else if (index > 0) {
    // Last property without a trailing comma: drop the comma before it instead.
    const previous = object.properties[index - 1]!;
    return { start: source.indexOf(',', previous.end), end, text: '' };
  }
  return { start, end, text: '' };
}

/**
 * Sets (or with `undefined`, removes) a field. Missing parent objects are created. Returns the
 * new source.
 *
 * @throws Error when the config is not an object literal or a parent is computed code.
 */
export function setConfigValue(
  ts: Ts,
  source: string,
  path: string,
  value: ConfigValue | undefined,
): string {
  const file = ts.createSourceFile(
    'game.config.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  let object = configObject(ts, file);
  if (!object)
    throw new Error(
      'game.config.ts must `export default defineConfig({ ... })` with an object literal.',
    );
  const keys = path.split('.');
  let edit: Edit | undefined;
  for (const [i, key] of keys.entries()) {
    const property: TS.PropertyAssignment | undefined = findProperty(ts, object, key);
    const last = i === keys.length - 1;
    if (last) {
      if (value === undefined)
        edit = property ? removeProperty(source, object, property) : undefined;
      else if (property) {
        const indent = lineIndent(source, property.getStart());
        const expanded = property.initializer.getText().includes('\n');
        edit = {
          start: property.initializer.getStart(),
          end: property.initializer.end,
          text: printValue(value, indent, expanded),
        };
      } else edit = insertProperty(source, object, key, value);
      break;
    }
    if (!property) {
      if (value === undefined) return source;
      // Build the missing branch as one nested literal.
      const nested = keys
        .slice(i + 1)
        .reduceRight<ConfigValue>((inner, k) => ({ [k]: inner }) as never, value);
      edit = insertProperty(source, object, key, nested);
      break;
    }
    if (!ts.isObjectLiteralExpression(property.initializer))
      throw new Error(
        `"${keys.slice(0, i + 1).join('.')}" is computed in game.config.ts; edit it in the code.`,
      );
    object = property.initializer;
  }
  if (!edit) return source;
  return source.slice(0, edit.start) + edit.text + source.slice(edit.end);
}
