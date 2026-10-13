'use client';

import Link from 'next/link';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { inspirationsApi } from '@/lib/inspirations/api';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';

const COMMUNITY_URL = 'https://chat.whatsapp.com/JxLUrQpNpaXJ4ido6muIW6?s=cl&p=i&ilr=4';

/** The library's app logos, for the row above the headline. Empty until loaded. */
function useAppLogos(): string[] {
  const [logos, setLogos] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    inspirationsApi
      .listApps()
      .then((apps) => {
        if (cancelled) return;
        setLogos(
          apps
            .map((app) => inspirationsApi.mediaUrl(app.logo))
            .filter((src): src is string => Boolean(src))
            .slice(0, 7),
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return logos;
}

// How far either side of the pointer a logo still grows, in px.
const DOCK_REACH = 150;
// How far past the logos the pointer can stray and still magnify them, in px.
const DOCK_SLACK = 24;
// Share of the way each logo's size closes on its target every 60fps frame:
// small enough that the first grow and the let-go glide, big enough that it
// still keeps up with the pointer.
const DOCK_EASE = 0.14;

/** Per row: each logo's shown magnification, the one it is easing to, and the running frame. */
const dockState = new WeakMap<HTMLElement, { shown: number[]; target: number[]; frame: number }>();

/**
 * Eases every logo's --dock towards `target`, one frame at a time, and stops
 * once they all arrive. Frame-rate independent, so it feels the same at 120Hz.
 */
function easeDock(row: HTMLElement, target: number[]) {
  let state = dockState.get(row);
  if (!state) {
    state = { shown: target.map(() => 0), target, frame: 0 };
    dockState.set(row, state);
  }
  state.target = target;
  if (state.frame) return;

  const s = state;
  let last = performance.now();
  const step = (now: number) => {
    const k = 1 - Math.pow(1 - DOCK_EASE, (now - last) / (1000 / 60));
    last = now;
    let moving = false;
    s.shown = s.target.map((to, i) => {
      const next = (s.shown[i] ?? 0) + (to - (s.shown[i] ?? 0)) * k;
      if (Math.abs(to - next) < 0.002) return to;
      moving = true;
      return next;
    });
    row.querySelectorAll<HTMLElement>('img').forEach((logo, i) => {
      if (s.shown[i]) logo.style.setProperty('--dock', s.shown[i].toFixed(3));
      else logo.style.removeProperty('--dock');
    });
    s.frame = moving ? requestAnimationFrame(step) : 0;
  };
  s.frame = requestAnimationFrame(step);
}

function resetDock(row: HTMLElement) {
  easeDock(row, Array.from(row.querySelectorAll('img'), () => 0));
}

/**
 * Magnifies the logos like the macOS Dock: the one under the pointer grows
 * most and its neighbours less, fading out over DOCK_REACH.
 *
 * Bound to the whole section rather than the row: the logos bob, tilt and
 * ride in with the scroll, so the row's own box is a poor hover target and
 * gliding along the logos kept slipping out of it through the gaps. Instead
 * it magnifies whenever the pointer is level with the logos, wherever they
 * are just now (grown ones included, so it holds on like the Dock).
 * Distances are measured to where each logo sits at rest, not where it has
 * moved to, so the growth never feeds back on itself and jitters.
 */
function onDockMove(e: React.PointerEvent<HTMLElement>) {
  if (e.pointerType !== 'mouse' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const row = e.currentTarget.querySelector<HTMLElement>('.lpi-closing-logos');
  if (!row) return;
  const logos = Array.from(row.querySelectorAll<HTMLElement>('img'));
  if (!logos.length) return;

  const rects = logos.map((logo) => logo.getBoundingClientRect());
  const styles = getComputedStyle(row);
  const base = parseFloat(styles.getPropertyValue('--dock-base')) || 52;
  const gap = parseFloat(styles.columnGap) || 0;
  const rowRect = row.getBoundingClientRect();
  const restWidth = logos.length * base + (logos.length - 1) * gap;
  const restLeft = rowRect.left + rowRect.width / 2 - restWidth / 2;

  const level =
    e.clientY >= Math.min(...rects.map((r) => r.top)) - DOCK_SLACK &&
    e.clientY <= Math.max(...rects.map((r) => r.bottom)) + DOCK_SLACK;
  const alongside = e.clientX >= restLeft - DOCK_SLACK && e.clientX <= restLeft + restWidth + DOCK_SLACK;
  if (!level || !alongside) {
    resetDock(row);
    return;
  }

  easeDock(
    row,
    logos.map((_, i) => {
      const distance = Math.abs(e.clientX - (restLeft + i * (base + gap) + base / 2));
      return distance >= DOCK_REACH ? 0 : (1 + Math.cos((Math.PI * distance) / DOCK_REACH)) / 2;
    }),
  );
}

function onDockLeave(e: React.PointerEvent<HTMLElement>) {
  const row = e.currentTarget.querySelector<HTMLElement>('.lpi-closing-logos');
  if (row) resetDock(row);
}

export type CtaAction = { label: string; href: string };

/** A page link, an outside link (opens in a new tab), or a mail link. */
function ActionLink({ action, className, children }: { action: CtaAction; className: string; children?: ReactNode }) {
  const content = (
    <>
      {action.label}
      {children}
    </>
  );
  if (action.href.startsWith('/')) {
    return (
      <Link href={action.href} className={className}>
        {content}
      </Link>
    );
  }
  const outside = /^https?:\/\//.test(action.href);
  return (
    <a href={action.href} className={className} {...(outside ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
      {content}
    </a>
  );
}

/**
 * A calm, light call to action with the library's app logos bobbing above
 * it, magnifying like the macOS Dock on hover. The last thing on the landing page before the footer, and reused (with
 * its own words and buttons) to sign off other pages, such as About.
 */
export function ClosingCta({
  title = 'Find designs that work',
  text = 'Start from real apps instead of a blank canvas. It is free to explore.',
  primary = { label: 'Start exploring', href: INSPIRATIONS_ROUTES.explore },
  secondary = { label: 'Join Community', href: COMMUNITY_URL },
}: {
  title?: string;
  text?: string;
  primary?: CtaAction;
  secondary?: CtaAction;
}) {
  const logos = useAppLogos();

  return (
    <section className="lpi-closing" aria-labelledby="lpi-closing-title" onPointerMove={onDockMove} onPointerLeave={onDockLeave}>
      {logos.length ? (
        <div className="lpi-closing-logos" aria-hidden="true">
          {logos.map((src, i) => (
            <img src={src} alt="" width={52} height={52} key={src} style={{ '--i': i } as CSSProperties} />
          ))}
        </div>
      ) : null}
      <h2 className="lpi-closing-title" id="lpi-closing-title">
        {title}
      </h2>
      <p className="lpi-closing-text">{text}</p>
      <div className="lpi-closing-actions">
        <ActionLink action={primary} className="lpi-closing-primary" />
        <ActionLink action={secondary} className="lpi-closing-secondary">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14" />
            <path d="m13 6 6 6-6 6" />
          </svg>
        </ActionLink>
      </div>
    </section>
  );
}
