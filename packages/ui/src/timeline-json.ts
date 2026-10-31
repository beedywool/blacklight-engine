import type { StepOptions, Timeline } from './timeline';

/** An animation step: `{ "to": ".title", "keyframes": { "x": ["-120%", "0%"] }, "duration": 0.35 }`. */
export interface TimelineToStep {
  /** CSS selector of the animated elements (inside `root` when given). */
  to: string;
  /** Motion keyframes per property (`{ "opacity": [0, 1] }`). */
  keyframes: Record<string, unknown>;
  /** When the step starts: seconds, `'+0.1'`, `'<'`, a label or `'label+0.2'` (see `StepOptions.at`). */
  at?: number | string;
  /** Seconds. @defaultValue `0.3` */
  duration?: number;
  /** Motion easing: name or cubic bezier. */
  ease?: StepOptions['ease'];
}

/** A label: `{ "label": "items" }`. */
export interface TimelineLabelStep {
  /** Label name, usable in later `at` values. */
  label: string;
  /** When the step starts: seconds, `'+0.1'`, `'<'`, a label or `'label+0.2'` (see `StepOptions.at`). */
  at?: number | string;
}

/** A UI sound: `{ "sound": "ui-slash", "at": "<" }`. */
export interface TimelineSoundStep {
  /** Sound asset key, played on the `ui` bus. */
  sound: string;
  /** When the step starts: seconds, `'+0.1'`, `'<'`, a label or `'label+0.2'` (see `StepOptions.at`). */
  at?: number | string;
}

/** One step of a {@link TimelineJson}: an animation, a label or a sound. */
export type TimelineStep = TimelineToStep | TimelineLabelStep | TimelineSoundStep;

/**
 * A timeline saved as data (`*.timeline.json`, JSON Schema
 * `@blacklight/core/schema/timeline.schema.json`), written by the VS Code timeline editor.
 */
export interface TimelineJson {
  /** Schema reference written by the editor; ignored at run time. */
  $schema?: string;
  /** Steps, added in order. */
  steps: TimelineStep[];
}

/**
 * Adds the steps of a timeline file to a timeline, in order. Selectors resolve inside `root`
 * (the screen's element) when given, else in the whole document when the timeline plays.
 *
 * @example
 * ```ts
 * import intro from '@ui/pause-intro.timeline.json';
 * const root = ref<HTMLElement>();
 * const timeline = useTimeline();
 * onMounted(() => applyTimeline(timeline, intro, { root: root.value }).play());
 * ```
 */
export function applyTimeline(
  timeline: Timeline,
  json: TimelineJson,
  options: { root?: Element } = {},
): Timeline {
  if (!json || !Array.isArray(json.steps)) {
    throw new Error(
      'applyTimeline() expects the content of a .timeline.json file ({ "steps": [...] }). Import it with `import intro from "./intro.timeline.json"`.',
    );
  }
  json.steps.forEach((step, index) => {
    if ('to' in step) {
      const target = options.root ? [...options.root.querySelectorAll(step.to)] : step.to;
      timeline.to(target, step.keyframes, {
        at: step.at,
        duration: step.duration,
        ease: step.ease,
      });
    } else if ('label' in step) {
      timeline.label(step.label, step.at);
    } else if ('sound' in step) {
      timeline.sound(step.sound, step.at);
    } else {
      throw new Error(
        `Timeline step ${index} needs "to" (with "keyframes"), "label" or "sound"; got ${JSON.stringify(step)}.`,
      );
    }
  });
  return timeline;
}
