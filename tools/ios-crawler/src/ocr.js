/**
 * On-device text recognition, compiled on demand from ocr.m.
 *
 * The same trick as frames.js: clang ships with the Command Line Tools and
 * Vision ships with macOS, so the crawler can read the text on a screenshot
 * without an API key, a network call, or anything to install.
 */

import { existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { has, run } from './exec.js';
import { log } from './log.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(HERE, 'ocr.m');
const BIN_DIR = join(HERE, '..', '.bin');
const BINARY = join(BIN_DIR, 'motvin-ocr');

const FRAMEWORKS = ['Foundation', 'Vision', 'AppKit', 'CoreGraphics'];

export async function buildOcr() {
  if (existsSync(BINARY) && statSync(BINARY).mtimeMs >= statSync(SOURCE).mtimeMs) {
    return BINARY;
  }
  if (!(await has('clang'))) {
    throw new Error('clang is not available, so on-device text recognition cannot be built. Install the Command Line Tools: xcode-select --install');
  }

  mkdirSync(BIN_DIR, { recursive: true });
  log.detail('building the text reader (once)…');

  const result = await run(
    'clang',
    [
      '-fobjc-arc',
      '-O2',
      '-Wno-deprecated-declarations',
      ...FRAMEWORKS.flatMap((framework) => ['-framework', framework]),
      '-o',
      BINARY,
      SOURCE,
    ],
    { timeout: 120_000 },
  );
  if (result.failed) {
    throw new Error(`could not build the text reader: ${result.stderr.trim().split('\n').slice(0, 3).join(' ')}`);
  }
  return BINARY;
}

/**
 * @typedef {{text: string, x: number, y: number, w: number, h: number, confidence: number}} TextLine
 * y is measured from the top, all values normalised 0–1.
 */

/**
 * Reads the text on one screenshot.
 * @returns {Promise<TextLine[]>}
 */
export async function readText(imagePath) {
  const binary = await buildOcr();
  const result = await run(binary, [imagePath], { timeout: 120_000 });
  if (result.failed) {
    throw new Error(result.stderr.trim().split('\n')[0] || `text reader exited ${result.code}`);
  }

  const lines = [];
  for (const raw of result.stdout.split('\n')) {
    const trimmed = raw.trim();
    if (!trimmed.startsWith('{')) continue;
    try {
      const parsed = JSON.parse(trimmed);
      lines.push({
        text: String(parsed.t ?? '').trim(),
        x: Number(parsed.x) || 0,
        y: Number(parsed.y) || 0,
        w: Number(parsed.w) || 0,
        h: Number(parsed.h) || 0,
        confidence: Number(parsed.c) || 0,
      });
    } catch {
      // A malformed line is skipped rather than failing the screen.
    }
  }
  return lines.filter((line) => line.text.length > 0).sort((a, b) => a.y - b.y);
}
