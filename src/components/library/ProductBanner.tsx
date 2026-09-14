'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/shared/AuthProvider';

/**
 * Beta announcement bar above the app shell — port of
 * motvin-ui/COMPONENT/Banner.js.
 *
 * The markup is `display:none` in the stylesheet until `body` carries
 * `.mi-has-product-banner`, and the shell's offset comes from the
 * `--mi-product-banner-height` custom property. Both are set here.
 *
 * Visible only to signed-out visitors, and it retracts when the grid is
 * scrolled down — restoring on the way back up.
 */

export const BANNER_COPY =
  'Motvin v1 beta is here, explore 345K+ icons, 10.5K logos and 1K+ illustrations in one powerful library.';

/** Scroll distance before a downward scroll counts as "away from the top". */
const SCROLL_THRESHOLD = 8;

export function ProductBanner() {
  const { user } = useAuth();
  const bannerRef = useRef<HTMLElement>(null);
  const [hiddenByScroll, setHiddenByScroll] = useState(false);

  const isAuthenticated = Boolean(user && !user.isAnonymous);
  const hidden = isAuthenticated || hiddenByScroll;

  // Reveal the banner and publish its height for the shell's offset.
  useEffect(() => {
    const banner = bannerRef.current;
    if (!banner) return;

    document.body.classList.add('mi-has-product-banner');
    const updateHeight = () =>
      document.body.style.setProperty(
        '--mi-product-banner-height',
        `${banner.offsetHeight}px`,
      );
    updateHeight();

    const observer = new ResizeObserver(updateHeight);
    observer.observe(banner);
    return () => {
      observer.disconnect();
      document.body.classList.remove('mi-has-product-banner');
      document.body.style.removeProperty('--mi-product-banner-height');
    };
  }, []);

  useEffect(() => {
    document.body.classList.toggle('mi-product-banner-hidden', hidden);
  }, [hidden]);

  // Signing out should bring the banner back even if it was scrolled away.
  // Adjusting during render rather than in an effect keeps it to one pass.
  const [wasAuthenticated, setWasAuthenticated] = useState(isAuthenticated);
  if (wasAuthenticated !== isAuthenticated) {
    setWasAuthenticated(isAuthenticated);
    if (!isAuthenticated && hiddenByScroll) setHiddenByScroll(false);
  }

  useEffect(() => {
    const main = document.querySelector('.mi-main');
    if (!main) return;

    let previousScrollTop = main.scrollTop;
    let framePending = false;
    // Reloading a scrolled page makes the browser restore scroll position after
    // mount, which arrives as a scroll event with no user behind it. Reading
    // that as a downward scroll would hide the banner on load.
    let hasUserScrolled = false;

    const markUserScroll = () => {
      hasUserScrolled = true;
    };
    const inputEvents = ['wheel', 'touchmove', 'keydown', 'pointerdown'] as const;
    for (const type of inputEvents) {
      main.addEventListener(type, markUserScroll, { passive: true });
    }

    const onScroll = () => {
      if (framePending) return;
      framePending = true;
      window.requestAnimationFrame(() => {
        const scrollTop = main.scrollTop;
        if (!hasUserScrolled) {
          // Scroll restoration: take it as the new baseline, nothing more.
          previousScrollTop = scrollTop;
          framePending = false;
          return;
        }
        const scrollingDown = scrollTop > previousScrollTop;
        const scrollingUp = scrollTop < previousScrollTop;

        setHiddenByScroll((current) => {
          if (!current && scrollingDown && scrollTop > SCROLL_THRESHOLD) return true;
          if (current && (scrollingUp || scrollTop <= SCROLL_THRESHOLD)) return false;
          return current;
        });

        previousScrollTop = scrollTop;
        framePending = false;
      });
    };

    main.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      main.removeEventListener('scroll', onScroll);
      for (const type of inputEvents) main.removeEventListener(type, markUserScroll);
    };
  }, []);

  const loginRef = useRef<HTMLAnchorElement>(null);
  // Set the login href with the current path baked in on mount so the DOM
  // matches reference (which server-side-renders the ?next= parameter). The
  // click handler still updates it in case the user navigated around before
  // clicking — belt-and-braces.
  useEffect(() => {
    if (!loginRef.current) return;
    const { pathname, search, hash } = window.location;
    loginRef.current.href = `/login?next=${encodeURIComponent(`${pathname}${search}${hash}`)}`;
  }, []);

  return (
    <section
      id="mi-product-banner"
      className={`mi-product-banner${hidden ? ' is-hidden' : ''}`}
      aria-label="Motvin beta announcement"
      ref={bannerRef}
    >
      <p>{BANNER_COPY}</p>
      {/* /login is not a route in this app — it is still served by the static
          site, so this has to be a real navigation rather than next/link. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a
        ref={loginRef}
        href="/login"
        onClick={(e) => {
          const { pathname, search, hash } = window.location;
          e.currentTarget.href = `/login?next=${encodeURIComponent(`${pathname}${search}${hash}`)}`;
        }}
      >
        Login &rarr;
      </a>
    </section>
  );
}

/**
 * Runs before first paint, from the document head.
 *
 * The banner mounts after hydration and shifts the app shell down by its
 * height. Deciding here whether that space is needed means the header renders
 * in its final position instead of jumping once the banner appears. Reads the
 * auth snapshot rather than waiting for Firebase, which resolves too late.
 */
export const BANNER_RESERVE_SCRIPT = `
(function(){
  try {
    var raw = localStorage.getItem('motvin-auth-snapshot-v1');
    var snapshot = raw ? JSON.parse(raw) : null;
    var signedIn = Boolean(snapshot && snapshot.uid && !snapshot.isAnonymous);
    if (!signedIn) document.documentElement.classList.add('mi-banner-reserved');
  } catch (e) {
    document.documentElement.classList.add('mi-banner-reserved');
  }
})();
`.trim();
