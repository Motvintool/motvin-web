'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { inspirationsApi } from '@/lib/inspirations/api';
import { extractPalette, isLightColor, readCachedPalette, writeCachedPalette, type PaletteColor } from '@/lib/inspirations/palette';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import { screenTypeLabel } from '@/lib/inspirations/taxonomy';
import { isDesktopPlatform, type App, type Screen } from '@/lib/inspirations/types';
import { AppLogo } from './AppLogo';
import { useToast } from './Toast';
import { useAsync } from './useAsync';

/** How many other apps the compare shortcut offers. */
const COMPARE_PICKS = 3;

/** Bar widths for the loading pills: they wrap two and one, as the loaded ones do. */
const COMPARE_SKELETON_WIDTHS = [58, 46, 48];

/**
 * This one screenshot's colours, worked out like the app's palette
 * (palette.ts) and cached per screen. `null` while being worked out, `[]`
 * when there was nothing to read.
 */
function useScreenPalette(screen: Screen): PaletteColor[] | null {
  const key = `motvin:palette:v4:screen:${screen.id}`;
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
    const src = inspirationsApi.mediaUrl(screen.url);
    if (!src) {
      const timer = window.setTimeout(() => !cancelled && setState({ key, colors: [] }), 0);
      return () => {
        cancelled = true;
        window.clearTimeout(timer);
      };
    }
    extractPalette([src])
      .then((colors) => {
        if (cancelled) return;
        if (colors.length) writeCachedPalette(key, colors);
        setState({ key, colors });
      })
      .catch(() => !cancelled && setState({ key, colors: [] }));
    return () => {
      cancelled = true;
    };
    // `key` already changes with the screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state && state.key === key ? state.colors : null;
}

/**
 * "Colours": the screenshot's palette as a row of swatches, biggest share
 * first; hover one for its hex (the black tooltip), click to copy it.
 */
export function ScreenColours({ screen }: { screen: Screen }) {
  const colors = useScreenPalette(screen);
  const { show } = useToast();
  if (colors && colors.length === 0) return null;

  const copy = async (hex: string) => {
    try {
      await navigator.clipboard.writeText(hex);
      show(`Copied ${hex}`);
    } catch {
      show('Copy not available', { tone: 'error' });
    }
  };

  return (
    <section className="ins-details-group" aria-labelledby="ins-details-colours">
      <h3 id="ins-details-colours" className="ins-details-group-title">
        Colours
      </h3>
      <div className={`ins-details-swatches ${colors ? '' : 'is-loading'}`}>
        {colors
          ? colors.map((c) => (
              <button
                key={c.hex}
                type="button"
                className={`ins-details-swatch ${isLightColor(c.hex) ? 'is-light' : ''}`}
                style={{ '--swatch': c.hex } as CSSProperties}
                aria-label={`Copy ${c.hex}`}
                onClick={() => void copy(c.hex)}
              >
                <span className="ins-flow-tip" aria-hidden="true">
                  {c.hex}
                </span>
              </button>
            ))
          : Array.from({ length: 5 }, (_, i) => <span key={i} className="ins-details-swatch" aria-hidden="true" />)}
      </div>
    </section>
  );
}

/**
 * "Compare {type} with": the apps with the most screens of this type (not
 * this one), each opening the compare view with that pair.
 */
export function CompareShortcut({ app, screen }: { app: App; screen: Screen }) {
  const type = screen.screenType;
  // Same keys as the compare view's own lists, so they share the fetch.
  const { data: ofType } = useAsync(() => inspirationsApi.listScreensOfType(type), `compare-type:${type}`);
  const { data: apps } = useAsync(() => inspirationsApi.listApps(), 'compare-apps');

  const picks = useMemo(() => {
    if (!ofType || !apps) return null;
    // Only apps in the same section — an iPhone screen beside iPhone apps,
    // a web screen beside web ones — as the rest of the site keeps them.
    const sameSection = (s: Screen) => isDesktopPlatform(s.platform) === isDesktopPlatform(screen.platform);
    const counts = new Map<string, number>();
    for (const s of ofType) if (s.appId !== app.id && sameSection(s)) counts.set(s.appId, (counts.get(s.appId) ?? 0) + 1);
    const byId = new Map(apps.map((a) => [a.id, a]));
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => byId.get(id))
      .filter((a): a is App => Boolean(a))
      .slice(0, COMPARE_PICKS);
  }, [ofType, apps, app.id, screen.platform]);

  if (!type || type === 'other') return null;
  const label = screenTypeLabel(type).toLowerCase();

  // Still loading: the group holds its place (heading and three pill shapes,
  // wrapping like the loaded pills) instead of dropping in later and pushing
  // Source and Tags down.
  if (picks === null) {
    return (
      <section className="ins-details-group" aria-busy="true" aria-labelledby="ins-details-compare">
        <h3 id="ins-details-compare" className="ins-details-group-title">
          Compare {label} with
        </h3>
        <div className="ins-details-pills" aria-hidden>
          {COMPARE_SKELETON_WIDTHS.map((width, i) => (
            <span key={i} className="ins-details-pill ins-details-pill--app ins-details-pill--skel">
              <span className="ins-skel ins-details-pill-skel-logo" />
              <span className="ins-skel ins-skel--line" style={{ width }} />
            </span>
          ))}
        </div>
      </section>
    );
  }
  if (!picks.length) return null;

  return (
    <section className="ins-details-group" aria-labelledby="ins-details-compare">
      <h3 id="ins-details-compare" className="ins-details-group-title">
        Compare {label} with
      </h3>
      <div className="ins-details-pills">
        {picks.map((other) => (
          <Link
            key={other.id}
            // CompareScreens' ?compare= / &with= (written out: CompareScreens imports the preview).
            href={INSPIRATIONS_ROUTES.app(app, screen.platform, { compare: type, with: other.slug })}
            className="ins-details-pill ins-details-pill--app"
            aria-label={`Compare ${app.name}'s ${label} screens with ${other.name}'s`}
          >
            <AppLogo app={other} size={20} />
            {other.name}
          </Link>
        ))}
      </div>
    </section>
  );
}
