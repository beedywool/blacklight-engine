import type { Rule, Scope } from 'eslint';
import type * as ESTree from 'estree';

/** `Math` functions whose result may differ between JavaScript engines, and the replacement. */
const UNSTABLE_MATH = new Set([
  'sin',
  'cos',
  'tan',
  'asin',
  'acos',
  'atan',
  'atan2',
  'sinh',
  'cosh',
  'tanh',
  'asinh',
  'acosh',
  'atanh',
  'exp',
  'expm1',
  'log',
  'log1p',
  'log2',
  'log10',
  'pow',
  'cbrt',
  'hypot',
]);

/** Functions `DMath` provides under the same name. */
const IN_DMATH = new Set([
  'sin',
  'cos',
  'tan',
  'asin',
  'acos',
  'atan',
  'atan2',
  'exp',
  'log',
  'log2',
  'log10',
  'pow',
  'cbrt',
  'hypot',
]);

/** Comment that makes a whole file simulation code in `scope: 'marked'`. */
export const FILE_MARKER = '@blacklight-deterministic';

/**
 * Options of the `blacklight/deterministic` rule, which reports what would make online simulation
 * code differ between players: `Math.random`, `crypto` values, the wall clock (`Date.now`,
 * `performance.now`), and `Math.sin`, `**` and the other math that may differ between engines.
 */
export interface DeterministicOptions {
  /**
   * `'file'`: the whole file is simulation code (use it with `files` globs). `'marked'`: only
   * classes with `static deterministic = true` and files containing the comment
   * `@blacklight-deterministic`.
   * @defaultValue `'file'`
   */
  scope?: 'file' | 'marked';
}

function propertyName(node: ESTree.MemberExpression): string | undefined {
  if (!node.computed && node.property.type === 'Identifier') return node.property.name;
  if (node.property.type === 'Literal' && typeof node.property.value === 'string')
    return node.property.value;
  return undefined;
}

/** `true` when `name` at `node` is the global, not a local variable or import. */
function isGlobal(scope: Scope.Scope, name: string): boolean {
  for (let s: Scope.Scope | null = scope; s; s = s.upper) {
    const variable = s.set.get(name);
    if (variable && variable.defs.length > 0) return false;
  }
  return true;
}

function isMarkedClass(node: ESTree.Class): boolean {
  return node.body.body.some(
    (member) =>
      member.type === 'PropertyDefinition' &&
      member.static &&
      !member.computed &&
      member.key.type === 'Identifier' &&
      member.key.name === 'deterministic' &&
      member.value?.type === 'Literal' &&
      member.value.value === true,
  );
}

/**
 * `blacklight/deterministic`: forbids what differs between players' machines in simulation code
 * of online games — `Math.random`, engine-dependent `Math` functions and `**`, the wall clock
 * (`Date`, `performance.now`) and `crypto` random values.
 */
export const deterministic: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Forbid non-deterministic APIs (Math.random, Math.sin…, **, Date.now, performance.now) in simulation code of online games.',
    },
    schema: [
      {
        type: 'object',
        properties: { scope: { enum: ['file', 'marked'] } },
        additionalProperties: false,
      },
    ],
    messages: {
      math: '`Math.{{name}}` can return different last digits on V8 and JavaScriptCore, which desynchronizes online players. Use `DMath.{{name}}` from @blacklight/core.',
      mathOther:
        '`Math.{{name}}` can return different last digits on V8 and JavaScriptCore, which desynchronizes online players. Build it from DMath functions (@blacklight/core).',
      random:
        "`Math.random` is not seeded, so every player gets other numbers. Use the scene's seeded generator: `this.scene.random.next()` (or `this.random` in a scene).",
      clock:
        '`{{name}}` reads the wall clock, which differs between players. Count steps instead (`this.scene.steps`, timers with `after` / `every`).',
      crypto:
        "`crypto.{{name}}` gives different values to every player. Use the scene's seeded generator (`this.scene.random`).",
      power:
        'The `**` operator is `Math.pow`, which can differ between engines. Multiply (`x * x`) or use `DMath.pow` from @blacklight/core.',
    },
  },
  create(context) {
    const options = (context.options[0] ?? {}) as DeterministicOptions;
    const source = context.sourceCode;
    const wholeFile =
      options.scope !== 'marked' ||
      source.getAllComments().some((comment) => comment.value.includes(FILE_MARKER));
    let markedDepth = 0;
    const active = () => wholeFile || markedDepth > 0;

    const enterClass = (node: ESTree.Class) => {
      if (isMarkedClass(node)) markedDepth++;
    };
    const exitClass = (node: ESTree.Class) => {
      if (isMarkedClass(node)) markedDepth--;
    };

    const globalObject = (node: ESTree.Expression | ESTree.Super, name: string): boolean =>
      node.type === 'Identifier' && node.name === name && isGlobal(source.getScope(node), name);

    /** `crypto`, `globalThis.crypto`, `window.crypto`, `self.crypto`. */
    const isCrypto = (node: ESTree.Expression | ESTree.Super): boolean => {
      if (globalObject(node, 'crypto')) return true;
      return (
        node.type === 'MemberExpression' &&
        propertyName(node) === 'crypto' &&
        ['globalThis', 'window', 'self'].some((g) => globalObject(node.object, g))
      );
    };

    const checkMath = (node: ESTree.Node, name: string) => {
      if (name === 'random') context.report({ node, messageId: 'random' });
      else if (UNSTABLE_MATH.has(name))
        context.report({
          node,
          messageId: IN_DMATH.has(name) ? 'math' : 'mathOther',
          data: { name },
        });
    };

    return {
      ClassDeclaration: enterClass,
      'ClassDeclaration:exit': exitClass,
      ClassExpression: enterClass,
      'ClassExpression:exit': exitClass,

      MemberExpression(node) {
        if (!active()) return;
        const name = propertyName(node);
        if (name === undefined) return;
        if (globalObject(node.object, 'Math')) checkMath(node, name);
        else if (globalObject(node.object, 'Date') && name === 'now')
          context.report({ node, messageId: 'clock', data: { name: 'Date.now' } });
        else if (globalObject(node.object, 'performance') && name === 'now')
          context.report({ node, messageId: 'clock', data: { name: 'performance.now' } });
        else if (isCrypto(node.object) && (name === 'getRandomValues' || name === 'randomUUID'))
          context.report({ node, messageId: 'crypto', data: { name } });
      },

      VariableDeclarator(node) {
        // const { sin, random } = Math;
        if (!active() || node.id.type !== 'ObjectPattern' || !node.init) return;
        if (!globalObject(node.init, 'Math')) return;
        for (const property of node.id.properties) {
          if (property.type !== 'Property' || property.computed) continue;
          if (property.key.type === 'Identifier') checkMath(property, property.key.name);
        }
      },

      NewExpression(node) {
        if (active() && node.callee.type !== 'Super' && globalObject(node.callee, 'Date'))
          context.report({ node, messageId: 'clock', data: { name: 'new Date()' } });
      },

      CallExpression(node) {
        if (active() && node.callee.type !== 'Super' && globalObject(node.callee, 'Date'))
          context.report({ node, messageId: 'clock', data: { name: 'Date()' } });
      },

      BinaryExpression(node) {
        if (active() && node.operator === '**') context.report({ node, messageId: 'power' });
      },

      AssignmentExpression(node) {
        if (active() && node.operator === '**=') context.report({ node, messageId: 'power' });
      },
    };
  },
};
