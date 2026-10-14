/**
 * An app's brand palette, worked out from its own screenshots in the browser.
 *
 * Each sampled screenshot is fetched small (through Next's image resizer, a
 * few KB), drawn to a canvas and read pixel by pixel, skipping the iOS status
 * bar at the top and the home bar at the bottom, which are the same on every
 * app. Similar colours are grouped, and the five that matter most are kept
 * with how much of the app each covers, then named for the part they play:
 * Background, Surface, Text, Primary, Muted (or Accent).
 */

export type PaletteRole = 'Background' | 'Surface' | 'Text' | 'Primary' | 'Accent' | 'Muted';

export type PaletteColor = {
  hex: string;
  /** Share of the sampled screens this colour covers, 0–1. */
  share: number;
  role: PaletteRole;
};

/** How many screenshots are sampled (spread across the app). */
const SAMPLE_SCREENS = 16;
/** Width each screenshot is read at. */
const SAMPLE_WIDTH = 48;
/** Colours closer than this (redmean distance) count as one. */
const MERGE_DISTANCE = 30;
/** Kept colours must be at least this far apart, so near-identical blacks don't fill the band. */
const DISTINCT_DISTANCE = 70;
/** A brand colour has to show up on at least this many sampled screens (rules out one album cover). */
const BRAND_MIN_SCREENS = 3;
const KEEP = 5;

/** `screens` is a bit mask of which sampled screenshots the colour appears on. */
type Cluster = { r: number; g: number; b: number; count: number; screens: number };

function hexOf(c: { r: number; g: number; b: number }): string {
  return `#${[c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

/** Perceptual-ish RGB distance ("redmean"), cheap and good enough for grouping. */
function distance(a: Cluster, b: Cluster): number {
  const rm = (a.r + b.r) / 2;
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
}

function luminance(c: { r: number; g: number; b: number }): number {
  const ch = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
}

function saturation(c: { r: number; g: number; b: number }): number {
  const max = Math.max(c.r, c.g, c.b);
  const min = Math.min(c.r, c.g, c.b);
  return max === 0 ? 0 : (max - min) / max;
}

function contrast(a: Cluster, b: Cluster): number {
  const la = luminance(a) + 0.05;
  const lb = luminance(b) + 0.05;
  return la > lb ? la / lb : lb / la;
}

/** Whether text on this colour should be dark. */
export function isLightColor(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  return luminance({ r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }) > 0.4;
}

async function samplePixels(src: string): Promise<Uint8ClampedArray | null> {
  // The small version first; the full file if the resizer can't serve it.
  const small = `/_next/image?url=${encodeURIComponent(src)}&w=64&q=60`;
  let res = await fetch(small).catch(() => null);
  if (!res || !res.ok) res = await fetch(src).catch(() => null);
  if (!res || !res.ok) return null;
  const bitmap = await createImageBitmap(await res.blob());
  const w = SAMPLE_WIDTH;
  const h = Math.max(1, Math.round((bitmap.height * w) / bitmap.width));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  // Skip the status bar and the home bar, which say nothing about the app.
  const top = Math.round(h * 0.06);
  const bottom = Math.round(h * 0.97);
  return ctx.getImageData(0, top, w, Math.max(1, bottom - top)).data;
}

/** The five colours that matter most across these screenshots. */
export async function extractPalette(sources: string[]): Promise<PaletteColor[]> {
  const picked =
    sources.length <= SAMPLE_SCREENS
      ? sources
      : Array.from({ length: SAMPLE_SCREENS }, (_, i) => sources[Math.floor((i * sources.length) / SAMPLE_SCREENS)]);

  // Count colours in 5-bit-per-channel buckets.
  const buckets = new Map<number, Cluster>();
  let total = 0;
  for (let i = 0; i < picked.length; i += 4) {
    const batch = await Promise.all(picked.slice(i, i + 4).map((src) => samplePixels(src).catch(() => null)));
    for (const [j, data] of batch.entries()) {
      if (!data) continue;
      const screenBit = 2 ** (i + j);
      for (let p = 0; p < data.length; p += 4) {
        if (data[p + 3] < 200) continue;
        const r = data[p];
        const g = data[p + 1];
        const b = data[p + 2];
        const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
        const bucket = buckets.get(key);
        if (bucket) {
          bucket.r += r;
          bucket.g += g;
          bucket.b += b;
          bucket.count += 1;
          bucket.screens |= screenBit;
        } else {
          buckets.set(key, { r, g, b, count: 1, screens: screenBit });
        }
        total += 1;
      }
    }
  }
  if (!total) return [];

  // Merge neighbouring buckets into clusters, biggest first.
  const clusters: Cluster[] = [];
  for (const bucket of [...buckets.values()].sort((a, b) => b.count - a.count)) {
    const mean = { r: bucket.r / bucket.count, g: bucket.g / bucket.count, b: bucket.b / bucket.count, count: bucket.count, screens: bucket.screens };
    const near = clusters.find((c) => distance(c, mean) < MERGE_DISTANCE);
    if (near) {
      const n = near.count + mean.count;
      near.r = (near.r * near.count + mean.r * mean.count) / n;
      near.g = (near.g * near.count + mean.g * mean.count) / n;
      near.b = (near.b * near.count + mean.b * mean.count) / n;
      near.count = n;
      near.screens |= mean.screens;
    } else if (clusters.length < 160) {
      clusters.push(mean);
    }
  }
  clusters.sort((a, b) => b.count - a.count);

  // The brand colour first: vivid, and on many screens (Spotify's green on
  // its buttons), not one big patch on a single screen (an album cover).
  const screenCount = (c: Cluster) => {
    let n = 0;
    for (let m = c.screens; m; m = Math.floor(m / 2)) n += m % 2;
    return n;
  };
  const brand = clusters
    .filter((c) => saturation(c) > 0.4 && luminance(c) > 0.04 && screenCount(c) >= Math.min(BRAND_MIN_SCREENS, picked.length))
    .sort((a, b) => saturation(b) * screenCount(b) * Math.log(1 + b.count) - saturation(a) * screenCount(a) * Math.log(1 + a.count))[0];

  // Then the biggest colours, each clearly different from those already kept.
  const chosen: Cluster[] = brand ? [brand] : [];
  for (const c of clusters) {
    if (chosen.length >= KEEP) break;
    if (chosen.every((k) => distance(k, c) >= DISTINCT_DISTANCE)) chosen.push(c);
  }
  const colors = chosen.sort((a, b) => b.count - a.count);

  // Roles.
  const roles = new Map<Cluster, PaletteRole>();
  const [background] = colors;
  roles.set(background, 'Background');
  const rest = () => colors.filter((c) => !roles.has(c));
  // The colour found across many screens is the brand's; only without one
  // does the most vivid of the rest stand in.
  const primary =
    brand && brand !== background
      ? brand
      : rest()
          .filter((c) => saturation(c) > 0.3)
          .sort((a, b) => saturation(b) * Math.sqrt(b.count) - saturation(a) * Math.sqrt(a.count))[0];
  if (primary) roles.set(primary, 'Primary');
  const text = rest().sort((a, b) => contrast(b, background) - contrast(a, background))[0];
  if (text && contrast(text, background) > 3) roles.set(text, 'Text');
  // A surface is a near-neutral a step off the background, never a vivid colour.
  const surface = rest()
    .filter((c) => saturation(c) <= 0.3)
    .sort((a, b) => Math.abs(luminance(a) - luminance(background)) - Math.abs(luminance(b) - luminance(background)))[0];
  if (surface) roles.set(surface, 'Surface');
  for (const c of rest()) roles.set(c, saturation(c) > 0.3 ? 'Accent' : 'Muted');

  return colors
    .map((c) => ({ hex: hexOf(c), share: c.count / total, role: roles.get(c) ?? 'Muted' }))
    .sort((a, b) => b.share - a.share);
}

/** Cached per app, version and screen count, so a revisit (or a rebuilt library) is handled right. */
export function paletteCacheKey(appId: string, version: string, screenCount: number): string {
  return `motvin:palette:v4:${appId}:${version || 'all'}:${screenCount}`;
}

export function readCachedPalette(key: string): PaletteColor[] | null {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as PaletteColor[]) : null;
    return Array.isArray(parsed) && parsed.length ? parsed : null;
  } catch {
    return null;
  }
}

export function writeCachedPalette(key: string, colors: PaletteColor[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(colors));
  } catch {
    // Storage full or blocked: it simply gets worked out again next time.
  }
}
