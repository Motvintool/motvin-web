'use client';

import { useSyncExternalStore } from 'react';

/**
 * Gallery column count driven by viewport width. Thresholds match the
 * breakpoints in inspirations.css:
 *   ≥1500 → 5 · ≥1140 → 4 · ≥760 → 3 · ≥360 → 2 · else 1
 *
 * Read through useSyncExternalStore so the server renders the 4-column
 * fallback and the client corrects on hydration without an extra effect.
 */

export type ColumnPreset = 'gallery' | 'wide';

const BREAKS: Record<ColumnPreset, [number, number][]> = {
  gallery: [
    [1500, 5],
    [1140, 4],
    [760, 3],
    [360, 2],
  ],
  wide: [
    [1500, 4],
    [1140, 3],
    [760, 2],
  ],
};

function subscribe(onChange: () => void) {
  window.addEventListener('resize', onChange);
  return () => window.removeEventListener('resize', onChange);
}

function compute(preset: ColumnPreset): number {
  const w = window.innerWidth;
  for (const [min, cols] of BREAKS[preset]) {
    if (w >= min) return cols;
  }
  return 1;
}

export function useColumnCount(preset: ColumnPreset = 'gallery'): number {
  return useSyncExternalStore(
    subscribe,
    () => compute(preset),
    () => (preset === 'gallery' ? 4 : 3),
  );
}
