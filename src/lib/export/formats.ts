import type { LibraryItem } from '@/lib/api/normalize';
import { toJsx } from '@/lib/render/editor';

/**
 * Copy formats offered by the bulk-selection strip — port of the format menu in
 * motvin-ui/COMPONENT/Multi Actions Strip.js.
 */

export const BULK_COPY_FORMATS = [
  { value: 'svg', label: 'SVG' },
  { value: 'jsx', label: 'JSX / React' },
  { value: 'vue', label: 'Vue' },
  { value: 'html', label: 'HTML <img>' },
  { value: 'css', label: 'CSS mask URL' },
  { value: 'dataurl', label: 'Data URL' },
  { value: 'base64', label: 'Base64 SVG' },
] as const;

export type BulkCopyFormat = (typeof BULK_COPY_FORMATS)[number]['value'];

/** Base64 of a UTF-8 string — btoa alone throws on non-Latin-1 characters. */
function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function dataUrl(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** Turns one item's rendered SVG into the requested format. */
export function formatSvg(
  svg: string,
  format: BulkCopyFormat,
  item: LibraryItem,
): string {
  switch (format) {
    case 'jsx':
      return toJsx(svg);
    case 'vue':
      // Vue templates take the SVG as-is; the wrapper is what differs.
      return `<template>\n  ${svg}\n</template>`;
    case 'html':
      return `<img src="${dataUrl(svg)}" alt="${item.name}" width="24" height="24" />`;
    case 'css':
      // Mask rather than background-image, so the colour stays controllable.
      return `mask-image: url("${dataUrl(svg)}");\n-webkit-mask-image: url("${dataUrl(svg)}");`;
    case 'dataurl':
      return dataUrl(svg);
    case 'base64':
      return `data:image/svg+xml;base64,${toBase64(svg)}`;
    case 'svg':
    default:
      return svg;
  }
}

/** Joins multiple items' output into one clipboard payload. */
export function joinFormatted(parts: string[], format: BulkCopyFormat): string {
  // CSS declarations would collide if simply concatenated; the rest read fine
  // separated by blank lines.
  const separator = format === 'css' ? '\n\n' : '\n';
  return parts.join(separator);
}
