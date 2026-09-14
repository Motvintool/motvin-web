'use client';

import Script from 'next/script';

/**
 * Loads motvin-ui's tooltip controller — port of the tooltip.js include in
 * icons.html.
 *
 * The controller is stateless from React's point of view: it appends a
 * `<div class="motvin-tooltip">` to the body once, then binds hover handlers
 * to any element carrying `data-tooltip`. Copied verbatim into
 * public/vendor/motvin-tooltip.js so its behaviour and DOM output match the
 * legacy site exactly.
 *
 * Loaded with `strategy="afterInteractive"` so the DOM is up before it scans.
 * The module also exposes `window.MotvinTooltip.refresh()` for reacting to
 * later mutations, which components can call if they need it.
 */
export function TooltipRuntime() {
  return <Script src="/vendor/motvin-tooltip.js" strategy="afterInteractive" />;
}
