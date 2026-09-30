import { inspirationsApi } from '@/lib/inspirations/api';
import { adminScreenImagePath, type AdminScreenFile } from '@/lib/inspirations/admin';
import { SCREEN_TYPE_LABEL } from '@/lib/inspirations/taxonomy';
import type { ScreenType } from '@/lib/inspirations/types';

/**
 * How a stored screen file is named and pictured in the admin tabs — shared
 * by the flow builder, the per-app version manager and the card-carousel
 * picker so a screen reads the same wherever an admin meets it.
 */

/** The sidecar's name, else its type, else the bare file name. */
export function screenLabel(file: AdminScreenFile): string {
  const sidecar = file.sidecar ?? {};
  if (sidecar.name) return sidecar.name;
  if (sidecar.screenType) return SCREEN_TYPE_LABEL[sidecar.screenType as ScreenType] ?? sidecar.screenType;
  return file.file.replace(/\.[^.]+$/, '');
}

/** The thumbnail URL, or null for a file the public API does not serve yet. */
export function thumbUrl(file: AdminScreenFile): string | null {
  if (!file.published) return null;
  return inspirationsApi.mediaUrl(adminScreenImagePath(file));
}
