'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { hueOf, type PaletteHue } from '@/lib/inspirations/hues';
import type { Platform } from '@/lib/inspirations/types';
import { PALETTE_PARAM, readPaletteParam } from './PaletteFilter';
import { useApps } from './useApps';
import { useLogoTints } from './useLogoTint';

/**
 * The colour filter on the screens, flows and patterns pages: a screen or flow is kept when its app's brand
 * colour (the app's logo, as on Explore and Apps) is one of the picked ones. Reads and writes `?color=`.
 *
 * `appIds` is the set of matching apps while colours are picked (null with none picked); `ready` is false
 * until every app's logo has been read, so a page waits rather than showing a partial list that then grows.
 * `counts` is how many of the browsed platform's apps have each colour, for the swatches.
 */
export function usePaletteApps(platforms: Platform[]) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const palette = readPaletteParam(params.get(PALETTE_PARAM));
  const apps = [...useApps().values()].filter((app) => app.platforms.some((p) => platforms.includes(p)));
  const tints = useLogoTints(apps);
  const ready = apps.length > 0 && apps.every((app) => tints.get(app.id) !== undefined);

  const appIds = palette.length ? new Set(apps.filter((app) => palette.includes(hueOf(tints.get(app.id)))).map((app) => app.id)) : null;
  const counts = apps.reduce<Partial<Record<PaletteHue, number>>>((all, app) => {
    if (tints.get(app.id) === undefined) return all;
    const hue = hueOf(tints.get(app.id));
    all[hue] = (all[hue] ?? 0) + 1;
    return all;
  }, {});

  const setPalette = (next: PaletteHue[]) => {
    const sp = new URLSearchParams(params.toString());
    if (next.length) sp.set(PALETTE_PARAM, next.join(','));
    else sp.delete(PALETTE_PARAM);
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return { palette, setPalette, counts, appIds, ready: !palette.length || ready };
}
