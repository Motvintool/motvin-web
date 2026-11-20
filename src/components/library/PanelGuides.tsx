'use client';

import type { ReactNode } from 'react';
import type { CategoryConfig } from '@/lib/config/categories';
import { CONTACT_EMAIL } from '@/lib/contact';
import { COMMUNITY_URL } from './LibraryTopHeader';
import { DETAIL_SHORTCUTS, SEARCH_SHORTCUT } from './shortcuts';

/**
 * The right panel's Plugins and Help tabs. They were one line of "coming
 * soon" text; now Plugins says plainly that none have shipped and points to
 * what already works, and Help is a real guide: first steps, the keyboard
 * shortcuts, and where to go next. Everything listed exists in the library
 * today — no plugin is named before it ships.
 */

type Nouns = Pick<CategoryConfig, 'noun' | 'nounPlural'>;

// Small line icons, 24-unit grid, drawn like the rest of the panel's icons.
const ICONS: Record<string, ReactNode> = {
  code: <path d="M16 18l6-6-6-6M8 6l-6 6 6 6" />,
  download: <path d="M12 3v12m0 0l-5-5m5 5l5-5M4 21h16" />,
  stack: <path d="M12 3l9 5-9 5-9-5 9-5zm-9 9l9 5 9-5m-18 4l9 5 9-5" />,
  people: (
    <path d="M16 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm13 9v-1a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  ),
  news: <path d="M4 4h12v16H6a2 2 0 0 1-2-2V4zm12 4h4v10a2 2 0 0 1-2 2h-2M8 8h4M8 12h4M8 16h4" />,
  license: <path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6l8-3zm-3 9l2 2 4-4" />,
  mail: <path d="M3 6h18v12H3V6zm0 0l9 7 9-7" />,
  search: <path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zm10 3l-5-5" />,
  sliders: <path d="M4 21v-7m0-4V3m8 18v-9m0-4V3m8 18v-5m0-4V3M1 14h6m2-6h6m2 8h6" />,
  palette: (
    <path d="M12 21a9 9 0 1 1 9-9c0 2.5-2 3.5-4 3.5h-2a2 2 0 0 0-1.5 3.3A1.4 1.4 0 0 1 12 21zM7.5 11a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm4-3a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm4.5 3a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" />
  ),
  edit: <path d="M4 20h4L19 9l-4-4L4 16v4zm9-13l4 4" />,
};

function Icon({ name }: { name: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICONS[name]}
    </svg>
  );
}

function Row({
  icon,
  title,
  text,
  href,
}: {
  icon: string;
  title: string;
  text: string;
  /** Rows with an href are links; the arrow only shows on those. */
  href?: string;
}) {
  const body = (
    <>
      <span className="mi-rp-guide-icon">
        <Icon name={icon} />
      </span>
      <span className="mi-rp-guide-copy">
        <span className="mi-rp-guide-name">{title}</span>
        <span className="mi-rp-guide-text">{text}</span>
      </span>
    </>
  );
  if (!href) return <div className="mi-rp-guide-row">{body}</div>;
  const external = /^(https?:|mailto:)/.test(href);
  return (
    <a
      className="mi-rp-guide-row is-link"
      href={href}
      {...(external && !href.startsWith('mailto:') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {body}
      {/* One mark for every link row, whether it stays on the site or not. */}
      <span className="mi-rp-guide-go" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 6l6 6-6 6" />
        </svg>
      </span>
    </a>
  );
}

const RELEASE_NOTES = { icon: 'news', title: 'Release notes', href: '/updates/' };

export function PluginsGuide({ noun, nounPlural }: Nouns) {
  return (
    <div className="mi-rp-guide">
      <div className="mi-rp-guide-hero">
        <span className="mi-rp-guide-hero-icon">
          <img src="/ASSET/Icons/sidebar-plugins.svg" alt="" />
        </span>
        <span className="mi-rp-guide-badge">Coming soon</span>
        <h3 className="mi-rp-guide-hero-title">Plugins are on the way</h3>
        <p className="mi-rp-guide-hero-text">
          Motvin {nounPlural}, right inside the apps you design and build with.
        </p>
      </div>

      <section className="mi-rp-guide-section">
        <span className="mi-rp-title">Works today</span>
        <Row icon="code" title="Copy as code" text={`SVG, JSX, Vue or HTML from any ${noun}.`} />
        <Row icon="download" title="Download" text="SVG, or PNG from 16 to 512px." />
        <Row icon="stack" title="Export in bulk" text={`Select several ${nounPlural}, copy or download them at once.`} />
      </section>

      <section className="mi-rp-guide-section">
        <span className="mi-rp-title">Stay in the loop</span>
        <Row icon="people" title="Community" text="Hear first when plugins ship." href={COMMUNITY_URL} />
        <Row {...RELEASE_NOTES} text="Everything new in Motvin." />
      </section>
    </div>
  );
}

export function HelpGuide({ noun, nounPlural }: Nouns) {
  return (
    <div className="mi-rp-guide">
      {/* One line each, so nothing wraps to a stray word in the panel's width. */}
      <section className="mi-rp-guide-section">
        <span className="mi-rp-title">Getting started</span>
        <Row icon="search" title="Search" text="Press ⌘K and type what you need." />
        <Row icon="sliders" title="Filter" text="Pick sources, styles and licenses." />
        <Row icon="palette" title="Recolor" text={`Paint every ${noun} one color.`} />
        <Row icon="edit" title="Customize" text="Open one to resize and export." />
      </section>

      <section className="mi-rp-guide-section">
        <span className="mi-rp-title">Shortcut Actions</span>
        <div className="mi-rp-guide-keys">
          {[[SEARCH_SHORTCUT, `Search ${nounPlural}`] as const, ...DETAIL_SHORTCUTS].map(([keys, action]) => (
            <div className="mi-rp-guide-key" key={action}>
              <span>{action}</span>
              <span className="mi-rp-kbd-group">
                {keys.map((key) => (
                  <kbd className="mi-rp-kbd" key={key}>
                    {key}
                  </kbd>
                ))}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="mi-rp-guide-section">
        <span className="mi-rp-title">Resources</span>
        <Row {...RELEASE_NOTES} text="Everything new in Motvin." />
        <Row icon="people" title="Community" text="Ask questions, share ideas." href={COMMUNITY_URL} />
        <Row icon="license" title="Licenses and attribution" text={`How each source's ${nounPlural} may be used.`} href="/copyrights" />
        <Row icon="mail" title="Contact us" text={CONTACT_EMAIL} href={`mailto:${CONTACT_EMAIL}`} />
      </section>
    </div>
  );
}
