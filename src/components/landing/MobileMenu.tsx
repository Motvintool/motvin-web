'use client';

import Link from 'next/link';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';

/**
 * The hamburger panel's list (<=1300px): every link at once under small group labels, in large type, the
 * way mobbin.com's menu reads, instead of the desktop mega-menus folded into accordions. Tools that aren't
 * live yet are plain rows with a "Soon" tag, as in the desktop Products menu.
 */

type Item = { label: string; href?: string; external?: boolean; soon?: boolean; onClick?: () => void };

const COMMUNITY = [
  ['Creative Mind’s 1', 'https://chat.whatsapp.com/JxLUrQpNpaXJ4ido6muIW6?s=cl&p=i&ilr=4'],
  ['Creative Mind’s 2', 'https://chat.whatsapp.com/KJDBfXpJLukHwo76xnoTSA?s=cl&p=i&ilr=4'],
  ['Creative Mind’s 3', 'https://chat.whatsapp.com/HP7TNbjBEE6CCfkGVMBqLA?s=cl&p=i&ilr=4'],
] as const;

export function MobileMenu({
  onNavigate,
  onRequestApp,
  instagramUrl,
  linkedinUrl,
}: {
  onNavigate: () => void;
  onRequestApp: () => void;
  instagramUrl: string;
  linkedinUrl: string;
}) {
  const groups: { title: string; items: Item[] }[] = [
    {
      title: 'Products',
      items: [
        { label: 'Inspirations', href: '/inspirations' },
        { label: 'Icons', href: '/icons', external: true },
        { label: 'Logos', href: '/logos', external: true },
        { label: 'Illustrations', href: '/illustrations', external: true },
        { label: 'Convert', soon: true },
        { label: 'Extension', soon: true },
        { label: 'Typescales', soon: true },
      ],
    },
    {
      title: 'Resources',
      items: [
        { label: 'Updates', href: '/updates/', external: true },
        { label: 'About us', href: '/about' },
        // Opens the library's request form right over the page, as the desktop Resources menu does.
        { label: 'Request apps', href: INSPIRATIONS_ROUTES.settingsRequests, onClick: onRequestApp },
        { label: 'Copyrights', href: '/copyrights' },
      ],
    },
    { title: 'Community', items: COMMUNITY.map(([label, href]) => ({ label, href, external: true })) },
    {
      title: 'Socials',
      items: [
        { label: 'Instagram', href: instagramUrl, external: true },
        { label: 'LinkedIn', href: linkedinUrl, external: true },
      ],
    },
  ];

  const row = (item: Item) => {
    const body = (
      <>
        <span className="mi-mm-label">{item.label}</span>
        {item.soon && <span className="mi-mm-soon">Soon</span>}
      </>
    );
    if (item.soon || !item.href) {
      return (
        <span className="mi-mm-link is-soon" aria-disabled="true">
          {body}
        </span>
      );
    }
    if (item.onClick) {
      const run = item.onClick;
      return (
        <a
          className="mi-mm-link"
          href={item.href}
          onClick={(e) => {
            e.preventDefault();
            onNavigate();
            run();
          }}
        >
          {body}
        </a>
      );
    }
    if (item.external) {
      return (
        <a className="mi-mm-link" href={item.href} target="_blank" rel="noopener noreferrer" onClick={onNavigate}>
          {body}
        </a>
      );
    }
    return (
      <Link className="mi-mm-link" href={item.href} onClick={onNavigate}>
        {body}
      </Link>
    );
  };

  return (
    <nav className="mi-mm" aria-label="Menu">
      {groups.map((group) => (
        <section className="mi-mm-group" key={group.title}>
          <h2 className="mi-mm-title">{group.title}</h2>
          <ul className="mi-mm-list">
            {group.items.map((item) => (
              <li key={item.label}>{row(item)}</li>
            ))}
          </ul>
        </section>
      ))}
    </nav>
  );
}
