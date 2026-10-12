'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { LandingApp } from './useLandingLibrary';

const SLOTS = 5;
const SWAP_MS = 2800;

function StripApp({ app, className, style, hidden }: { app: LandingApp; className: string; style: CSSProperties; hidden?: boolean }) {
  return (
    <Link
      href={app.href}
      className={`lpi-strip-app ${className}`}
      style={style}
      tabIndex={hidden ? -1 : undefined}
      aria-hidden={hidden || undefined}
    >
      <img src={app.logo!} alt="" width={32} height={32} />
      <span>{app.name}</span>
    </Link>
  );
}

/**
 * Quiet row of the library's own apps under the hero. It names the apps whose
 * screens are in Motvin, not companies that use it, so it never claims an
 * endorsement the library doesn't have.
 *
 * Every few seconds each slot swaps to another app, one slot after the other,
 * the way Jitter's client row does. With more apps than slots it walks through
 * all of them; with fewer, the same apps trade places.
 */
export function AppLogoStrip({ apps }: { apps: LandingApp[] }) {
  const withLogo = apps.filter((app) => app.logo);
  const slots = Math.min(SLOTS, withLogo.length);
  const rootRef = useRef<HTMLElement>(null);
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const canSwap = withLogo.length > 1 && slots > 0;
  useEffect(() => {
    if (!visible || !canSwap) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => setStep((s) => s + 1), SWAP_MS);
    return () => window.clearInterval(timer);
  }, [visible, canSwap]);

  // Move a whole row along when there are enough apps; otherwise shift by
  // about half, so every slot still lands on a different app.
  const n = withLogo.length;
  const shift = n > slots ? slots : Math.max(1, Math.floor(n / 2));
  const appAt = (slot: number, s: number) => withLogo[(slot + s * shift) % n];

  return (
    <section ref={rootRef} className="lpi-strip" aria-label="Apps in Motvin Inspirations">
      <p className="lpi-strip-label">Real screens from the apps you use every day</p>
      {slots ? (
        <div className="lpi-strip-row">
          {Array.from({ length: slots }, (_, i) => {
            const style = { '--lpi-slot': i } as CSSProperties;
            const current = appAt(i, step);
            const previous = step > 0 ? appAt(i, step - 1) : null;
            return (
              <div className="lpi-strip-slot" key={i}>
                {withLogo.map((app) => (
                  <span className="lpi-strip-app lpi-strip-sizer" aria-hidden="true" key={app.id}>
                    <img src={app.logo!} alt="" width={32} height={32} />
                    <span>{app.name}</span>
                  </span>
                ))}
                {/* Keyed by step, so both play their animation again on every swap. */}
                {previous ? <StripApp app={previous} className="is-leaving" style={style} hidden key={`out-${step}`} /> : null}
                <StripApp app={current} className={step > 0 ? 'is-entering' : ''} style={style} key={`in-${step}`} />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="lpi-strip-row is-loading">
          {Array.from({ length: 6 }, (_, i) => (
            <span className="lpi-strip-app is-placeholder" key={i} />
          ))}
        </div>
      )}
    </section>
  );
}
