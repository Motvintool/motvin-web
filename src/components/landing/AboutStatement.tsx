'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * The About page's story, set large and centred in a soft grey that darkens
 * word by word as it scrolls up the screen, across both paragraphs, like the
 * landing page's statement (ScrollStatement).
 */

const PARAGRAPHS = [
  'Designers spend a surprising share of their time looking for things: a reference for a checkout flow, the right icon, a logo in a usable format. Motvin was made to bring those things into one place.',
  'Look at how real products handle a moment, take a website apart into layers, and pick up the building blocks you need, so more of your time goes into the design itself.',
];

const WORDS = PARAGRAPHS.map((p) => p.split(' '));
const TOTAL_WORDS = WORDS.reduce((sum, words) => sum + words.length, 0);

export function AboutStatement() {
  const ref = useRef<HTMLDivElement>(null);
  const [lit, setLit] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      frame = requestAnimationFrame(() => setLit(TOTAL_WORDS));
      return () => cancelAnimationFrame(frame);
    }
    const update = () => {
      frame = 0;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      // 0 when the text's top reaches 85% down the screen, 1 when its bottom passes 45%.
      const progress = (vh * 0.85 - rect.top) / (rect.height + vh * 0.4);
      setLit(Math.round(Math.min(1, Math.max(0, progress)) * TOTAL_WORDS));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  let index = 0;
  return (
    <section className="abt-story" aria-label="Why Motvin">
      <div className="abt-story-copy" ref={ref}>
        {WORDS.map((words, p) => (
          <p key={p}>
            {words.map((word) => {
              const i = index++;
              return (
                <span key={i} className={i < lit ? 'is-lit' : undefined}>
                  {word}{' '}
                </span>
              );
            })}
          </p>
        ))}
      </div>
    </section>
  );
}
