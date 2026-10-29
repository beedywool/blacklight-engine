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
