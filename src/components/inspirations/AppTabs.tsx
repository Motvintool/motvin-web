'use client';

import Link from 'next/link';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * The library's two top-level tabs (Figma "Tabs", node 1311:15013): "Apps" — iOS apps and Web Apps,
 * with the toolbar's switch choosing between them — and "Webs", the websites. Shared by the header
 * and by the toolbar when it docks over the header, so the two always read the same.
 */
export function AppTabs({
  appsOn,
  appsHref,
  webHref,
  scroll,
}: {
  appsOn: boolean;
  appsHref: string;
  webHref: string;
  /** Pass false to keep the scroll position when switching (the docked toolbar does). */
  scroll?: boolean;
}) {
  const navRef = useRef<HTMLElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const lastLeft = useRef<number | null>(null);
  // The short underline is one element that travels to the current tab, rather than each tab drawing its own.
  const [barLeft, setBarLeft] = useState<number | null>(null);

  useLayoutEffect(() => {
    const place = () => {
      const current = navRef.current?.querySelector<HTMLElement>('.ins-apptab.is-active');
      setBarLeft(current ? current.offsetLeft : null);
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [appsOn]);

  // Jelly: the underline stretches out across the gap, then eases into the new tab with one soft settle. The first placement just appears; nothing moves for people who ask for reduced motion.
  useEffect(() => {
    const el = barRef.current;
    const from = lastLeft.current;
    lastLeft.current = barLeft;
    if (!el || barLeft === null || from === null || from === barLeft) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || typeof el.animate !== 'function') return;
    const BAR = 15;
    const left = Math.min(from, barLeft);
    const span = Math.abs(barLeft - from) + BAR;
    const at = (x: number, w: number, sx: number, sy: number) => ({ transform: `translateX(${x}px) scale(${sx}, ${sy})`, width: `${w}px` });
    // Two long, eased legs and one soft settle, so it reads as a single flowing motion.
    el.animate(
      [
        { ...at(from, BAR, 1, 1), offset: 0, easing: 'cubic-bezier(0.5, 0, 0.2, 1)' },
        { ...at(left, span, 1, 0.8), offset: 0.45, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
        { ...at(barLeft, BAR, 0.97, 1.2), offset: 0.85, easing: 'ease-in-out' },
        { ...at(barLeft, BAR, 1, 1), offset: 1 },
      ],
      { duration: 620 },
    );
  }, [barLeft]);

  return (
    <nav ref={navRef} className="ins-apptabs" aria-label="Library">
      {barLeft !== null && <span ref={barRef} className="ins-apptabs-bar" style={{ transform: `translateX(${barLeft}px)` }} aria-hidden />}
      <Link href={appsHref} scroll={scroll} className={`ins-apptab ${appsOn ? 'is-active' : ''}`} aria-current={appsOn ? 'page' : undefined}>
        Apps
        {appsOn && <TabMarks />}
      </Link>
      <Link href={webHref} scroll={scroll} className={`ins-apptab ${appsOn ? '' : 'is-active'}`} aria-current={appsOn ? undefined : 'page'}>
        Webs
        {!appsOn && <TabMarks />}
      </Link>
    </nav>
  );
}

/** The two overlapping app marks (Figma "Container", node 1311:15279), shown on whichever tab is current. */
function TabMarks() {
  return (
    <span className="ins-apptab-icons" aria-hidden>
      <span className="ins-apptab-icon">
        <img src="/ASSET/Images/Motvin/tab-apps-icon-a.webp" alt="" width={16} height={16} />
      </span>
      <span className="ins-apptab-icon">
        <img src="/ASSET/Images/Motvin/tab-apps-icon-b.webp" alt="" width={16} height={16} />
      </span>
    </span>
  );
}
