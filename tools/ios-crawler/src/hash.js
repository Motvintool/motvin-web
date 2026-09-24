/**
 * Perceptual hashing and pixel comparison, used to answer "have we already
 * seen this screen?" and, for a recording, "what just happened between these
 * two frames?".
 *
 * Two routes in:
 *
 *   fingerprint(path)        — for a file on disk. Built on `sips`, which
 *                              ships with macOS, so no image dependency.
 *                              Used by the Simulator crawler and by folder
 *                              ingest, where there are tens of images.
 *   fingerprintFromThumb()   — for a raw RGB thumbnail the frame reader
 *                              already produced. Pure JavaScript, no
 *                              subprocess. Used for recordings, where there
 *                              are hundreds or thousands of frames and two
 *                              `sips` calls each would dominate the run.
 *
 * Both produce the same two hashes, computed the same way on the same
 * downsampled grid, so a thumbnail-derived print and a file-derived print are
 * comparable.
 *
 * Two hashes are computed because they fail differently:
 *
 *   dHash — gradient between adjacent pixels. Robust to brightness and to
 *           content changing inside a fixed layout, which is what we want:
 *           two product cards with different photos are still one screen type.
 *           Degenerate on a flat screen (all zeros), which is why a splash is
 *           never judged by dHash alone.
 *   aHash — pixels above/below the mean. Coarser, but catches the case where a
 *           layout shifts without the gradients changing much.
 *
 * Neither is enough alone for a scrolling app, so graph.js also compares the
 * visible text, and segment.js reads the thumbnails directly.
 */

import { readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { run } from './exec.js';

/**
 * Thumbnail size the frame reader emits. Tall rather than square because the
 * recordings are of phones, and vertical resolution is what scroll detection
 * needs; a landscape recording is squashed, which is harmless since every
 * frame of it is squashed identically.
 */
export const THUMB = { width: 32, height: 64 };

let counter = 0;

// ─── Reading pixels ──────────────────────────────────────────────────────────

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
      gray[y * width + x] = luma(r, g, b);
    }
  }

  return gray;
}

/** Rec. 601 luma, integer-scaled to avoid float noise between runs. */
function luma(r, g, b) {
  return (r * 77 + g * 150 + b * 29) >> 8;
}

/** A raw RGB thumbnail → grayscale bytes. */
export function thumbToGray(rgb, width = THUMB.width, height = THUMB.height) {
  const gray = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < gray.length; i++, p += 3) {
    gray[i] = luma(rgb[p], rgb[p + 1], rgb[p + 2]);
  }
  return gray;
}

/**
 * Area-averaging resample of a grayscale grid. Each target cell averages the
 * source cells it covers, with fractional coverage at the edges, so the result
 * is the same whether the source is 32×64 or 9×8 already.
 */
export function resampleGray(gray, width, height, targetWidth, targetHeight) {
  const out = new Float64Array(targetWidth * targetHeight);
  const sx = width / targetWidth;
  const sy = height / targetHeight;

  for (let ty = 0; ty < targetHeight; ty++) {
    const y0 = ty * sy;
    const y1 = y0 + sy;
    for (let tx = 0; tx < targetWidth; tx++) {
      const x0 = tx * sx;
      const x1 = x0 + sx;
      let total = 0;
      let weight = 0;
      for (let y = Math.floor(y0); y < Math.min(height, Math.ceil(y1)); y++) {
        const wy = Math.min(y + 1, y1) - Math.max(y, y0);
        if (wy <= 0) continue;
        for (let x = Math.floor(x0); x < Math.min(width, Math.ceil(x1)); x++) {
          const wx = Math.min(x + 1, x1) - Math.max(x, x0);
          if (wx <= 0) continue;
          total += gray[y * width + x] * wx * wy;
          weight += wx * wy;
        }
      }
      out[ty * targetWidth + tx] = weight ? total / weight : 0;
    }
  }
  return out;
}

// ─── Hashes ──────────────────────────────────────────────────────────────────

function toHex(bits) {
  let hex = '';
  for (let i = 0; i < bits.length; i += 4) {
    const nibble = (bits[i] << 3) | (bits[i + 1] << 2) | (bits[i + 2] << 1) | bits[i + 3];
    hex += nibble.toString(16);
  }
  return hex;
}

/** 64-bit difference hash from a 9×8 grid: each pixel compared with the one to its right. */
function dHashFromGrid(pixels) {
  const bits = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      bits.push(pixels[y * 9 + x] > pixels[y * 9 + x + 1] ? 1 : 0);
    }
  }
  return toHex(bits);
}

/** 64-bit average hash from an 8×8 grid: each pixel compared with the frame mean. */
function aHashFromGrid(pixels) {
  let total = 0;
  for (const value of pixels) total += value;
  const mean = total / pixels.length;
  return toHex(Array.from(pixels, (value) => (value > mean ? 1 : 0)));
}

async function dHash(imagePath) {
  return dHashFromGrid(await grayscalePixels(imagePath, 9, 8));
}

async function aHash(imagePath) {
  return aHashFromGrid(await grayscalePixels(imagePath, 8, 8));
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

/** Both hashes for one screenshot on disk. */
export async function fingerprint(imagePath) {
  const [difference, average] = await Promise.all([dHash(imagePath), aHash(imagePath)]);
  return { dhash: difference, ahash: average };
}

/**
 * Both hashes, plus the signals the segmenter needs, from a raw RGB thumbnail.
 *
 *   gray       the grayscale pixels, kept so comparisons need not recompute them
 *   luminance  mean brightness 0–255
 *   edge       mean absolute gradient — how much structure the frame has. Near
 *              zero for a flat splash or a blank loading screen, high for a
 *              dense feed.
 */
export function fingerprintFromThumb(rgb, width = THUMB.width, height = THUMB.height) {
  const gray = thumbToGray(rgb, width, height);
  let total = 0;
  for (const value of gray) total += value;
  return {
    dhash: dHashFromGrid(resampleGray(gray, width, height, 9, 8)),
    ahash: aHashFromGrid(resampleGray(gray, width, height, 8, 8)),
    gray,
    width,
    height,
    luminance: total / gray.length,
    edge: edgeEnergy(gray, width, height),
  };
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

// ─── Pixel comparison ────────────────────────────────────────────────────────
// All of these take grayscale grids of equal size, as produced by
// fingerprintFromThumb. Row ranges are [from, to) in pixel rows.

/** Mean absolute difference, 0–255, over a band of rows. */
export function meanAbsDiff(a, b, width, height, fromRow = 0, toRow = height) {
  let total = 0;
  let count = 0;
  for (let y = fromRow; y < toRow; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      total += Math.abs(a[i] - b[i]);
      count++;
    }
  }
  return count ? total / count : 0;
}

/** Fraction of pixels whose difference exceeds `threshold`. */
export function changedFraction(a, b, threshold = 24) {
  let changed = 0;
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i] - b[i]) > threshold) changed++;
  }
  return a.length ? changed / a.length : 0;
}

/**
 * Bounding box of the pixels that changed, in normalised 0–1 coordinates, or
 * null when nothing did. Tells a bottom sheet (box anchored to the bottom)
 * from a dialog (box floating in the middle) from a toast (thin box).
 */
export function changedBox(a, b, width, height, threshold = 24) {
  let top = height;
  let bottom = -1;
  let left = width;
  let right = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (Math.abs(a[i] - b[i]) > threshold) {
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }
  if (bottom < 0) return null;
  return {
    x: left / width,
    y: top / height,
    w: (right - left + 1) / width,
    h: (bottom - top + 1) / height,
  };
}

/**
 * Fraction of pixels that got darker by a roughly uniform amount — the
 * signature of a scrim: a sheet or dialog dims the screen behind it without
 * changing its structure.
 */
export function dimmedFraction(a, b, minDrop = 14, maxDrop = 140) {
  let dimmed = 0;
  for (let i = 0; i < a.length; i++) {
    const drop = a[i] - b[i];
    if (drop >= minDrop && drop <= maxDrop) dimmed++;
  }
  return a.length ? dimmed / a.length : 0;
}

/**
 * The vertical shift that best explains the difference between two frames
 * over the content band — how a scroll looks in pixels.
 *
 * Only the middle of the screen is compared, because the status bar, nav bar
 * and tab bar stay put while content moves under them. Returns the shift in
 * rows (positive = content moved up, i.e. the user scrolled down), the
 * residual difference after shifting, and the unshifted difference for
 * comparison. A scroll is a shift that removes most of the residual.
 */
export function bestVerticalShift(a, b, width, height, maxShift = Math.floor(height / 4)) {
  const fromRow = Math.floor(height * 0.12);
  const toRow = Math.floor(height * 0.88);
  const madAtZero = meanAbsDiff(a, b, width, height, fromRow, toRow);

  let best = { shift: 0, mad: madAtZero };
  for (let shift = -maxShift; shift <= maxShift; shift++) {
    if (shift === 0) continue;
    let total = 0;
    let count = 0;
    for (let y = fromRow; y < toRow; y++) {
      const sy = y + shift;
      if (sy < fromRow || sy >= toRow) continue;
      for (let x = 0; x < width; x++) {
        total += Math.abs(a[sy * width + x] - b[y * width + x]);
        count++;
      }
    }
    // Small shifts compare more rows and so are naturally favoured; the
    // penalty keeps a one-row jitter from being called a scroll.
    const mad = count ? total / count + Math.abs(shift) * 0.05 : Infinity;
    if (mad < best.mad) best = { shift, mad };
  }
  return { ...best, madAtZero };
}

/** Mean absolute gradient, horizontal and vertical — how much structure there is. */
export function edgeEnergy(gray, width, height, fromRow = 0, toRow = height) {
  let total = 0;
  let count = 0;
  for (let y = fromRow; y < toRow; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (x + 1 < width) {
        total += Math.abs(gray[i] - gray[i + 1]);
        count++;
      }
      if (y + 1 < toRow) {
        total += Math.abs(gray[i] - gray[i + width]);
        count++;
      }
    }
  }
  return count ? total / count : 0;
}

// ─── Colour ──────────────────────────────────────────────────────────────────

function toHexColor(r, g, b) {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
}

function saturation(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max ? (max - min) / max : 0;
}

/**
 * The dominant colours of a thumbnail, most common first, with a share of the
 * frame each covers and a role guessed from how it sits against the rest.
 *
 * Quantises to a coarse cube (32 levels per channel), gathers the heaviest
 * cells, then merges cells that are visually close so a gradient does not
 * read as five colours. The roles are honest and simple: the biggest area is
 * the background, the most saturated distinct colour is the accent, the
 * darkest or lightest against the background is the text colour.
 *
 * @returns {{hex: string, share: number, role: string}[]}
 */
export function dominantColors(rgb, width = THUMB.width, height = THUMB.height, count = 5) {
  const cells = new Map();
  const pixels = width * height;
  for (let i = 0, p = 0; i < pixels; i++, p += 3) {
    const r = rgb[p];
    const g = rgb[p + 1];
    const b = rgb[p + 2];
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const cell = cells.get(key);
    if (cell) {
      cell.n++;
      cell.r += r;
      cell.g += g;
      cell.b += b;
    } else {
      cells.set(key, { n: 1, r, g, b });
    }
  }

  const ranked = [...cells.values()]
    .map((cell) => ({ n: cell.n, r: cell.r / cell.n, g: cell.g / cell.n, b: cell.b / cell.n }))
    .sort((a, b) => b.n - a.n);

  // Merge near-duplicates into the heavier colour.
  const merged = [];
  for (const cell of ranked) {
    const near = merged.find(
      (m) => Math.abs(m.r - cell.r) + Math.abs(m.g - cell.g) + Math.abs(m.b - cell.b) < 60,
    );
    if (near) {
      const total = near.n + cell.n;
      near.r = (near.r * near.n + cell.r * cell.n) / total;
      near.g = (near.g * near.n + cell.g * cell.n) / total;
      near.b = (near.b * near.n + cell.b * cell.n) / total;
      near.n = total;
    } else {
      merged.push({ ...cell });
    }
    if (merged.length >= count * 3) break;
  }

  const top = merged.sort((a, b) => b.n - a.n).slice(0, count);
  if (!top.length) return [];

  const background = top[0];
  const backgroundLuma = luma(background.r, background.g, background.b);
  const accent = [...top.slice(1)].sort((a, b) => saturation(b.r, b.g, b.b) - saturation(a.r, a.g, a.b))[0];
  const text = [...top.slice(1)].sort(
    (a, b) => Math.abs(luma(b.r, b.g, b.b) - backgroundLuma) - Math.abs(luma(a.r, a.g, a.b) - backgroundLuma),
  )[0];

  return top.map((c) => {
    let role = 'surface';
    if (c === background) role = 'background';
    else if (c === accent && saturation(c.r, c.g, c.b) > 0.35) role = 'accent';
    else if (c === text && Math.abs(luma(c.r, c.g, c.b) - backgroundLuma) > 90) role = 'text';
    return { hex: toHexColor(c.r, c.g, c.b), share: Math.round((c.n / pixels) * 1000) / 1000, role };
  });
}
