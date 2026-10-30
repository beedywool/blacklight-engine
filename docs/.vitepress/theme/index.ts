import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import LiveExample from './components/LiveExample.vue';
import BlPlayground from './components/BlPlayground.vue';
import BlExercise from './components/BlExercise.vue';
import './style.css';

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('LiveExample', LiveExample);
    app.component('BlPlayground', BlPlayground);
    app.component('BlExercise', BlExercise);
  },
} satisfies Theme;
