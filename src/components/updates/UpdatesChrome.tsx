'use client';

import { useEffect } from 'react';

/**
 * Sets the document title, forces `data-theme="light"` on <html>, and adds
 * `updates-page` on <body>. Runs on mount and cleans up on unmount so a SPA
 * nav back to a themed page restores the visitor's preference.
 *
 * The parent `src/app/updates/layout.tsx` ships an inline pre-paint script
 * that installs the same attributes BEFORE hydration — that's what prevents
 * the dark-theme flash on a hard refresh. This effect re-installs on mount
 * so React StrictMode's double-invoke (dev-only) and SPA navigation both
 * still land on the correct state.
 */

type Props = { title: string };

const PREV_THEME_ATTR = 'data-updates-prev-theme';

export function UpdatesChrome({ title }: Props) {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = title;
    return () => {
      document.title = prevTitle;
    };
  }, [title]);

  useEffect(() => {
    const html = document.documentElement;
    // Only stash the visitor's previous theme once — repeat mounts (StrictMode
    // dev double-invoke, HMR) must not overwrite it with our own 'light'.
    if (!html.hasAttribute(PREV_THEME_ATTR)) {
      html.setAttribute(PREV_THEME_ATTR, html.getAttribute('data-theme') ?? '');
    }
    html.setAttribute('data-theme', 'light');
    document.body.classList.add('updates-page');
    return () => {
      const previous = html.getAttribute(PREV_THEME_ATTR);
      if (previous) html.setAttribute('data-theme', previous);
      else html.removeAttribute('data-theme');
      html.removeAttribute(PREV_THEME_ATTR);
      document.body.classList.remove('updates-page');
    };
  }, []);

  return null;
}
