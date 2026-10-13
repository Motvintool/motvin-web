'use client';

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useEffect } from 'react';

/**
 * The About page's scroll parallax. Layers move at their own speeds as the
 * page scrolls, for a sense of depth, like the landing page's (group 6 in
 * LandingAnimations):
 *
 *  - Hero: the headline and its line drift down and fade as you scroll
 *    away, the line a little more, so they part as they go.
 *  - Hero stage: the tool pills float at different depths, the phone a
 *    little slower and the clouds slowest.
 *  - Why Motvin: the second paragraph trails the first.
 *  - Founder card: the portrait, hello sticker, sparkles and dots float at
 *    different depths across the pastel panel.
 *  - What we make: the banner's fan of screens rises; the tiles rise in together.
 *  - What we believe: the middle card runs ahead of the outer two.
 *  - Say hello: the logos settle down into their row (the CSS in
 *    landing-inspirations.css turns --lpi-rise into their offsets).
 *
 * Everything moves on `transform`, which nothing on this page otherwise uses:
 * the entrance, bobs, tilts and hover moves are on the separate `translate`,
 * `rotate` and `scale` properties, so they all stack. Desktop only, tied to
 * the scroll so it plays both ways, and off under prefers-reduced-motion.
 */

// The parallax runs above this width, where the layouts have more than one column.
const PARALLAX_MIN_WIDTH = 901;

// How far each hero-stage layer travels over the stage's pass through the
// screen, in px either side of its resting place. Bigger is nearer.
const STAGE_DEPTH: [selector: string, travel: number][] = [
  ['.abt-cloud', 14],
  ['.abt-phone', 34],
  ['.abt-pill.is-a', 90],
  ['.abt-pill.is-b', 70],
  ['.abt-pill.is-c', 110],
  // Half behind a cloud; it drifts only a little, so it stays half hidden.
  ['.abt-pill.is-d', 24],
  ['.abt-pill.is-e', 80],
  ['.abt-pill.is-f', 120],
];

// How far each founder-card layer travels over the card's pass through the
// screen, in px either side of its resting place. Bigger is nearer.
const FOUNDER_DEPTH: [selector: string, travel: number][] = [
  ['.abt-founder-ring', 18],
  ['.abt-founder-hello', 42],
  ['.abt-founder-deco.is-spark-blue', 70],
  ['.abt-founder-deco.is-spark-green', 56],
  ['.abt-founder-dot.is-red', 90],
  ['.abt-founder-dot.is-purple', 64],
  ['.abt-founder-dot.is-green', 80],
];

export function AboutAnimations() {
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);

    const mm = gsap.matchMedia();
    mm.add(`(min-width: ${PARALLAX_MIN_WIDTH}px) and (prefers-reduced-motion: no-preference)`, () => {
      // Hero: the headline and its line drift down and fade as the stage
      // comes up over them.
      const heroScroll = { trigger: '.abt-hero', start: 'top top', end: () => `+=${window.innerHeight * 0.6}`, scrub: 0.6 };
      (
        [
          ['.abt-title', 50],
          ['.abt-lead', 80],
        ] as const
      ).forEach(([selector, y]) => {
        gsap.to(selector, { y, opacity: 0, ease: 'none', scrollTrigger: heroScroll });
      });

      // The stage: the pills float past at their own depths, the phone a
      // little slower, the clouds slowest, as the stage scrolls through.
      const stageScroll = { trigger: '.abt-stage', start: 'top bottom', end: 'bottom top', scrub: 0.6 };
      for (const [selector, travel] of STAGE_DEPTH) {
        gsap.fromTo(selector, { y: travel }, { y: -travel, ease: 'none', scrollTrigger: stageScroll });
      }

      // Why Motvin: the second paragraph trails the first.
      gsap.utils.toArray<HTMLElement>('.abt-story-copy p').forEach((p, i) => {
        const travel = 24 + i * 36;
        gsap.fromTo(
          p,
          { y: travel },
          { y: -travel, ease: 'none', scrollTrigger: { trigger: '.abt-story', start: 'top bottom', end: 'bottom top', scrub: 0.6 } },
        );
      });

      // Founder card: each layer floats past at its own depth.
      const founderScroll = { trigger: '.abt-founder-card', start: 'top bottom', end: 'bottom top', scrub: 0.6 };
      for (const [selector, travel] of FOUNDER_DEPTH) {
        gsap.fromTo(selector, { y: travel }, { y: -travel, ease: 'none', scrollTrigger: founderScroll });
      }

      // What we make: the banner's fan of screens rises out of its corner as
      // the banner scrolls up, and the tiles below rise in together, as one
      // even grid.
      gsap.fromTo(
        '.abt-featured-fan',
        { y: 70 },
        { y: -10, ease: 'none', scrollTrigger: { trigger: '.abt-featured', start: 'top bottom', end: 'bottom 30%', scrub: 0.6 } },
      );
      gsap.fromTo(
        '.abt-product-grid',
        { y: 50 },
        { y: 0, ease: 'none', scrollTrigger: { trigger: '.abt-product-grid', start: 'top bottom', end: 'top 60%', scrub: 0.6 } },
      );

      // What we believe: the middle card runs ahead of the outer two.
      gsap.utils.toArray<HTMLElement>('.abt-belief').forEach((belief, i) => {
        const travel = i === 1 ? 70 : 30;
        gsap.fromTo(
          belief,
          { y: travel },
          { y: -travel, ease: 'none', scrollTrigger: { trigger: '.abt-belief-grid', start: 'top bottom', end: 'bottom top', scrub: 0.6 } },
        );
      });

      // Say hello: the logos settle down into their row.
      gsap.fromTo(
        '.lpi-closing',
        { '--lpi-rise': 1 },
        {
          '--lpi-rise': 0,
          ease: 'none',
          scrollTrigger: { trigger: '.lpi-closing', start: 'top bottom', end: 'top 35%', scrub: 0.6 },
        },
      );
    });

    return () => mm.revert();
  }, []);

  return null;
}
