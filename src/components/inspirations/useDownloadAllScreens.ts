import { useCallback, useState } from 'react';
import { inspirationsApi } from '@/lib/inspirations/api';
import { downloadFiles, type ZipFile } from '@/lib/export/zip';
import type { App, Screen } from '@/lib/inspirations/types';
import { useToast } from './Toast';

/**
 * Bundles every downloadable screen of an app into one zip. Honours the same
 * rule the API does: a screen whose app is recorded view-only is never handed
 * over, so `count` (and the toast) is what is actually downloadable, not what
 * was asked for. Shared by the masthead's Download button and the "…" menu so
 * both stay in step and cannot run two downloads at once.
 */
export function useDownloadAllScreens(app: App, screens: Screen[]) {
  const { show } = useToast();
  const [busy, setBusy] = useState(false);
  const downloadable = screens.filter((s) => s.downloadable);

  const downloadAll = useCallback(async () => {
    if (busy) return;
    if (!downloadable.length) {
      show('These screens are view-only under their recorded licence');
      return;
    }

    setBusy(true);
    show(`Preparing ${downloadable.length} screen${downloadable.length === 1 ? '' : 's'}…`);
    try {
      const files: ZipFile[] = [];
      for (const screen of downloadable) {
        const url = inspirationsApi.mediaUrl(screen.url);
        if (!url) continue;
        const res = await fetch(url);
        if (!res.ok) continue;
        // The stored path already encodes flow and position, so a flow's
        // screens stay in order and together inside the archive.
        files.push({
          name: screen.file.replace(/^[a-z]+\//, ''),
          data: new Uint8Array(await res.arrayBuffer()),
          type: 'image/png',
        });
      }
      if (!files.length) {
        show('None of the screens could be fetched');
        return;
      }
      const count = downloadFiles(files, `${app.slug}-screens.zip`);
      show(`Downloaded ${count} screen${count === 1 ? '' : 's'}`);
    } catch (error) {
      show((error as Error).message || 'Download failed');
    } finally {
      setBusy(false);
    }
  }, [app.slug, busy, downloadable, show]);

  return { downloadAll, busy, count: downloadable.length };
}
