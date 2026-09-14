'use client';

import { useEffect } from 'react';

/**
 * Side-effect-only component — sets the document title while the 404 page is
 * mounted. Mirrors motvin-ui/404.html's `<title>Error: Page Not Found</title>`.
 */
export function NotFoundChrome() {
  useEffect(() => {
    const previous = document.title;
    document.title = 'Error: Page Not Found';
    return () => {
      document.title = previous;
    };
  }, []);
  return null;
}
