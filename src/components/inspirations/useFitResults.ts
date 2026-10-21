import { useEffect, useRef } from 'react';

/** A scroll this small is "the very top": a change made there moves nothing. */
const TOP_ZONE_PX = 24;
/** After a change, the first results settle this far under the docked bar (within the dock's hold). */
const FIT_GAP_PX = 16;
/** How long the fit keeps waiting for the new results to make the page tall enough — long enough for a panel
 *  that fetches its content (an app's Patterns tab) to land; only a change in the results actually moves. */
const FIT_WAIT_MS = 2500;
/** The layout is read this often while waiting… */
const POLL_MS = 100;
/** …and counts as settled once the results' position and the page's height have held for this many reads: a
 *  loading state can give way to results that start somewhere else, so the fit measures after the last such
 *  change. Pictures loading into fixed boxes, and more pages loading in below, don't move it, so they don't
 *  hold it up. */
const STABLE_READS = 2;

type Prepared = { shrink: number; commit: () => void };

/** Where the bar at the top ends: the header, or a row docked in it that hangs lower (a phone's tab row
 *  wraps onto a second line below the header). */
function barBottom() {
  const header = document.querySelector<HTMLElement>('.ins-header');
  const row = header?.querySelector<HTMLElement>('.is-docked:not(.is-leaving)');
  return Math.max(header?.offsetHeight ?? 0, row ? Math.round(row.getBoundingClientRect().bottom) : 0);
}

/**
 * A filter, sort, tab or search changed while the page was scrolled into the results: the list changes
 * length under the visitor, which could leave them in blank space or mid-list. Once the new results are in,
 * bring them to the fitted view — the toolbar docked in the header, the first results a little below it —
 * smoothly. The results arrive after the key changes, so the fit waits for the results' layout to settle,
 * and leaves a page too short to scroll that far alone. A change made at the very top moves nothing.
 *
 * `root` is what to watch for the results' arrival and where to find them (`gridSelector`). `prepare` lets a
 * page that will change height when fitted (Explore's heading folds) say by how much (`shrink`) and make that
 * change (`commit`) only once the fit is going ahead. `onOwnScroll` is told right before the page scrolls
 * itself, so scroll handlers can tell it from the visitor's.
 */
export function useFitResults(
  key: string,
  root: () => HTMLElement | null,
  gridSelector: string,
  options: { prepare?: () => Prepared; onOwnScroll?: () => void } = {},
) {
  const lastKey = useRef(key);
  // The latest callbacks, read by the effect below without being among its dependencies: a change of key is
  // what starts a fit, not a new callback identity. Kept in an effect declared first, so it has run by then.
  const latest = useRef({ root, gridSelector, options });
  useEffect(() => {
    latest.current = { root, gridSelector, options };
  });

  useEffect(() => {
    if (lastKey.current === key) return;
    lastKey.current = key;
    const { root, gridSelector, options } = latest.current;
    const el = root();
    if (!el || window.scrollY <= TOP_ZONE_PX) return;
    let done = false;
    let cancelRecheck = () => {};
    const inputs = ['wheel', 'touchstart', 'keydown'] as const;
    const stop = () => {
      done = true;
      window.clearInterval(poll);
      window.clearTimeout(timer);
      inputs.forEach((type) => window.removeEventListener(type, stop));
    };
    const measure = () => {
      const grid = el.querySelector<HTMLElement>(gridSelector);
      if (!grid) return null;
      const prepared = options.prepare?.();
      const shrink = prepared?.shrink ?? 0;
      const line = barBottom() + FIT_GAP_PX;
      const target = Math.round(grid.getBoundingClientRect().top + window.scrollY - shrink - line);
      const reachable = document.documentElement.scrollHeight - shrink - window.innerHeight >= target - 1;
      // Settledness is judged by where the results start, not the page's height: more pages loading in below
      // (infinite scroll) lengthen the page without moving the results' top, and shouldn't hold the fit up.
      return { target, reachable, prepared, signature: String(target) };
    };
    const fit = () => {
      if (done) return;
      const m = measure();
      // Too short to reach from here (a skeleton, or fewer results): left for the next read.
      if (!m || !m.reachable) return;
      stop();
      m.prepared?.commit();
      if (Math.abs(window.scrollY - m.target) <= 1) return;
      const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      options.onOwnScroll?.();
      window.scrollTo({ top: m.target, behavior: smooth ? 'smooth' : 'auto' });
      // The bar can change on the way: a row that docks as the page arrives may hang lower than the header did
      // when this was measured. Once the scroll has landed, the fit is checked once more.
      let fallback = 0;
      const recheck = () => {
        cancelRecheck();
        const again = measure();
        if (!again || !again.reachable || Math.abs(window.scrollY - again.target) <= 2) return;
        options.onOwnScroll?.();
        window.scrollTo({ top: again.target, behavior: smooth ? 'smooth' : 'auto' });
      };
      cancelRecheck = () => {
        window.removeEventListener('scrollend', recheck);
        window.clearTimeout(fallback);
        inputs.forEach((type) => window.removeEventListener(type, cancelRecheck));
      };
      window.addEventListener('scrollend', recheck);
      fallback = window.setTimeout(recheck, 1200);
      inputs.forEach((type) => window.addEventListener(type, cancelRecheck, { passive: true }));
    };
    // The results are watched by their layout: once their position and the page's height have held still
    // for a moment, they're in. Anything the visitor does first — a scroll, a key — calls it off.
    let last = '';
    let stable = 0;
    const poll = window.setInterval(() => {
      if (done) return;
      const m = measure();
      const signature = m?.signature ?? '';
      if (signature === last) stable += 1;
      else {
        stable = 0;
        last = signature;
      }
      if (m && stable >= STABLE_READS) fit();
    }, POLL_MS);
    const timer = window.setTimeout(() => {
      fit();
      stop();
    }, FIT_WAIT_MS);
    inputs.forEach((type) => window.addEventListener(type, stop, { passive: true }));
    return () => {
      stop();
      cancelRecheck();
    };
  }, [key]);
}
