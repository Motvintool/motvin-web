'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { inspirationsApi } from '@/lib/inspirations/api';
import { pageTypeLabel, PAGE_TYPE_LABEL, sectionTypeLabel, SECTION_TYPE_LABEL, sitePageName } from '@/lib/inspirations/taxonomy';
import type { App, Screen } from '@/lib/inspirations/types';
import { AppLogo } from './AppLogo';
import { FloatCollectionBar } from './FloatCollectionBar';
import { CloseIcon } from './Icons';
import { Screenshot } from './Screenshot';
import { useScreenContextMenu } from './useScreenContextMenu';

/** The screen preview's own address key (SCREEN_PARAM in ScreenPreviewModal.tsx, which imports this file). */
const SCREEN_PARAM = 'screen';
/**
 * Web (sites) on an app page: websites are page based, so instead of Screens / UI Elements / Patterns / Flows
 * the page shows two tabs — Full Page (whole pages, top to bottom) and Sections (the parts cut out of them) —
 * each narrowed from the tab bar's Pages / Sections pill (Landing Page, Pricing Page… / Hero, Pricing, FAQ…). Opening a page
 * shows it in the screen preview, whole, to scroll through; a section opens there as itself, like a screen.
 * Web Apps and iOS never come here.
 */

export type SiteTab = 'full-page' | 'sections';
export const SITE_TABS: { id: SiteTab; label: string }[] = [
  { id: 'full-page', label: 'Full Page' },
  { id: 'sections', label: 'Sections' },
];
/** With `?screen=<page>` (the screen preview): the section to show in that page, scrolled to or opened over it. */
export const SITE_AT_PARAM = 'at';
/** The types picked in the tab bar's Pages / Sections pill, comma-separated. */
export const SITE_TYPE_PARAM = 'type';

export const isSitePage = (s: Screen) => s.site?.kind !== 'section';
export const isSiteSection = (s: Screen) => s.site?.kind === 'section';

const PAGE_ORDER = Object.keys(PAGE_TYPE_LABEL);
const SECTION_ORDER = Object.keys(SECTION_TYPE_LABEL);
const typeOf = (s: Screen, tab: SiteTab) => (tab === 'sections' ? s.site?.sectionType ?? 'content' : s.site?.pageType ?? 'other');
const labelOf = (type: string, tab: SiteTab) => (tab === 'sections' ? sectionTypeLabel(type) : pageTypeLabel(type));
const pathOf = (url: string | null | undefined) => {
  if (!url) return '';
  try {
    // The home page reads as the site's address, any other page as its path.
    const u = new URL(url);
    return u.pathname.replace(/\/+$/, '') || u.host.replace(/^www\./, '');
  } catch {
    return '';
  }
};

/** The screens a tab lists, and its pill's options: every type present, in the vocabulary's order, with counts. */
export function siteTabContent(screens: Screen[], tab: SiteTab) {
  const list = screens.filter(tab === 'sections' ? isSiteSection : isSitePage);
  const order = tab === 'sections' ? SECTION_ORDER : PAGE_ORDER;
  const counts = new Map<string, number>();
  list.forEach((s) => counts.set(typeOf(s, tab), (counts.get(typeOf(s, tab)) ?? 0) + 1));
  const rank = (t: string) => (order.includes(t) ? order.indexOf(t) : order.length);
  const types = [...counts.keys()].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  return { list, types: types.map((t) => ({ type: t, label: labelOf(t, tab), count: counts.get(t) ?? 0 })) };
}

function isPlainClick(event: React.MouseEvent) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

/** The screen preview's address for a card. */
function useViewerHref() {
  const pathname = usePathname();
  const params = useSearchParams();
  return (screen: Screen) => {
    // A page or a section, each opened as itself in the screen preview.
    const sp = new URLSearchParams(params.toString());
    sp.set(SCREEN_PARAM, screen.id);
    sp.delete(SITE_AT_PARAM);
    return `${pathname}?${sp.toString()}`;
  };
}

/**
 * `app`: the one website the cards are of (its own page). `apps`: every website's, for a grid of several — each card
 * then names its website. No `tab`: pages and sections together (a collection), each card drawn as what it is.
 * `onRemoveItem`: a collection's grid — each card has the remove button instead of picking and Save.
 */
export function SiteGrid({ screens, app, apps, tab, empty, onRemoveItem }: { screens: Screen[]; app?: App; apps?: Map<string, App>; tab?: SiteTab; empty: React.ReactNode; onRemoveItem?: (id: string) => void }) {
  const appOf = (screen: Screen) => app ?? apps?.get(screen.appId);
  const hrefFor = useViewerHref();
  // Picked cards, saved to a collection together from the bar below — as on every screen grid.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const selected = screens.filter((s) => selectedIds.has(s.id));
  if (!screens.length) return <>{empty}</>;
  return (
    <>
      <div className="ins-grid ins-site-grid" role="list">
        {screens.map((screen) => {
          const of = appOf(screen);
          const cardTab = tab ?? (isSiteSection(screen) ? 'sections' : 'full-page');
          return of ? <SiteCard key={screen.id} screen={screen} app={of} tab={cardTab} href={hrefFor(screen)} selected={selectedIds.has(screen.id)} onToggleSelect={() => toggle(screen.id)} namesSite={!app} onRemove={onRemoveItem ? () => onRemoveItem(screen.id) : undefined} /> : null;
        })}
      </div>
      {selected.length > 0 && (
        <FloatCollectionBar
          screens={selected}
          screenApp={app}
          apps={app ? undefined : [...new Set(selected.map((s) => appOf(s)).filter((a): a is App => Boolean(a)))]}
          onClose={() => setSelectedIds(new Set())}
          onSaved={() => setSelectedIds(new Set())}
        />
      )}
    </>
  );
}

/**
 * A page or section card: the picture opens the viewer. Like a screen card it has the select circle (pick
 * several, save them together) and, on hover, Save (picks it) and Copy; in a collection, the remove button instead.
 */
function SiteCard({ screen, app, tab, href, selected, onToggleSelect, namesSite = false, onRemove }: { screen: Screen; app: App; tab: SiteTab; href: string; selected: boolean; onToggleSelect: () => void; namesSite?: boolean; onRemove?: () => void }) {
  const router = useRouter();
  const shot = useScreenContextMenu(screen, app, () => `${window.location.origin}${href}`);
  const type = typeOf(screen, tab);
  // A whole page by its own name when it was given one; a section by its type.
  const title = tab === 'sections' ? labelOf(type, tab) : sitePageName(screen.site);
  // A navigation menu says which one it is ("Products menu"); any other section, the page it is on.
  const own = tab !== 'sections'
    ? pathOf(screen.site?.pageUrl)
    : screen.site?.sectionType === 'nav-menu' && screen.site.heading
      ? screen.site.heading
      : `on the ${sitePageName(screen.site)}`;
  // On a grid of several websites, each card says whose it is: "Remote · /pricing".
  const sub = namesSite ? [app.name, own].filter(Boolean).join(' · ') : own;
  // A section sits on the card's light grey, so only a whole page's preview, which fills its card, takes the dark look.
  return (
    <article className={`ins-site-card ins-site-card--${tab} ${selected ? 'is-selected' : ''} ${tab !== 'sections' && screen.style?.includes('dark') ? 'is-dark-shot' : ''}`} data-id={screen.id} role="listitem">
      <div className="ins-site-card-shot" onContextMenu={shot.onContextMenu}>
        {onRemove ? (
          <button
            type="button"
            className="ins-card-remove-btn"
            aria-label={`Remove ${title}, ${app.name}`}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onRemove();
            }}
          >
            <CloseIcon size={14} />
          </button>
        ) : (
          <button
            type="button"
            className={`ins-card-select-ring ${selected ? 'is-selected' : ''}`}
            aria-label={selected ? `Deselect ${title}` : `Select ${title}`}
            aria-pressed={selected}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onToggleSelect();
            }}
          >
            {selected && <span className="ins-card-select-check" aria-hidden />}
          </button>
        )}
        <div className="ins-site-card-inset">
          <Link
            href={href}
            scroll={false}
            className="ins-site-card-link"
            aria-label={`${title}, ${app.name}`}
            onClick={(event) => {
              if (!isPlainClick(event)) return;
              event.preventDefault();
              router.push(href, { scroll: false });
            }}
          >
            <Screenshot screen={screen} sizes="(max-width: 900px) 100vw, 640px" />
          </Link>
        </div>
        {/* On hover: a screen card's own Save (picks it) and Copy (the PNG) over a fade. On a grid of several sites
            every card has it and names the site, logo first, as a screen card names its app on Screens. On a site's own
            page every card is that site's: only a section has it, without the name (a whole page's circle picks it). */}
        {(namesSite || tab === 'sections') && !onRemove && (
          <div className={`ins-card-hover-footer ins-site-card-footer ${namesSite ? 'ins-site-card-footer--named' : ''}`}>
            {namesSite && (
              <div className="ins-card-hover-app">
                <AppLogo app={app} size={48} className="ins-card-hover-logo" />
                <div className="ins-card-hover-app-text">
                  <p className="ins-card-hover-title">{app.name}</p>
                  {app.tagline && <p className="ins-card-hover-tagline">{app.tagline}</p>}
                </div>
              </div>
            )}
            <div className="ins-card-hover-actions">
              <button
                type="button"
                className="ins-btn-save"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  if (!selected) onToggleSelect();
                }}
              >
                {selected ? 'Saved' : 'Save'}
              </button>
              <button type="button" className="ins-btn-copy" onClick={(e) => void shot.copyPng(e)}>Copy</button>
            </div>
          </div>
        )}
      </div>
      {/* On a grid of several sites a card is named on hover (site, logo first), as a screen is on Screens, so it
          has no line under it; a card in a collection (no hover footer there) and every card on a site's own page keep
          their name below. */}
      {!(namesSite && !onRemove) && (
        <div className="ins-site-card-meta">
          <div className="ins-site-card-meta-text">
            <Link href={href} scroll={false} className="ins-site-card-name">{title}</Link>
            {sub && <p className="ins-site-card-tagline">{sub}</p>}
          </div>
        </div>
      )}
      {shot.menu}
    </article>
  );
}

/**
 * A website page in the screen preview, where a screen's picture goes: the whole page at the preview's width,
 * scrolled top to bottom. `focus` (a section id, with a counter so the same one can be shown again) scrolls to
 * that part of the page and outlines it — or, for a navigation menu, lays the open menu over the page's top.
 */
/** Where on a page a click fell: how far down the picture (0–1), and how far down the window. */
export type ZoomAt = { part: number; y: number };

export function SitePageShot({
  page,
  sections,
  focus,
  onContextMenu,
  onZoom,
}: {
  page: Screen;
  sections: Screen[];
  focus: { id: string; n: number } | null;
  onContextMenu?: (e: React.MouseEvent) => void;
  /** A click: the enlarged view of the page — or of the opened menu, when the click is on it. `at` is the clicked
   * spot on the page, so the enlarged page opens there rather than at its top. */
  onZoom?: (shown?: Screen, at?: ZoomAt) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [mark, setMark] = useState<{ id: string; top: number; height: number } | null>(null);
  // An open navigation menu, laid over the top of the page where it opens (it has no place in the page itself).
  const [openMenu, setMenu] = useState<{ page: string; screen: Screen; top: number; left: number; width: number } | null>(null);
  const menu = openMenu && openMenu.page === page.id ? openMenu : null;

  const show = (section: Screen | undefined, smooth: boolean) => {
    const box = scrollRef.current;
    const img = imgRef.current;
    if (!section?.site || !box || !img || !img.clientHeight) return;
    if (section.site.top === null) {
      box.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' });
      setMark(null);
      setMenu({ page: page.id, screen: section, top: img.offsetTop, left: img.offsetLeft, width: img.clientWidth });
      return;
    }
    setMenu(null);
    const top = section.site.top * img.clientHeight + img.offsetTop;
    box.scrollTo({ top: Math.max(0, top - 24), behavior: smooth ? 'smooth' : 'auto' });
    setMark({ id: section.id, top, height: (section.site.height ?? 0) * img.clientHeight });
  };
  useEffect(() => {
    if (!mark) return;
    const t = window.setTimeout(() => setMark(null), 1800);
    return () => window.clearTimeout(t);
  }, [mark]);
  // A new page opens at its top; a section asked for is shown once the picture has its size.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [page.id]);
  useEffect(() => {
    if (focus && imgRef.current?.complete) show(sections.find((s) => s.id === focus.id), focus.n > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.id, focus?.n, page.id]);

  const src = inspirationsApi.mediaUrl(page.url);
  return (
    <div className="ins-site-shot" ref={scrollRef} onContextMenu={onContextMenu}>
      {src && (
        // eslint-disable-next-line @next/next/no-img-element -- the whole page at full size, never resized
        <img
          ref={imgRef}
          key={page.id}
          src={src}
          alt={`${page.name}, whole page`}
          width={page.width}
          height={page.height}
          className="ins-site-shot-img"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            onZoom?.(undefined, { part: (e.clientY - r.top) / r.height, y: e.clientY });
          }}
          onLoad={() => focus && show(sections.find((s) => s.id === focus.id), false)}
        />
      )}
      {mark && <div className="ins-site-viewer-mark" style={{ top: mark.top, height: mark.height }} aria-hidden />}
      {menu && (
        <button
          type="button"
          className="ins-site-viewer-menu"
          style={{ top: menu.top, left: menu.left, width: menu.width }}
          aria-label={`${menu.screen.site?.heading ?? sectionTypeLabel('nav-menu')}: open it enlarged`}
          onClick={() => onZoom?.(menu.screen)}
        >
          <Screenshot screen={menu.screen} />
        </button>
      )}
    </div>
  );
}

/**
 * The preview panel's list of a page's parts, under its "Sections" heading: each part in its own card, styled as
 * the panel's other cards (Screen, Colours, Source…) — its name as the card's title, its picture under it.
 * A click shows that part in the page.
 */
/**
 * What a section is called beside its page: "Products menu" for a navigation menu, else its type — numbered when
 * the page has more than one of that type ("Features 1", "Features 2"), so two never read as the same thing.
 */
export function siteSectionName(s: Screen, all: Screen[]): string {
  const base = (x: Screen) =>
    x.site?.sectionType === 'nav-menu' && x.site.heading ? x.site.heading : sectionTypeLabel(x.site?.sectionType ?? 'content');
  const same = all.filter((x) => x.site?.kind === 'section' && x.site.parentId === s.site?.parentId && base(x) === base(s));
  return same.length > 1 ? `${base(s)} ${same.findIndex((x) => x.id === s.id) + 1}` : base(s);
}

export function SiteSectionsList({ sections, active, onPick }: { sections: Screen[]; active: string | null; onPick: (id: string) => void }) {
  if (!sections.length) return null;
  return (
    <>
      {sections.map((s) => (
        // A block, not a <button>: it stretches to the panel's width exactly as the other cards do.
        <div
          key={s.id}
          role="button"
          tabIndex={0}
          aria-pressed={active === s.id}
          className={`ins-details-group ins-site-section-card ${active === s.id ? 'is-active' : ''}`}
          onClick={() => onPick(s.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onPick(s.id);
            }
          }}
        >
          <span className="ins-details-group-title">
            {siteSectionName(s, sections)}
          </span>
          <Screenshot screen={s} sizes="300px" />
        </div>
      ))}
    </>
  );
}
