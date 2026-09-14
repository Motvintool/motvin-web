'use client';

import { useEffect, useRef, useState } from 'react';
import { IlFloatingLogos } from './IlFloatingLogos';

/**
 * Tall sticky "world's largest library" section — port of
 * #icons-library-section in motvin-ui/index.html and its scroll handler in
 * JS/index.js.
 *
 * Scroll progress through the section drives three things: the floating logos
 * throw in once the section is 70% up the viewport; the three headline counts
 * reveal cumulatively at 5% / 33% / 66%; and while the section is pinned
 * (0 < progress < 1) the sticky header hides and the section's borders drop.
 *
 * Not ported: the `.il-badge` toggle from the original handler — no such
 * element exists in the markup. The `exited` class is likewise dropped; the
 * original removed it but never added it.
 */

const PHASE_THRESHOLDS = [0.05, 0.33, 0.66];
const THROW_IN_VIEWPORT_FRACTION = 0.7;

export function IconsLibrary() {
  const sectionRef = useRef<HTMLElement>(null);
  const [thrown, setThrown] = useState(false);
  const [activeTitles, setActiveTitles] = useState(0);
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const onScroll = () => {
      const rect = section.getBoundingClientRect();
      const windowHeight = window.innerHeight;

      if (rect.top <= windowHeight * THROW_IN_VIEWPORT_FRACTION) {
        setThrown(true);
      }

      const scrollDistance = rect.height - windowHeight;
      const rawProgress = -rect.top / scrollDistance;

      setPinned(rawProgress > 0 && rawProgress < 1);

      const progress = Math.max(0, Math.min(1, rawProgress));
      setActiveTitles(PHASE_THRESHOLDS.filter((t) => progress >= t).length);
    };

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // The sticky header lives in Navbar, outside this subtree. The original
  // toggled it from this same handler; keep that coupling rather than lifting
  // scroll state into a shared provider for one class.
  useEffect(() => {
    const header = document.querySelector('.sticky-header');
    header?.classList.toggle('hidden', pinned);
    return () => header?.classList.remove('hidden');
  }, [pinned]);

  const noBorder = pinned ? ' no-border' : '';

  return (
    <section className="icons-library-section" id="icons-library-section" ref={sectionRef}>
      <div className={`il-sticky-wrapper${noBorder}`}>
        <div className={`il-container${noBorder}`}>
          <IlFloatingLogos thrown={thrown} />
          <div className="il-text-content">
            <p className="il-subtitle">A world largest motvin library</p>
            <div className="il-titles">
              {['3,50,000 Icons', '10,000+ Logos', '2,000+ Illustrations'].map((title, index) => (
                <h2 key={title} className={`il-title${index < activeTitles ? ' active' : ''}`}>
                  {title}
                </h2>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
