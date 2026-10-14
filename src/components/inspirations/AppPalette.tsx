'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { inspirationsApi } from '@/lib/inspirations/api';
import {
  extractPalette,
  isLightColor,
  paletteCacheKey,
  readCachedPalette,
  writeCachedPalette,
  type PaletteColor,
} from '@/lib/inspirations/palette';
import type { App, Screen } from '@/lib/inspirations/types';
import { useToast } from './Toast';

/**
 * The app's colours, worked out from its screenshots (see palette.ts) and
 * cached per version. `null` while they're being worked out, `[]` when there
 * was nothing to read.
 */
export function useAppPalette(app: App, screens: Screen[], version: string): PaletteColor[] | null {
  const key = paletteCacheKey(app.id, version, screens.length);
  const [state, setState] = useState<{ key: string; colors: PaletteColor[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const cached = readCachedPalette(key);
    if (cached) {
      // Deferred, so the effect never sets state synchronously.
      const timer = window.setTimeout(() => !cancelled && setState({ key, colors: cached }), 0);
      return () => {
        cancelled = true;
        window.clearTimeout(timer);
      };
    }
    const sources = screens.map((s) => inspirationsApi.mediaUrl(s.url)).filter((src): src is string => Boolean(src));
    extractPalette(sources)
      .then((colors) => {
        if (cancelled) return;
        if (colors.length) writeCachedPalette(key, colors);
        setState({ key, colors });
      })
      .catch(() => !cancelled && setState({ key, colors: [] }));
    return () => {
      cancelled = true;
    };
    // `key` already changes with the app, version and screen count.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state && state.key === key ? state.colors : null;
}

/**
 * The Palette pill and the panel it drops down, like the app's menus: it
 * floats over the page from the pill's right edge and closes on a click
 * outside it or Escape.
 */
export function AppPaletteMenu({
  app,
  colors,
  screens,
  flowCount,
  patternCount,
}: {
  app: App;
  colors: PaletteColor[] | null;
  screens: Screen[];
  flowCount: number;
  patternCount: number;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (colors && colors.length === 0) return null;
  return (
    <div className="ins-palette-menu" ref={rootRef}>
      <PalettePill colors={colors} open={open} onToggle={() => setOpen((o) => !o)} />
      <PalettePanel
        app={app}
        colors={colors}
        open={open}
        screens={screens}
        flowCount={flowCount}
        patternCount={patternCount}
      />
    </div>
  );
}

/** "Palette ●●●●● ⌄" at the end of the store strip; opens the card below it. */
function PalettePill({
  colors,
  open,
  onToggle,
}: {
  colors: PaletteColor[] | null;
  open: boolean;
  onToggle: () => void;
}) {
  if (colors && colors.length === 0) return null;
  return (
    <button
      type="button"
      className={`ins-palette-pill ${open ? 'is-open' : ''}`}
      aria-expanded={open}
      aria-controls="ins-app-palette"
      onClick={onToggle}
      disabled={!colors}
    >
      Palette
      {/* The colours as overlapping circles, each ringed so a white one still shows. */}
      <span className={`ins-palette-dots ${colors ? '' : 'is-loading'}`} aria-hidden>
        {(colors ?? Array.from({ length: 5 }, () => null)).map((c, i) => (
          <span key={c?.hex ?? i} style={c ? { background: c.hex } : undefined} />
        ))}
      </span>
      <svg className="ins-palette-chevron" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

/** "#FFFEFF" → "rgb(255, 254, 255)". */
function rgbOf(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

function shareLabel(share: number): string {
  return `${share < 0.01 ? '<1' : Math.round(share * 100)}%`;
}

type ColorFormat = 'hex' | 'rgb';

/**
 * The card the pill opens: the app's colours as a row of tiles, each as wide
 * as its share of the app (hover one to widen it, click to copy it), with the
 * brand colour tagged and a HEX / RGB switch.
 */
function PalettePanel({
  app,
  colors,
  open,
  screens,
  flowCount,
  patternCount,
}: {
  app: App;
  colors: PaletteColor[] | null;
  open: boolean;
  screens: Screen[];
  flowCount: number;
  patternCount: number;
}) {
  const { show } = useToast();
  const [format, setFormat] = useState<ColorFormat>('hex');
  // The tile that was just copied shows "Copied" in place of its role.
  const [copied, setCopied] = useState<string | null>(null);
  const copiedTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(copiedTimer.current), []);
  if (colors && colors.length === 0) return null;

  const valueOf = (c: PaletteColor) => (format === 'hex' ? c.hex : rgbOf(c.hex));
  // On the tile, RGB drops its "rgb( )" so it fits the narrowest one; copies keep it.
  const shownOf = (c: PaletteColor) => (format === 'hex' ? c.hex : rgbOf(c.hex).slice(4, -1));

  const copy = async (text: string, message: string, hex?: string) => {
    try {
      await navigator.clipboard.writeText(text);
      show(message);
      if (hex) {
        setCopied(hex);
        window.clearTimeout(copiedTimer.current);
        copiedTimer.current = window.setTimeout(() => setCopied(null), 1400);
      }
    } catch {
      show('Copy not available');
    }
  };

  // Widths follow each colour's share on a square-root scale, so a big
  // background doesn't squeeze a small brand colour out of view.
  const bandTotal = colors?.reduce((sum, c) => sum + Math.sqrt(c.share), 0) || 1;
  const counts = [
    screens.length && `${screens.length} screens`,
    flowCount && `${flowCount} flows`,
    patternCount && `${patternCount} patterns`,
  ].filter(Boolean);

  return (
    <div id="ins-app-palette" className={`ins-palette-pop ${open ? 'is-open' : ''}`} aria-hidden={!open}>
        <section className="ins-palette-card" role="dialog" aria-label={`${app.name} brand palette`}>
          <div className="ins-palette-head">
            <div className="ins-palette-heading">
              <h2 className="ins-palette-title">Brand palette</h2>
              {counts.length > 0 && <p className="ins-palette-note">Sampled from {counts.join(' · ')}</p>}
            </div>
            {colors && (
              <div className="ins-palette-actions">
                <div className="ins-palette-format" role="radiogroup" aria-label="Colour format">
                  {(['hex', 'rgb'] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      role="radio"
                      aria-checked={format === f}
                      className={format === f ? 'is-active' : ''}
                      tabIndex={open ? 0 : -1}
                      onClick={() => setFormat(f)}
                    >
                      {f.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {colors ? (
            <div className="ins-palette-band">
              {colors.map((c) => {
                const isCopied = copied === c.hex;
                return (
                  <button
                    key={c.hex}
                    type="button"
                    className={`ins-palette-seg ${isLightColor(c.hex) ? 'is-light' : ''} ${isCopied ? 'is-copied' : ''}`}
                    style={{ background: c.hex, '--w': Math.max(4, Math.round((Math.sqrt(c.share) / bandTotal) * 100)) } as CSSProperties}
                    tabIndex={open ? 0 : -1}
                    aria-label={`${c.role} ${valueOf(c)}, ${shareLabel(c.share)} of screens. Copy`}
                    onClick={() => void copy(valueOf(c), `Copied ${valueOf(c)}`, c.hex)}
                  >
                    {c.role === 'Primary' && <span className="ins-palette-brand">Brand</span>}
                    <span className="ins-palette-seg-icon" aria-hidden>
                      {isCopied ? (
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                          <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                          <rect x="5.5" y="5.5" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.5" />
                          <path d="M10.5 3.5v-.25A1.75 1.75 0 008.75 1.5h-5.5A1.75 1.75 0 001.5 3.25v5.5c0 .97.78 1.75 1.75 1.75h.25" stroke="currentColor" strokeWidth="1.5" />
                        </svg>
                      )}
                    </span>
                    <span className="ins-palette-seg-label">
                      <span className="ins-palette-hex">{shownOf(c)}</span>
                      <span className="ins-palette-role">{isCopied ? 'Copied' : `${c.role} · ${shareLabel(c.share)}`}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="ins-palette-band ins-palette-band--loading" aria-hidden />
          )}
        </section>
    </div>
  );
}
