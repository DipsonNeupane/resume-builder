// Shared types for the ResumeStride job-capture extension. Kept dependency-free so both the
// popup (a real ES module) and the injected/content scripts (classic scripts — see
// src/inject/extract-job.ts and src/content/bridge.ts for why) can agree on the same shape
// even where the classic scripts can't literally `import` this file.

import type { JobCapture } from './capture.js';
export type { JobCapture } from './capture.js';

export type ExtractResult =
  | { supported: true; capture: JobCapture }
  | { supported: false; reason: string };

export type PendingCaptureEntry = { payload: JobCapture; storedAt: number };
