'use client';

import { useEffect, useState } from 'react';

/**
 * The Explore page's heading: six short phrases take turns. Each is typed in letter by letter, every
 * letter coming out of a blur into focus, then held until the next phrase replaces it.
 * Screen readers get one steady heading instead of a changing one; with reduced motion on, it
 * stays on the first phrase.
 */
const PHRASES = ['Inspirations', 'Discover', 'Explore', 'Get inspired', 'Find ideas', 'Browse screens'];

/** Time each phrase is on screen, including the time it takes to type in (see .ins-rotor-char). */
const CYCLE_MS = 6500;

export function RotatingTitle() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % PHRASES.length), CYCLE_MS);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <span className="ins-rotor">
      <span className="ins-visually-hidden">Inspirations</span>
      <span key={index} className="ins-rotor-word" aria-hidden>
        {Array.from(PHRASES[index]).map((char, i) => (
          <span key={i} className="ins-rotor-char" style={{ ['--i' as string]: i }}>
            {char}
          </span>
        ))}
      </span>
    </span>
  );
}
