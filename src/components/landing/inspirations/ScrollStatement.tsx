'use client';

import { useEffect, useRef, useState } from 'react';

const LEAD = 'Motvin Inspirations is a library of real app design.';
const REST =
  'Browse screens, flows, patterns and UI elements from shipped products, search them by what they say, and save the ones that work into collections your team can reuse.';

/**
 * Jitter-style statement: the lead sentence is always dark, and the rest of
 * the paragraph darkens word by word as it scrolls up through the screen.
 */
export function ScrollStatement() {
  const ref = useRef<HTMLParagraphElement>(null);
  const words = REST.split(' ');
  const [lit, setLit] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      frame = requestAnimationFrame(() => setLit(words.length));
      return () => cancelAnimationFrame(frame);
    }
    const update = () => {
      frame = 0;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      // 0 when the paragraph's top reaches 85% down the screen, 1 when its bottom passes 40%.
      const progress = (vh * 0.85 - rect.top) / (rect.height + vh * 0.45);
      setLit(Math.round(Math.min(1, Math.max(0, progress)) * words.length));
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
  }, [words.length]);

  return (
    <section className="lpi-statement">
      <p className="lpi-statement-text" ref={ref}>
        <span className="is-lit">{LEAD}</span>{' '}
        {words.map((word, i) => (
          <span key={i} className={i < lit ? 'is-lit' : undefined}>
            {word}{' '}
          </span>
        ))}
      </p>
    </section>
  );
}
