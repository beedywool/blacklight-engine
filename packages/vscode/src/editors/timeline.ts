import * as vscode from 'vscode';
import {
  applyTimelineEdit,
  parseTimeline,
  printTimeline,
  timelineRows,
  type TimelineEdit,
  type TimelineFile,
  type TimelineRow,
} from '../core/timeline';
import type { LiveGame } from '../live';
import { Controller, registry, replaceDocument, setupWebview, type WebviewMessage } from '../panel';

export interface TimelineState {
  file: string;
  timeline: TimelineFile | undefined;
  rows: TimelineRow[];
  duration: number;
  error?: string;
  /** A game is running: "Play in game" works. */
  live: boolean;
}

/** UI timeline editor: steps on a time ruler, edited as `.timeline.json`. */
export class TimelineController extends Controller<TimelineState> {
  readonly kind = 'timeline';

  constructor(
    readonly document: vscode.TextDocument,
    private readonly live: LiveGame,
  ) {
    super();
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document === document) void this.push();
      }),
    );
  }

  state(): TimelineState {
    const file = vscode.workspace.asRelativePath(this.document.uri);
    try {
      const timeline = parseTimeline(this.document.getText());
      return { file, timeline, ...timelineRows(timeline), live: this.live.connected };
    } catch (error) {
      return {
        file,
        timeline: undefined,
        rows: [],
        duration: 0,
        error: (error as Error).message,
        live: this.live.connected,
      };
    }
  }

  protected async handle(message: WebviewMessage): Promise<unknown> {
    switch (message.type) {
      case 'edit': {
        const next = applyTimelineEdit(
          parseTimeline(this.document.getText()),
          message.edit as TimelineEdit,
        );
        await replaceDocument(this.document, printTimeline(next));
        return next.steps.length;
      }
      case 'play': {
        // Plays over the screens open in the running game (open the screen first, e.g. from the UI preview).
        const client = await this.live.connect(this.document.uri);
        await client.request(
          'ui.timeline',
          { timeline: parseTimeline(this.document.getText()) },
          { timeout: 15_000 },
        );
        return 'played';
      }
      default:
        throw new Error(`Unknown message ${message.type}`);
    }
  }
}

export class TimelineEditorProvider implements vscode.CustomTextEditorProvider {
  constructor(
    private readonly extension: vscode.Uri,
    private readonly live: LiveGame,
  ) {}

  resolveCustomTextEditor(document: vscode.TextDocument, panel: vscode.WebviewPanel): void {
    const controller = registry.add(new TimelineController(document, this.live));
    setupWebview(panel.webview, this.extension, controller, 'timeline', 'UI timeline');
    controller.attach(panel.webview, panel.onDidDispose);
  }
}
