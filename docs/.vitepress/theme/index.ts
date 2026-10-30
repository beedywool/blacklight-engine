import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import LiveExample from './components/LiveExample.vue';
import BlPlayground from './components/BlPlayground.vue';
import './style.css';

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('LiveExample', LiveExample);
    app.component('BlPlayground', BlPlayground);
  },
} satisfies Theme;
