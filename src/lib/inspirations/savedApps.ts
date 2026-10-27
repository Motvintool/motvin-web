import { PLATFORMS, type Platform } from './types';

/**
 * The id an app is saved under. An app on one platform is saved by its own id; an app on several by
 * "<id>@<platform>" — Claude saved from its web page is Claude as a web app, with its own "Saved" state,
 * cover and link, apart from Claude saved from its iOS page.
 */
export function savedAppId(appId: string, platform: Platform | null | undefined, onSeveral: boolean): string {
  return onSeveral && platform ? `${appId}@${platform}` : appId;
}

/** What a saved app id names: the app, and the platform it was saved on (null for one saved by its id alone). */
export function readSavedAppId(id: string): { appId: string; platform: Platform | null } {
  const [appId, platform] = id.split('@');
  return { appId, platform: (PLATFORMS as readonly string[]).includes(platform) ? (platform as Platform) : null };
}

/**
 * The platforms a saved item is of, so a collection shows each section's own items (Apps: iOS; Webs: the
 * web). Screens, flows, UI elements and pattern screens carry it in their id ("<app>-<platform>-…"); an
 * app saved on a platform is of that one, an older save of an app on several is of each it is on. A
 * pattern saved from its page, or an icon, is of none in particular and shows in every section.
 */
export function itemPlatforms(item: { type: string; id: string }, appPlatforms: Map<string, readonly Platform[]>): Platform[] | 'any' {
  if (item.type === 'app') {
    const { appId, platform } = readSavedAppId(item.id);
    return platform ? [platform] : [...(appPlatforms.get(appId) ?? [])];
  }
  if (item.type === 'icon' || (item.type === 'pattern' && !item.id.includes(':'))) return 'any';
  const screenOrFlow = item.id.split(':')[0];
  const appId = [...appPlatforms.keys()].filter((id) => screenOrFlow.startsWith(`${id}-`)).sort((a, b) => b.length - a.length)[0];
  if (!appId) return 'any';
  const platform = screenOrFlow.slice(appId.length + 1).split('-')[0];
  return (PLATFORMS as readonly string[]).includes(platform) ? [platform as Platform] : 'any';
}

/** Whether a saved item belongs to the section being browsed. */
export const inSection = (item: { type: string; id: string }, section: readonly Platform[], appPlatforms: Map<string, readonly Platform[]>) => {
  const of = itemPlatforms(item, appPlatforms);
  return of === 'any' || of.some((platform) => section.includes(platform));
};
