/**
 * A screenshot's pixel size, read from its file header (PNG, JPEG or WebP),
 * and the layout that implies: wider than tall is a desktop page.
 */

import { closeSync, openSync, readSync } from 'node:fs';

/** Wider than this, a screenshot is a desktop page rather than a phone screen. */
const DESKTOP_ASPECT = 1.15;

function head(path, bytes) {
  const fd = openSync(path, 'r');
  try {
    const buffer = Buffer.alloc(bytes);
    const read = readSync(fd, buffer, 0, bytes, 0);
    return buffer.subarray(0, read);
  } finally {
    closeSync(fd);
  }
}

/** @returns {{width: number, height: number} | null} */
export function imageSize(path) {
  let b;
  try {
    b = head(path, 64 * 1024);
  } catch {
    return null;
  }
  // PNG: IHDR right after the signature.
  if (b.length >= 24 && b.readUInt32BE(0) === 0x89504e47) return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  // WebP: RIFF....WEBP then a VP8 / VP8L / VP8X chunk.
  if (b.length >= 30 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = b.toString('ascii', 12, 16);
    if (chunk === 'VP8X') return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
    if (chunk === 'VP8L') {
      const bits = b.readUInt32LE(21);
      return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
    }
    if (chunk === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  }
  // JPEG: walk the markers to a start-of-frame.
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) {
        i += 1;
        continue;
      }
      const marker = b[i + 1];
      const length = b.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) };
      i += 2 + length;
    }
  }
  return null;
}

/** 'desktop' for a wide screenshot, 'phone' otherwise (and when the size can't be read). */
export function layoutOf(path) {
  const size = imageSize(path);
  return size && size.height > 0 && size.width / size.height >= DESKTOP_ASPECT ? 'desktop' : 'phone';
}
