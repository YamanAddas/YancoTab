#!/usr/bin/env node
// scripts/guard-filesize.mjs
//
// PostToolUse hook: warns when the file Claude just touched crosses the YancoTab
// size caps (soft 800, hard 1200 on .js). Emits a non-blocking warning to stderr;
// the hook ignores exit status so it never blocks progress.
//
// Reads Claude Code's hook JSON payload from stdin; extracts tool_input.file_path.

import { readFileSync } from 'node:fs';

let payload;
try {
  payload = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}

const file = payload?.tool_input?.file_path;
if (!file || typeof file !== 'string') process.exit(0);
if (!file.endsWith('.js')) process.exit(0);

let content;
try {
  content = readFileSync(file, 'utf8');
} catch {
  process.exit(0);
}

const lines = content.split('\n').length;
const SOFT = 800;
const HARD = 1200;

if (lines >= HARD) {
  console.error(`[yancotab] ⚠ ${file} is ${lines} lines — HARD cap ${HARD} exceeded. Split before next addition. See CLAUDE.md #3.`);
} else if (lines >= SOFT) {
  console.error(`[yancotab] ℹ ${file} is ${lines} lines — soft cap ${SOFT}. Plan a split.`);
}

process.exit(0);
