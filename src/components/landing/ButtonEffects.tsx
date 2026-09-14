'use client';

import { useEffect } from 'react';

/**
 * Liquid glow + jelly bounce on the primary CTAs — port of the button effect in
 * JS/index.js. Renders nothing; it attaches to `.btn-primary-large` and
 * `.howitwork-redesign-button` wherever they appear on the page.
 *
 * The glow follows the cursor through --x/--y custom properties the CSS reads.
 * The jelly bounce differs per button by design: the how-it-works button
 * retriggers on every enter (forced by a reflow so the animation restarts),
 * while the hero CTA is rate-limited to once a second to stop it stuttering
 * when the pointer skims the edge.
 */

const SELECTOR = '.btn-primary-large, .howitwork-redesign-button';
const JELLY_LOCK_MS = 1000;

export function ButtonEffects() {
  useEffect(() => {
    const buttons = Array.from(document.querySelectorAll<HTMLElement>(SELECTOR));
    const cleanups: (() => void)[] = [];

    for (const button of buttons) {
      let jellyLocked = false;
      let unlockTimer: ReturnType<typeof setTimeout>;

      const onMouseMove = (e: MouseEvent) => {
        const rect = button.getBoundingClientRect();
        button.style.setProperty('--x', `${e.clientX - rect.left}px`);
        button.style.setProperty('--y', `${e.clientY - rect.top}px`);
      };

      const onMouseEnter = () => {
        if (button.classList.contains('howitwork-redesign-button')) {
          button.classList.remove('jelly-active');
          void button.offsetWidth; // Force reflow so the animation restarts.
          button.classList.add('jelly-active');
          return;
        }
        if (jellyLocked) return;
        jellyLocked = true;
        button.classList.add('jelly-active');
        unlockTimer = setTimeout(() => {
          jellyLocked = false;
        }, JELLY_LOCK_MS);
      };

      const onAnimationEnd = (e: AnimationEvent) => {
        if (e.animationName === 'jelly') button.classList.remove('jelly-active');
      };

      button.addEventListener('mousemove', onMouseMove);
      button.addEventListener('mouseenter', onMouseEnter);
      button.addEventListener('animationend', onAnimationEnd);

      cleanups.push(() => {
        clearTimeout(unlockTimer);
        button.removeEventListener('mousemove', onMouseMove);
        button.removeEventListener('mouseenter', onMouseEnter);
        button.removeEventListener('animationend', onAnimationEnd);
      });
    }

    return () => cleanups.forEach((fn) => fn());
  }, []);

  return null;
}
