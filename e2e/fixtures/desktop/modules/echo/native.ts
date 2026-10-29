// Main-process part of the fixture's `echo` module (MOD-03 on desktop): validated arguments and
// the context the desktop app passes.
import { t } from '@blacklight/core/schema';
import { defineNative, fn } from '@blacklight/native';

export const echoNative = defineNative({
  name: 'echo',
  functions: {
    shout: fn([t.string({ max: 32 })], (context, text) => ({
      text: text.toUpperCase(),
      gameId: context.gameId,
      dev: context.dev,
    })),
  },
});
