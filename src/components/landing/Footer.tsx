'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useStoredValue, writeStoredValue } from '@/hooks/useStoredValue';
import { LANDING_TRANSLATIONS, LANGUAGE_CODES, type Language } from '@/lib/i18n/translations';
import { MotvinWordmark } from './MotvinWordmark';

/**
 * Site footer, styled like the Inspirations sections above it, with the
 * language switcher and cookie-settings link from the original site.
 *
 * Translation approach is the original's: walk the page's text nodes and swap
 * any whose trimmed text has an entry in the chosen language. Each node
 * remembers its English source on first pass so switching languages repeatedly
 * always translates from English rather than from the previous translation.
 *
 * This works here because the landing page's content is static — nothing
 * re-renders these nodes after hydration, so React never overwrites the
 * swapped text. It is not a general-purpose i18n layer: any section that
 * becomes dynamic will need its strings moved into the translation map and
 * rendered through it instead.
 */

/** How much of the footer has to be showing before the wordmark starts to rise (0–1). */
const WORDMARK_RISE_START = 0;

const LANGUAGE_STORAGE_KEY = 'motvin_language';
const DEFAULT_LANGUAGE: Language = 'English';
// Room kept clear at the top when deciding whether the footer fits on
// screen. None needed: by the time the footer shows, the page has been
// scrolled down, so the navbar has already tucked away into its compact
// buttons, which sit over the footer's empty top padding.
const REVEAL_CLEARANCE = 0;

// Text nodes inside these are left alone — the switcher's own labels must stay
// in their native spelling.
const SKIP_WITHIN = 'script, style, .lpi-footer-lang';

// Remembers each text node's original English text across language switches.
const englishSource = new WeakMap<Text, string>();

function applyLanguage(language: string) {
  const translations = LANDING_TRANSLATIONS[language] ?? {};
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const parent = node.parentElement;
    const raw = node.textContent ?? '';

    let source = englishSource.get(node);
    if (source === undefined) {
      source = raw.trim();
      if (!source || !parent || parent.closest(SKIP_WITHIN)) continue;
      englishSource.set(node, source);
    }

    const leading = raw.match(/^\s*/)?.[0] ?? '';
    const trailing = raw.match(/\s*$/)?.[0] ?? '';
    node.textContent = `${leading}${translations[source] ?? source}${trailing}`;
  }

  document.documentElement.lang = LANGUAGE_CODES[language as Language] ?? 'en';
}

function parseLanguage(raw: string | null): string {
  return raw && raw in LANGUAGE_CODES ? raw : DEFAULT_LANGUAGE;
}

export function Footer() {
  // Server-renders as English — which is what the static site also served
  // before its script ran — then resolves to the stored language on the client.
  const [language, refreshLanguage] = useStoredValue(
    LANGUAGE_STORAGE_KEY,
    DEFAULT_LANGUAGE as string,
    parseLanguage,
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLElement>(null);
  // The page slides up to uncover the footer, but only while the whole footer
  // fits on screen; a taller one would hide its top for good.
  const [reveal, setReveal] = useState(false);
  const wordmarkRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const footer = footerRef.current;
    if (!footer) return;
    // Measured without the top padding the reveal itself adds, so turning it
    // on can never push the footer over the limit and flip it back off.
    const check = () => {
      const height = footer.offsetHeight - parseFloat(getComputedStyle(footer).paddingTop);
      setReveal(height <= window.innerHeight - REVEAL_CLEARANCE);
    };
    const timer = window.setTimeout(check, 0);
    const observer = new ResizeObserver(check);
    observer.observe(footer);
    window.addEventListener('resize', check);
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
      window.removeEventListener('resize', check);
    };
  }, []);

  // The wordmark rises up from below the footer's bottom edge as the footer
  // comes into view, tied to the scroll (as on mobbin.com): it starts as
  // soon as a sliver of the footer shows and lands when all of it does.
  // Scrolling back sinks it again.
  //
  // The same reading also sets the page's own background: dark once the
  // footer is mostly in view, white above it. That is what shows when a
  // trackpad bounces past either end of the page, so a hard scroll to the
  // bottom no longer flashes white under the dark footer.
  useEffect(() => {
    const footer = footerRef.current;
    const wordmark = wordmarkRef.current;
    if (!footer || !wordmark) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const root = document.documentElement;
    const sheet = document.querySelector<HTMLElement>('.landing-sheet');
    let frame = 0;
    const update = () => {
      frame = 0;
      // The footer either scrolls in, or sits stuck under the page sheet that
      // slides up off it; whichever edge is lower is where it starts to show.
      const top = Math.max(footer.getBoundingClientRect().top, sheet ? sheet.getBoundingClientRect().bottom : -Infinity);
      const shown = Math.min(1, Math.max(0, (window.innerHeight - top) / footer.offsetHeight));
      root.classList.toggle('lpi-at-footer', shown > 0.5);
      if (still) return;
      const rise = Math.min(1, Math.max(0, (shown - WORDMARK_RISE_START) / (1 - WORDMARK_RISE_START)));
      // Ease out: quick at first, settling gently into place.
      const eased = 1 - Math.pow(1 - rise, 3);
      wordmark.style.setProperty('--lpi-wm-rise', String(1 - eased));
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      root.classList.remove('lpi-at-footer');
    };
  }, []);

  // Translation rewrites text nodes across the whole page, so it has to run
  // after the sections have rendered — not during.
  useEffect(() => {
    applyLanguage(language);
  }, [language]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  const chooseLanguage = useCallback(
    (next: string) => {
      writeStoredValue(LANGUAGE_STORAGE_KEY, next);
      refreshLanguage();
      setMenuOpen(false);
    },
    [refreshLanguage],
  );

  return (
    <footer className={`lpi-footer${reveal ? ' is-reveal' : ''}`} ref={footerRef}>
      <div className="lpi-footer-inner">
        <div className="lpi-footer-top">
          <div className="lpi-footer-brand">
            <img className="lpi-footer-mark" src="/ASSET/Icons/footer-logo.svg" alt="Motvin" />
            <p>
              AI-powered UI design platform. Convert websites, generate design systems, and build
              modern interfaces faster.
            </p>
            {/* Who owns the screens and logos shown on Motvin, and where owners
                can ask for them to be removed (the Copyrights page's removal section). */}
            <p className="lpi-footer-note">
              App names, logos and screenshots belong to their owners. Motvin isn&apos;t affiliated with them.{' '}
              <Link href="/copyrights#ask-for-a-change-or-removal">Request a removal</Link>
            </p>
            <a
              className="lpi-footer-community"
              href="https://chat.whatsapp.com/JxLUrQpNpaXJ4ido6muIW6?s=cl&p=i&ilr=4"
              target="_blank"
              rel="noopener noreferrer"
            >
              Join Community
            </a>
          </div>

          <nav className="lpi-footer-links" aria-label="Footer">
            <div>
              <h2>Tools</h2>
              {/* Not live yet: plain text with a "Soon" tag, like the Resources column. */}
              <span className="is-soon" title="Coming Soon" aria-disabled="true">Color Generator</span>
              <span className="is-soon" title="Coming Soon" aria-disabled="true">Typescale</span>
              <span className="is-soon" title="Coming Soon" aria-disabled="true">Live Convert</span>
            </div>
            <div>
              <h2>Resources</h2>
              {/* Not live yet: plain text, so a click doesn't jump to the top of the page. */}
              <span className="is-soon" title="Coming Soon" aria-disabled="true">Documentation</span>
              <span className="is-soon" title="Coming Soon" aria-disabled="true">Blog</span>
              <span className="is-soon" title="Coming Soon" aria-disabled="true">Tutorials</span>
              <a
                href="https://chat.whatsapp.com/JxLUrQpNpaXJ4ido6muIW6?s=cl&p=i&ilr=4"
                target="_blank"
                rel="noopener noreferrer"
              >
                Community
              </a>
              <Link href="/about">About us</Link>
            </div>
            <div>
              <h2>Library</h2>
              <a href="/icons" target="_blank">Icons</a>
              <a href="/logos" target="_blank">Logos</a>
              <a href="/illustrations" target="_blank">Illustrations</a>
            </div>
          </nav>
        </div>

        <div className="lpi-footer-bar">
          <div className="lpi-footer-legal">
            <span>© {new Date().getFullYear()} Motvin</span>
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
            <a href="/copyrights">Copyright</a>
            <button
              type="button"
              className="lpi-footer-cookies"
              id="footer-cookie-settings"
              // ConsentBanners owns the banner; ask it to open on the settings tab.
              onClick={() => document.dispatchEvent(new CustomEvent('motvin:open-cookie-settings'))}
            >
              Cookie settings
            </button>
          </div>

          <div className="lpi-footer-end">
            <div className="lpi-footer-socials">
              <a href="https://www.instagram.com/siren.uix" target="_blank" rel="noopener noreferrer" aria-label="Instagram">
                <img src="/ASSET/Icons/instagram-icon.svg" alt="" />
              </a>
              <a href="https://www.linkedin.com/in/sirenuix/" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn">
                <img src="/ASSET/Icons/linkedin-icon.svg" alt="" />
              </a>
              <a href="https://www.behance.net/surendarv" target="_blank" rel="noopener noreferrer" aria-label="Behance">
                <img src="/ASSET/Icons/behance-icon.svg" alt="" />
              </a>
            </div>

            <div className={`lpi-footer-lang${menuOpen ? ' is-open' : ''}`} ref={menuRef}>
              <button
                type="button"
                className="lpi-footer-lang-button"
                aria-expanded={menuOpen}
                aria-controls="footer-language-options"
                onClick={() => setMenuOpen((open) => !open)}
              >
                <img src="/ASSET/Icons/language.svg" alt="" />
                <span>{language}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m6 15 6-6 6 6" />
                </svg>
              </button>
              {/* Opens upwards, away from the wordmark. */}
              <div
                className="lpi-footer-lang-options"
                id="footer-language-options"
                role="menu"
                aria-label="Select language"
              >
                {Object.keys(LANGUAGE_CODES).map((name) => (
                  <button
                    key={name}
                    type="button"
                    role="menuitem"
                    data-language={name}
                    className={name === language ? 'is-current' : undefined}
                    onClick={() => chooseLanguage(name)}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* The outlined wordmark, edge to edge and running off the bottom.
          Each letter hops when hovered, and its dots spin. */}
      <div className="lpi-footer-wordmark" ref={wordmarkRef}>
        <MotvinWordmark />
      </div>
    </footer>
  );
}
