'use client';

import { useCallback, useEffect, useRef } from 'react';

/**
 * Templates carousel — port of `.templates-section` in motvin-ui/index.html
 * and the slider handler in JS/index.js.
 *
 * The loop is a scroll illusion: two clone groups sit on each side of the real
 * cards, and once scrolling settles the scroll position is snapped back by one
 * cycle width so the user never reaches an edge. Clones are inert and hidden
 * from assistive tech.
 */

type TemplateCard = {
  title: string;
  img: string;
  width: number;
  height: number;
  href: string;
};

const TEMPLATE_CARDS: TemplateCard[] = [
  { title: 'Claude UI', img: '/ASSET/Images/motvin-template1.webp', width: 384, height: 480, href: '#' },
  { title: 'Smart Home App', img: '/ASSET/Images/motvin-template2.webp', width: 286, height: 358, href: '#' },
  { title: 'Whatsapp UI', img: '/ASSET/Images/motvin-template3.webp', width: 342, height: 427, href: '#' },
  { title: 'LinkedIn App', img: '/ASSET/Images/motvin-template4.webp', width: 342, height: 427, href: '#' },
  { title: 'Medical App', img: '/ASSET/Images/motvin-template5.webp', width: 283, height: 354, href: '#' },
  { title: 'Gemini UI', img: '/ASSET/Images/motvin-template6.webp', width: 469, height: 586, href: '#' },
];

// Clone groups on each side of the real cards. Two per side, as in the original.
const CLONE_GROUPS = 2;
const SCROLL_STEP = 350;
// Extra offset the original applied to the initial scroll position.
const INITIAL_OFFSET = 120;
// Debounce before snapping the loop back, so the snap never fights a smooth scroll.
const SETTLE_DELAY = 100;

function Card({ card, clone }: { card: TemplateCard; clone?: boolean }) {
  return (
    <div className="template-card" aria-hidden={clone || undefined} inert={clone || undefined}>
      <div
        className="template-image-wrapper"
        style={{ width: `${card.width}px`, height: `${card.height}px` }}
      >
        <img src={card.img} alt={card.title} />
      </div>
      <a href={card.href} className="template-link">
        <u>{card.title}</u> <img src="/ASSET/Icons/arrow-redirect.svg" alt="Link" />
      </a>
    </div>
  );
}

export function Templates() {
  const sliderRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

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
    slider.scrollLeft = originalStart + INITIAL_OFFSET;

    let settleTimer: ReturnType<typeof setTimeout>;
    const normalize = () => {
      const position = slider.scrollLeft;
      if (position < originalStart) {
        slider.scrollLeft = position + cycleWidth;
      } else if (position >= originalStart + cycleWidth) {
        slider.scrollLeft = position - cycleWidth;
      }
    };

    const onScroll = () => {
      clearTimeout(settleTimer);
      settleTimer = setTimeout(normalize, SETTLE_DELAY);
    };

    slider.addEventListener('scroll', onScroll);
    return () => {
      slider.removeEventListener('scroll', onScroll);
      clearTimeout(settleTimer);
    };
  }, []);

  const scrollPrev = useCallback(() => {
    sliderRef.current?.scrollBy({ left: -SCROLL_STEP, behavior: 'smooth' });
  }, []);

  const scrollNext = useCallback(() => {
    sliderRef.current?.scrollBy({ left: SCROLL_STEP, behavior: 'smooth' });
  }, []);

  const cloneGroup = (side: string, group: number) =>
    TEMPLATE_CARDS.map((card) => (
      <Card key={`${side}-${group}-${card.title}`} card={card} clone />
    ));

  return (
    <section className="templates-section">
      <div className="templates-container">
        <div className="templates-header">
          <div className="templates-title-col">
            <p className="templates-subtitle">Resources</p>
            <h2 className="templates-title">
              High-quality templates for designers.
              <br />
              <span className="templates-author">
                Made by
                <a href="#">@siren.uix</a>
                on Motvin
              </span>
            </h2>
          </div>
          <div className="templates-nav-col">
            <a href="#" className="demo-explore-btn btn-templates-explore">
              <span>Browse all templates</span>
              <svg
                className="demo-explore-icon"
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M5.25 2.33334L9.91667 7.00001L5.25 11.6667"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </a>
            <div className="templates-slider-nav">
              <span className="templates-slide-count">1 of 6</span>
              <div className="templates-nav-buttons">
                <button className="nav-btn prev" onClick={scrollPrev} aria-label="Previous templates">
                  <img src="/ASSET/Icons/nav-btn next.svg" alt="Prev" />
                </button>
                <button className="nav-btn next" onClick={scrollNext} aria-label="Next templates">
                  <img
                    src="/ASSET/Icons/nav-btn next.svg"
                    style={{ transform: 'rotate(180deg)' }}
                    alt="Next"
                  />
                </button>
              </div>
            </div>
          </div>
        </div>
        <div className="templates-slider-container" ref={sliderRef}>
          <div className="templates-track" ref={trackRef}>
            {Array.from({ length: CLONE_GROUPS }, (_, g) => cloneGroup('lead', g))}
            {TEMPLATE_CARDS.map((card) => (
              <Card key={card.title} card={card} />
            ))}
            {Array.from({ length: CLONE_GROUPS }, (_, g) => cloneGroup('trail', g))}
          </div>
        </div>
      </div>
    </section>
  );
}
