'use client';

import { useCallback } from 'react';
import { useToast } from '@/components/inspirations/Toast';
import { encodeFigmaCopy, type FigmaCopy } from '@/lib/figma/copy-code';

/** The icon the website's menus show beside "Copy to Figma". */
export const COPY_TO_FIGMA_ICON = '/ASSET/Icons/Motvin/copy-to-figma.svg';

/**
 * "Copy to Figma": puts a screen, a few screens or a flow on the clipboard as
 * a Motvin code (lib/figma/copy-code.ts), which the Figma plugin adds to the
 * canvas when the person presses ⌘V in it. Only ids are copied, so nothing is
 * downloaded or stored here, and no sign-in is asked for: the plugin asks
 * when it adds the screens.
 */
export function useCopyToFigma() {
  const { show } = useToast();
  return useCallback(
    async (copy: FigmaCopy) => {
      const what = copy.kind === 'flow' ? 'Flow' : copy.ids.length === 1 ? 'Screen' : `${copy.ids.length} screens`;
      try {
        await navigator.clipboard.writeText(encodeFigmaCopy(copy));
        show(`${what} copied — press ⌘V in the Motvin plugin in Figma`);
      } catch {
        show('Could not copy — try again', { tone: 'error' });
      }
    },
    [show],
  );
}
