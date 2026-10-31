// NF-06: the public API is typed, documented and reviewed. Reads the declarations of every public
// entry point (scripts/api-entries.mjs) with TypeDoc, after `pnpm build`, and fails when
//   - a public symbol has no TSDoc comment (classes, interfaces, functions, methods, properties,
//     accessors, type aliases, enums and their members, variables, namespaces),
//   - a top-level class or function has no `@example`,
//   - a public type contains `any`,
//   - an entry point has a default export,
//   - a public type uses `typeof` of a declaration that is not exported (its shape would be hidden),
//   - api-report.txt (one line per public symbol with its signature) is not up to date.
// Symbols marked `@internal` are not public: tsup keeps the tag and TypeDoc leaves them out.
//
//   pnpm api:check            # check
//   pnpm api:check --update   # rewrite api-report.txt after an intended API change, then review it
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Application, Logger, LogLevel, ReflectionKind } from 'typedoc';
import { ENTRY_POINTS, specifierOfModule } from './api-entries.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

/** Kinds that need a comment. Constructors are covered by their class's comment. */
const DOCUMENTED_KINDS =
  ReflectionKind.Namespace |
  ReflectionKind.Enum |
  ReflectionKind.EnumMember |
  ReflectionKind.Variable |
  ReflectionKind.Function |
  ReflectionKind.Class |
  ReflectionKind.Interface |
  ReflectionKind.Property |
  ReflectionKind.Method |
  ReflectionKind.Accessor |
  ReflectionKind.TypeAlias;

/** Top-level kinds that need an `@example`. */
const EXAMPLE_KINDS = ReflectionKind.Class | ReflectionKind.Function;

class CollectingLogger extends Logger {
  messages = [];
  log(message, level) {
    if (level >= LogLevel.Error) this.messages.push(String(message));
  }
}

/**
 * Converts the declarations of `entries` (specifier → declaration file relative to `base`) into a
 * TypeDoc project whose modules are named after the specifiers.
 */
export async function loadApi({
  entries = ENTRY_POINTS,
  base = root,
  tsconfig = `${root}docs/scripts/api.tsconfig.json`,
} = {}) {
  const missing = Object.values(entries).filter((entry) => !existsSync(base + entry));
  if (missing.length) {
    throw new Error(
      `API check: missing declarations (${missing.join(', ')}). Run \`pnpm build\` at the repository root first.`,
    );
  }
  const app = await Application.bootstrap({
    entryPoints: Object.values(entries).map((entry) => base + entry),
    tsconfig,
    excludePrivate: true,
    excludeInternal: true,
    excludeExternals: true,
    skipErrorChecking: true,
    disableSources: true,
    sort: ['kind', 'alphabetical'],
    logLevel: 'Error',
  });
  const logger = new CollectingLogger();
  app.logger = logger;
  const project = await app.convert();
  if (!project) {
    throw new Error(
      `API check: TypeDoc could not read the declarations.\n${logger.messages.join('\n')}`,
    );
  }
  const modules = project.children?.every((child) => child.kindOf(ReflectionKind.Module))
    ? project.children
    : [project];
  if (modules.length === 1 && Object.keys(entries).length === 1) {
    modules[0].name = Object.keys(entries)[0];
  } else {
    for (const module of modules)
      module.name = specifierOfModule(module.name, entries) ?? module.name;
  }
  return { project, modules };
}

function ancestors(reflection) {
  const list = [];
  for (let r = reflection.parent; r; r = r.parent) list.push(r);
  return list;
}

function isInherited(reflection) {
  return [reflection, ...ancestors(reflection)].some((r) => r.inheritedFrom);
}

function signaturesOf(reflection) {
  const own = [
    ...(reflection.signatures ?? []),
    reflection.getSignature,
    reflection.setSignature,
  ].filter(Boolean);
  const declaration = reflection.type?.type === 'reflection' ? reflection.type.declaration : null;
  return [...own, ...(declaration?.signatures ?? [])];
}

function isDocumented(reflection) {
  if (reflection.hasComment()) return true;
  return signaturesOf(reflection).some((signature) => signature.hasComment());
}

function hasExample(reflection) {
  return [reflection, ...signaturesOf(reflection)].some((r) =>
    r.comment?.blockTags.some((tag) => tag.tag === '@example'),
  );
}

function kindName(reflection) {
  return ReflectionKind.singularString(reflection.kind).toLowerCase();
}

/** The project holds the modules, except with a single entry point where it is the module. */
function isModuleContainer(reflection) {
  return (
    reflection.kindOf(ReflectionKind.Project) &&
    Boolean(reflection.children?.some((child) => child.kindOf(ReflectionKind.Module)))
  );
}

function nameOf(reflection) {
  // Type literals are called `__type` by TypeDoc: leave them out of the path.
  // Signatures repeat the name of their function or method.
  const parts = [reflection, ...ancestors(reflection)]
    .filter((r) => !r.kindOf(ReflectionKind.SomeSignature) || r === reflection)
    .filter(
      (r, i, list) => !(r.kindOf(ReflectionKind.SomeSignature) && list[i + 1]?.name === r.name),
    )
    .filter((r) => !isModuleContainer(r) && r.name !== '__type')
    .map((r) => r.name)
    .reverse();
  const [module, ...rest] = parts;
  return rest.length ? `${module}: ${rest.join('.')}` : module;
}

/** A type and every type nested in it. Reflection types stop here: their members are checked one by one. */
function* nestedTypes(type) {
  if (!type) return;
  yield type;
  switch (type.type) {
    case 'array':
    case 'optional':
    case 'rest':
      yield* nestedTypes(type.elementType);
      return;
    case 'union':
    case 'intersection':
      for (const t of type.types) yield* nestedTypes(t);
      return;
    case 'tuple':
      for (const t of type.elements) yield* nestedTypes(t);
      return;
    case 'namedTupleMember':
      yield* nestedTypes(type.element);
      return;
    case 'reference':
      for (const t of type.typeArguments ?? []) yield* nestedTypes(t);
      return;
    case 'conditional':
      for (const t of [type.checkType, type.extendsType, type.trueType, type.falseType]) {
        yield* nestedTypes(t);
      }
      return;
    case 'indexedAccess':
      yield* nestedTypes(type.objectType);
      yield* nestedTypes(type.indexType);
      return;
    case 'inferred':
      yield* nestedTypes(type.constraint);
      return;
    case 'mapped':
      for (const t of [type.parameterType, type.templateType, type.nameType]) yield* nestedTypes(t);
      return;
    case 'predicate':
      yield* nestedTypes(type.targetType);
      return;
    case 'query':
      yield* nestedTypes(type.queryType);
      return;
    case 'typeOperator':
      yield* nestedTypes(type.target);
      return;
    case 'templateLiteral':
      for (const [t] of type.tail) yield* nestedTypes(t);
      return;
  }
}

function isAny(type) {
  return (
    (type.type === 'intrinsic' && type.name === 'any') ||
    (type.type === 'unknown' && /\bany\b/.test(type.name))
  );
}

/**
 * `typeof x` where `x` is not exported: the shape behind it reaches neither the API reference nor
 * api-report.txt, and its members escape the other checks. Components compiled by vue-tsc are
 * declared as `typeof __VLS_export`; their props are checked by vue-tsc in the templates instead.
 */
function isHiddenQuery(type) {
  return (
    type.type === 'query' && !type.queryType.reflection && !type.queryType.name.startsWith('__VLS_')
  );
}

/** Types written on a reflection (its own, not its members'). */
function typesOf(reflection) {
  return [
    reflection.type,
    reflection.default && typeof reflection.default === 'object' ? reflection.default : undefined,
    ...(reflection.extendedTypes ?? []),
    ...(reflection.implementedTypes ?? []),
  ].filter(Boolean);
}

/**
 * Finds every problem of a converted API: undocumented symbols, top-level classes and functions
 * without `@example`, `any` in a public type, default exports. Returns a sorted list of messages and
 * the number of symbols that need a comment.
 */
export function findProblems({ project, modules }) {
  const problems = [];
  let symbols = 0;
  for (const module of modules) {
    for (const child of module.children ?? []) {
      if (child.name === 'default') {
        problems.push(
          `${module.name}: has a default export. Engine packages use named exports: export the symbol by name.`,
        );
      }
      if (child.kindOf(EXAMPLE_KINDS) && !hasExample(child)) {
        problems.push(
          `${nameOf(child)} (${kindName(child)}) has no @example. Add a short, realistic \`@example\` block to its TSDoc.`,
        );
      }
    }
  }
  for (const reflection of Object.values(project.reflections)) {
    if (isInherited(reflection)) continue;
    const parents = ancestors(reflection);
    const inParameter = parents.some((r) =>
      r.kindOf(ReflectionKind.Parameter | ReflectionKind.TypeParameter),
    );
    if (reflection.kindOf(DOCUMENTED_KINDS) && !inParameter && reflection.name !== 'default') {
      symbols++;
      if (!isDocumented(reflection)) {
        problems.push(
          `${nameOf(reflection)} (${kindName(reflection)}) has no TSDoc comment. Document it in the package's src/, or mark it @internal if games never use it.`,
        );
      }
    }
    const nested = typesOf(reflection).flatMap((type) => [...nestedTypes(type)]);
    if (nested.some(isAny)) {
      problems.push(
        `${nameOf(reflection)} (${kindName(reflection)}) uses \`any\` in its public type. Use a precise type, \`unknown\` or a type parameter.`,
      );
    }
    for (const query of nested.filter(isHiddenQuery)) {
      problems.push(
        `${nameOf(reflection)} (${kindName(reflection)}) uses \`typeof ${query.queryType.name}\`, which is not exported: its shape is missing from the API reference and api-report.txt. Write the type out as a documented interface or type alias, or export ${query.queryType.name} with TSDoc.`,
      );
    }
  }
  return { problems: [...new Set(problems)].sort(), symbols };
}

// --- API report -------------------------------------------------------------------------------

function typeToString(type) {
  if (!type) return 'void';
  switch (type.type) {
    case 'intrinsic':
      return type.name;
    case 'unknown':
      return type.name;
    case 'literal':
      return typeof type.value === 'string'
        ? JSON.stringify(type.value)
        : type.value === null
          ? 'null'
          : typeof type.value === 'object'
            ? `${type.value.negative ? '-' : ''}${type.value.value}n`
            : String(type.value);
    case 'array': {
      const inner = typeToString(type.elementType);
      return /[|& ]/.test(inner) ? `(${inner})[]` : `${inner}[]`;
    }
    case 'optional':
      return `${typeToString(type.elementType)}?`;
    case 'rest':
      return `...${typeToString(type.elementType)}`;
    case 'union':
      return type.types.map(typeToString).join(' | ');
    case 'intersection':
      return type.types.map(typeToString).join(' & ');
    case 'tuple':
      return `[${type.elements.map(typeToString).join(', ')}]`;
    case 'namedTupleMember':
      return `${type.name}${type.isOptional ? '?' : ''}: ${typeToString(type.element)}`;
    case 'reference': {
      const args = type.typeArguments?.length
        ? `<${type.typeArguments.map(typeToString).join(', ')}>`
        : '';
      return `${type.name}${args}`;
    }
    case 'conditional':
      return `${typeToString(type.checkType)} extends ${typeToString(type.extendsType)} ? ${typeToString(type.trueType)} : ${typeToString(type.falseType)}`;
    case 'indexedAccess':
      return `${typeToString(type.objectType)}[${typeToString(type.indexType)}]`;
    case 'inferred':
      return `infer ${type.name}${type.constraint ? ` extends ${typeToString(type.constraint)}` : ''}`;
    case 'mapped':
      return `{ [${type.parameter} in ${typeToString(type.parameterType)}${type.nameType ? ` as ${typeToString(type.nameType)}` : ''}]${type.optionalModifier === '+' ? '?' : type.optionalModifier === '-' ? '-?' : ''}: ${typeToString(type.templateType)} }`;
    case 'predicate':
      return `${type.asserts ? 'asserts ' : ''}${type.name}${type.targetType ? ` is ${typeToString(type.targetType)}` : ''}`;
    case 'query':
      return `typeof ${typeToString(type.queryType)}`;
    case 'typeOperator':
      return `${type.operator} ${typeToString(type.target)}`;
    case 'templateLiteral':
      return `\`${type.head}${type.tail.map(([t, text]) => `\${${typeToString(t)}}${text}`).join('')}\``;
    case 'reflection':
      return declarationToString(type.declaration);
    default:
      return String(type);
  }
}

function typeParametersToString(list) {
  if (!list?.length) return '';
  const one = (p) =>
    `${p.flags.isConst ? 'const ' : ''}${p.name}${p.type ? ` extends ${typeToString(p.type)}` : ''}${p.default ? ` = ${typeToString(p.default)}` : ''}`;
  return `<${list.map(one).join(', ')}>`;
}

function parametersToString(list) {
  return (list ?? [])
    .map(
      (p) =>
        `${p.flags.isRest ? '...' : ''}${p.name}${p.flags.isOptional ? '?' : ''}: ${typeToString(p.type)}`,
    )
    .join(', ');
}

function signatureToString(signature, name = '') {
  const separator = signature.kindOf(ReflectionKind.ConstructorSignature) ? 'new ' : '';
  return `${separator}${name}${typeParametersToString(signature.typeParameters)}(${parametersToString(signature.parameters)}): ${typeToString(signature.type)}`;
}

function declarationToString(declaration) {
  const parts = [];
  for (const signature of declaration.signatures ?? []) parts.push(signatureToString(signature));
  for (const index of declaration.indexSignatures ?? []) {
    parts.push(`[${parametersToString(index.parameters)}]: ${typeToString(index.type)}`);
  }
  for (const child of declaration.children ?? []) parts.push(memberToString(child));
  if (parts.length === 1 && declaration.signatures?.length === 1 && !declaration.children) {
    const signature = declaration.signatures[0];
    return `(${parametersToString(signature.parameters)}) => ${typeToString(signature.type)}`;
  }
  return parts.length ? `{ ${parts.join('; ')} }` : '{}';
}

function modifiers(reflection) {
  const flags = reflection.flags;
  return [
    flags.isStatic && 'static',
    flags.isProtected && 'protected',
    flags.isAbstract && 'abstract',
    flags.isReadonly && 'readonly',
  ]
    .filter(Boolean)
    .map((flag) => `${flag} `)
    .join('');
}

function memberToString(reflection) {
  const name = `${reflection.name}${reflection.flags.isOptional ? '?' : ''}`;
  if (reflection.signatures?.length) {
    return reflection.signatures
      .map((signature) => `${modifiers(reflection)}${signatureToString(signature, name)}`)
      .join('; ');
  }
  if (reflection.getSignature || reflection.setSignature) {
    const parts = [];
    if (reflection.getSignature) {
      parts.push(
        `${modifiers(reflection)}get ${name}(): ${typeToString(reflection.getSignature.type)}`,
      );
    }
    if (reflection.setSignature) {
      parts.push(
        `${modifiers(reflection)}set ${name}(${parametersToString(reflection.setSignature.parameters)})`,
      );
    }
    return parts.join('; ');
  }
  return `${modifiers(reflection)}${name}: ${typeToString(reflection.type)}`;
}

function heritage(reflection) {
  const parts = [];
  if (reflection.extendedTypes?.length) {
    parts.push(` extends ${reflection.extendedTypes.map(typeToString).join(', ')}`);
  }
  if (reflection.implementedTypes?.length) {
    parts.push(` implements ${reflection.implementedTypes.map(typeToString).join(', ')}`);
  }
  return parts.join('');
}

function reportLines(reflection, indent) {
  const pad = '  '.repeat(indent);
  const typeParams = typeParametersToString(reflection.typeParameters);
  if (reflection.kindOf(ReflectionKind.Reference)) {
    const target = reflection.getTargetReflectionDeep?.() ?? reflection;
    return [`${pad}export ${reflection.name} = ${target === reflection ? '?' : nameOf(target)}`];
  }
  if (
    reflection.kindOf(
      ReflectionKind.ClassOrInterface | ReflectionKind.Namespace | ReflectionKind.Enum,
    )
  ) {
    const kind = kindName(reflection);
    const lines = [
      `${pad}${reflection.flags.isAbstract ? 'abstract ' : ''}${kind} ${reflection.name}${typeParams}${heritage(reflection)}`,
    ];
    for (const index of reflection.indexSignatures ?? []) {
      lines.push(`${pad}  [${parametersToString(index.parameters)}]: ${typeToString(index.type)}`);
    }
    for (const child of reflection.children ?? []) {
      if (child.inheritedFrom) continue;
      if (child.kindOf(ReflectionKind.EnumMember)) {
        lines.push(`${pad}  ${child.name} = ${typeToString(child.type)}`);
      } else {
        lines.push(...reportLines(child, indent + 1));
      }
    }
    return lines;
  }
  if (reflection.kindOf(ReflectionKind.TypeAlias)) {
    return [`${pad}type ${reflection.name}${typeParams} = ${typeToString(reflection.type)}`];
  }
  if (reflection.kindOf(ReflectionKind.Function)) {
    return reflection.signatures.map(
      (s) => `${pad}function ${signatureToString(s, reflection.name)}`,
    );
  }
  if (reflection.kindOf(ReflectionKind.Variable)) {
    return [`${pad}${reflection.flags.isConst ? 'const' : 'let'} ${memberToString(reflection)}`];
  }
  if (reflection.kindOf(ReflectionKind.Constructor)) {
    return reflection.signatures.map(
      (s) => `${pad}constructor(${parametersToString(s.parameters)})`,
    );
  }
  return [`${pad}${memberToString(reflection)}`];
}

/** One line per public symbol with its signature, grouped by entry point. */
export function apiReport({ modules }, entries = ENTRY_POINTS) {
  const order = Object.keys(entries);
  const sorted = [...modules].sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
  const out = [
    '# Public API of Blacklight Engine, generated by `pnpm api:check --update` from the declarations',
    '# of every entry point (scripts/api-entries.mjs). A changed line is a change of the public API:',
    '# a removed or narrowed line breaks games (major version), an added one is a feature (minor).',
  ];
  for (const module of sorted) {
    out.push('', `## ${module.name}`, '');
    for (const child of module.children ?? []) out.push(...reportLines(child, 0));
  }
  return `${out.join('\n')}\n`;
}

// --- Command line -----------------------------------------------------------------------------

async function main() {
  const update = process.argv.includes('--update');
  const api = await loadApi();
  const { problems, symbols } = findProblems(api);
  const reportFile = `${root}api-report.txt`;
  const report = apiReport(api);
  let failed = false;
  if (problems.length) {
    failed = true;
    console.error(problems.join('\n'));
    console.error(
      `\nAPI check: ${problems.length} problem(s) in the public API (${symbols} symbols). See CONTRIBUTING.md, "Documenting the public API".`,
    );
  }
  if (update) {
    writeFileSync(reportFile, report);
    console.log('API check: api-report.txt written. Review its diff before committing.');
  } else if (
    // A Windows checkout (core.autocrlf) turns the report's line endings into CRLF.
    !existsSync(reportFile) ||
    readFileSync(reportFile, 'utf8').replace(/\r\n/g, '\n') !== report
  ) {
    failed = true;
    console.error(
      'API check: api-report.txt does not match the public API. Run `pnpm api:check --update` and review the diff: a removed or changed line is a breaking change (CONTRIBUTING.md, "Versions and releases").',
    );
  }
  // exitCode instead of exit(): a pipe would lose the messages still buffered.
  if (failed) {
    process.exitCode = 1;
    return;
  }
  console.log(
    `API check: ${symbols} public symbols in ${Object.keys(ENTRY_POINTS).length} entry points documented and typed; api-report.txt up to date.`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
