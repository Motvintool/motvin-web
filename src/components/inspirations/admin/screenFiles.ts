import { inspirationsApi } from '@/lib/inspirations/api';
import { adminScreenImagePath, type AdminScreenFile } from '@/lib/inspirations/admin';
import { screenTitle } from '@/lib/inspirations/screenNaming';

/**
 * How a stored screen file is named and pictured in the admin tabs — shared
 * by the flow builder, the per-app version manager and the card-carousel
 * picker so a screen reads the same wherever an admin meets it.
 */

/** The library's one naming rule (see screenNaming), else the bare file name. */
export function screenLabel(file: AdminScreenFile): string {
  const sidecar = file.sidecar ?? {};
  if (sidecar.name || sidecar.screenType) return screenTitle({ name: sidecar.name, screenType: sidecar.screenType });
  return file.file.replace(/^versions\/[^/]+\//, '').replace(/\.[^.]+$/, '');
}

/** The thumbnail URL, or null for a file the public API does not serve yet. */
export function thumbUrl(file: AdminScreenFile): string | null {
  if (!file.published) return null;
  return inspirationsApi.mediaUrl(adminScreenImagePath(file));
}
