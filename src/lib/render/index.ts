import type { LibraryItem } from '@/lib/api/normalize';
import type { Category } from '@/lib/config/categories';
import { renderLogoSvg } from './logos';
import { renderSvg, type RenderOptions } from './svg';

/**
 * Per-category render strategy.
 *
 * The three original engines did NOT share a renderer, and the differences are
 * substantive rather than cosmetic:
 *
 *  - icons (motvin-icons.js) rewrites every path's stroke and fill so one
 *    global colour and stroke width apply across artwork from 240-odd
 *    libraries drawn in wildly different ways.
 *
 *  - logos (logos.js) does almost none of that, by design. A brand's colours
 *    are the brand, so only monochrome marks (style "solid") are repainted, and
 *    there is no stroke control at all — logos aren't line art.
 *
 *  - illustrations (illustrations.js) carried an older copy of the icons
 *    renderer. See the note on ILLUSTRATION_RENDERER below.
 */

export type ItemRenderer = (
  item: LibraryItem,
  globals: { size: number; stroke: number; color: string },
  extra?: RenderOptions,
) => string;

/** Full pipeline: stroke scaling, fill detection, colour rewriting. */
const renderIconItem: ItemRenderer = (item, globals, extra = {}) => {
  const color = globals.color !== 'currentColor' ? globals.color : undefined;
  return renderSvg(item.svg, {
    size: globals.size,
    stroke: globals.stroke,
    iconStyle: item.style,
    sourceId: item.source,
    viewBox: item.viewBox,
    ...styleOptions(item.style),
    ...(color ? { color } : {}),
    ...extra,
  });
};

/**
 * Logos: artwork passes through untouched unless the mark is monochrome.
 *
 * Solid marks are always painted in the current ink even when no colour has
 * been picked — left alone, a white-inked mark renders white-on-white and looks
 * like a blank card. currentColor is the neutral default and follows the theme.
 */
const renderLogoItem: ItemRenderer = (item, globals, extra = {}) => {
  const isSolid = item.style === 'solid';
  const ink = isSolid ? globals.color || 'currentColor' : null;
  return renderLogoSvg(item.svg, {
    size: globals.size,
    viewBox: item.viewBox,
    ...(ink ? { color: ink } : {}),
    ...extra,
    // Whether artwork may be repainted is a property of the logo, not of the
    // colour a caller happens to pass — the detail modal passes its own
    // surface colour, and that must not flatten a colour logo's branding. So
    // this deliberately overrides `extra`.
    repaint: isSolid,
  });
};

/**
 * Illustrations use the same pipeline in its older "illustrations" variant.
 *
 * illustrations.js shipped a copy of the icons renderer that never received
 * four of its fixes (mask/defs guard, attribute-based fill detection,
 * isColorStyle, a longer fill-based source list). Those are not cosmetic:
 * rendered side by side, 53 of 60 illustrations come out differently between
 * the two, because a `stroke="none"` anywhere in the artwork makes the two
 * fill-detection tests disagree.
 *
 * So this reproduces the original exactly rather than quietly adopting the
 * newer behaviour. Switching the variant to 'icons' is a one-line change if the
 * newer rendering turns out to look better — but that is a visual decision,
 * not a refactor.
 */
const renderIllustrationItem: ItemRenderer = (item, globals, extra = {}) => {
  // Some collections (Bioicons) ship no inline SVG at all — only a remote URL.
  // The original rendered those as an <img>; without this they render blank,
  // which is 27 of the first 60 illustrations.
  if (item.imageUrl) {
    const size = extra.size || globals.size;
    const label = escapeAttribute(item.name);
    return `<img src="${escapeAttribute(item.imageUrl)}" alt="${label}" width="${size}" height="${size}" style="display:block;max-width:100%;object-fit:contain">`;
  }

  const color = globals.color !== 'currentColor' ? globals.color : undefined;
  return renderSvg(item.svg, {
    size: globals.size,
    stroke: globals.stroke,
    iconStyle: item.style,
    sourceId: item.source,
    viewBox: item.viewBox,
    variant: 'illustrations',
    ...styleOptions(item.style),
    ...(color ? { color } : {}),
    ...extra,
  });
};

export const RENDERERS: Readonly<Record<Category, ItemRenderer>> = {
  icons: renderIconItem,
  logos: renderLogoItem,
  illustrations: renderIllustrationItem,
};

/**
 * Per-style defaults — port of styleOpts().
 *
 * "solid" deliberately does NOT force stroke to 0: line-based icons (menu,
 * minus, activity) would vanish. The fill covers closed shapes for a solid look
 * while the stroke keeps open paths visible.
 */
function styleOptions(style: string): Partial<RenderOptions> {
  switch (style) {
    case 'solid':
    case 'duotone':
    case 'thin':
      return { cap: 'round', join: 'round' };
    default:
      return {};
  }
}

/** Escapes a value for interpolation into an HTML attribute. */
function escapeAttribute(value: string): string {
  return String(value).replace(
    /[&"<>]/g,
    (character) =>
      ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' })[character] as string,
  );
}

/**
 * Wraps inline SVG as a data URL, for illustrations that have markup but are
 * displayed as an image — port of nativeSvgDataUrl().
 */
export function nativeSvgDataUrl(item: LibraryItem): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${item.viewBox || '0 0 24 24'}" preserveAspectRatio="xMidYMid meet">${item.svg}</svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export function renderForCategory(
  category: Category,
  item: LibraryItem,
  globals: { size: number; stroke: number; color: string },
  extra: RenderOptions = {},
): string {
  return RENDERERS[category](item, globals, extra);
}
