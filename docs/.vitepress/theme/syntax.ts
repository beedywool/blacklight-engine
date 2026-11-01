// One palette for every line of code in the docs: the CodeMirror theme of the live examples
// (`editor.ts`) and the Shiki theme of the static snippets (`config.ts`) read these colours, so a
// keyword is the same violet in an editor and in a code block. Hues, one per kind of token, on a
// near-black surface: keywords violet, strings green, numbers amber, calls blue, types gold,
// properties rose, comments muted italic.

/** Colours of code tokens, by the kind of token. */
export const syntaxColors = {
  background: '#0f1115',
  text: '#d6dbe4',
  keyword: '#c792ea',
  string: '#9ec879',
  regexp: '#56b6c2',
  comment: '#7d8797',
  number: '#e0a86b',
  constant: '#56b6c2',
  type: '#e5c07b',
  call: '#61afef',
  property: '#e19aa6',
  tag: '#e06c75',
  attribute: '#e5c07b',
  operator: '#93a1b1',
  punctuation: '#8b95a5',
  meta: '#7d8797',
  invalid: '#ff8f8f',
} as const;

const token = (foreground: string, fontStyle?: 'italic' | 'bold') => ({
  foreground,
  ...(fontStyle ? { fontStyle } : {}),
});

/**
 * The Shiki theme of code blocks: `syntaxColors` in the shape VitePress takes for
 * `markdown.theme`. Later rules win, so specific scopes come after the general ones.
 */
export const shikiTheme = {
  name: 'blacklight',
  type: 'dark',
  colors: {
    'editor.background': syntaxColors.background,
    'editor.foreground': syntaxColors.text,
  },
  tokenColors: [
    {
      scope: ['comment', 'punctuation.definition.comment'],
      settings: token(syntaxColors.comment, 'italic'),
    },
    {
      scope: ['string', 'string.quoted', 'punctuation.definition.string'],
      settings: token(syntaxColors.string),
    },
    {
      scope: ['regexp', 'string.regexp', 'constant.other.character-class.regexp'],
      settings: token(syntaxColors.regexp),
    },
    { scope: ['constant.numeric', 'constant.other'], settings: token(syntaxColors.number) },
    {
      scope: [
        'constant.language',
        'constant.language.boolean',
        'constant.language.null',
        'constant.language.undefined',
        'constant.language.nan',
      ],
      settings: token(syntaxColors.constant),
    },
    {
      scope: [
        'entity.name.type',
        'entity.name.class',
        'entity.name.namespace',
        'entity.other.inherited-class',
        'support.type',
        'support.class',
        'meta.type.annotation entity.name.type',
      ],
      settings: token(syntaxColors.type),
    },
    {
      scope: [
        'variable.other.property',
        'variable.other.object.property',
        'variable.other.constant.property',
        'support.variable.property',
        'meta.object-literal.key',
      ],
      settings: token(syntaxColors.property),
    },
    {
      scope: [
        'entity.name.function',
        'support.function',
        'variable.function',
        'meta.function-call',
      ],
      settings: token(syntaxColors.call),
    },
    { scope: ['entity.name.tag', 'support.class.component'], settings: token(syntaxColors.tag) },
    {
      scope: ['entity.other.attribute-name', 'meta.attribute'],
      settings: token(syntaxColors.attribute),
    },
    {
      scope: [
        'keyword',
        'storage',
        'storage.type',
        'storage.modifier',
        'keyword.control',
        'keyword.other',
      ],
      settings: token(syntaxColors.keyword, 'bold'),
    },
    { scope: ['keyword.operator', 'punctuation.accessor'], settings: token(syntaxColors.operator) },
    {
      scope: ['punctuation', 'meta.brace', 'punctuation.separator', 'punctuation.terminator'],
      settings: token(syntaxColors.punctuation),
    },
    {
      scope: ['meta.annotation', 'storage.type.annotation', 'meta.decorator'],
      settings: token(syntaxColors.meta),
    },
    {
      scope: ['markup.heading'],
      settings: { ...token(syntaxColors.text), fontStyle: 'bold' },
    },
    { scope: ['markup.bold'], settings: { ...token(syntaxColors.text), fontStyle: 'bold' } },
    { scope: ['markup.italic'], settings: { ...token(syntaxColors.text), fontStyle: 'italic' } },
    {
      scope: ['markup.underline.link', 'string.other.link', 'meta.link'],
      settings: token(syntaxColors.call),
    },
    {
      scope: ['invalid', 'invalid.illegal'],
      settings: { ...token(syntaxColors.invalid), fontStyle: 'italic' },
    },
  ],
};
