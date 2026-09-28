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
 * Both backends emit frame-00001.png … in chronological order, and alongside
 * every frame a tiny raw RGB thumbnail (THUMB.width × THUMB.height, 8-bit, no
 * header). The thumbnails are what the segmenter works on: deciding whether the
 * UI held still, scrolled, opened a sheet or flashed a loading state takes a
 * few thousand pixels, and producing those while the frame is already decoded
 * is what keeps a long recording quick to analyse.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { has, run } from './exec.js';
import { log } from './log.js';
import { THUMB } from './hash.js';

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
 * Pass one: a thumbnail for every sampled frame, and nothing else.
 *
 * A three-minute recording at five frames a second is over a thousand frames;
 * as PNGs that is more than a gigabyte, and all but a few dozen are thrown
 * away by the segmenter. Thumbnails are a few kilobytes each, so this pass is
 * quick and small whatever the length of the recording.
 *
 * @returns {Promise<{thumbs: Buffer[], count: number, fps: number, backend: string}>}
 */
export async function extractThumbs(videoPath, framesDir, fps) {
  mkdirSync(framesDir, { recursive: true });
  const backend = (await has('ffmpeg')) ? 'ffmpeg' : 'avfoundation';
  const size = THUMB.width * THUMB.height * 3;

  if (backend === 'ffmpeg') {
    const result = await run(
      'ffmpeg',
      ['-nostdin', '-loglevel', 'error', '-i', videoPath, '-vf', `fps=${fps},scale=${THUMB.width}:${THUMB.height}:flags=area,format=rgb24`, '-f', 'rawvideo', join(framesDir, 'thumbs.rgb')],
      { timeout: 900_000 },
    );
    if (result.failed) {
      throw new Error(`ffmpeg could not read the video: ${result.stderr.trim().split('\n').slice(-2).join(' ') || `exit ${result.code}`}`);
    }
    const all = readFileSync(join(framesDir, 'thumbs.rgb'));
    const count = Math.floor(all.length / size);
    if (!count) throw new Error('no frames came out of the video');
    return { thumbs: Array.from({ length: count }, (_, i) => all.subarray(i * size, (i + 1) * size)), count, fps, backend };
  }

  const binary = await buildFrameExtractor();
  const result = await run(binary, [videoPath, framesDir, String(fps), String(THUMB.width), String(THUMB.height), '--thumbs-only'], { timeout: 900_000 });
  if (result.failed) throw new Error(result.stderr.trim().split('\n')[0] || `frame reader exited ${result.code}`);
  const files = readdirSync(framesDir).filter((file) => /^frame-\d+\.rgb$/.test(file)).sort();
  if (!files.length) throw new Error('no frames came out of the video');
  // Indexes are the sampling grid; a frame the reader could not decode leaves
  // a gap, filled with its neighbour so the timeline keeps its clock.
  const count = Number(files[files.length - 1].match(/\d+/)[0]);
  const thumbs = [];
  let last = null;
  for (let i = 1; i <= count; i++) {
    const path = join(framesDir, `frame-${String(i).padStart(5, '0')}.rgb`);
    if (existsSync(path)) {
      last = readFileSync(path);
      if (last.length !== size) throw new Error(`thumbnail ${i} is ${last.length} bytes, expected ${size}`);
    }
    thumbs.push(last ?? Buffer.alloc(size));
  }
  return { thumbs, count, fps, backend };
}

/**
 * Pass two: the chosen frames at full size, by their index on the same
 * sampling grid.
 *
 * @param {number[]} indexes 0-based frame indexes
 * @returns {Promise<Map<number, string>>} index → PNG path
 */
export async function extractFramesAt(videoPath, framesDir, fps, indexes) {
  mkdirSync(framesDir, { recursive: true });
  const wanted = [...new Set(indexes)].sort((a, b) => a - b);
  const paths = new Map();
  if (!wanted.length) return paths;
  const backend = (await has('ffmpeg')) ? 'ffmpeg' : 'avfoundation';

  if (backend === 'ffmpeg') {
    for (const index of wanted) {
      const out = join(framesDir, `frame-${String(index + 1).padStart(5, '0')}.png`);
      const result = await run(
        'ffmpeg',
        ['-nostdin', '-loglevel', 'error', '-ss', String(index / fps), '-i', videoPath, '-frames:v', '1', '-y', out],
        { timeout: 120_000 },
      );
      if (!result.failed && existsSync(out)) paths.set(index, out);
    }
    return paths;
  }

  const binary = await buildFrameExtractor();
  const result = await run(binary, [videoPath, framesDir, String(fps), String(THUMB.width), String(THUMB.height), '--only', wanted.join(',')], {
    timeout: 900_000,
  });
  if (result.failed) throw new Error(result.stderr.trim().split('\n')[0] || `frame reader exited ${result.code}`);
  for (const index of wanted) {
    const out = join(framesDir, `frame-${String(index + 1).padStart(5, '0')}.png`);
    if (existsSync(out)) paths.set(index, out);
  }
  return paths;
}

/**
 * Both passes at once: every frame as a PNG with its thumbnail. Kept for
 * callers that want the whole reel; the recording pipeline uses the two
 * passes above so a long recording never fills the disk.
 *
 * @returns {Promise<{paths: string[], thumbs: Buffer[], fps: number, backend: string}>}
 */
export async function extractFrames(videoPath, framesDir, fps) {
  const { thumbs, count } = await extractThumbs(videoPath, framesDir, fps);
  const byIndex = await extractFramesAt(videoPath, framesDir, fps, Array.from({ length: count }, (_, i) => i));
  const paths = Array.from({ length: count }, (_, i) => byIndex.get(i)).filter(Boolean);
  return { paths, thumbs, fps, backend: (await has('ffmpeg')) ? 'ffmpeg' : 'avfoundation' };
}
