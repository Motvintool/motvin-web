'use client';

import { useCallback, useEffect, useRef } from 'react';

/**
 * Templates carousel, styled like the Inspirations sections above it.
 *
 * The loop is a scroll illusion: two clone groups sit on each side of the real
 * cards, and once scrolling settles the scroll position is snapped back by one
 * cycle width so the user never reaches an edge. Clones are inert and hidden
 * from assistive tech.
 */

type TemplateCard = {
  title: string;
  img: string;
  href: string;
};

const TEMPLATE_CARDS: TemplateCard[] = [
  { title: 'Claude UI', img: '/ASSET/Images/motvin-template1.webp', href: '#' },
  { title: 'Whatsapp UI', img: '/ASSET/Images/motvin-template2.webp', href: '#' },
  { title: 'Smart Home App', img: '/ASSET/Images/motvin-template3.webp', href: '#' },
  { title: 'Gemini UI', img: '/ASSET/Images/motvin-template4.webp', href: '#' },
  { title: 'Medical App', img: '/ASSET/Images/motvin-template5.webp', href: '#' },
  { title: 'LinkedIn App', img: '/ASSET/Images/motvin-template6.webp', href: '#' },
];

const AUTHOR_URL = 'https://www.instagram.com/siren.uix';

// Clone groups on each side of the real cards.
const CLONE_GROUPS = 2;
// One card plus the gap between cards.
const SCROLL_STEP = 376;
// Debounce before snapping the loop back, so the snap never fights a smooth scroll.
const SETTLE_DELAY = 100;
// Drift speed of the self-moving loop, in pixels per second.
const DRIFT_SPEED = 36;
// How long the drift waits after someone scrolls, drags or presses an arrow.
const DRIFT_RESUME_DELAY = 2500;

const chevron = (d: string) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

function Card({ card, clone }: { card: TemplateCard; clone?: boolean }) {
  return (
    <a
      href={card.href}
      className="lpi-template-card"
      aria-hidden={clone || undefined}
      tabIndex={clone ? -1 : undefined}
      inert={clone || undefined}
    >
      <span className="lpi-template-tile">
        <img src={card.img} alt={clone ? '' : card.title} draggable={false} />
      </span>
      <span className="lpi-template-name">
        {card.title}
        <img src="/ASSET/Icons/Motvin/view-apps.svg" alt="" width={20} height={20} aria-hidden="true" />
      </span>
    </a>
  );
}

export function Templates() {
  const sliderRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  // The drift holds off until this time (ms, performance.now) after any
  // interaction, so it never fights the visitor.
  const driftPausedUntil = useRef(0);

  useEffect(() => {
    const slider = sliderRef.current;
    const track = trackRef.current;
    if (!slider || !track) return;

    const cards = Array.from(track.children) as HTMLElement[];
    const leadingCloneCount = CLONE_GROUPS * TEMPLATE_CARDS.length;
    const firstOriginal = cards[leadingCloneCount];
    const firstTrailingClone = cards[leadingCloneCount + TEMPLATE_CARDS.length];
    if (!firstOriginal || !firstTrailingClone) return;

    const originalStart = firstOriginal.offsetLeft;
    const cycleWidth = firstTrailingClone.offsetLeft - originalStart;
    // Start with the first real card lined up with the heading text above it.
    const head = headRef.current;
    const inset = head
      ? head.getBoundingClientRect().left - slider.getBoundingClientRect().left + parseFloat(getComputedStyle(head).paddingLeft)
      : 24;
    slider.scrollLeft = originalStart - inset;

    let settleTimer: ReturnType<typeof setTimeout>;
    const normalize = () => {
      const position = slider.scrollLeft + inset;
      if (position < originalStart) {
        slider.scrollLeft += cycleWidth;
      } else if (position >= originalStart + cycleWidth) {
        slider.scrollLeft -= cycleWidth;
      }
    };

    const onScroll = () => {
      clearTimeout(settleTimer);
      settleTimer = setTimeout(normalize, SETTLE_DELAY);
    };

    slider.addEventListener('scroll', onScroll);

    // The loop drifts on its own: a few pixels each frame, wrapping back by one
    // cycle (seamless, thanks to the clones) when it reaches the end. It rests
    // while hovered, after any interaction, and while off screen.
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let hovered = false;
    let onScreen = false;
    let frame = 0;
    let last = 0;
    let position = slider.scrollLeft;

    const pause = () => {
      driftPausedUntil.current = performance.now() + DRIFT_RESUME_DELAY;
    };
    const onEnter = () => {
      hovered = true;
    };
    const onLeave = () => {
      hovered = false;
    };

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const dt = last ? Math.min(now - last, 64) : 0;
      last = now;
      // Someone moved it by hand: carry on from wherever they left it.
      if (Math.abs(slider.scrollLeft - position) > 2) position = slider.scrollLeft;
      if (hovered || !onScreen || now < driftPausedUntil.current) return;
      position += (DRIFT_SPEED * dt) / 1000;
      if (position + inset >= originalStart + cycleWidth) position -= cycleWidth;
      slider.scrollLeft = position;
    };

    const observer = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
    });

    if (!reduceMotion) {
      observer.observe(slider);
      slider.addEventListener('pointerenter', onEnter);
      slider.addEventListener('pointerleave', onLeave);
      slider.addEventListener('pointerdown', pause);
      slider.addEventListener('wheel', pause, { passive: true });
      slider.addEventListener('touchstart', pause, { passive: true });
      frame = requestAnimationFrame(tick);
    }

    return () => {
      slider.removeEventListener('scroll', onScroll);
      clearTimeout(settleTimer);
      cancelAnimationFrame(frame);
      observer.disconnect();
      slider.removeEventListener('pointerenter', onEnter);
      slider.removeEventListener('pointerleave', onLeave);
      slider.removeEventListener('pointerdown', pause);
      slider.removeEventListener('wheel', pause);
      slider.removeEventListener('touchstart', pause);
    };
  }, []);

  const pauseDrift = () => {
    driftPausedUntil.current = performance.now() + DRIFT_RESUME_DELAY;
  };

  const scrollPrev = useCallback(() => {
    pauseDrift();
    sliderRef.current?.scrollBy({ left: -SCROLL_STEP, behavior: 'smooth' });
  }, []);

  const scrollNext = useCallback(() => {
    pauseDrift();
    sliderRef.current?.scrollBy({ left: SCROLL_STEP, behavior: 'smooth' });
  }, []);

  const cloneGroup = (side: string, group: number) =>
    TEMPLATE_CARDS.map((card) => <Card key={`${side}-${group}-${card.title}`} card={card} clone />);

  return (
    <section className="lpi-templates">
      <div className="lpi-templates-head" ref={headRef}>
        <div>
          <h2 className="lpi-title">High-quality templates for designers</h2>
          <p className="lpi-templates-author">
            Made by{' '}
            <a href={AUTHOR_URL} target="_blank" rel="noopener noreferrer">
              @siren.uix
            </a>{' '}
            on Motvin
          </p>
        </div>
        <div className="lpi-templates-actions">
          <a href="#" className="lpi-templates-all">
            Browse all templates
          </a>
          <button type="button" className="lpi-templates-nav" onClick={scrollPrev} aria-label="Previous templates">
            {chevron('m15 6-6 6 6 6')}
          </button>
          <button type="button" className="lpi-templates-nav" onClick={scrollNext} aria-label="Next templates">
            {chevron('m9 6 6 6-6 6')}
          </button>
        </div>
      </div>

      <div className="lpi-templates-slider" ref={sliderRef}>
        <div className="lpi-templates-track" ref={trackRef}>
          {Array.from({ length: CLONE_GROUPS }, (_, g) => cloneGroup('lead', g))}
          {TEMPLATE_CARDS.map((card) => (
            <Card key={card.title} card={card} />
          ))}
          {Array.from({ length: CLONE_GROUPS }, (_, g) => cloneGroup('trail', g))}
        </div>
      </div>
    </section>
  );
}
