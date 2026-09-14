'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useStoredValue, writeStoredValue } from '@/hooks/useStoredValue';
import { LANDING_TRANSLATIONS, LANGUAGE_CODES, type Language } from '@/lib/i18n/translations';

/**
 * Site footer — port of `.footer-section` in motvin-ui/index.html plus the
 * language switcher and cookie-settings link from JS/index.js.
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

const LANGUAGE_STORAGE_KEY = 'motvin_language';
const DEFAULT_LANGUAGE: Language = 'English';

// Text nodes inside these are left alone — the switcher's own labels must stay
// in their native spelling.
const SKIP_WITHIN = 'script, style, .figma-footer-language-menu';

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
    <footer className="footer-section">
      <div className="figma-footer-content">
        <div className="figma-footer-top">
          <div className="figma-footer-brand">
            <img className="figma-footer-mark" src="/ASSET/Icons/footer-logo.svg" alt="Motvin" />
            <p>
              AI-powered UI design platform. Convert websites, generate design systems, and build
              modern interfaces faster.
            </p>
            <div className="figma-footer-socials">
              <a href="https://www.instagram.com/siren.uix" target="_blank" aria-label="Instagram">
                <img src="/ASSET/Icons/instagram-icon.svg" alt="" />
              </a>
              <a href="https://www.linkedin.com/in/sirenuix/" target="_blank" aria-label="LinkedIn">
                <img src="/ASSET/Icons/linkedin-icon.svg" alt="" />
              </a>
              <a href="https://www.behance.net/surendarv" target="_blank" aria-label="Behance">
                <img src="/ASSET/Icons/behance-icon.svg" alt="" />
              </a>
            </div>
          </div>
          <div className="figma-footer-links">
            <div>
              <h2>Tools</h2>
              <a href="/MOTVIN/styles" target="_blank">Color Generator</a>
              <a href="/MOTVIN/typeface" target="_blank">Typescale</a>
              <a href="/MOTVIN" target="_blank">Live Convert</a>
            </div>
            <div>
              <h2>Resources</h2>
              <a href="#" title="Coming Soon">Documentation</a>
              <a href="#" title="Coming Soon">Blog</a>
              <a href="#" title="Coming Soon">Tutorials</a>
              <a
                href="https://chat.whatsapp.com/JxLUrQpNpaXJ4ido6muIW6?s=cl&p=i&ilr=4"
                target="_blank"
              >
                Community
              </a>
            </div>
            <div>
              <h2>Library</h2>
              <a href="/icons" target="_blank">Icons</a>
              <a href="/logos" target="_blank">Logos</a>
              <a href="/illustrations" target="_blank">Illustrations</a>
            </div>
            <div>
              <h2>Company</h2>
              <a href="/about-me" target="_blank">About</a>
              <a href="https://www.linkedin.com/in/sirenuix/" target="_blank">Careers</a>
              <a href="mailto:surendarv638@gmail.com" target="_blank">Contacts</a>
            </div>
          </div>
        </div>
        <img
          className="figma-footer-illustration"
          src="/ASSET/svg/motvin-illustration.svg"
          alt="Motvin"
        />
        <div className="footer-utility">
          <button
            type="button"
            id="footer-cookie-settings"
            // ConsentBanners owns the banner; ask it to open on the settings tab.
            onClick={() =>
              document.dispatchEvent(new CustomEvent('motvin:open-cookie-settings'))
            }
          >
            Cookie settings
          </button>
          <span aria-hidden="true"></span>
          <div
            className={`figma-footer-language-menu${menuOpen ? ' is-open' : ''}`}
            ref={menuRef}
          >
            <button
              type="button"
              className="figma-footer-language"
              aria-expanded={menuOpen}
              aria-controls="footer-language-options"
              onClick={() => setMenuOpen((open) => !open)}
            >
              <img src="/ASSET/Icons/language.svg" alt="" />
              <span>{language}</span>
              <img
                className="figma-footer-language-arrow"
                src="/ASSET/Icons/desktop-arrow.svg"
                alt=""
              />
            </button>
            <div
              className="figma-footer-language-options"
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
                  onClick={() => chooseLanguage(name)}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="figma-footer-colors" aria-hidden="true">
        <i></i>
        <i></i>
        <i></i>
        <i></i>
      </div>
    </footer>
  );
}
