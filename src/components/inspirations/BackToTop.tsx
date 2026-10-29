'use client';

import { useEffect, useState } from 'react';
import { DEFAULT_PLATFORM } from '@/lib/inspirations/filters';
import type { Platform } from '@/lib/inspirations/types';
import { ArrowUpIcon, PlusIcon } from './Icons';
import { RequestAppModal } from './RequestAppModal';

const PLATFORMS: readonly Platform[] = ['ios', 'webapp', 'web'];

/** The section being browsed (the URL's first platform), so a request starts on it. */
function browsedPlatform(): Platform {
  const first = new URLSearchParams(window.location.search).get('platform')?.split(',')[0];
  return PLATFORMS.find((p) => p === first) ?? DEFAULT_PLATFORM;
}

/** How close to the end of the page the button shows. */
const NEAR_END_PX = 240;

/**
 * Once the visitor reaches the end of a long page, two pills at the foot of the window, centred: "Scroll to
 * top" takes them back to the top in one smooth scroll (straight there with reduced motion), and "Request an
 * app" opens the Request-an-app popup on the section being browsed — the end of a list is where a missing app
 * is noticed. Hidden, they're out of the tab order too.
 */
export function BackToTop() {
  const [shown, setShown] = useState(false);
  const [requesting, setRequesting] = useState<Platform | null>(null);
  useEffect(() => {
    let frame = 0;
    const check = () => {
      frame = 0;
      const root = document.documentElement;
      // Only once the page has been scrolled a fair way; a page that barely scrolls is already at its top.
      const travelled = window.scrollY > window.innerHeight / 2;
      setShown(travelled && window.scrollY + window.innerHeight >= root.scrollHeight - NEAR_END_PX);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };
    // Also where the page starts — Back can bring the visitor straight to the end.
    schedule();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    // The end moves without a scroll, too: more results load in, off-screen rows take their real height
    // once rendered (content-visibility), pictures land. A page that changes height is measured again.
    const grow = new ResizeObserver(schedule);
    grow.observe(document.documentElement);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      grow.disconnect();
    };
  }, []);

  return (
    <>
      <div className={`ins-end-actions ${shown ? 'is-shown' : ''}`} inert={!shown}>
        <button
          type="button"
          className="ins-back-to-top"
          onClick={(e) => {
            const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            window.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' });
            // It hides on the way up; the focus shouldn't stay on a button that's gone.
            e.currentTarget.blur();
          }}
        >
          {/* A wrapper, so the arrow can nudge up on hover: theme.css keeps svgs from transitioning. */}
          <span className="ins-back-to-top-arrow" aria-hidden>
            <ArrowUpIcon size={20} strokeWidth={2.2} />
          </span>
          Scroll to top
        </button>
        <button
          type="button"
          className="ins-back-to-top is-icon"
          onClick={() => setRequesting(browsedPlatform())}
          aria-label="Request an app"
        >
          <span className="ins-back-to-top-arrow" aria-hidden>
            <PlusIcon size={20} strokeWidth={2.2} />
          </span>
          <span className="ins-end-tip" aria-hidden>
            Request an app
          </span>
        </button>
      </div>
      {requesting && <RequestAppModal initialName="" initialPlatform={requesting} onClose={() => setRequesting(null)} />}
    </>
  );
}
