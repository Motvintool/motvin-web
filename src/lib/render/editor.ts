import type { LibraryItem } from '@/lib/api/normalize';
import type { Category } from '@/lib/config/categories';
import { flattenSvg, normalizeSvgFile } from './flatten';
import { renderLogoSvg } from './logos';
import { renderSvg, type RenderOptions } from './svg';

/**
 * Editor state and export formats — port of the editor half of
 * motvin-ui/JS/motvin-icons.js (DEFAULT_EDITOR, editorRenderOpts, PRESETS,
 * currentSvgString, toJsx, toDataUrl).
 */

export type EditorState = {
  size: number;
  stroke: number;
  color: string;
  fillMode: 'none' | 'solid';
  fillColor: string;
  bg: string;
  cap: string;
  join: string;
  pattern: 'solid' | 'dashed' | 'dotted';
  rotation: number;
  padding: number;
  flip: 'none' | 'h' | 'v';
  opacity: number;
  shadow: number;
  shape: 'none' | 'circle' | 'rect' | 'rounded';
  iconInset: number;
  shapeRadius: number;
  shapeColor: string;
};

export const DEFAULT_EDITOR: EditorState = {
  size: 24,
  stroke: 1.75,
  color: '#0F1116',
  fillMode: 'none',
  fillColor: '#0F1116',
  bg: 'transparent',
  cap: 'round',
  join: 'round',
  pattern: 'solid',
  rotation: 0,
  padding: 0,
  flip: 'none',
  opacity: 100,
  shadow: 0,
  shape: 'none',
  iconInset: 3,
  shapeRadius: 4,
  shapeColor: '#EEEAFB',
};

/**
 * Opening the editor inherits the grid's current global settings, so the
 * preview matches the card the visitor just clicked rather than resetting to
 * defaults.
 */
export function editorFromGlobals(
  item: LibraryItem,
  globals: { size: number; stroke: number; color: string },
): EditorState {
  return {
    ...DEFAULT_EDITOR,
    size: globals.size || DEFAULT_EDITOR.size,
    stroke: globals.stroke || DEFAULT_EDITOR.stroke,
    color:
      globals.color && globals.color !== 'currentColor'
        ? globals.color
        : DEFAULT_EDITOR.color,
    // Reference (motvin-icons.js:1676) resets fillMode from DEFAULT_EDITOR
    // regardless of style — auto-flipping it to 'solid' turns every
    // no-fill path in the artwork into a color-flooded silhouette
    // (illustrations especially: OpenDoodles' outline paths become filled
    // blobs). Keep the default; the visitor toggles Fill from the UI.
    fillMode: DEFAULT_EDITOR.fillMode,
  };
}

/** Illustration styles that need round joins/caps to look right — mirrors
 * styleOptions() in lib/render/index.ts, which the grid renderer applies. */
function illustrationStyleOptions(style: string): Partial<RenderOptions> {
  switch (style) {
    case 'solid':
    case 'duotone':
    case 'thin':
      return { cap: 'round', join: 'round' };
    default:
      return {};
  }
}

export function editorRenderOptions(
  item: LibraryItem,
  editor: EditorState,
  sizeOverride?: number,
  category: Category = 'icons',
): RenderOptions {
  const base: RenderOptions = {
    size: sizeOverride ?? editor.size,
    stroke: editor.stroke,
    color: editor.color,
    viewBox: item.viewBox,
    iconStyle: item.style,
    sourceId: item.source,
    fillMode: editor.fillMode,
    fillColor: editor.fillColor,
    cap: editor.cap,
    join: editor.join,
    pattern: editor.pattern,
    rotation: editor.rotation,
    flip: editor.flip,
    opacity: editor.opacity,
    shadow: editor.shadow,
    shape: editor.shape,
    iconInset: editor.iconInset,
    shapeRadius: editor.shapeRadius,
    shapeColor: editor.shapeColor,
  };
  // Illustrations keep the legacy 'illustrations' variant so their palette
  // survives — without this, a colour/3d/multi-colour illustration goes
  // through the icons pipeline, which strips fills and forces a mono stroke.
  // Matches the grid renderer (renderIllustrationItem in lib/render/index.ts).
  if (category === 'illustrations') {
    return {
      ...base,
      variant: 'illustrations',
      ...illustrationStyleOptions(item.style),
    };
  }
  return base;
}

export function renderEditorSvg(
  item: LibraryItem,
  editor: EditorState,
  sizeOverride?: number,
  category: Category = 'icons',
): string {
  // Logos take the logo renderer here too, so the editor preview and its
  // exports match what the grid shows rather than flattening brand colours.
  if (category === 'logos') {
    const isSolid = item.style === 'solid';
    return renderLogoSvg(item.svg, {
      size: sizeOverride ?? editor.size,
      viewBox: item.viewBox,
      color: isSolid ? editor.color : undefined,
      repaint: isSolid,
    });
  }
  return renderSvg(item.svg, editorRenderOptions(item, editor, sizeOverride, category));
}

/**
 * One-click looks — port of the PRESETS map. Each is a partial edit applied
 * over the current state.
 */
export const EDITOR_PRESETS: Record<string, Partial<EditorState>> = {
  Default: { ...DEFAULT_EDITOR },
  Bold: { stroke: 2, cap: 'round', join: 'round' },
  Thin: { stroke: 1, cap: 'round', join: 'round' },
  Filled: { fillMode: 'solid', stroke: 0 },
  Rounded: { cap: 'round', join: 'round', shape: 'rounded', shapeRadius: 6, iconInset: 4 },
  Circle: { shape: 'circle', iconInset: 5 },
  Shadow: { shadow: 6 },
};

/** SVG source as the editor currently renders it, flattened for design tools. */
export function currentSvgString(
  item: LibraryItem,
  editor: EditorState,
  category: Category = 'icons',
): string {
  return flattenSvg(renderEditorSvg(item, editor, undefined, category));
}

/**
 * Illustrations from remote-URL-only collections (Bioicons, some SVGRepo
 * entries) ship without inline SVG — the grid renders them as `<img>`, which is
 * useless for clipboard/export. Fetch the file, normalise it, and cache the
 * markup on the item so every follow-up copy/download works. Port of
 * `exportSvgFor` in motvin-ui/JS/illustrations.js:2038.
 */
export async function resolveInlineSvg(item: LibraryItem): Promise<void> {
  if (item.svg || !item.imageUrl) return;
  try {
    const response = await fetch(item.imageUrl);
    if (!response.ok) return;
    const markup = normalizeSvgFile(await response.text());
    if (markup) item.svg = markup;
  } catch {
    // Network / CORS failure — leave item.svg empty so the caller can fall
    // back to whatever error message it uses.
  }
}

/**
 * Export-ready SVG for one item. Waits for `resolveInlineSvg` first so an
 * imageUrl-only illustration is fetched before it goes to the clipboard.
 */
export async function exportSvgFor(
  item: LibraryItem,
  editor: EditorState,
  category: Category = 'icons',
): Promise<string> {
  await resolveInlineSvg(item);
  return currentSvgString(item, editor, category);
}

/** SVG rewritten for JSX: hyphenated attributes camelCased, xmlns dropped. */
export function toJsx(svg: string): string {
  return svg
    .replace(/stroke-width/g, 'strokeWidth')
    .replace(/stroke-linecap/g, 'strokeLinecap')
    .replace(/stroke-linejoin/g, 'strokeLinejoin')
    .replace(/stroke-dasharray/g, 'strokeDasharray')
    .replace(/flood-color/g, 'floodColor')
    .replace(/flood-opacity/g, 'floodOpacity')
    .replace(/fill-rule/g, 'fillRule')
    .replace(/clip-rule/g, 'clipRule')
    .replace(/fill-opacity/g, 'fillOpacity')
    .replace(/preserveAspectRatio/g, 'preserveAspectRatio')
    .replace(/xmlns="[^"]+"\s?/, '');
}

/**
 * Vue single-file-component template. Kept literal so a paste into a `.vue`
 * file works without shaping the artwork's SVG twice.
 */
export function toVue(svg: string): string {
  return `<template>\n${svg}\n</template>`;
}

/**
 * `<img>` tag holding the SVG as a data URL — the most portable form; every
 * browser and every editor accepts it.
 */
export function toHtmlImg(svg: string, name: string): string {
  return `<img src="${toDataUrl(svg)}" alt="${name}">`;
}

/**
 * CSS `mask-image` declaration block; useful for one-colour icons where the
 * consuming stylesheet paints the "ink" through `background-color`.
 */
export function toCssMask(svg: string, name: string): string {
  const url = toDataUrl(svg);
  const cls = name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'icon';
  return `.icon-${cls} {\n  mask: url("${url}") center / contain no-repeat;\n  -webkit-mask: url("${url}") center / contain no-repeat;\n  background-color: currentColor;\n}`;
}

export function toDataUrl(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** Rasterises the current SVG to a PNG data URL at the requested square size. */
export async function toPngDataUrl(svg: string, size: number): Promise<string> {
  const image = new Image();
  image.crossOrigin = 'anonymous';

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Could not rasterise SVG'));
    image.src = toDataUrl(svg);
  });

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas unavailable');
  context.drawImage(image, 0, 0, size, size);
  return canvas.toDataURL('image/png');
}

/**
 * PNG base64 without the `data:` prefix — some tools want the bytes only.
 */
export async function toBase64Png(svg: string, size: number): Promise<string> {
  const dataUrl = await toPngDataUrl(svg, size);
  return dataUrl.replace(/^data:image\/png;base64,/, '');
}

/**
 * Copy formats — order matches the legacy dropdown so muscle memory carries
 * over.
 */
export const COPY_FORMATS = ['svg', 'jsx', 'vue', 'html', 'css', 'dataurl', 'base64'] as const;
export type CopyFormat = (typeof COPY_FORMATS)[number];

export const PNG_SIZES = [512, 256, 128, 64, 32, 24, 16] as const;

/** Human labels — used by both dropdowns and the green pill's label. */
export const COPY_FORMAT_LABELS: Record<CopyFormat, string> = {
  svg: 'SVG',
  jsx: 'JSX / React',
  vue: 'Vue',
  html: 'HTML <img>',
  css: 'CSS mask URL',
  dataurl: 'Data URL',
  base64: 'Base64 PNG',
};

/** Short labels for the green pill — "Copy SVG", "Copy JSX", etc. */
export const COPY_FORMAT_SHORT: Record<CopyFormat, string> = {
  svg: 'SVG',
  jsx: 'JSX',
  vue: 'Vue',
  html: 'HTML',
  css: 'CSS',
  dataurl: 'Data URL',
  base64: 'Base64',
};

/**
 * Formats the current artwork as the given copy format. Async because two of
 * them rasterise through canvas.
 */
export async function formatCode(
  svg: string,
  format: CopyFormat,
  itemName: string,
  pngSize: number,
): Promise<string> {
  switch (format) {
    case 'svg':
      return svg;
    case 'jsx':
      return toJsx(svg);
    case 'vue':
      return toVue(svg);
    case 'html':
      return toHtmlImg(svg, itemName);
    case 'css':
      return toCssMask(svg, itemName);
    case 'dataurl':
      return toDataUrl(svg);
    case 'base64':
      return toBase64Png(svg, pngSize);
  }
}
