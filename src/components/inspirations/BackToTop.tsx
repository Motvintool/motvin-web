'use client';

import { useEffect, useState } from 'react';
import { ArrowUpIcon } from './Icons';

/** How close to the end of the page the button shows. */
const NEAR_END_PX = 240;

/**
 * Once the visitor reaches the end of a long page, a "Scroll to top" pill at the foot of the window, centred,
 * takes them back to the top in one smooth scroll (straight there with reduced motion). Hidden, it's out of
 * the tab order too.
 */
export function BackToTop() {
  const [shown, setShown] = useState(false);
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
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, []);

  return (
    <button
      type="button"
      className={`ins-back-to-top ${shown ? 'is-shown' : ''}`}
      inert={!shown}
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
  );
}
