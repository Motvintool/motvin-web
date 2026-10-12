'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { inspirationsApi } from '@/lib/inspirations/api';

const LOGO_MS = 2600;
const SLOTS = 4;

/** Logos of the apps in the library, and a counter that moves every slot on to its next logo. */
export function useAppLogoCycle(): { logos: string[]; step: number } {
  const [logos, setLogos] = useState<string[]>([]);
  const [step, setStep] = useState(0);

  useEffect(() => {
    let cancelled = false;
    inspirationsApi
      .listApps()
      .then((apps) => {
        const srcs = apps
          .map((app) => inspirationsApi.mediaUrl(app.logo))
          .filter((src): src is string => Boolean(src));
        // Fewer logos than slots would put the same app in two places at once.
        if (!cancelled && srcs.length >= SLOTS) setLogos(srcs);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (logos.length < SLOTS || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = setInterval(() => setStep((s) => s + 1), LOGO_MS);
    return () => clearInterval(timer);
  }, [logos.length]);

  return { logos, step };
}

/**
 * One app-icon spot beside the hero headline. Shows the design's icon until the
 * library logos arrive, then cross-fades through them. Every slot advances on
 * the same tick, offset by its own index, so no two slots ever show one app;
 * the per-slot delay only staggers the visible swap.
 */
export function HeroLogoSlot({
  className,
  fallback,
  slot,
  logos,
  step,
}: {
  className: string;
  fallback: string;
  slot: number;
  logos: string[];
  step: number;
}) {
  const current = logos.length ? (step + slot) % logos.length : -1;

  return (
    <div
      className={`hero-float hero-float-app ${className}`}
      style={{ '--hero-logo-delay': `${slot * 140}ms` } as CSSProperties}
    >
      <img alt="" className={`hero-logo${current < 0 ? ' is-active' : ''}`} src={fallback} draggable={false} />
      {logos.map((src, i) => (
        <img
          key={src}
          alt=""
          className={`hero-logo${i === current ? ' is-active' : ''}`}
          src={src}
          draggable={false}
        />
      ))}
    </div>
  );
}

