import Link from 'next/link';
import type { ReactNode } from 'react';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import { McpIcon } from '@/components/mcp/McpShared';

/** One of the library's own icons (the Settings set), drawn in the menu's text colour. */
const libraryIcon = (file: string) => (
  <span
    aria-hidden="true"
    style={{ display: 'block', width: 20, height: 20, background: 'currentColor', WebkitMask: `url(${file}) center / contain no-repeat`, mask: `url(${file}) center / contain no-repeat` }}
  />
);

/** The tools shown on the Motvin MCP tile, each in its brand colour (as on its setup guide; Figma keeps its own). */
const FEATURE_TOOLS = [
  { id: 'claude', color: '#D97757' },
  { id: 'openai', color: '#10A37F' },
  { id: 'cursor', color: '#141414' },
  { id: 'vscode', color: '#007ACC' },
  { id: 'figma', color: undefined },
] as const;

type Entry = { title: string; text: string; href: string; icon: ReactNode; newTab?: boolean; opensRequest?: boolean; badge?: string; feature?: boolean };

const ENTRIES: Entry[] = [
  {
    title: 'Motvin MCP',
    text: 'Connect your AI tools',
    badge: 'New',
    feature: true,
    href: '/mcp',
    // The plug used for AI tools in Settings and the top bar.
    icon: libraryIcon('/ASSET/Icons/ai-tools.svg'),
  },
  {
    title: 'Updates',
    text: "See what's new in Motvin",
    href: '/updates/',
    newTab: true,
    // The same party popper as "Week's new apps" in the library's profile menu.
    icon: libraryIcon('/ASSET/Icons/Motvin/week-app-release.svg'),
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
    title: 'About us',
    text: 'Our story and the founder',
    href: '/about',
    // The person icon from Settings → Account.
    icon: libraryIcon('/ASSET/Icons/user-account.svg'),
  },
  {
    title: 'Copyrights',
    text: 'Credits and removal requests',
    href: '/copyrights',
    icon: libraryIcon('/ASSET/Icons/copyrights.svg'),
  },
];

/**
 * Resources menu, as a bento grid on desktop: a wide Motvin MCP tile on top, then Updates,
 * Request apps, About us and Copyrights. The same layered
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
                  <b>
                    {entry.title}
                    {entry.badge && <span className="product-soon company-link-badge">{entry.badge}</span>}
                  </b>
                  <span>{entry.text}</span>
                </span>
                {entry.feature && (
                  <span className="company-link-tools" aria-hidden="true">
                    {FEATURE_TOOLS.map((tool) => (
                      <span key={tool.id} style={tool.color ? { color: tool.color } : undefined}>
                        <McpIcon id={tool.id} size={14} />
                      </span>
                    ))}
                  </span>
                )}
                {/* Shown on hover: the home page cards' corner arrow. */}
                <img className="company-link-arrow" src="/ASSET/Icons/Motvin/view-apps.svg" alt="" width={16} height={16} aria-hidden="true" />
              </>
            );
            if (entry.opensRequest && onRequestApp) {
              return (
                <a
                  key={entry.title}
                  href={entry.href}
                  className={`company-link${entry.feature ? ' is-feature' : ''}`}
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
              <Link key={entry.title} href={entry.href} className={`company-link${entry.feature ? ' is-feature' : ''}`} onClick={onNavigate}>
                {body}
              </Link>
            ) : (
              <a
                key={entry.title}
                href={entry.href}
                className={`company-link${entry.feature ? ' is-feature' : ''}`}
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
