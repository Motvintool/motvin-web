'use client';

import Link from 'next/link';
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '@/components/shared/AuthProvider';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import { CLIENT_GROUPS, installLink, MCP_CLIENTS, USAGE_PROMPTS, type InstallKind, type McpClient } from '@/lib/mcp/clients';
import { ClientGrid } from './ClientGrid';
import { CopyButton, McpIcon, useServerUrl } from './McpShared';

/**
 * The MCP setup guides: /mcp/clients (every tool) and /mcp/clients/<id> (one
 * tool's steps). A three-column docs layout in the site's own look — the
 * list of tools on the left, the guide in the middle, "On this page" on the
 * right — under the landing navbar.
 */

const GUIDE_TOC = [
  { id: 'setup', label: 'Setup' },
  { id: 'usage', label: 'Usage' },
  { id: 'remove', label: 'Disconnect' },
  { id: 'help', label: 'Troubleshooting' },
];

const COMMUNITY_URL = 'https://chat.whatsapp.com/JxLUrQpNpaXJ4ido6muIW6?s=cl&p=i&ilr=4';

/** The same few fixes apply to every tool, so they live here rather than per client. */
const TROUBLESHOOTING = [
  {
    q: 'The browser didn’t open',
    a: 'Run the connect step again, or open the sign-in link your tool shows.',
  },
  {
    q: 'It won’t accept a guest account',
    a: 'Motvin MCP needs a full account. Sign in with it, then click **Allow**.',
  },
  {
    q: 'I’m asked to sign in again',
    a: 'Sign-in renews while you use it. After 30 days unused, sign in once more.',
  },
  {
    q: 'How do I disconnect?',
    a: 'Click **Disconnect** next to the tool in **Settings** → **AI tools** on motvin.com; it loses access right away. To take Motvin out of the tool too, see **Disconnect or remove** above. Your account isn’t affected.',
  },
];

/**
 * `**bold**` marks a menu or button name, backticks a command or file name,
 * and `{url}` becomes the server address.
 */
function rich(text: string, url: string): ReactNode {
  return text
    .replaceAll('{url}', url)
    .split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
    .map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) return <b key={i}>{part.slice(2, -2)}</b>;
      if (part.length > 1 && part.startsWith('`') && part.endsWith('`')) {
        const code = part.slice(1, -1);
        // Short commands stay whole on one line; a long one may wrap so it never runs past its box.
        return (
          <code key={i} className={`mcd-inline${code.length > 40 ? ' is-long' : ''}`}>
            {code}
          </code>
        );
      }
      return <Fragment key={i}>{part}</Fragment>;
    });
}

function SideLink({ href, active, icon, children }: { href: string; active?: boolean; icon: ReactNode; children: ReactNode }) {
  return (
    <li>
      <Link href={href} className={active ? 'is-active' : undefined} aria-current={active ? 'page' : undefined}>
        <span className="mcd-side-icon">{icon}</span>
        {children}
      </Link>
    </li>
  );
}

/** Scrolls the current item into view inside its own scrolling list (not the page). */
function useRevealActive<T extends HTMLElement>(axis: 'x' | 'y') {
  const ref = useRef<T>(null);
  useEffect(() => {
    const box = ref.current;
    const active = box?.querySelector<HTMLElement>('.is-active');
    if (!box || !active) return;
    if (axis === 'y') {
      const top = active.offsetTop - box.clientHeight / 2 + active.offsetHeight / 2;
      if (active.offsetTop + active.offsetHeight > box.clientHeight) box.scrollTop = top;
    } else {
      box.scrollLeft = active.offsetLeft - box.clientWidth / 2 + active.offsetWidth / 2;
    }
  }, [axis]);
  return ref;
}

/** The side list drops a trailing "CLI" to stay short; the page title keeps the full name. */
const navName = (name: string) => name.replace(/ CLI$/, '');

function Sidebar({ activeId }: { activeId: string | null }) {
  const ref = useRevealActive<HTMLElement>('y');
  const { user } = useAuth();
  const signedIn = Boolean(user && !user.isAnonymous);
  return (
    <aside className="mcd-side" aria-label="MCP documentation" ref={ref}>
      {/* One list: each group (Terminal, Editors, Web apps) under a small heading, "Other clients" last.
          The All tools page stays one click away in the breadcrumb. */}
      <ul>
        {[...CLIENT_GROUPS.map((group) => ({ key: group.id as string, label: group.label as string | null })), { key: 'rest', label: null }].map(({ key, label }) => (
          <Fragment key={key}>
            <li className={`mcd-side-group-label${label ? '' : ' is-gap'}`} aria-hidden={label ? undefined : true}>
              {label}
            </li>
            {MCP_CLIENTS.filter((client) => (client.group ?? 'rest') === key).map((client) => (
              <SideLink
                key={client.id}
                href={`/mcp/clients/${client.id}`}
                active={client.id === activeId}
                icon={
                  // Quiet grey marks; only the open tool shows its brand colour.
                  <span style={client.id === activeId ? { color: client.color } : undefined}>
                    <McpIcon id={client.icon} size={16} mono={client.id !== activeId} />
                  </span>
                }
              >
                {navName(client.name)}
                {client.legacy && <span className="mcd-side-tag">Legacy</span>}
              </SideLink>
            ))}
          </Fragment>
        ))}
      </ul>
      {/* Signed in: one click to the tools you've connected and your usage. */}
      {signedIn && (
        <Link href={INSPIRATIONS_ROUTES.settingsTools} className="mcd-side-card">
          <span className="mcd-side-card-icon" aria-hidden="true">
            <span className="mcd-side-plug" />
          </span>
          <span className="mcd-side-card-text">
            <b>Your AI tools</b>
            <span>Tools and usage</span>
          </span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m9 6 6 6-6 6" />
          </svg>
        </Link>
      )}
    </aside>
  );
}

/** Phones: the sidebar is hidden, so the tools sit in one row you can swipe. */
function MobileNav({ activeId }: { activeId: string | null }) {
  const ref = useRevealActive<HTMLElement>('x');
  return (
    <nav className="mcd-mnav" aria-label="Supported clients" ref={ref}>
      <Link href="/mcp/clients" className={activeId === null ? 'is-active' : undefined}>
        All tools
      </Link>
      {MCP_CLIENTS.map((client) => (
        <Link key={client.id} href={`/mcp/clients/${client.id}`} className={client.id === activeId ? 'is-active' : undefined} aria-current={client.id === activeId ? 'page' : undefined}>
          <span style={{ color: client.color }}>
            <McpIcon id={client.icon} size={16} mono={client.id === activeId} />
          </span>
          {navName(client.name)}
        </Link>
      ))}
    </nav>
  );
}

function Toc({ items }: { items: { id: string; label: string }[] }) {
  // The section nearest the top of the screen is the current one.
  const [current, setCurrent] = useState(items[0]?.id);
  useEffect(() => {
    const sections = items.map((item) => document.getElementById(item.id)).filter((el): el is HTMLElement => Boolean(el));
    const update = () => {
      let id = sections[0]?.id;
      for (const section of sections) if (section.getBoundingClientRect().top < window.innerHeight * 0.35) id = section.id;
      setCurrent(id);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, [items]);

  return (
    <nav className="mcd-toc" aria-label="On this page">
      <p className="mcd-toc-label">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          <path d="M4 6h16M4 12h10M4 18h13" />
        </svg>
        On this page
      </p>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <a href={`#${item.id}`} className={item.id === current ? 'is-active' : undefined} aria-current={item.id === current ? 'true' : undefined}>
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Shell({ activeId, toc, children }: { activeId: string | null; toc?: { id: string; label: string }[]; children: ReactNode }) {
  return (
    <div className="mcd">
      <Sidebar activeId={activeId} />
      <article className="mcd-main">
        <MobileNav activeId={activeId} />
        {children}
      </article>
      {toc ? <Toc items={toc} /> : <span aria-hidden="true" />}
    </div>
  );
}

/** "MCP / Clients / Claude": where this page sits, on the same line as the side labels. */
function Crumbs({ current }: { current?: string }) {
  return (
    <nav className="mcd-crumbs" aria-label="Breadcrumb">
      <Link href="/mcp">MCP</Link>
      <span aria-hidden="true">/</span>
      {current ? <Link href="/mcp/clients">Clients</Link> : <span aria-current="page">Clients</span>}
      {current ? (
        <>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{current}</span>
        </>
      ) : null}
    </nav>
  );
}

/** One click: the tool opens with Motvin filled in; the Setup steps are the by-hand way. */
function InstallButton({ client, kind, url }: { client: McpClient; kind: InstallKind; url: string }) {
  // Claude Web and Replit Web open in a new browser tab; the rest open a desktop app.
  const web = kind === 'claude-web' || kind === 'replit-web';
  return (
    <a className="mcd-install-btn" href={installLink(kind, url)} {...(web ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
      <McpIcon id={client.icon} size={18} />
      Add to {client.name}
      <span className="nav-social-tip" aria-hidden="true">
        {web ? `Opens ${kind === 'replit-web' ? 'Replit' : 'Claude'} with Motvin filled in` : `Needs ${client.name} installed`}
      </span>
    </a>
  );
}

/**
 * Tools no link can open: the same "Add to …" button copies what to paste instead —
 * the setup command or prompt, the config snippet, or (for settings pages) the address.
 */
function QuickCopyButton({ client, url }: { client: McpClient; url: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const quick = client.quickCopy;
  const value = quick ? quick.value.replaceAll('{url}', url) : url;
  const where = client.id === 'other' ? 'your tool' : client.name;
  // Every guide's button reads "Add to …"; the tooltip says what the click copies and where it goes.
  const what = quick?.kind ?? 'address';
  const into = quick?.kind === 'command' ? 'your terminal' : quick?.kind === 'config' ? quick.file : where;
  const tip = client.quickOpen ? `Copies the ${what} and opens ${where}` : `Copies the ${what} to paste into ${into}`;
  return (
    <button
      type="button"
      className="mcd-install-btn"
      onClick={() => {
        // Copy first (the page must still have focus), then open the tool's page if it has one.
        const copy = navigator.clipboard?.writeText(value).then(() => setCopied(true)) ?? Promise.resolve();
        if (client.quickOpen) {
          const page = client.quickOpen;
          // Web pages open in a new tab; an app link (antigravity-ide://) is handed to the system instead.
          void copy.finally(() => (page.startsWith('http') ? window.open(page, '_blank', 'noopener,noreferrer') : (window.location.href = page)));
        }
      }}
      aria-live="polite"
    >
      <McpIcon id={client.icon} size={18} />
      {copied ? 'Copied' : `Add to ${where}`}
      <span className="nav-social-tip" aria-hidden="true">
        {tip}
      </span>
    </button>
  );
}

function CodeBlock({ code }: { code: string }) {
  return (
    <div className={`mcd-code${code.includes('\n') ? ' is-multi' : ''}`}>
      <pre>{code}</pre>
      <CopyButton value={code} className="mcd-code-copy" icon />
    </div>
  );
}

/** /mcp/clients: every tool as a card. */
export function McpClientsIndex() {
  const url = useServerUrl();
  return (
    <Shell activeId={null}>
      <Crumbs />
      <h1 className="mcd-title">Choose your tool</h1>
      <p className="mcd-intro">Motvin works with any AI tool that supports MCP over HTTP with sign-in. Pick yours for step-by-step setup — the address is the same for all of them.</p>
      <div className="mcpp-address mcd-address">
        <code>{url}</code>
        <CopyButton value={url} label="Copy address" />
      </div>
      {CLIENT_GROUPS.map((group) => (
        <section key={group.id} className="mcd-group">
          <h2 className="mcd-group-label">{group.label}</h2>
          <ClientGrid clients={MCP_CLIENTS.filter((client) => client.group === group.id)} />
        </section>
      ))}
      <section className="mcd-group">
        <h2 className="mcd-group-label">Other</h2>
        <ClientGrid clients={MCP_CLIENTS.filter((client) => !client.group)} />
      </section>
    </Shell>
  );
}

/** /mcp/clients/<id>: one tool's setup, then what to ask. */
export function McpClientGuide({ client }: { client: McpClient }) {
  const url = useServerUrl();
  const index = MCP_CLIENTS.findIndex((item) => item.id === client.id);
  const prev = MCP_CLIENTS[index - 1];
  const next = MCP_CLIENTS[index + 1];

  return (
    <Shell activeId={client.id} toc={GUIDE_TOC}>
      <Crumbs current={client.name} />
      {/* Title, intro and the facts on the left; the one-click install (Cursor, VS Code) on the right. */}
      <div className="mcd-head">
        <div className="mcd-head-text">
          <h1 className="mcd-title">
            <span className="mcd-title-icon" style={{ color: client.color }}>
              <McpIcon id={client.icon} size={30} />
            </span>
            {client.name}
          </h1>
          <p className="mcd-intro">{client.intro}</p>
          {/* What you need before you start, at a glance. */}
          <ul className="mcd-meta">
            <li>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" />
              </svg>
              Needs a Motvin account
            </li>
            <li>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
              </svg>
              About a minute
            </li>
            <li>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="5" y="11" width="14" height="9" rx="2" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
              </svg>
              No API key
            </li>
          </ul>
        </div>
        <div className="mcd-head-action">
          {/* Terminal guides need no button: the command and its copy button are right in the steps. */}
          {client.group === 'terminal' ? null : client.install ? <InstallButton client={client} kind={client.install} url={url} /> : <QuickCopyButton client={client} url={url} />}
        </div>
      </div>

      <h2 className="mcd-h2" id="setup">
        Setup
      </h2>
      <ol className="mcd-steps">
        {client.steps.map((step, i) => (
          <li key={i}>
            <p>{rich(step.text, url)}</p>
            {step.sub ? (
              <ul>
                {step.sub.map((line) => (
                  <li key={line}>{rich(line, url)}</li>
                ))}
              </ul>
            ) : null}
            {step.code ? <CodeBlock code={step.code.replaceAll('{url}', url)} /> : null}
          </li>
        ))}
      </ol>

      {client.note ? (
        <div className="mcd-note" role="note">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 11v5M12 8h.01" />
          </svg>
          <p>{rich(client.note, url)}</p>
        </div>
      ) : null}

      <h2 className="mcd-h2" id="usage">
        Usage
      </h2>
      <p className="mcd-p">Once connected, ask {client.id === 'other' ? 'your tool' : client.name} things like:</p>
      <ul className="mcd-prompts">
        {USAGE_PROMPTS.map((prompt) => (
          <li key={prompt}>
            <span className="mcd-prompt-mark" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z" />
              </svg>
            </span>
            <span className="mcd-prompt-text">{prompt}</span>
            <CopyButton value={prompt} className="mcd-prompt-copy" label="Copy prompt" icon />
          </li>
        ))}
      </ul>

      <h2 className="mcd-h2" id="remove">
        Disconnect or remove
      </h2>
      <ol className="mcd-steps">
        <li>
          <p>
            To cut {client.id === 'other' ? 'your tool' : client.name} off right away, open <Link href={INSPIRATIONS_ROUTES.settingsTools}>Settings → AI tools</Link> on motvin.com and click{' '}
            <b>Disconnect</b>. It will ask you to sign in again the next time you use it.
          </p>
        </li>
        <li>
          <p>{rich(client.remove.text, url)}</p>
          {client.remove.code ? <CodeBlock code={client.remove.code.replaceAll('{url}', url)} /> : null}
        </li>
      </ol>

      <h2 className="mcd-h2" id="help">
        Troubleshooting
      </h2>
      {/* One row per question, divided by hairlines; the answer opens on click. */}
      <div className="mcd-faq">
        {TROUBLESHOOTING.map((item) => (
          <details key={item.q}>
            <summary>
              {item.q}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </summary>
            <p>{rich(item.a, url)}</p>
          </details>
        ))}
      </div>
      <p className="mcd-help">
        Still stuck?{' '}
        <a href={COMMUNITY_URL} target="_blank" rel="noopener noreferrer">
          Ask in the community
        </a>
      </p>

      <nav className="mcd-pager" aria-label="More guides">
        {prev ? (
          <Link href={`/mcp/clients/${prev.id}`} className="mcd-pager-link">
            <span>Previous</span>
            <b>{prev.name}</b>
          </Link>
        ) : (
          <Link href="/mcp/clients" className="mcd-pager-link">
            <span>Previous</span>
            <b>Choose your tool</b>
          </Link>
        )}
        {next ? (
          <Link href={`/mcp/clients/${next.id}`} className="mcd-pager-link is-next">
            <span>Next</span>
            <b>{next.name}</b>
          </Link>
        ) : null}
      </nav>
    </Shell>
  );
}
