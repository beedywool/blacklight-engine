// CodeMirror 6 set up with the BlackLight palette: black surface, grey containers, white accents.
// Loaded only in the browser (live examples import it from onMounted).
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
import { tags } from '@lezer/highlight';
import { basicSetup } from 'codemirror';

const theme = EditorView.theme(
  {
    '&': {
      color: '#ededed',
      backgroundColor: '#111111',
      height: '100%',
      fontSize: '13px',
    },
    '.cm-scroller': {
      fontFamily: 'var(--vp-font-family-mono)',
      lineHeight: '1.6',
    },
    '.cm-content': { caretColor: '#ffffff' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#ffffff' },
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
      { backgroundColor: '#3a3a3a' },
    '.cm-gutters': {
      backgroundColor: '#0d0d0d',
      color: '#8e8e8e',
      border: 'none',
    },
    '.cm-activeLine': { backgroundColor: '#181818' },
    '.cm-activeLineGutter': { backgroundColor: '#181818', color: '#ededed' },
    '.cm-matchingBracket': { backgroundColor: '#303030', outline: '1px solid #8e8e8e' },
    '.cm-tooltip': {
      backgroundColor: '#222222',
      color: '#ededed',
      border: '1px solid #3a3a3a',
      borderRadius: '8px',
    },
    '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
      backgroundColor: '#303030',
      color: '#ffffff',
    },
    '.cm-panels': { backgroundColor: '#181818', color: '#ededed' },
    '.cm-foldPlaceholder': { backgroundColor: '#2c2c2c', border: 'none', color: '#c2c2c2' },
  },
  { dark: true },
);

const highlight = HighlightStyle.define([
  {
    tag: [tags.keyword, tags.controlKeyword, tags.moduleKeyword],
    color: '#ffffff',
    fontWeight: '600',
  },
  { tag: [tags.string, tags.special(tags.string), tags.regexp], color: '#b8b8b8' },
  {
    tag: [tags.comment, tags.lineComment, tags.blockComment],
    color: '#8e8e8e',
    fontStyle: 'italic',
  },
  { tag: [tags.number, tags.bool, tags.null, tags.atom], color: '#e6e6e6' },
  { tag: [tags.typeName, tags.className, tags.namespace], color: '#d6d6d6', fontStyle: 'italic' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: '#ffffff' },
  { tag: [tags.propertyName, tags.definition(tags.propertyName)], color: '#cfcfcf' },
  { tag: [tags.operator, tags.punctuation, tags.bracket], color: '#a8a8a8' },
  { tag: tags.invalid, color: '#f2b8b5' },
]);

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
