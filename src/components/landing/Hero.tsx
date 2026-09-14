'use client';

import { gsap } from 'gsap';
import { useCallback, useEffect, useRef, useState } from 'react';
import { HeroFloatingGraphics, type HeroState } from './HeroFloatingGraphics';
import { ColorWidget, TypescaleWidget } from './HeroWidgets';

/**
 * Hero — port of `.hero-section` in motvin-ui/index.html and the interactive
 * word logic in JS/index.js.
 *
 * Each highlighted word in the headline maps to a cluster of floating graphics.
 * The clusters cycle every 3s, hovering a word pins it and stops the cycle, and
 * leaving resumes from that word.
 *
 * The scroll-linked GSAP timeline and Draggable setup live in HeroAnimations,
 * mirroring the original's split between behavior and animation.
 */

const WORDS: { state: HeroState; label: string }[] = [
  { state: 'convert-websites', label: 'Convert Websites' },
  { state: 'explore-colors', label: 'Explore Colors' },
  { state: 'icons', label: 'Icons' },
  { state: 'type-systems', label: 'Type Systems' },
];

// Order the auto-cycle walks. The original cycled through the wrappers in DOM
// order, which is the reading order of the two headline rows.
const CYCLE_ORDER: HeroState[] = WORDS.map((w) => w.state);
const INITIAL_STATE: HeroState = 'icons';
const CYCLE_MS = 3000;

export function Hero() {
  const [active, setActive] = useState<HeroState>(INITIAL_STATE);
  const hoveredRef = useRef(false);
  const indexRef = useRef(CYCLE_ORDER.indexOf(INITIAL_STATE));
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startCycle = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      if (hoveredRef.current) return;
      indexRef.current = (indexRef.current + 1) % CYCLE_ORDER.length;
      setActive(CYCLE_ORDER[indexRef.current]);
    }, CYCLE_MS);
  }, []);

  useEffect(() => {
    startCycle();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [startCycle]);

  // Stagger the newly-activated cluster's items in, as the original did.
  useEffect(() => {
    const items = document.querySelectorAll(`#floating-${active} .floating-item`);
    if (!items.length) return;
    gsap.fromTo(
      items,
      { y: 30, scale: 0.8, opacity: 0 },
      {
        y: 0,
        scale: 1,
        opacity: 1,
        duration: 0.5,
        ease: 'back.out(1.7)',
        stagger: 0.05,
        overwrite: 'auto',
      },
    );
  }, [active]);

  const onWordEnter = (state: HeroState, index: number) => () => {
    hoveredRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    indexRef.current = index;
    setActive(state);
  };

  const onWordLeave = () => {
    hoveredRef.current = false;
    startCycle();
  };

  const word = (state: HeroState, label: string, comma: boolean) => {
    const index = CYCLE_ORDER.indexOf(state);
    return (
      <div
        key={state}
        className={`interactive-word-wrapper${active === state ? ' active' : ''}`}
        data-state={state}
        onMouseEnter={onWordEnter(state, index)}
        onMouseLeave={onWordLeave}
      >
        <span className="interactive-word">{label}</span>
        {comma && <span className="hero-title-comma">,</span>}
      </div>
    );
  };

  return (
    <section className="hero-section">
      <div className="hero-bg">
        <div className="hero-bg-img">
          <img alt="" src="/ASSET/Images/Hero-section.webp" />
        </div>
        <div className="hero-gradient"></div>
      </div>

      <div className="hero-content">
        <div className="hero-badge">
          <div className="badge-new">
            <span>New</span>
          </div>
          <p>Website capture with one click</p>
          <div className="badge-dot"></div>
          <a
            href="https://drive.google.com/drive/folders/1XV9TMKR0Q0Eg1A_mIybUAxLGcDQxP2I8?usp=sharing"
            target="_blank"
            className="badge-link"
          >
            <span>Get Now</span>
            <img alt="" src="/ASSET/svg/arrow-icon.svg" />
          </a>
        </div>

        <div className="hero-title-interactive">
          <div className="hero-title-rows">
            <div className="hero-title-row">
              <span className="hero-title-text-main">Build Better Designs</span>
              {word('convert-websites', 'Convert Websites', true)}
            </div>
            <div className="hero-title-row">
              {word('explore-colors', 'Explore Colors', true)}
              {word('icons', 'Icons', true)}
              {word('type-systems', 'Type Systems', true)}
              <span className="hero-title-text-main">And More</span>
            </div>
          </div>

          <HeroFloatingGraphics active={active} />
        </div>

        <p className="hero-subtitle">
          Trusted by 5,00,000+ designers and developers building better with Motvin.
        </p>

        <div className="hero-cta">
          <a
            href="https://chat.whatsapp.com/JxLUrQpNpaXJ4ido6muIW6?s=cl&p=i&ilr=4"
            target="_blank"
            className="btn-primary-large"
          >
            <span>Join Community</span>
          </a>
          <div className="hero-rating">
            <div className="rating-stars">
              <img alt="Star" src="/ASSET/svg/star-icon.svg" />
              <span className="rating-score">
                4.7
                <span className="rating-max">/ 5.0</span>
              </span>
            </div>
            <p className="rating-users">8k+ Designers Joined</p>
          </div>
        </div>

        <div className="hero-demo">
          <div className="demo-window">
            <div className="demo-header">
              <div className="demo-dot" style={{ backgroundColor: '#ff5b59' }}></div>
              <div className="demo-dot" style={{ backgroundColor: '#f5b900' }}></div>
              <div className="demo-dot" style={{ backgroundColor: '#0fc27b' }}></div>
            </div>
            <div className="demo-body">
              <video
                src="/ASSET/Videos/typescale-demo.mp4"
                autoPlay
                loop
                muted
                playsInline
                poster="/ASSET/Images/hero-demo.png.webp"
              ></video>
            </div>
          </div>
        </div>
      </div>

      <ColorWidget />
      <TypescaleWidget />
    </section>
  );
}
