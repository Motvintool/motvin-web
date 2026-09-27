'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { memo, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';

import type { App, Screen } from '@/lib/inspirations/types';
import { AppLogo } from './AppLogo';
import { SCREEN_PARAM } from './ScreenPreviewModal';
import { Screenshot } from './Screenshot';
import { useToast } from './Toast';
import { inspirationsApi } from '@/lib/inspirations/api';

/** A plain left-click with no modifier opens the preview modal in place;
 * anything else (middle-click, cmd/ctrl-click, shift-click) is the visitor
 * asking for the real link behaviour (new tab, etc.), so it's left alone. */
function isPlainClick(e: MouseEvent) {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

const NAME_TAGLINE_SEPARATOR = ' — ';

/**
 * Some stored app names carry their tagline inline (e.g. "Bumble — Find new
 * people & chat singles") from whichever pipeline ingested them, rather than
 * in the app's own tagline field. Split on the same em-dash the masthead
 * displays it with, so the card can still show a title and a description
 * separately instead of one long truncated line.
 */
function splitAppName(name: string): { title: string; tagline: string | null } {
  const i = name.indexOf(NAME_TAGLINE_SEPARATOR);
  if (i === -1) return { title: name, tagline: null };
  return { title: name.slice(0, i), tagline: name.slice(i + NAME_TAGLINE_SEPARATOR.length) };
}

/**
 * One gallery cell, matching Figma's "List Item" component: the screenshot
 * inset on a tinted mat, and a logo + app-name + tagline row below.
 *
 * Hovering reveals prev/next controls that cycle through other screens from
 * the same app without leaving the grid — the image, its link and the dots
 * all track whichever screen is currently shown, then reset to the card's
 * own screen on mouse leave. The sibling list itself is fetched lazily on
 * hover intent, not up front, so a large grid doesn't fetch data for cards
 * nobody looks at closely.
 */
function ScreenCardImpl({
  screen,
  app,
  showApp = true,
  showMeta = true,
  selectable = false,
  selected = false,
  onToggleSelect,
  index,
  textHighlights,
  onRemove,
}: {
  screen: Screen;
  app?: App;
  showApp?: boolean;
  showMeta?: boolean;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  index?: number;
  textHighlights?: Array<{ left: number; top: number; width: number; height: number }>;
  onRemove?: () => void;
}) {
  const shownScreen = screen;
  const { show: showToast } = useToast();
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const src = inspirationsApi.mediaUrl(shownScreen.url);
      if (!src) throw new Error('No source');
      const response = await fetch(src);
      const blob = await response.blob();
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard.write) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      } else {
        showToast('Copying not supported');
      }
    } catch (error) {
      console.error('Failed to copy', error);
      showToast('Failed to copy');
    }
  };

  const handleSave = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!selected) {
      onToggleSelect?.();
    }
  };

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  /** Adds `?screen=<id>` to the current URL (see SCREEN_PARAM in
   * ScreenPreviewModal.tsx), so the preview is linkable, Back closes it, and
   * the grid and its filters underneath survive. Used as both the card's
   * real `href` (a modifier-clicked or middle-clicked card opens it in a new
   * tab, still landing on the same overlay) and, for a plain click,
   * `openPreview` pushes it in place without a full navigation. */
  const href = (() => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set(SCREEN_PARAM, shownScreen.id);
    return `${pathname}?${sp.toString()}`;
  })();
  const openPreview = () => {
    router.push(href, { scroll: false });
  };

  const { title: appTitle, tagline: derivedTagline } = app ? splitAppName(app.name) : { title: '', tagline: null };
  const appDescription = app?.tagline || derivedTagline;

  return (
    <article className={`ins-card ${selected ? 'is-selected' : ''}`} data-id={screen.id} role="listitem">
      <div className="ins-card-shot">
        {selectable && (
          <button
            type="button"
            className={`ins-card-select-ring ${selected ? 'is-selected' : ''}`}
            aria-label={selected ? `Deselect ${screen.name}` : `Select ${screen.name}`}
            aria-pressed={selected}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onToggleSelect?.();
            }}
          >
            {selected && <span className="ins-card-select-check" aria-hidden />}
          </button>
        )}
        {onRemove && (
          <button
            type="button"
            className="ins-card-remove-btn"
            aria-label={`Remove ${screen.name}`}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onRemove();
            }}
          >
            <img src="/ASSET/Icons/Motvin/colletion-delete.svg" alt="" width={16} height={16} />
          </button>
        )}
        <div className="ins-card-inset">
          <Link
            href={href}
            className="ins-card-link"
            aria-label={`${shownScreen.name}${app ? ` — ${app.name}` : ''}`}
            prefetch={index !== undefined && index < 10 ? undefined : false}
            onClick={(e) => {
              if (!isPlainClick(e)) return;
              e.preventDefault();
              openPreview();
            }}
          >
            <Screenshot screen={shownScreen} />
            {shownScreen.id === screen.id && textHighlights?.map((highlight, index) => (
              <span
                key={`${highlight.left}-${highlight.top}-${index}`}
                className="ins-card-text-highlight"
                aria-hidden
                style={{ left: `${highlight.left}%`, top: `${highlight.top}%`, width: `${highlight.width}%`, height: `${highlight.height}%` }}
              />
            ))}
          </Link>
        </div>
        <div className="ins-card-hover-footer">
          {app && (
            <div className="ins-card-hover-app">
              <AppLogo app={app} size={48} className="ins-card-hover-logo" />
              <div className="ins-card-hover-app-text">
                <p className="ins-card-hover-title">{appTitle}</p>
                {appDescription && <p className="ins-card-hover-tagline">{appDescription}</p>}
              </div>
            </div>
          )}
          <div className="ins-card-hover-actions">
            <button type="button" className="ins-btn-save" onClick={handleSave}>{selected ? 'Saved' : 'Save'}</button>
            <button type="button" className="ins-btn-copy" onClick={handleCopy}>Copy</button>
          </div>
        </div>
      </div>
      {showMeta && (
        <div className="ins-card-meta">
          {showApp && app ? (
            <>
              <AppLogo app={app} size={48} className="ins-card-logo" />
              <div className="ins-card-meta-text">
                <Link href={INSPIRATIONS_ROUTES.app(app)} className="ins-card-app">{appTitle}</Link>
                {appDescription && <p className="ins-card-tagline">{appDescription}</p>}
              </div>
            </>
          ) : (
            <Link
              href={href}
              className="ins-card-name"
              onClick={(e) => {
                if (!isPlainClick(e)) return;
                e.preventDefault();
                openPreview();
              }}
            >
              {shownScreen.name}
            </Link>
          )}
        </div>
      )}
      {copied && typeof document !== 'undefined' && createPortal(
        <div className="ins-float-collection" role="status" aria-live="polite">
          <div className="ins-float-collection-success">
            <span className="ins-float-collection-success-check" aria-hidden>
              <span />
            </span>
            Copied as png
          </div>
        </div>,
        document.body
      )}
    </article>
  );
}

export const ScreenCard = memo(ScreenCardImpl);
