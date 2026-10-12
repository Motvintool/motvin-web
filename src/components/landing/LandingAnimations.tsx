'use client';

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useEffect } from 'react';

/**
 * All of the landing page's GSAP work, ported from JS/index.js.
 *
 * Mounted once by the page. Like the original it drives elements by selector
 * across section boundaries, so it renders nothing itself. Everything runs
 * after mount, once the sections it animates are in the DOM.
 *
 * Four groups:
 *  1. Hero scroll timeline (>1300px only) — pins the hero, crops its bottom
 *     edge and shrinks the demo window.
 *  2. Hero entrance — a one-off rise-and-settle on load.
 *  3. Word animation — per-word colour pop on `.animated-word` groups, played
 *     on first scroll into view and replayed on hover.
 *  4. Section reveals — fade/rise each section's contents once, on approach.
 *
 * Groups 2-4 are skipped under prefers-reduced-motion, matching the original.
 *
 * Not ported from JS/index.js: the `.trusted-partners-scroll` marquee, whose
 * target elements no longer exist in the markup.
 */

const HERO_SCROLL_MIN_WIDTH = 1300;

// Headings whose words animate on hover. None on the page right now: the
// sections that used it were removed or restyled, but the effect is kept.
const WORD_ANIMATION_CONTAINERS: string[] = [];

const REVEAL_SECTIONS = [
  { selector: '.lpi-story', items: '.lpi-story-inner > *' },
  { selector: '.lpi-stack-section', items: '.lpi-stack-section > .lpi-heading' },
  { selector: '.lpi-grid-section', items: '.lpi-heading, .lpi-bento-card' },
  { selector: '.lpi-templates', items: '.lpi-templates-head, .lpi-templates-slider' },
  { selector: '.lpi-faq', items: '.lpi-faq-intro, .lpi-faq-list' },
  { selector: '.lpi-explore', items: '.lpi-heading, .lpi-explore-grid' },
  { selector: '.lpi-closing', items: '.lpi-closing > *' },
];

export function LandingAnimations() {
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // gsap.context scopes every tween and ScrollTrigger created inside it, so
    // revert() on unmount cleans all of them up — important under React's dev
    // double-mount, which would otherwise stack duplicate ScrollTriggers.
    const ctx = gsap.context(() => {
      // 1. Hero scroll timeline — desktop only, as in the original.
      if (window.innerWidth > HERO_SCROLL_MIN_WIDTH) {
        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: '.hero-section',
            start: 'top top',
            end: '+=250px', // Exactly matches the clip-path shrink below.
            pin: true,
            // Without this GSAP pads the page with the pinned height, which
            // would leave a gap under the shrinking hero.
            pinSpacing: false,
            scrub: 3,
          },
        });

        tl.to(
          '.hero-badge, .hero-title-interactive, .hero-subtitle, .hero-cta',
          { opacity: 0, duration: 0.5, ease: 'sine.inOut' },
          0,
        )
          // clipPath rather than height: animating height would recalculate the
          // background gradient and make it jump on refresh.
          .fromTo(
            '.hero-section',
            { clipPath: 'inset(0px 0px 0px 0px)' },
            { clipPath: 'inset(0px 0px 250px 0px)', duration: 0.5, ease: 'sine.inOut' },
            0.1,
          )
          .fromTo(
            '.demo-window',
            { scale: 1, y: 0 },
            { scale: 0.9, y: -250, duration: 0.5, ease: 'sine.inOut' },
            0.1,
          );
      }

      if (prefersReducedMotion) return;

      // 2. Hero entrance.
      gsap
        .timeline()
        .fromTo(
          '.hero-badge, .hero-title-row, .hero-subtitle, .hero-cta',
          { y: 32 },
          { y: 0, duration: 0.7, ease: 'power3.out', stagger: 0.1, clearProps: 'transform' },
        )
        .fromTo(
          '.hero-demo',
          { autoAlpha: 0, y: 56, scale: 0.97 },
          {
            autoAlpha: 1,
            y: 0,
            scale: 1,
            duration: 0.8,
            ease: 'power3.out',
            clearProps: 'transform',
          },
          '-=0.35',
        );

      // 3. Word animation.
      const observers: IntersectionObserver[] = [];
      const hoverCleanups: (() => void)[] = [];

      for (const selector of WORD_ANIMATION_CONTAINERS) {
        const container = document.querySelector(selector);
        if (!container) continue;
        const words = container.querySelectorAll('.animated-word');
        if (!words.length) continue;

        const tl = gsap.timeline({ paused: true });
        words.forEach((word, i) => {
          const stepTime = 0.12;
          const halfStep = stepTime / 2;
          const at = i * stepTime;

          tl.set(word, { color: '#9587FB' }, at)
            .to(word, { y: -6, scale: 1.05, duration: halfStep, ease: 'power1.out' }, at)
            .set(word, { color: '#5C4AE4' }, at + halfStep)
            .to(word, { y: 0, scale: 1, duration: 0.2, ease: 'back.out(2.5)' }, at + halfStep)
            .set(word, { clearProps: 'color' }, at + stepTime);
        });

        const observer = new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (entry.isIntersecting) {
                tl.play();
                observer.disconnect();
              }
            }
          },
          { rootMargin: '0px', threshold: 0.01 },
        );
        observer.observe(container);
        observers.push(observer);

        const onEnter = () => {
          if (!tl.isActive()) tl.restart();
        };
        container.addEventListener('mouseenter', onEnter);
        hoverCleanups.push(() => container.removeEventListener('mouseenter', onEnter));
      }

      // 4. Section reveals.
      for (const { selector, items } of REVEAL_SECTIONS) {
        const section = document.querySelector(selector);
        if (!section) continue;
        const targets = section.querySelectorAll(items);
        if (!targets.length) continue;

        gsap.fromTo(
          targets,
          { autoAlpha: 0, y: 48 },
          {
            autoAlpha: 1,
            y: 0,
            duration: 0.8,
            ease: 'power3.out',
            stagger: 0.12,
            // Hand the elements back to CSS afterwards, so hover transforms work.
            clearProps: 'transform,opacity,visibility',
            scrollTrigger: { trigger: section, start: 'top 78%', once: true },
          },
        );
      }

      return () => {
        observers.forEach((o) => o.disconnect());
        hoverCleanups.forEach((fn) => fn());
      };
    });

    return () => ctx.revert();
  }, []);

  return null;
}
