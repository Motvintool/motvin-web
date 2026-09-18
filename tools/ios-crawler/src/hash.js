/**
 * Perceptual hashing, used to answer "have we already seen this screen?".
 *
 * Built on `sips`, which ships with macOS, so the crawler needs no image
 * dependency. sips downsamples the screenshot to a handful of pixels and emits
 * an uncompressed BMP, which is about twenty lines to parse by hand.
 *
 * Two hashes are computed because they fail differently:
 *
 *   dHash — gradient between adjacent pixels. Robust to brightness and to
 *           content changing inside a fixed layout, which is what we want:
 *           two product cards with different photos are still one screen type.
 *   aHash — pixels above/below the mean. Coarser, but catches the case where a
 *           layout shifts without the gradients changing much.
 *
 * Neither is enough alone for a scrolling app, so screens.js also compares the
 * accessibility label set. See `looksLikeSameScreen`.
 */

import { readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { run } from './exec.js';

let counter = 0;

/** Resizes an image with sips and returns its pixels as grayscale bytes. */
async function grayscalePixels(imagePath, width, height) {
  const out = join(tmpdir(), `motvin-hash-${process.pid}-${counter++}.bmp`);
  const result = await run(
    'sips',
    ['-z', String(height), String(width), '-s', 'format', 'bmp', imagePath, '--out', out],
    { timeout: 20_000 },
  );
  if (result.failed) {
    throw new Error(`sips could not read ${imagePath}: ${result.stderr.trim() || `exit ${result.code}`}`);
  }

  try {
    return decodeBmpToGray(readFileSync(out), width, height);
  } finally {
    try {
      unlinkSync(out);
    } catch {
      // Best effort; the temp file is harmless if it survives.
    }
  }
}

/**
 * Minimal BMP reader — enough for what sips writes: uncompressed 24- or 32-bit
 * BGR(A), bottom-up rows padded to a 4-byte boundary.
 */
function decodeBmpToGray(buffer, expectedWidth, expectedHeight) {
  if (buffer.length < 54 || buffer[0] !== 0x42 || buffer[1] !== 0x4d) {
    throw new Error('not a BMP file');
  }

  const dataOffset = buffer.readUInt32LE(10);
  const width = buffer.readInt32LE(18);
  const rawHeight = buffer.readInt32LE(22);
  const height = Math.abs(rawHeight);
  const topDown = rawHeight < 0;
  const bitsPerPixel = buffer.readUInt16LE(28);

  if (bitsPerPixel !== 24 && bitsPerPixel !== 32) {
    throw new Error(`unsupported BMP depth ${bitsPerPixel}`);
  }
  if (width !== expectedWidth || height !== expectedHeight) {
    // sips preserves aspect ratio for some inputs; the caller's grid assumes
    // exact dimensions, so this must be loud rather than silently skewed.
    throw new Error(`expected ${expectedWidth}x${expectedHeight} BMP, got ${width}x${height}`);
  }

  const bytesPerPixel = bitsPerPixel / 8;
  const rowSize = Math.ceil((width * bitsPerPixel) / 32) * 4;
  const gray = new Uint8Array(width * height);

  for (let y = 0; y < height; y++) {
    const sourceRow = topDown ? y : height - 1 - y;
    const rowStart = dataOffset + sourceRow * rowSize;
    for (let x = 0; x < width; x++) {
      const p = rowStart + x * bytesPerPixel;
      const b = buffer[p];
      const g = buffer[p + 1];
      const r = buffer[p + 2];
      // Rec. 601 luma, integer-scaled to avoid float noise between runs.
      gray[y * width + x] = (r * 77 + g * 150 + b * 29) >> 8;
    }
  }

  return gray;
}

function toHex(bits) {
  let hex = '';
  for (let i = 0; i < bits.length; i += 4) {
    const nibble = (bits[i] << 3) | (bits[i + 1] << 2) | (bits[i + 2] << 1) | bits[i + 3];
    hex += nibble.toString(16);
  }
  return hex;
}

/** 64-bit difference hash: each pixel compared with the one to its right. */
async function dHash(imagePath) {
  const pixels = await grayscalePixels(imagePath, 9, 8);
  const bits = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      bits.push(pixels[y * 9 + x] > pixels[y * 9 + x + 1] ? 1 : 0);
    }
  }
  return toHex(bits);
}

/** 64-bit average hash: each pixel compared with the frame mean. */
async function aHash(imagePath) {
  const pixels = await grayscalePixels(imagePath, 8, 8);
  let total = 0;
  for (const value of pixels) total += value;
  const mean = total / pixels.length;
  return toHex(Array.from(pixels, (value) => (value > mean ? 1 : 0)));
}

/**
 * Mean brightness, 0–255, from a heavily downsampled copy.
 *
 * Used to tell a dark screen from a light one, which is the one style judgement
 * that can be made honestly without a model.
 */
export async function luminance(imagePath) {
  const pixels = await grayscalePixels(imagePath, 8, 8);
  let total = 0;
  for (const value of pixels) total += value;
  return total / pixels.length;
}

/** Both hashes for one screenshot. */
export async function fingerprint(imagePath) {
  const [difference, average] = await Promise.all([dHash(imagePath), aHash(imagePath)]);
  return { dhash: difference, ahash: average };
}

const POPCOUNT = Array.from({ length: 16 }, (_, n) => (n.toString(2).match(/1/g) || []).length);

/** Number of differing bits between two hex hashes of equal length. */
export function hamming(a, b) {
  if (!a || !b || a.length !== b.length) return Number.MAX_SAFE_INTEGER;
  let distance = 0;
  for (let i = 0; i < a.length; i++) {
    distance += POPCOUNT[parseInt(a[i], 16) ^ parseInt(b[i], 16)];
  }
  return distance;
}

/** Overlap of two label sets, 0–1. Used to rescue scrolled-but-identical screens. */
export function jaccard(a, b) {
  const left = new Set(a);
  const right = new Set(b);
  if (left.size === 0 && right.size === 0) return 0;
  let shared = 0;
  for (const value of left) if (right.has(value)) shared++;
  return shared / (left.size + right.size - shared);
}
