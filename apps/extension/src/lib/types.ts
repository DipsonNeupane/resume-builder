// Shared types for the APWICO job-capture extension. Kept dependency-free so both the
// popup (a real ES module) and the injected/content scripts (classic scripts — see
// src/inject/extract-job.ts and src/content/bridge.ts for why) can agree on the same shape
// even where the classic scripts can't literally `import` this file.

import type { JobCapture } from './capture.js';
export type { JobCapture } from './capture.js';

export type ExtractResult =
  | { detected: true; capture: JobCapture }
  | { detected: false; state: 'open_detail' | 'no_job'; reason: string; sourceUrl?: string; canConfirm?: boolean };

export type SaveResult = { status: 'saved' | 'already_saved' | 'signed_out' | 'error'; message?: string; tabId?: number };
