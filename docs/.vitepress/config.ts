import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'Blacklight Engine',
  description:
    'A TypeScript game framework for web developers: scenes, objects, Persona-grade UI, every platform.',
  lang: 'en',
  cleanUrls: true,
  appearance: 'force-dark',
  lastUpdated: true,
  head: [
    ['link', { rel: 'icon', type: 'image/png', href: '/logo_bulb_only.png' }],
    ['meta', { name: 'theme-color', content: '#080808' }],
  ],
  themeConfig: {
    logo: { src: '/logo_bulb_only.png', alt: '' },
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Limitations', link: '/guide/limitations' },
    ],
    sidebar: [
      {
        text: 'Introduction',
        items: [
          { text: 'What is Blacklight Engine?', link: '/guide/what-is-blacklight' },
          { text: 'Getting started', link: '/guide/getting-started' },
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
        text: 'Interface',
        items: [
          { text: 'UI layer', link: '/guide/ui' },
          { text: 'Focus and input prompts', link: '/guide/ui-focus' },
          { text: 'Style, layout and motion', link: '/guide/ui-style' },
          { text: 'Widgets', link: '/guide/ui-widgets' },
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
        text: 'Reference',
        items: [{ text: 'Accepted limitations', link: '/guide/limitations' }],
      },
    ],
    search: { provider: 'local' },
    footer: { message: 'Released under the MIT License.', copyright: 'BlackLight' },
  },
});
