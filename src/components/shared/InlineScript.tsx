'use client';

import { useHydrated } from './useHydrated';

/**
 * A blocking inline `<script>` that lives only in the server's HTML, where it
 * runs before first paint. Once the page is hydrated it has done its work, so
 * it's dropped; and when the browser renders the page itself (Next's error
 * shell, e.g. a 404 in development) it isn't created at all — React won't run
 * a script it creates, and warns ("Encountered a script tag…") if asked to.
 */
export function InlineScript({ html }: { html: string }) {
  const hydrated = useHydrated();
  if (hydrated) return null;
  return <script dangerouslySetInnerHTML={{ __html: html }} />;
}
