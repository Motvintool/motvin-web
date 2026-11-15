import Link from 'next/link';
import type { ReactNode } from 'react';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';

/** Small line icons in the text colour (the menu icons in /ASSET are white, for dark menus). */
const icon = (paths: ReactNode) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {paths}
  </svg>
);

type Entry = { title: string; text: string; href: string; icon: ReactNode; newTab?: boolean; opensRequest?: boolean };

const ENTRIES: Entry[] = [
  {
    title: 'Updates',
    text: "See what's new in Motvin",
    href: '/updates/',
    newTab: true,
    icon: icon(<><path d="M11 3l1.8 4.7 4.7 1.8-4.7 1.8L11 16l-1.8-4.7L4.5 9.5l4.7-1.8z" /><path d="M18.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" /></>),
  },
  {
    title: 'About us',
    text: 'Our story and the founder',
    href: '/about',
    icon: icon(<><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" /></>),
  },
  {
    // Opens the library's request form right over the page (onRequestApp);
    // the Requests page link is kept for anyone opening it in a new tab.
    title: 'Request apps',
    text: 'Ask for an app to be added',
    href: INSPIRATIONS_ROUTES.settingsRequests,
    opensRequest: true,
    icon: <img src="/ASSET/Icons/Motvin/app-request.svg" alt="" width={20} height={20} />,
  },
  {
    title: 'Copyrights',
    text: 'Credits and removal requests',
    href: '/copyrights',
    icon: icon(<><circle cx="12" cy="12" r="9" /><path d="M15 9.5a4 4 0 1 0 0 5" /></>),
  },
];

/**
 * Resources menu: Updates, About us, Request apps and Copyrights. The same layered
 * card as the Products and Community menus on desktop, and an accordion in
 * the hamburger panel. `onNavigate` closes the menu (and the panel) on a pick.
 */
export function CompanyDropdown({
  open,
  onNavigate,
  onRequestApp,
}: {
  open: boolean;
  onNavigate?: () => void;
  /** Opens the request form over the page; without it, the entry links to the Requests page. */
  onRequestApp?: () => void;
}) {
  return (
    <div className={`company-dropdown${open ? ' active' : ''}`} id="company-dropdown">
      <div className="company-dropdown-container">
        <p className="dropdown-heading">Resources</p>
        <div className="company-links">
          {ENTRIES.map((entry) => {
            const body = (
              <>
                <span className="company-link-icon">{entry.icon}</span>
                <span className="company-link-text">
                  <b>{entry.title}</b>
                  <span>{entry.text}</span>
                </span>
              </>
            );
            if (entry.opensRequest && onRequestApp) {
              return (
                <a
                  key={entry.title}
                  href={entry.href}
                  className="company-link"
                  onClick={(e) => {
                    // A plain click opens the form here; a modified click still opens the page in a new tab.
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                    e.preventDefault();
                    onNavigate?.();
                    onRequestApp();
                  }}
                >
                  {body}
                </a>
              );
            }
            return entry.href.startsWith('/') && !entry.newTab ? (
              <Link key={entry.title} href={entry.href} className="company-link" onClick={onNavigate}>
                {body}
              </Link>
            ) : (
              <a
                key={entry.title}
                href={entry.href}
                className="company-link"
                onClick={onNavigate}
                {...(entry.newTab ? { target: '_blank', rel: 'noopener' } : {})}
              >
                {body}
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}
