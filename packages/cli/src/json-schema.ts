/**
 * A small JSON Schema (2020-12) validator for the engine's own schemas (`.anim.json`,
 * `.layout.json`, `.timeline.json`): the keywords those schemas use, nothing more. Editors validate
 * the same files with the full schema through `$schema`.
 */
export type Schema = {
  $ref?: string;
  type?: string | string[];
  enum?: unknown[];
  const?: unknown;
  required?: string[];
  properties?: Record<string, Schema>;
  additionalProperties?: boolean | Schema;
  propertyNames?: Schema;
  items?: Schema;
  prefixItems?: Schema[];
  minItems?: number;
  maxItems?: number;
  minimum?: number;
  exclusiveMinimum?: number;
  maximum?: number;
  pattern?: string;
  oneOf?: Schema[];
  anyOf?: Schema[];
  $defs?: Record<string, Schema>;
};

/** One schema violation, with a JSON pointer-like path (`animations.run.fps`). */
export interface SchemaError {
  path: string;
  message: string;
}

function typeOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  return typeof value;
}

function matchesType(value: unknown, type: string): boolean {
  const actual = typeOf(value);
  return actual === type || (type === 'number' && actual === 'integer');
}

const join = (path: string, key: string | number) => (path ? `${path}.${key}` : String(key));

/** Validates `value` against `schema`; returns every error found (empty when valid). */
export function validate(
  value: unknown,
  schema: Schema,
  root: Schema = schema,
  path = '',
): SchemaError[] {
  if (schema.$ref) {
    const name = schema.$ref.replace(/^#\/\$defs\//, '');
    const target = root.$defs?.[name];
    if (!target) return [{ path, message: `unknown schema reference ${schema.$ref}` }];
    return validate(value, target, root, path);
  }
  const errors: SchemaError[] = [];
  const fail = (message: string) => errors.push({ path: path || '(root)', message });
  if (schema.oneOf || schema.anyOf) {
    const options = (schema.oneOf ?? schema.anyOf)!;
    const passing = options.filter((option) => validate(value, option, root, path).length === 0);
    if (passing.length === 0) {
      // Report the closest option: one of the right type, then the one with the fewest errors.
      const score = (option: Schema) => {
        const resolved = option.$ref
          ? root.$defs?.[option.$ref.replace(/^#\/\$defs\//, '')]
          : option;
        const types = resolved?.type ? [resolved.type].flat() : undefined;
        const wrongType = types && !types.some((t) => matchesType(value, t)) ? 1000 : 0;
        return wrongType + validate(value, option, root, path).length;
      };
      const closest = [...options].sort((a, b) => score(a) - score(b))[0]!;
      errors.push(...validate(value, closest, root, path));
    } else if (schema.oneOf && passing.length > 1) {
      fail('matches more than one allowed form');
    }
  }
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => matchesType(value, t))) {
      fail(`must be ${types.join(' or ')}, not ${typeOf(value)}`);
      return errors;
    }
  }
  if (schema.enum && !schema.enum.some((v) => v === value))
    fail(`must be one of ${schema.enum.map((v) => JSON.stringify(v)).join(', ')}`);
  if ('const' in schema && schema.const !== value) fail(`must be ${JSON.stringify(schema.const)}`);
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) fail(`must be ≥ ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) fail(`must be ≤ ${schema.maximum}`);
    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum)
      fail(`must be > ${schema.exclusiveMinimum}`);
  }
  if (typeof value === 'string' && schema.pattern && !new RegExp(schema.pattern, 'u').test(value))
    fail(`must match ${schema.pattern}`);
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems)
      fail(`needs at least ${schema.minItems} items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems)
      fail(`has more than ${schema.maxItems} items`);
    value.forEach((item, i) => {
      const itemSchema = schema.prefixItems?.[i] ?? schema.items;
      if (itemSchema) errors.push(...validate(item, itemSchema, root, join(path, i)));
    });
  }
  if (typeOf(value) === 'object') {
    const object = value as Record<string, unknown>;
    for (const key of schema.required ?? []) if (!(key in object)) fail(`is missing "${key}"`);
    for (const [key, item] of Object.entries(object)) {
      if (schema.propertyNames) {
        const nameErrors = validate(key, schema.propertyNames, root, join(path, key));
        if (nameErrors.length > 0)
          errors.push({
            path: join(path, key),
            message: `invalid name: ${nameErrors[0]!.message}`,
          });
      }
      const known = schema.properties?.[key];
      if (known) errors.push(...validate(item, known, root, join(path, key)));
      else if (schema.additionalProperties === false)
        errors.push({ path: join(path, key), message: 'is not an allowed property' });
      else if (typeof schema.additionalProperties === 'object')
        errors.push(...validate(item, schema.additionalProperties, root, join(path, key)));
    }
  }
  return errors;
}
