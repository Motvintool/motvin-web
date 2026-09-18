/**
 * Frame extraction, with two backends.
 *
 *   ffmpeg          — used when it is on PATH. Faster, and reads more formats.
 *   motvin-frames   — AVFoundation, compiled on demand from frames.m.
 *
 * The fallback is not a nicety. Installing ffmpeg means writing into the
 * Homebrew prefix, which on a managed Mac belongs to an admin account the
 * person running this does not have. AVFoundation and clang are both already
 * present — clang because the Command Line Tools are required anyway — so the
 * fallback needs no permission from anyone.
 *
 * Both backends emit frame-00001.png … in chronological order.
 */

import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { has, run } from './exec.js';
import { log } from './log.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(HERE, 'frames.m');
const BIN_DIR = join(HERE, '..', '.bin');
const BINARY = join(BIN_DIR, 'motvin-frames');

const FRAMEWORKS = [
  'Foundation',
  'AVFoundation',
  'CoreMedia',
  'CoreGraphics',
  'ImageIO',
  'CoreServices',
];

/**
 * Compiles the helper if it is missing or older than its source. Cheap enough
 * to check every run; the compile itself takes about a second and happens once.
 */
export async function buildFrameExtractor() {
  if (existsSync(BINARY) && statSync(BINARY).mtimeMs >= statSync(SOURCE).mtimeMs) {
    return BINARY;
  }

  if (!(await has('clang'))) {
    throw new Error(
      'clang is not available, so the built-in frame reader cannot be built.\n' +
        '  Install the Command Line Tools: xcode-select --install\n' +
        '  Or install ffmpeg instead: brew install ffmpeg',
    );
  }

  mkdirSync(BIN_DIR, { recursive: true });
  log.detail('building the frame reader (once)…');

  const result = await run(
    'clang',
    [
      '-fobjc-arc',
      '-O2',
      // kUTTypePNG is formally deprecated in favour of UniformTypeIdentifiers,
      // but still the portable spelling across the SDK versions this has to
      // build against. The warning is noise, not a signal.
      '-Wno-deprecated-declarations',
      ...FRAMEWORKS.flatMap((framework) => ['-framework', framework]),
      '-o',
      BINARY,
      SOURCE,
    ],
    { timeout: 120_000 },
  );

  if (result.failed) {
    throw new Error(`could not build the frame reader: ${result.stderr.trim().split('\n').slice(0, 3).join(' ')}`);
  }
  return BINARY;
}

/**
 * Writes frames from `videoPath` into `framesDir` at `fps` per second.
 * @returns {Promise<{paths: string[], backend: string}>}
 */
export async function extractFrames(videoPath, framesDir, fps) {
  mkdirSync(framesDir, { recursive: true });

  const backend = (await has('ffmpeg')) ? 'ffmpeg' : 'avfoundation';
  if (backend === 'ffmpeg') {
    const result = await run(
      'ffmpeg',
      ['-nostdin', '-loglevel', 'error', '-i', videoPath, '-vf', `fps=${fps}`, join(framesDir, 'frame-%05d.png')],
      { timeout: 900_000 },
    );
    if (result.failed) {
      const reason = result.stderr.trim().split('\n').slice(-2).join(' ') || `exit ${result.code}`;
      throw new Error(`ffmpeg could not read the video: ${reason}`);
    }
  } else {
    const binary = await buildFrameExtractor();
    const result = await run(binary, [videoPath, framesDir, String(fps)], { timeout: 900_000 });
    if (result.failed) {
      throw new Error(result.stderr.trim().split('\n')[0] || `frame reader exited ${result.code}`);
    }
  }

  const paths = readdirSync(framesDir)
    .filter((file) => file.endsWith('.png'))
    .sort()
    .map((file) => join(framesDir, file));

  if (!paths.length) throw new Error('no frames came out of the video');
  return { paths, backend };
}
