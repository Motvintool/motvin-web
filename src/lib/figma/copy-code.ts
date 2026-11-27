/**
 * "Copy to Figma": what motvin.com puts on the clipboard, and what the Figma
 * plugin ("Motvin — Inspiration", figma-plugin/) reads back when the person
 * presses ⌘V in it. One file for both, so the two never disagree.
 *
 * The code is plain text — only ids, nothing is stored anywhere — and always
 * one platform: iOS, Web Apps and Webs never mix.
 *
 *   motvin-figma:1:ios:screens:airbnb-ios-…-1,airbnb-ios-…-2
 *   motvin-figma:1:webapp:flow:claude-webapp-…-subscribing
 *
 * No imports: the plugin bundles this file as it is.
 */

export const FIGMA_PLATFORMS = ['ios', 'webapp', 'site'] as const;
export type FigmaPlatform = (typeof FIGMA_PLATFORMS)[number];

export type FigmaCopy = { platform: FigmaPlatform; kind: 'screens'; ids: string[] } | { platform: FigmaPlatform; kind: 'flow'; id: string };

const PREFIX = 'motvin-figma:1:';
/** The most screens one code carries; the plugin adds them in one go. */
export const MAX_COPY_SCREENS = 40;
/** Ids are slugs: letters, digits, dashes, dots, underscores and @ (an app's own flow). */
const ID = /^[\w.@-]{1,200}$/;

export function encodeFigmaCopy(copy: FigmaCopy): string {
  if (copy.kind === 'flow') return `${PREFIX}${copy.platform}:flow:${copy.id}`;
  return `${PREFIX}${copy.platform}:screens:${copy.ids.slice(0, MAX_COPY_SCREENS).join(',')}`;
}

/** The copy in pasted text, or null when it is not a Motvin code (or is damaged). */
export function decodeFigmaCopy(text: string): FigmaCopy | null {
  const line = text.trim();
  if (!line.startsWith(PREFIX)) return null;
  const [platform, kind, rest = ''] = line.slice(PREFIX.length).split(':');
  if (!(FIGMA_PLATFORMS as readonly string[]).includes(platform)) return null;
  const on = platform as FigmaPlatform;
  if (kind === 'flow') return ID.test(rest) ? { platform: on, kind: 'flow', id: rest } : null;
  if (kind === 'screens') {
    const ids = rest.split(',').filter((id) => ID.test(id)).slice(0, MAX_COPY_SCREENS);
    return ids.length ? { platform: on, kind: 'screens', ids } : null;
  }
  return null;
}
