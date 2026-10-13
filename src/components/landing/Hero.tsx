'use client';

import { gsap } from 'gsap';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import { HeroLogoSlot, useAppLogoPicks } from './HeroAppLogos';

/**
 * Hero — Figma "Design-Post-Site" node 1360:14057.
 *
 * The highlighted word cycles every 3s; hovering a word pins it and leaving
 * resumes from there. Each word links to its Inspirations page. The scroll
 * timeline lives in LandingAnimations.
 */

const WORDS = [
  { label: 'Screens', href: INSPIRATIONS_ROUTES.screens },
  { label: 'Flows', href: INSPIRATIONS_ROUTES.flows },
  { label: 'Patterns', href: INSPIRATIONS_ROUTES.patterns },
  { label: 'UI Designs', href: INSPIRATIONS_ROUTES.uiElements },
];
const INITIAL_INDEX = 1;
const CYCLE_MS = 3000;

const BADGE_BLOBS = [1, 2, 3, 4, 5];

export function Hero() {
  const [active, setActive] = useState(INITIAL_INDEX);
  const hoveredRef = useRef(false);
  const indexRef = useRef(INITIAL_INDEX);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { logos, picks, next } = useAppLogoPicks();

  const startCycle = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      if (hoveredRef.current) return;
      indexRef.current = (indexRef.current + 1) % WORDS.length;
      setActive(indexRef.current);
    }, CYCLE_MS);
  }, []);

  useEffect(() => {
    startCycle();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [startCycle]);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const tween = gsap.fromTo(
      '.hero-floating-graphics .hero-float',
      { y: 30, scale: 0.8, opacity: 0 },
      { y: 0, scale: 1, opacity: 1, duration: 0.5, ease: 'back.out(1.7)', stagger: 0.05, delay: 0.3 },
    );
    return () => {
      tween.kill();
    };
  }, []);

  const onWordEnter = (index: number) => () => {
    hoveredRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    indexRef.current = index;
    setActive(index);
  };

  const onWordLeave = () => {
    hoveredRef.current = false;
    startCycle();
  };

  const word = (i: number) => (
    <Link
      key={WORDS[i].label}
      href={WORDS[i].href}
      className={`interactive-word-wrapper${active === i ? ' active' : ''}`}
      onMouseEnter={onWordEnter(i)}
      onMouseLeave={onWordLeave}
      onFocus={onWordEnter(i)}
      onBlur={onWordLeave}
    >
      <span className="interactive-word">{WORDS[i].label}</span>
      {i < WORDS.length - 1 && <span className="hero-title-comma">,</span>}
    </Link>
  );

  return (
    <section className="hero-section">
      <div className="hero-bg">
        <div className="hero-gradient"></div>
      </div>

      <div className="hero-content">
        <div className="hero-badge">
          <div className="badge-new">
            <div className="badge-new-texture" aria-hidden="true">
              {BADGE_BLOBS.map((n) => (
                <div className={`badge-blob badge-blob-${n}`} key={n}>
                  <img alt="" src={`/ASSET/landing/badge-new/blob${n}-base.svg`} />
                  <img alt="" className="badge-blob-color" src={`/ASSET/landing/badge-new/blob${n}-color.svg`} />
                  <div className="badge-blob-overlay">
                    <img alt="" src={`/ASSET/landing/badge-new/blob${n}-overlay.svg`} />
                  </div>
                </div>
              ))}
            </div>
            <span>New</span>
          </div>
          <p>Motvin Icons: 350k+ editable icons</p>
          <div className="badge-dot"></div>
          <a href="/icons" target="_blank" rel="noopener" className="badge-link">
            <span>Explore</span>
            <img alt="" src="/ASSET/svg/arrow-icon.svg" />
          </a>
        </div>

        <div className="hero-title-interactive">
          <h1 className="hero-title-rows">
            <span className="hero-title-row">
              <span className="hero-title-text-main">Get Inspired By Real App</span>
            </span>
            <span className="hero-title-row">{WORDS.map((_, i) => word(i))}</span>
          </h1>

          <div className="hero-floating-graphics" aria-hidden="true">
            <div className="container-left">
              <img alt="" className="hero-float hf-l-sparkle" src="/ASSET/Icons/imgI2.svg" width={35} height={35} />
              <img alt="" className="hero-float hf-l-at" src="/ASSET/Icons/imgI4.svg" width={40} height={40} />
              <HeroLogoSlot className="hf-l-app1" fallback="/ASSET/landing/hero-app-icon-1.webp" slot={0} logos={logos} picks={picks} onNext={next} />
              <HeroLogoSlot className="hf-l-app2" fallback="/ASSET/landing/hero-app-icon-2.webp" slot={1} logos={logos} picks={picks} onNext={next} />
            </div>
            <div className="container-right">
              <img alt="" className="hero-float hf-r-gear" src="/ASSET/Icons/imgI7.svg" width={40} height={40} />
              <HeroLogoSlot className="hf-r-app3" fallback="/ASSET/landing/hero-app-icon-3.webp" slot={2} logos={logos} picks={picks} onNext={next} />
              <HeroLogoSlot className="hf-r-app4" fallback="/ASSET/landing/hero-app-icon-4.webp" slot={3} logos={logos} picks={picks} onNext={next} />
              <img alt="" className="hero-float hf-r-sparkle" src="/ASSET/landing/hero-sparkle-green.svg" width={35} height={35} />
            </div>
          </div>
        </div>

        <p className="hero-subtitle">
          Browse screens, flows, patterns and UI elements from real apps, and save what inspires.
        </p>

        <div className="hero-cta">
          <a
            href="https://chat.whatsapp.com/JxLUrQpNpaXJ4ido6muIW6?s=cl&p=i&ilr=4"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary-large"
          >
            <span>Join Community</span>
          </a>
          <div className="hero-rating">
            <div className="rating-stars">
              <img alt="Star" src="/ASSET/svg/star-icon.svg" />
              <span className="rating-score">
                4.7
                <span className="rating-max"> / 5.0</span>
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
                poster="/ASSET/landing/hero-demo-typescale.webp"
              ></video>
            </div>
          </div>
        </div>
      </div>

    </section>
  );
}
