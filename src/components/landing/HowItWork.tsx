'use client';

import { useEffect, useRef } from 'react';

/**
 * Social-proof band — port of `.howitwork-section.howitwork-redesign` in
 * motvin-ui/index.html plus the count-up in JS/index.js.
 *
 * The statistic counts from 0 to 95% over 1200ms the first time it scrolls into
 * view (40% threshold), then the observer disconnects.
 *
 * Not ported: the `.howitwork-right-col` vertical marquee in JS/index.js. That
 * element no longer exists in the markup — the section was redesigned and the
 * handler was left behind as dead code.
 */

const COUNT_TARGET = 95;
const COUNT_SUFFIX = '%';
const COUNT_DURATION = 1200;

export function HowItWork() {
  const countRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = countRef.current;
    if (!el) return;

    let frame = 0;
    const animate = () => {
      const startTime = performance.now();
      const update = (now: number) => {
        const progress = Math.min((now - startTime) / COUNT_DURATION, 1);
        el.textContent = `${Math.round(COUNT_TARGET * progress)}${COUNT_SUFFIX}`;
        if (progress < 1) frame = requestAnimationFrame(update);
      };
      frame = requestAnimationFrame(update);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          animate();
          observer.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(el);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <section className="howitwork-section howitwork-redesign" aria-labelledby="howitwork-title">
      <div className="howitwork-redesign-intro">
        <h2 id="howitwork-title">
          The products you love are designed in
          <strong>Motvin</strong>
        </h2>
        <div className="howitwork-redesign-details">
          <figure className="howitwork-redesign-quote">
            <blockquote>
              <span aria-hidden="true">&ldquo;</span>
              Everyone is able to influence, inspire, and give input without ever leaving the design
              file. That creates a really transparent, open, and honest process throughout the whole
              project.
              <span aria-hidden="true">&rdquo;</span>
            </blockquote>
            <figcaption>
              <img src="/ASSET/Images/howitwork-founder-figma.jpeg" alt="Surendar V" />
              <div>
                <strong>Surendar V</strong>
                <span>Product Designer &amp; Founder</span>
              </div>
            </figcaption>
          </figure>
          <aside className="howitwork-redesign-stat" aria-label="Usage statistic">
            <div>
              <strong
                className="howitwork-count"
                data-count={COUNT_TARGET}
                data-suffix={COUNT_SUFFIX}
                ref={countRef}
              >
                0%
              </strong>
              <p>95% of the Fortune 500 uses Figma</p>
            </div>
            <span>Based on data from March 2026.</span>
          </aside>
        </div>
      </div>
      <div className="howitwork-redesign-cta">
        <div className="howitwork-redesign-divider">
          <img src="/ASSET/svg/howitwork-divider.svg" alt="" />
          <p>Ideas no longer have to wait their turn</p>
          <img src="/ASSET/svg/howitwork-divider.svg" alt="" />
        </div>
        <a href="#" className="howitwork-redesign-button" id="howitwork-signup-btn">
          Get started
        </a>
      </div>
    </section>
  );
}
