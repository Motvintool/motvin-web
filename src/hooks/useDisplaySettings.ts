'use client';

import { useCallback, useState } from 'react';
import { storageKey, type CategoryConfig } from '@/lib/config/categories';
import { useStoredValue, writeStoredValue } from './useStoredValue';

/**
 * The global render controls — size, stroke, colour and grid density.
 *
 * These stay in localStorage rather than the URL: they're a per-visitor
 * preference about how the grid looks, not part of what's being searched, so
 * they shouldn't ride along in a shared link. Keys keep the original's
 * per-category prefixes (`mi.` / `ml.` / `mill.`), so a returning visitor's
 * settings carry over from the static site.
 */

export type Density = 'detailed' | 'compact';

export type DisplaySettings = {
  size: number;
  stroke: number;
  color: string;
  density: Density;
  setSize: (value: number) => void;
  setStroke: (value: number) => void;
  setColor: (value: string) => void;
  resetColor: () => void;
  setDensity: (value: Density) => void;
};

/** The original's sentinel for "don't recolour". */
export const NO_RECOLOR = 'currentColor';

export function useDisplaySettings(config: CategoryConfig): DisplaySettings {
  const sizeKey = storageKey(config, 'globalSize');
  const strokeKey = storageKey(config, 'globalStroke');
  const colorKey = storageKey(config, 'globalColor');
  const densityKey = storageKey(config, 'density');

  const parseSize = useCallback(
    (raw: string | null) => {
      const value = parseInt(raw ?? '', 10);
      return Number.isFinite(value) && value > 0 ? value : config.defaultGlobalSize;
    },
    [config.defaultGlobalSize],
  );

  const parseStroke = useCallback(
    (raw: string | null) => {
      const value = parseFloat(raw ?? '');
      return Number.isFinite(value) && value > 0 ? value : config.defaultGlobalStroke;
    },
    [config.defaultGlobalStroke],
  );

  const parseColor = useCallback((raw: string | null) => raw || NO_RECOLOR, []);

  const parseDensity = useCallback(
    (raw: string | null): Density => (raw === 'compact' ? 'compact' : 'detailed'),
    [],
  );

  const [storedSize, refreshSize] = useStoredValue(sizeKey, config.defaultGlobalSize, parseSize);
  const [storedStroke, refreshStroke] = useStoredValue(
    strokeKey,
    config.defaultGlobalStroke,
    parseStroke,
  );
  const [storedColor, refreshColor] = useStoredValue(colorKey, NO_RECOLOR, parseColor);
  const [storedDensity, refreshDensity] = useStoredValue<Density>(
    densityKey,
    'detailed',
    parseDensity,
  );

  // Mirrors the stored values so dragging a slider updates the grid on every
  // frame without writing to storage on every frame.
  const [liveSize, setLiveSize] = useState<number | null>(null);
  const [liveStroke, setLiveStroke] = useState<number | null>(null);

  const setSize = useCallback(
    (value: number) => {
      setLiveSize(value);
      writeStoredValue(sizeKey, String(value));
      refreshSize();
    },
    [sizeKey, refreshSize],
  );

  const setStroke = useCallback(
    (value: number) => {
      setLiveStroke(value);
      writeStoredValue(strokeKey, String(value));
      refreshStroke();
    },
    [strokeKey, refreshStroke],
  );

  const setColor = useCallback(
    (value: string) => {
      writeStoredValue(colorKey, value);
      refreshColor();
    },
    [colorKey, refreshColor],
  );

  const resetColor = useCallback(() => {
    writeStoredValue(colorKey, NO_RECOLOR);
    refreshColor();
  }, [colorKey, refreshColor]);

  const setDensity = useCallback(
    (value: Density) => {
      writeStoredValue(densityKey, value);
      refreshDensity();
    },
    [densityKey, refreshDensity],
  );

  return {
    size: liveSize ?? storedSize,
    stroke: liveStroke ?? storedStroke,
    color: storedColor,
    density: storedDensity,
    setSize,
    setStroke,
    setColor,
    resetColor,
    setDensity,
  };
}
