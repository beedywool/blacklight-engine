// CodeMirror 6 set up for the BlackLight surface: near-black background, grey containers, and a
// syntax palette with one hue per kind of token (violet keywords, green strings, amber numbers,
// blue calls, gold types, rose properties, muted italic comments) so code reads faster than the
// white-on-grey it used to be. Loaded only in the browser (live examples import it on mount).
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { EditorState, StateEffect, StateField, type Extension, type Text } from '@codemirror/state';
import { Decoration, EditorView, keymap, type DecorationSet } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
import { tags } from '@lezer/highlight';
import { basicSetup } from 'codemirror';
import { syntaxColors } from './syntax';

const theme = EditorView.theme(
  {
    '&': {
      color: syntaxColors.text,
      backgroundColor: syntaxColors.background,
      height: '100%',
      fontSize: '13px',
    },
    '.cm-scroller': {
      fontFamily: 'var(--vp-font-family-mono)',
      lineHeight: '1.65',
    },
    '.cm-content': { caretColor: '#e9edf5' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#e9edf5' },
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
      { backgroundColor: '#2c3b55' },
    '.cm-gutters': {
      backgroundColor: '#0a0c10',
      color: '#5f6a79',
      border: 'none',
    },
    '.cm-activeLine': { backgroundColor: '#161a21' },
    '.cm-activeLineGutter': { backgroundColor: '#161a21', color: syntaxColors.text },
    // Lines a solution changed, after the solution button applied it.
    '.cm-highlight-line': {
      backgroundColor: '#18222f',
      boxShadow: `inset 3px 0 0 ${syntaxColors.call}`,
    },
    '.cm-matchingBracket': { backgroundColor: '#26313f', outline: '1px solid #5f7fb0' },
    '.cm-tooltip': {
      backgroundColor: '#1d222b',
      color: '#d6dbe4',
      border: '1px solid #333b47',
      borderRadius: '8px',
    },
    '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
      backgroundColor: '#2b3340',
      color: '#ffffff',
    },
    '.cm-panels': { backgroundColor: '#181c23', color: '#d6dbe4' },
    '.cm-foldPlaceholder': { backgroundColor: '#2b3340', border: 'none', color: '#c2cbd8' },
  },
  { dark: true },
);

const highlight = HighlightStyle.define([
  {
    tag: [tags.keyword, tags.controlKeyword, tags.moduleKeyword, tags.definitionKeyword],
    color: syntaxColors.keyword,
    fontWeight: '600',
  },
  {
    tag: [tags.string, tags.special(tags.string), tags.attributeValue],
    color: syntaxColors.string,
  },
  { tag: tags.regexp, color: syntaxColors.regexp },
  {
    tag: [tags.comment, tags.lineComment, tags.blockComment, tags.docComment],
    color: syntaxColors.comment,
    fontStyle: 'italic',
  },
  { tag: tags.number, color: syntaxColors.number },
  { tag: [tags.bool, tags.null, tags.atom], color: syntaxColors.constant },
  { tag: [tags.typeName, tags.className, tags.namespace], color: syntaxColors.type },
  {
    tag: [tags.function(tags.variableName), tags.function(tags.propertyName)],
    color: syntaxColors.call,
  },
  { tag: [tags.propertyName, tags.definition(tags.propertyName)], color: syntaxColors.property },
  { tag: tags.tagName, color: syntaxColors.tag },
  { tag: tags.attributeName, color: syntaxColors.attribute },
  { tag: [tags.operator, tags.operatorKeyword], color: syntaxColors.operator },
  { tag: [tags.punctuation, tags.bracket, tags.separator], color: syntaxColors.punctuation },
  { tag: [tags.meta, tags.processingInstruction], color: syntaxColors.meta },
  { tag: tags.invalid, color: syntaxColors.invalid, textDecoration: 'underline wavy' },
]);

/** Replaces the highlighted lines (1-based) of an editor. */
const setHighlightedLines = StateEffect.define<number[]>();

function lineDecorations(lines: number[], doc: Text): DecorationSet {
  const marks = lines
    .filter((line) => line >= 1 && line <= doc.lines)
    .map((line) => Decoration.line({ class: 'cm-highlight-line' }).range(doc.line(line).from));
  return Decoration.set(marks, true);
}

const highlightedLines = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(marks, transaction) {
    for (const effect of transaction.effects)
      if (effect.is(setHighlightedLines))
        return lineDecorations(effect.value, transaction.state.doc);
    return marks.map(transaction.changes);
  },
  provide: (field) => EditorView.decorations.from(field),
});

/** Marks lines of the editor, such as the ones a solution changed. */
export function setHighlight(view: EditorView, lines: number[]): void {
  view.dispatch({ effects: setHighlightedLines.of(lines) });
}

/** Editor extensions for a file, picked by its extension. */
function language(path: string): Extension {
  if (path.endsWith('.json')) return json();
  return javascript({ typescript: true });
}

/**
 * Creates an editor in `parent` for `path`. `onChange` gets the whole text after each edit.
 */
export function createEditor(
  parent: HTMLElement,
  path: string,
  text: string,
  onChange: (text: string) => void,
): EditorView {
  return new EditorView({
    parent,
    state: EditorState.create({
      doc: text,
      extensions: [
        basicSetup,
        keymap.of([indentWithTab]),
        language(path),
        theme,
        syntaxHighlighting(highlight),
        highlightedLines,
        EditorView.contentAttributes.of({ 'aria-label': `Code of ${path}` }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChange(update.state.doc.toString());
        }),
      ],
    }),
  });
}

/** Replaces the whole text of an editor. */
export function setText(view: EditorView, text: string): void {
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
}
