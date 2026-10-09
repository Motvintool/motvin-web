import Link from 'next/link';
import type { ReactNode } from 'react';
import { InspirationsShell } from '@/components/inspirations/InspirationsShell';
import '@/styles/theme.css';
import '@/styles/inspirations.css';
import '@/styles/profile-menu.css';
import '@/styles/legal.css';

/**
 * The shell for Motvin's public legal pages (Privacy, Terms, Copyrights): the logo, a title, a short intro,
 * sections of plain text, and links to the other two pages.
 *
 * Where people write to us. Change it here and every page follows.
 */
export const CONTACT_EMAIL = 'hello@motvin.com';

/** When these pages were last revised. */
export const LEGAL_UPDATED = '9 October 2026';

const PAGES = [
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/copyrights', label: 'Copyrights' },
] as const;

export type LegalSection = { title: string; body: ReactNode };

export function LegalPage({
  title,
  intro,
  emphasis,
  current,
  sections,
}: {
  title: string;
  intro: string;
  /** A sentence set in bold at the end of the intro: the one thing to take away. */
  emphasis?: string;
  current: (typeof PAGES)[number]['href'];
  sections: LegalSection[];
}) {
  const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

  return (
    // The same header, theme and chrome as every Inspirations page.
    <InspirationsShell>
      <div className="legal">
        <main className="legal-main">
          <h1>{title}</h1>
          <p className="legal-date">Effective date: {LEGAL_UPDATED}</p>

          <p className="legal-intro">
            {intro}
            {emphasis && <> <strong>{emphasis}</strong></>}
          </p>

          <hr className="legal-rule" />

          <ol className="legal-toc">
            {sections.map((section) => (
              <li key={section.title}>
                <a href={`#${slug(section.title)}`}>{section.title}</a>
              </li>
            ))}
          </ol>

          {sections.map((section) => (
            <section key={section.title} id={slug(section.title)} className="legal-section">
              <h2>
                {section.title}
              </h2>
              {section.body}
            </section>
          ))}
        </main>

        <footer className="legal-foot">
          <nav className="legal-foot-nav" aria-label="Legal">
            {PAGES.map((page) => (
              <Link key={page.href} href={page.href} aria-current={page.href === current ? 'page' : undefined}>
                {page.label}
              </Link>
            ))}
          </nav>
          <span>© {new Date().getFullYear()} Motvin</span>
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </footer>
      </div>
    </InspirationsShell>
  );
}
