'use client';

/**
 * Development only. When a page calls notFound() (every Inspirations 404:
 * an unknown address, a missing app or pattern), Next's dev server sends the
 * error shell and the browser re-renders the page; React's dev-only render
 * timing then replays the server's timestamps and throws "Failed to execute
 * 'measure' on 'Performance': '…' cannot have a negative time stamp", which
 * surfaces as a Runtime TypeError over a page that's otherwise fine.
 *
 * That timing exists only in development builds of React, so this guard
 * ignores exactly that one error there and lets everything else through.
 * Production is untouched (the 404s still answer 404).
 */
if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') {
  const flag = '__motvinMeasureGuard';
  const host = window as unknown as Record<string, unknown>;
  if (!host[flag] && typeof performance?.measure === 'function') {
    host[flag] = true;
    const measure = performance.measure.bind(performance);
    performance.measure = ((...args: Parameters<Performance['measure']>) => {
      try {
        return measure(...args);
      } catch (error) {
        if (error instanceof TypeError && /negative time stamp/i.test(error.message)) return undefined;
        throw error;
      }
    }) as Performance['measure'];
  }
}

/** Renders nothing; mounting it is what loads the guard above. */
export function DevPerformanceGuard() {
  return null;
}
