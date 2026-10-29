// `import story from '@stories/en/main.ink'`: the CLI compiles Ink files to the JSON inkjs plays.
declare module '*.ink' {
  const story: object;
  export default story;
}
