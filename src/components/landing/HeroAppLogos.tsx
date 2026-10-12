'use client';

import { useCallback, useEffect, useState } from 'react';
import { inspirationsApi } from '@/lib/inspirations/api';

const SLOTS = 4;

/**
 * Logos of the apps in the library, which logo each slot shows, and a way to
 * move one slot on to its next logo. Slot n starts on logo n.
 */
export function useAppLogoPicks(): { logos: string[]; picks: number[]; next: (slot: number) => void } {
  const [logos, setLogos] = useState<string[]>([]);
  const [picks, setPicks] = useState<number[]>(() => Array.from({ length: SLOTS }, (_, i) => i));

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

  const next = useCallback(
    (slot: number) => {
      setPicks((prev) => {
        const count = logos.length;
        // Without a spare logo there is nothing new to show.
        if (count <= SLOTS) return prev;
        let pick = prev[slot];
        // Skip whatever the other slots are showing, so no app appears twice.
        do pick = (pick + 1) % count;
        while (prev.some((p, i) => i !== slot && p === pick));
        return prev.map((p, i) => (i === slot ? pick : p));
      });
    },
    [logos.length],
  );

  return { logos, picks, next };
}

/**
 * One app-icon spot beside the hero headline. Shows the design's icon until the
 * library logos arrive, then the slot's picked logo; clicking it pops in the
 * next one.
 */
export function HeroLogoSlot({
  className,
  fallback,
  slot,
  logos,
  picks,
  onNext,
}: {
  className: string;
  fallback: string;
  slot: number;
  logos: string[];
  picks: number[];
  onNext: (slot: number) => void;
}) {
  const current = logos.length ? picks[slot] : -1;

  return (
    <div className={`hero-float hero-float-app ${className}`} onClick={() => onNext(slot)}>
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
