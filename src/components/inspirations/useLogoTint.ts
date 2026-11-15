'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { inspirationsApi } from '@/lib/inspirations/api';
import type { App } from '@/lib/inspirations/types';

/**
 * The app's own colour, read off its logo, for the faint tint behind its card's screen: Memrise's yellow,
 * Deepstash's red, Elevate's blue. The logo is drawn small, its strongly coloured pixels averaged (white,
 * black and greys left out, so a black-and-white mark like ChatGPT's has none and keeps the plain grey).
 * Remembered per logo in this browser, so each is read once. Null until known, or when the logo has no colour.
 */
const KEY = 'motvin:logo-tint:';
const memory = new Map<string, string | null>();
const listeners = new Set<() => void>();
const loading = new Set<string>();
/** Bumped whenever a logo's colour lands, for the all-apps hook to re-read. */
let version = 0;

function readCache(src: string): string | null | undefined {
  if (memory.has(src)) return memory.get(src);
  try {
    const stored = localStorage.getItem(KEY + src);
    if (stored === null) return undefined;
    const value = stored === '' ? null : stored;
    memory.set(src, value);
    return value;
  } catch {
    return undefined;
  }
}

function writeCache(src: string, value: string | null) {
  memory.set(src, value);
  version += 1;
  listeners.forEach((fn) => fn());
  try {
    localStorage.setItem(KEY + src, value ?? '');
  } catch {
    // Private mode or full storage: read again next visit.
  }
}

function colourOf(image: HTMLImageElement): string | null {
  const size = 24;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(image, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue;
    const max = Math.max(data[i], data[i + 1], data[i + 2]);
    const min = Math.min(data[i], data[i + 1], data[i + 2]);
    // Coloured enough, and neither near-white nor near-black.
    if (max - min < 60 || max < 60 || min > 235) continue;
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
    n += 1;
  }
  // A mark with only a sliver of colour (a small dot on black) is treated as colourless.
  if (n < size * size * 0.06) return null;
  return `rgb(${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(b / n)})`;
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function load(src: string) {
  if (loading.has(src) || readCache(src) !== undefined) return;
  loading.add(src);
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.onload = () => {
    let value: string | null = null;
    try {
      value = colourOf(image);
    } catch {
      value = null;
    }
    loading.delete(src);
    writeCache(src, value);
  };
  image.onerror = () => {
    loading.delete(src);
    memory.set(src, null);
    version += 1;
    listeners.forEach((fn) => fn());
  };
  image.src = src;
}

export function useLogoTint(app: App): string | null {
  const src = inspirationsApi.mediaUrl(app.logo);
  useEffect(() => {
    if (src) load(src);
  }, [src]);
  // Nothing on the server (no logo read there), so the page hydrates as rendered and the tint fades in after.
  return useSyncExternalStore(
    subscribe,
    () => (src ? readCache(src) ?? null : null),
    () => null,
  );
}

/**
 * Every app's colour at once (the Palette filter), by app id: a colour, null for a colourless mark, undefined
 * while its logo is still being read. Each logo is read once, through the same store as the cards'.
 */
export function useLogoTints(apps: App[]): Map<string, string | null | undefined> {
  const key = apps.map((app) => app.logo ?? '').join('|');
  useEffect(() => {
    for (const app of apps) {
      const src = inspirationsApi.mediaUrl(app.logo);
      if (src) load(src);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the logos, not the array's identity
  }, [key]);
  useSyncExternalStore(subscribe, () => version, () => 0);
  return new Map(
    apps.map((app) => {
      const src = inspirationsApi.mediaUrl(app.logo);
      return [app.id, src ? readCache(src) ?? (loading.has(src) ? undefined : null) : null];
    }),
  );
}
