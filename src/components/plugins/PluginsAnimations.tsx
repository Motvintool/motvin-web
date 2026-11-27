'use client';

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useEffect } from 'react';

/**
 * The /plugins hero's scroll, the same as the home page's (LandingAnimations,
 * group 1): the hero pins, its headline, line and button drift up as
 * they fade, the hero's bottom is cropped, and the Figma window rises with the
 * page and grows a touch, coming forward as it becomes the focus. The section
 * below arrives right under the window, with no gap.
 *
 * Wide windows only (as on the home page), and never under reduced motion; set
 * up through gsap.matchMedia so it turns on and off as the window is resized.
 * Renders nothing.
 */

const HERO_SCROLL_MIN_WIDTH = 1300;
// How far the page scrolls while the hero is pinned; the window rises by the same amount.
const HERO_SCROLL_DISTANCE = 360;
// The hero's bottom is cropped by a little less than that, so the window's lower edge
// and its shadow are never sliced off.
const HERO_CROP_ROOM = 16;

export function PluginsAnimations() {
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const mm = gsap.matchMedia();
    mm.add(`(min-width: ${HERO_SCROLL_MIN_WIDTH + 1}px) and (prefers-reduced-motion: no-preference)`, () => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: '.plg-hero',
          start: 'top top',
          end: `+=${HERO_SCROLL_DISTANCE}px`,
          pin: true,
          // No padding for the pin: the hero is cropped as it goes, so padding would leave a gap.
          pinSpacing: false,
          scrub: 1.5,
        },
      });

      tl.fromTo(
        '.plg-hero .plg-title-wrap, .plg-hero .mh-lead, .plg-hero .mh-actions',
        { opacity: 1, y: 0 },
        { opacity: 0, y: -50, duration: 0.5, ease: 'sine.inOut', immediateRender: false },
        0,
      )
        .fromTo(
          '.plg-hero',
          { clipPath: 'inset(0px 0px 0px 0px)' },
          { clipPath: `inset(0px 0px ${HERO_SCROLL_DISTANCE - HERO_CROP_ROOM}px 0px)`, duration: 0.5, ease: 'sine.inOut' },
          0.1,
        )
        .fromTo(
          '.plg-window',
          { scale: 1, y: 0, transformOrigin: '50% 100%' },
          { scale: 1.03, y: -HERO_SCROLL_DISTANCE, transformOrigin: '50% 100%', duration: 0.5, ease: 'sine.inOut' },
          0.1,
        );
    });
    return () => mm.revert();
  }, []);

  return null;
}
