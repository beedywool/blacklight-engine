import { existsSync, readFileSync } from 'node:fs';
import { defineConfig, type DefaultTheme } from 'vitepress';
import { shikiTheme } from './theme/syntax';

/** Sidebar of the API reference, written by `scripts/api.mjs` (TypeDoc) before each build. */
function apiSidebar(): DefaultTheme.SidebarItem[] {
  const file = new URL('../api/typedoc-sidebar.json', import.meta.url);
  const modules = existsSync(file)
    ? (JSON.parse(readFileSync(file, 'utf8')) as DefaultTheme.SidebarItem[])
    : [];
  // One entry per package: the site data (sidebar included) is inlined in every page, and the
  // full member list would add hundreds of kilobytes to each. Package pages list their members.
  const items = modules.map(({ text, link }) => ({ text, link }));
  return [{ text: 'API reference', link: '/api/', items }];
}

const BEHAVIORS = [
  'eightDirections',
  'fourDirections',
  'platformer',
  'gridMovement',
  'pointer',
  'dragAndDrop',
  'virtualJoystick',
  'pathFollow',
  'patrol',
  'followTarget',
  'bullet',
  'bounce',
  'tankRotation',
  'sineWave',
  'anchorToScreen',
  'wrapAroundScreen',
  'destroyOutsideLayout',
  'flash',
  'fade',
];
const kebab = (name: string) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

const guide: DefaultTheme.SidebarItem[] = [
  {
    text: 'Introduction',
    items: [
      { text: 'What is Blacklight Engine?', link: '/guide/what-is-blacklight' },
      { text: 'Install the tools', link: '/guide/installation' },
      { text: 'Getting started', link: '/guide/getting-started' },
      { text: 'Start from a template', link: '/guide/templates' },
      { text: 'Concepts', link: '/guide/concepts' },
      { text: 'Coming from another engine', link: '/guide/migration' },
      { text: 'FAQ', link: '/guide/faq' },
    ],
  },
  {
    text: 'Tutorials',
    items: [
      { text: 'How the tutorials work', link: '/tutorials/' },
      { text: 'Scenes', link: '/tutorials/scenes' },
      { text: 'Objects', link: '/tutorials/objects' },
      { text: 'Behaviors', link: '/tutorials/behaviors' },
      { text: 'Sprites and animations', link: '/tutorials/sprites' },
      { text: 'Input', link: '/tutorials/input' },
      { text: 'Collisions', link: '/tutorials/collisions' },
      { text: 'Camera', link: '/tutorials/camera' },
      { text: 'UI screens and widgets', link: '/tutorials/ui' },
      { text: 'Transitions', link: '/tutorials/transitions' },
    ],
  },
  {
    text: 'Essentials',
    items: [
      { text: 'Project layout', link: '/guide/project-layout' },
      { text: 'Configuration', link: '/guide/configuration' },
      { text: 'Scenes', link: '/guide/scenes' },
      { text: 'Objects', link: '/guide/objects' },
      { text: 'Sprites and animations', link: '/guide/sprites-and-animations' },
      { text: 'Assets', link: '/guide/assets' },
    ],
  },
  {
    text: 'Gameplay',
    items: [
      { text: 'Behaviors', link: '/guide/behaviors' },
      { text: 'Collisions and physics', link: '/guide/collisions' },
      { text: 'Input', link: '/guide/input' },
      { text: 'Audio', link: '/guide/audio' },
      { text: 'Camera', link: '/guide/camera' },
      { text: 'Time and events', link: '/guide/time-and-events' },
    ],
  },
  {
    text: 'Behaviors',
    collapsed: true,
    items: BEHAVIORS.map((name) => ({ text: name, link: `/behaviors/${kebab(name)}` })),
  },
  {
    text: 'Interface',
    items: [
      { text: 'UI layer', link: '/guide/ui' },
      { text: 'Focus and input prompts', link: '/guide/ui-focus' },
      { text: 'Style, layout and motion', link: '/guide/ui-style' },
      { text: 'Widgets', link: '/guide/ui-widgets' },
      { text: 'Transitions', link: '/guide/ui-transitions' },
      { text: 'Rich text', link: '/guide/ui-rich-text' },
      { text: 'Dialogue', link: '/guide/ui-dialogue' },
      { text: 'FX layer', link: '/guide/ui-fx' },
      { text: 'World-anchored UI', link: '/guide/ui-world' },
      { text: 'Localization', link: '/guide/ui-localization' },
      { text: 'Accessibility', link: '/guide/ui-accessibility' },
      { text: 'Ready-made screens', link: '/guide/ui-screens' },
      { text: 'Video', link: '/guide/ui-video' },
    ],
  },
  {
    text: '3D',
    items: [
      { text: '3D models', link: '/guide/3d' },
      { text: 'Render to texture', link: '/guide/3d-render-to-texture' },
    ],
  },
  {
    text: 'Modules and services',
    items: [
      { text: 'Modules', link: '/guide/modules' },
      { text: 'Native parts', link: '/guide/modules-native' },
      { text: 'Module registry', link: '/guide/modules-registry' },
      { text: 'Accounts', link: '/guide/accounts' },
      { text: 'Achievements', link: '/guide/achievements' },
      { text: 'Telemetry', link: '/guide/telemetry' },
      { text: 'Reference server', link: '/guide/server' },
    ],
  },
  {
    text: 'Tools',
    items: [
      { text: 'Snapshots', link: '/guide/snapshots' },
      { text: 'Debugging', link: '/guide/debugging' },
      { text: 'Command line tools', link: '/guide/tooling' },
      { text: 'Hot reload', link: '/guide/hot-reload' },
      { text: 'VS Code extension', link: '/guide/vscode' },
    ],
  },
  {
    text: 'Desktop and release',
    items: [
      { text: 'Desktop and Steam', link: '/guide/desktop' },
      { text: 'Saves', link: '/guide/saves' },
      { text: 'Production hardening', link: '/guide/security' },
    ],
  },
  {
    text: 'Mobile',
    items: [{ text: 'Android and iOS', link: '/guide/mobile' }],
  },
  {
    text: 'Online',
    items: [
      { text: 'Networking', link: '/guide/networking' },
      { text: 'Determinism', link: '/guide/networking-determinism' },
      { text: 'Testing online play', link: '/guide/networking-testing' },
      { text: 'Relay server', link: '/guide/networking-relay' },
    ],
  },
  {
    text: 'Deployment',
    items: [
      { text: 'Web games (PWA)', link: '/guide/deploy-web' },
      { text: 'Docs site and playground', link: '/guide/deploy-docs' },
      { text: 'Module registry', link: '/guide/deploy-registry' },
      { text: 'Servers', link: '/guide/deploy-server' },
    ],
  },
  {
    text: 'Publishing',
    items: [
      { text: 'Apple: macOS and iOS', link: '/publishing/apple' },
      { text: 'Windows code signing', link: '/publishing/windows' },
      { text: 'Android and Google Play', link: '/publishing/android' },
      { text: 'Steamworks', link: '/publishing/steam' },
      { text: 'OpenID Connect provider', link: '/publishing/oidc' },
      { text: 'GitHub secrets', link: '/publishing/github-secrets' },
    ],
  },
  {
    text: 'Recipes',
    items: [
      { text: 'All recipes', link: '/recipes/' },
      { text: 'Pause menu', link: '/recipes/pause-menu' },
      { text: 'Shooting', link: '/recipes/shooting' },
      { text: 'Hit feedback', link: '/recipes/hit-feedback' },
      { text: 'Health bars over enemies', link: '/recipes/health-bars' },
      { text: 'Touch controls', link: '/recipes/touch-controls' },
      { text: 'Local multiplayer', link: '/recipes/local-multiplayer' },
      { text: 'Split screen', link: '/recipes/split-screen' },
      { text: 'Save and continue', link: '/recipes/save-and-continue' },
      { text: 'Custom loading screen', link: '/recipes/loading-screen' },
    ],
  },
  {
    text: 'Reference',
    items: [
      { text: 'API reference', link: '/api/' },
      { text: 'Playground', link: '/playground' },
      { text: 'Benchmarks', link: '/benchmarks' },
      { text: 'Accepted limitations', link: '/guide/limitations' },
    ],
  },
];

export default defineConfig({
  title: 'Blacklight Engine',
  description:
    'A TypeScript game framework for web developers: scenes, objects, Persona-grade UI, every platform.',
  lang: 'en',
  cleanUrls: true,
  // Site data and the page hash map go to one shared chunk instead of being inlined in each of
  // the ~900 pages (the API reference alone has 740).
  metaChunk: true,
  appearance: 'force-dark',
  lastUpdated: true,
  // Static snippets use the palette of the live editors (theme/syntax.ts).
  markdown: { theme: shikiTheme },
  // The API reference is generated; its pages link to each other by file name.
  ignoreDeadLinks: [/^\.\.?\/api\//],
  head: [
    ['link', { rel: 'icon', type: 'image/png', href: '/logo_bulb_only.png' }],
    ['meta', { name: 'theme-color', content: '#080808' }],
  ],
  themeConfig: {
    logo: { src: '/logo_bulb_only.png', alt: '' },
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Tutorials', link: '/tutorials/' },
      { text: 'Recipes', link: '/recipes/' },
      { text: 'API', link: '/api/' },
      { text: 'Playground', link: '/playground' },
      { text: 'Limitations', link: '/guide/limitations' },
    ],
    sidebar: {
      '/guide/': guide,
      '/behaviors/': guide,
      '/recipes/': guide,
      '/tutorials/': guide,
      '/publishing/': guide,
      '/api/': apiSidebar(),
    },
    search: { provider: 'local' },
    footer: { message: 'Released under the MIT License.', copyright: 'BlackLight' },
  },
});
