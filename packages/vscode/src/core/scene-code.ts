import type * as TS from 'typescript';

/**
 * Makes a scene load its layout file: adds `import layout from './<name>.layout.json'` and
 * `this.load(layout);` at the start of `create()` (creating `create()` when missing). Returns the
 * new source, or `undefined` when the scene already imports the layout or has no default class.
 */
export function addLayoutLoad(
  ts: typeof TS,
  source: string,
  layoutFile: string,
): string | undefined {
  if (source.includes(layoutFile)) return undefined;
  const file = ts.createSourceFile(
    'scene.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const edits: { at: number; text: string }[] = [];
  const imports = file.statements.filter(ts.isImportDeclaration);
  const importText = `import layout from './${layoutFile}';\n`;
  const lastImport = imports.at(-1);
  edits.push(
    lastImport
      ? { at: lastImport.end, text: `\n${importText.trimEnd()}` }
      : { at: 0, text: importText },
  );

  const cls = file.statements.find(
    (s): s is TS.ClassDeclaration =>
      ts.isClassDeclaration(s) &&
      !!s.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword),
  );
  if (!cls) return undefined;
  const indentOf = (node: TS.Node) => {
    const start = source.lastIndexOf('\n', node.getStart()) + 1;
    return /^[ \t]*/.exec(source.slice(start))![0];
  };
  const create = cls.members.find(
    (m): m is TS.MethodDeclaration =>
      ts.isMethodDeclaration(m) && m.name.getText() === 'create' && !!m.body,
  );
  if (create?.body) {
    const first = create.body.statements[0];
    const indent = first ? indentOf(first) : `${indentOf(create)}  `;
    edits.push({ at: create.body.getStart() + 1, text: `\n${indent}this.load(layout);` });
  } else {
    const member = cls.members.find((m) => ts.isMethodDeclaration(m)) ?? undefined;
    const indent = cls.members[0] ? indentOf(cls.members[0]) : '  ';
    const method = `${indent}override create() {\n${indent}  this.load(layout);\n${indent}}\n`;
    if (member)
      edits.push({ at: source.lastIndexOf('\n', member.getStart()) + 1, text: `${method}\n` });
    else edits.push({ at: cls.end - 1, text: `\n${method}` });
  }
  let out = source;
  for (const edit of edits.sort((a, b) => b.at - a.at))
    out = out.slice(0, edit.at) + edit.text + out.slice(edit.at);
  return out;
}
