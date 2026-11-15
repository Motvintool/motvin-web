'use client';

import Link from 'next/link';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { inspirationsApi } from '@/lib/inspirations/api';
import { isDesktopPlatform } from '@/lib/inspirations/types';
import { useAsync } from './useAsync';

/**
 * The library's two top-level tabs (Figma "Tabs", node 1311:15013): "Apps" — the iOS apps — and
 * "Webs", websites and web apps together. Shared by the header
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
        {appsOn && <TabMarks web={false} />}
      </Link>
      <Link href={webHref} scroll={scroll} className={`ins-apptab ${appsOn ? '' : 'is-active'}`} aria-current={appsOn ? undefined : 'page'}>
        Webs
        {!appsOn && <TabMarks web />}
      </Link>
    </nav>
  );
}

/** How long each pair of marks stays before the next two take their place. */
const MARKS_PERIOD_MS = 3200;

/**
 * Which pair is showing, from the wall clock: every copy of the tabs (the header's, and the docked toolbar's
 * that stands in for it) shows the same pair and turns together. Still for people who ask for reduced motion,
 * and when there's nothing to turn through.
 */
function useMarksStep(moving: boolean) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!moving || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let timer = 0;
    const tick = () => {
      const now = Date.now();
      setStep(Math.floor(now / MARKS_PERIOD_MS));
      timer = window.setTimeout(tick, MARKS_PERIOD_MS - (now % MARKS_PERIOD_MS) + 20);
    };
    tick();
    return () => window.clearTimeout(timer);
  }, [moving]);
  return step;
}

/** The static pair, until the library's own apps are known (and if it has none with a logo). */
const FALLBACK_MARKS = ['/ASSET/Images/Motvin/tab-apps-icon-a.webp', '/ASSET/Images/Motvin/tab-apps-icon-b.webp'];

/**
 * The two overlapping app marks (Figma "Container", node 1311:15279), shown on whichever tab is current: the
 * logos of the apps in that part of the library — iOS apps beside Apps, web apps and websites beside Webs —
 * a new pair every few seconds, each popping in as the last one leaves. A part with only one app shows one.
 */
function TabMarks({ web }: { web: boolean }) {
  const { data } = useAsync(() => inspirationsApi.listApps(), 'apps:all');
  const logos = useMemo(
    () =>
      (data ?? [])
        .filter((app) => (web ? app.platforms.some(isDesktopPlatform) : app.platforms.includes('ios')))
        .map((app) => ({ id: app.id, src: inspirationsApi.mediaUrl(app.logo) }))
        .filter((logo): logo is { id: string; src: string } => Boolean(logo.src)),
    [data, web],
  );
  const n = logos.length;
  const step = useMarksStep(n > 2);
  const pair = n <= 2 ? logos : [logos[(step * 2) % n], logos[(step * 2 + 1) % n]];

  // The next pair is fetched ahead, so it pops in drawn rather than blank.
  useEffect(() => {
    if (n <= 2) return;
    [logos[(step * 2 + 2) % n], logos[(step * 2 + 3) % n]].forEach((logo) => {
      new Image().src = logo.src;
    });
  }, [logos, n, step]);

  const marks = n > 0 ? pair : FALLBACK_MARKS.map((src) => ({ id: src, src }));
  return (
    <span className="ins-apptab-icons" aria-hidden>
      {marks.map((logo) => (
        // Keyed by the app, so a new one is a new element and plays its entrance.
        <span key={logo.id} className="ins-apptab-icon">
          <img src={logo.src} alt="" width={16} height={16} />
        </span>
      ))}
    </span>
  );
}
