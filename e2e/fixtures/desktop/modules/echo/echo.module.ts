import { defineModule, nativeModule, t } from '@blacklight/core';
import type { echoNative } from './native';

/** Calls its native part on desktop; on the web it answers in the page. */
export const echo = defineModule({
  name: 'echo',
  version: '1.0.0',
  config: t.object({ suffix: t.string().default('') }),
  setup({ platform, config }) {
    const native = nativeModule<typeof echoNative>(platform, 'echo');
    return {
      shout: async (text: string) => {
        const answer =
          platform.name === 'desktop'
            ? await native.shout(text)
            : { text: text.toUpperCase(), gameId: '', dev: false };
        return { ...answer, text: answer.text + config.suffix };
      },
    };
  },
});
