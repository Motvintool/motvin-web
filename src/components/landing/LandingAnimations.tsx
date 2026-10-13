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
 * Six groups:
 *  1. Hero scroll timeline (>1300px, and only when motion is allowed) —
 *     pins the hero, drifts its text up as it fades, crops the hero's bottom
 *     edge, and lifts the demo window while it grows slightly. Set up
 *     through gsap.matchMedia, so it turns on and off as the window is
 *     resized across the breakpoint, without a reload.
 *  2. Hero entrance — a one-off rise-and-settle on load.
 *  3. Word animation — per-word colour pop on `.animated-word` groups, played
 *     on first scroll into view and replayed on hover.
 *  4. Section reveals — fade/rise each section's contents once, on approach.
 *  5. Feature card stack — covered cards shrink like cards in a wallet.
 *  6. Scroll parallax (>900px) — hero icons, stack phones, the Buddy window
 *     and the closing logos move at their own speeds, for depth.
 *
 * All six are skipped under prefers-reduced-motion.
 *
 * Not ported from JS/index.js: the `.trusted-partners-scroll` marquee, whose
 * target elements no longer exist in the markup.
 */

const HERO_SCROLL_MIN_WIDTH = 1300;
// How far the page scrolls while the hero is pinned. The demo window rises
// by the same amount, so the section below arrives right under it, with no
// gap opening up.
const HERO_SCROLL_DISTANCE = 330;
// The hero's bottom is cropped by a little less than that, so the window's
// lower edge and its soft shadow are never sliced off. The extra only
// overlaps the empty top padding of the section below.
const HERO_CROP_ROOM = 16;

// How much smaller a stacked feature card gets for each card piled on top of it.
const STACK_SHRINK = 0.06;
// The cards stack above this width; below it they are a plain list (landing-inspirations.css).
const STACK_MIN_WIDTH = 601;

// Scroll parallax runs above this width, where there is room for the layers
// to drift without crowding the content.
const PARALLAX_MIN_WIDTH = 901;
// How far each hero decoration travels up as the hero scrolls away, in px,
// and how much it turns. Unequal, so they read as layers at different depths.
const HERO_FLOAT_DEPTH: [selector: string, y: number, rotate: number][] = [
  ['.hf-l-sparkle', -150, -18],
  ['.hf-l-at', -70, 10],
  ['.hf-l-app1', -120, -8],
  ['.hf-l-app2', -55, 6],
  ['.hf-r-gear', -95, 24],
  ['.hf-r-app3', -135, 8],
  ['.hf-r-app4', -60, -6],
  ['.hf-r-sparkle', -110, 16],
];

// Headings whose words animate on hover. None on the page right now: the
// sections that used it were removed or restyled, but the effect is kept.
const WORD_ANIMATION_CONTAINERS: string[] = [];

const REVEAL_SECTIONS = [
  { selector: '.lpi-story', items: '.lpi-story-inner > *' },
  { selector: '.lpi-stack-section', items: '.lpi-stack-section > .lpi-heading' },
  { selector: '.lpi-grid-section', items: '.lpi-heading, .lpi-bento-card' },
  { selector: '.lpi-buddy', items: '.lpi-heading, .lpi-buddy-stage' },
  { selector: '.lpi-templates', items: '.lpi-templates-head, .lpi-templates-slider' },
  { selector: '.lpi-faq', items: '.lpi-faq-intro, .lpi-faq-list' },
  { selector: '.lpi-explore', items: '.lpi-heading, .lpi-explore-grid' },
  { selector: '.lpi-closing', items: '.lpi-closing > *' },
];

export function LandingAnimations() {
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // 1. Hero scroll timeline. matchMedia builds it while the query matches
    // and reverts it (unpinning, clearing styles) when it stops matching.
    const mm = gsap.matchMedia();
    mm.add(
      `(min-width: ${HERO_SCROLL_MIN_WIDTH + 1}px) and (prefers-reduced-motion: no-preference)`,
      () => {
        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: '.hero-section',
            start: 'top top',
            end: `+=${HERO_SCROLL_DISTANCE}px`,
            pin: true,
            // Without this GSAP pads the page with the pinned height, which
            // would leave a gap under the shrinking hero.
            pinSpacing: false,
            // How long the animation trails the scroll, in seconds.
            scrub: 1.5,
          },
        });

        // The text drifts up as it fades, so the space it leaves reads as part
        // of the motion rather than a blank gap. fromTo with immediateRender
        // off, so it doesn't fight the entrance animation on load.
        tl.fromTo(
          '.hero-badge, .hero-title-interactive, .hero-subtitle, .hero-cta',
          { opacity: 1, y: 0 },
          { opacity: 0, y: -50, duration: 0.5, ease: 'sine.inOut', immediateRender: false },
          0,
        )
          // clipPath rather than height: animating height would recalculate the
          // background gradient and make it jump on refresh.
          .fromTo(
            '.hero-section',
            { clipPath: 'inset(0px 0px 0px 0px)' },
            {
              clipPath: `inset(0px 0px ${HERO_SCROLL_DISTANCE - HERO_CROP_ROOM}px 0px)`,
              duration: 0.5,
              ease: 'sine.inOut',
            },
            0.1,
          )
          // The window rises with the page and grows a touch, coming forward
          // as it becomes the focus. It grows from its bottom edge, so the
          // growth goes up and out, never down past the hero's crop.
          .fromTo(
            '.demo-window',
            { scale: 1, y: 0, transformOrigin: '50% 100%' },
            {
              scale: 1.03,
              y: -HERO_SCROLL_DISTANCE,
              transformOrigin: '50% 100%',
              duration: 0.5,
              ease: 'sine.inOut',
            },
            0.1,
          );
      },
    );

    // 5. Stacked feature cards, like cards in a wallet: as the cards after
    // it slide up over it, each card shrinks a little from its top edge,
    // more the deeper it ends up in the pile, so the tops peek out as a
    // tidy, narrowing stack. Tied to the scroll, so it plays both ways.
    // Only where the cards stack: on phones they scroll as a plain list.
    mm.add(`(min-width: ${STACK_MIN_WIDTH}px) and (prefers-reduced-motion: no-preference)`, () => {
      const stackCards = gsap.utils.toArray<HTMLElement>('.lpi-stack-card');
      const lastCard = stackCards[stackCards.length - 1];
      if (!lastCard) return;
      const lastTop = parseFloat(getComputedStyle(lastCard).top) || 0;
      stackCards.slice(0, -1).forEach((card, i) => {
        const depth = stackCards.length - 1 - i;
        gsap.fromTo(
          card,
          { scale: 1 },
          {
            scale: 1 - depth * STACK_SHRINK,
            transformOrigin: '50% 0%',
            ease: 'none',
            immediateRender: false,
            scrollTrigger: {
              trigger: stackCards[i + 1],
              start: 'top bottom',
              endTrigger: lastCard,
              end: `top ${lastTop}px`,
              scrub: 0.4,
            },
          },
        );
      });
    });

    // 6. Scroll parallax. Layers move at different speeds to the page, for a
    // sense of depth. Each one moves on `transform`, which nothing else on
    // these elements uses: their tilts, bobs and hover moves are on the
    // separate `rotate`, `translate` and `scale` properties, so they all stack.
    mm.add(`(min-width: ${PARALLAX_MIN_WIDTH}px) and (prefers-reduced-motion: no-preference)`, () => {
      // The hero's floating icons drift up and turn as you scroll away,
      // the nearer ones faster, as if they sat in front of the headline.
      // Hero's entrance tween owns their `y` and `scale`, so this moves them
      // with `yPercent` (the px depth over the icon's height) and a relative
      // rotation; GSAP adds both into the same transform without a clash.
      for (const [selector, y, rotate] of HERO_FLOAT_DEPTH) {
        gsap.to(selector, {
          yPercent: (_: number, el: HTMLElement) => (y / (el.offsetHeight || 1)) * 100,
          rotation: `+=${rotate}`,
          ease: 'none',
          scrollTrigger: { start: 0, end: () => window.innerHeight, scrub: 0.8 },
        });
      }

      // Each stacked feature card's phones rise into place as the card
      // slides up, the tilted side phones from further down than the front
      // one. The phones load after this runs, so the scroll drives a variable
      // on the card and CSS turns it into their offsets (landing-inspirations.css).
      gsap.utils.toArray<HTMLElement>('.lpi-stack-card').forEach((card) => {
        gsap.fromTo(
          card,
          { '--lpi-rise': 1 },
          {
            '--lpi-rise': 0,
            ease: 'none',
            scrollTrigger: { trigger: card, start: 'top bottom', end: 'top 25%', scrub: 0.6 },
          },
        );
      });

      // The Buddy window settles forward as its section comes up.
      gsap.fromTo(
        '.lpi-buddy-window',
        { y: 60, scale: 0.94 },
        {
          y: 0,
          scale: 1,
          ease: 'none',
          scrollTrigger: { trigger: '.lpi-buddy', start: 'top bottom', end: 'top 20%', scrub: 0.6 },
        },
      );

      // The closing logos settle down into their row, the outer ones from
      // higher up, so the row arrives as an arc that flattens out. The logos load
      // after this runs, so the scroll drives a variable on the section and
      // CSS turns it into each logo's offset (landing-inspirations.css).
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

    // gsap.context scopes every tween and ScrollTrigger created inside it, so
    // revert() on unmount cleans all of them up — important under React's dev
    // double-mount, which would otherwise stack duplicate ScrollTriggers.
    const ctx = gsap.context(() => {
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

    return () => {
      mm.revert();
      ctx.revert();
    };
  }, []);

  return null;
}
