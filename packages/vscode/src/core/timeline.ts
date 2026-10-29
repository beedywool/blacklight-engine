import { formatJson } from './json';

/** Steps of a `.timeline.json` (same shapes as `TimelineStep` in `@blacklight/ui`). */
export type TimelineStep =
  | {
      to: string;
      keyframes: Record<string, unknown>;
      at?: number | string;
      duration?: number;
      ease?: string | number[];
    }
  | { label: string; at?: number | string }
  | { sound: string; at?: number | string };

export interface TimelineFile {
  $schema?: string;
  steps: TimelineStep[];
}

/** One row of the editor: when a step starts and how long it lasts. */
export interface TimelineRow {
  index: number;
  kind: 'to' | 'label' | 'sound';
  title: string;
  start: number;
  duration: number;
  error?: string;
}

/** Rows and total length; resolves `at` exactly like `Timeline` in `@blacklight/ui`. */
export function timelineRows(file: TimelineFile): { rows: TimelineRow[]; duration: number } {
  const labels = new Map<string, number>();
  let cursor = 0;
  let lastStart = 0;
  const resolve = (at: number | string | undefined): number => {
    if (at === undefined) return cursor;
    if (typeof at === 'number') return at;
    if (at === '<') return lastStart;
    const relative = /^([+-])(\d*\.?\d+)$/.exec(at);
    if (relative) return Math.max(0, cursor + (relative[1] === '-' ? -1 : 1) * Number(relative[2]));
    if (labels.has(at)) return labels.get(at)!;
    const labelled = /^(.+?)([+-]\d*\.?\d+)?$/.exec(at)!;
    const base = labels.get(labelled[1]!);
    if (base === undefined)
      throw new Error(
        `Unknown label "${labelled[1]}"; labels: ${[...labels.keys()].join(', ') || 'none'}.`,
      );
    return Math.max(0, base + Number(labelled[2] ?? 0));
  };
  const rows: TimelineRow[] = file.steps.map((step, index) => {
    let start = cursor;
    let error: string | undefined;
    try {
      start = resolve(step.at);
    } catch (e) {
      error = (e as Error).message;
    }
    if ('to' in step) {
      const duration = step.duration ?? 0.3;
      lastStart = start;
      cursor = Math.max(cursor, start + duration);
      return {
        index,
        kind: 'to',
        title: `${step.to} → ${Object.keys(step.keyframes ?? {}).join(', ')}`,
        start,
        duration,
        ...(error && { error }),
      };
    }
    if ('label' in step) {
      labels.set(step.label, start);
      return {
        index,
        kind: 'label',
        title: step.label,
        start,
        duration: 0,
        ...(error && { error }),
      };
    }
    lastStart = start;
    return { index, kind: 'sound', title: step.sound, start, duration: 0, ...(error && { error }) };
  });
  const duration = Math.max(0, ...rows.map((r) => r.start + r.duration));
  return { rows, duration };
}

/** Edits the timeline editor sends. */
export type TimelineEdit =
  | { op: 'add'; step: TimelineStep }
  | { op: 'update'; index: number; step: TimelineStep }
  | { op: 'remove'; index: number }
  | { op: 'move'; index: number; to: number };

export function applyTimelineEdit(file: TimelineFile, edit: TimelineEdit): TimelineFile {
  const steps = [...file.steps];
  if (edit.op !== 'add' && !steps[edit.index])
    throw new Error(`No step ${edit.index} in the timeline.`);
  switch (edit.op) {
    case 'add':
      steps.push(edit.step);
      break;
    case 'update':
      steps[edit.index] = edit.step;
      break;
    case 'remove':
      steps.splice(edit.index, 1);
      break;
    case 'move': {
      const [step] = steps.splice(edit.index, 1);
      steps.splice(Math.max(0, Math.min(steps.length, edit.to)), 0, step!);
      break;
    }
  }
  return { ...file, steps };
}

export function parseTimeline(text: string): TimelineFile {
  if (!text.trim()) return { steps: [] };
  const json = JSON.parse(text) as Partial<TimelineFile>;
  if (!json || !Array.isArray(json.steps))
    throw new Error('A timeline file needs a "steps" array.');
  return json as TimelineFile;
}

export function printTimeline(file: TimelineFile): string {
  const { $schema, steps, ...rest } = file;
  return formatJson({ ...($schema && { $schema }), ...rest, steps });
}
