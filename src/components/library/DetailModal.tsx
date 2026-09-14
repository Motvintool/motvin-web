'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { LibraryItem } from '@/lib/api/normalize';
import { categoryHref, type CategoryConfig } from '@/lib/config/categories';
import { renderForCategory } from '@/lib/render';
import {
  COPY_FORMATS,
  COPY_FORMAT_LABELS,
  COPY_FORMAT_SHORT,
  DEFAULT_EDITOR,
  PNG_SIZES,
  currentSvgString,
  editorFromGlobals,
  formatCode,
  renderEditorSvg,
  toDataUrl,
  toPngDataUrl,
  type CopyFormat,
  type EditorState,
} from '@/lib/render/editor';
import { isColorStyle } from '@/lib/render/svg';
import { ModalPortal } from './ModalPortal';

/**
 * Item detail view with the full editor — port of openDetail() in
 * motvin-ui/JS/motvin-icons.js and the markup in COMPONENT/Edit Modal.js.
 *
 * Opens with the grid's current global size, stroke and colour so the preview
 * matches the card that was clicked. Every export path (copy, download, code
 * preview) goes through the flattening step so design tools get one `<svg>`
 * rather than the renderer's nested wrapper chain.
 */

type Props = {
  item: LibraryItem | null;
  config: CategoryConfig;
  globals: { size: number; stroke: number; color: string };
  saved: boolean;
  /**
   * The item pool the Similar rail and Matching grid score against. The parent
   * passes its current results; nothing further is fetched, matching legacy.
   */
  items: readonly LibraryItem[];
  savedIds: ReadonlySet<string>;
  query: string;
  onClose: () => void;
  onToggleSave: (item: LibraryItem) => void;
  onNavigate: (offset: number) => void;
  onToast: (message: string) => void;
  /**
   * Open a different item in this same modal — used by the Similar rail and
   * the Matching grid. The parent decides how to move detail state.
   */
  onOpen?: (item: LibraryItem) => void;
  /** Copy the SVG of a card in the Matching grid. */
  onCopyCard?: (item: LibraryItem) => void;
  /**
   * Both accept a category or a tag string. Clicking a breadcrumb category
   * closes the modal and applies the filter; clicking a tag chip closes the
   * modal and drops the tag into the toolbar's search field. Both are optional
   * because the modal can render without these behaviours wired.
   */
  onCategoryClick?: (category: string) => void;
  onTagClick?: (tag: string) => void;
};

/**
 * localStorage key holding the epoch ms until which the promo banner in the
 * modal stays dismissed. Legacy uses the same key so the choice survives.
 */
const PROMO_HIDDEN_KEY = 'motvin_promo_hidden_until';
const PROMO_HIDE_MS = 2 * 24 * 60 * 60 * 1000;

const COLOR_SWATCHES = [
  '#0F1116',
  '#5C4AE4',
  '#2563EB',
  '#059669',
  '#DC2626',
  '#F59E0B',
  '#4F91EF',
];

/**
 * Background swatches — legacy also carries a "transparent" chip rendered as a
 * checkerboard. `null` here is the transparent option; everything else is a
 * concrete hex the canvas paints behind the artwork.
 */
const BG_SWATCHES: Array<{ value: string; label: string; isChecker?: boolean }> = [
  { value: 'transparent', label: 'Transparent background', isChecker: true },
  { value: '#FFFFFF', label: 'White background' },
  { value: '#F5F5F7', label: 'Light gray background' },
  { value: '#0F1116', label: 'Black background' },
  { value: '#5C4AE4', label: 'Purple background' },
  { value: '#2563EB', label: 'Blue background' },
  { value: '#059669', label: 'Green background' },
];

const SIZE_PRESETS = [16, 20, 24, 32];
const STROKE_PRESETS = [1, 1.5, 1.75, 2];

/**
 * Single-pass syntax highlighter — port of highlightXml/highlightXmlKw/
 * highlightCss/highlightDataUrl at motvin-icons.js:2461-2513, with the same
 * Figma-design colour tokens.
 */
const CODE_COLORS = {
  tag: '#22863a',
  attr: '#6f42c1',
  str: '#032f62',
  kw: '#d73a49',
};

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function span(color: string, text: string): string {
  return `<span style="color:${color}">${text}</span>`;
}

function highlightXml(raw: string): string {
  const escaped = escapeHtml(raw);
  return escaped.replace(
    /(&lt;\/?)([a-zA-Z0-9:_-]+)|([a-zA-Z_:][a-zA-Z0-9:_.-]*)(?==)|("(?:[^"\\]|\\.)*")/g,
    (match, tagPre, tagName, attrName, strVal) => {
      if (tagName) return (tagPre || '') + span(CODE_COLORS.tag, tagName);
      if (attrName) return span(CODE_COLORS.attr, attrName);
      if (strVal) return span(CODE_COLORS.str, strVal);
      return match;
    },
  );
}

function highlightXmlKw(raw: string, keywords: readonly string[]): string {
  let out = highlightXml(raw);
  for (const kw of keywords) {
    out = out.replace(
      new RegExp(`(?<![>"])\\b(${kw})\\b(?![^<]*>)`, 'g'),
      (_m, word: string) => span(CODE_COLORS.kw, word),
    );
  }
  return out;
}

function highlightCss(raw: string): string {
  const escaped = raw.replace(/&/g, '&amp;');
  return escaped.replace(
    /(\.[\w-]+(?=\s*\{))|([\w-]+)(?=\s*:)|(url\([^)]*\)|"[^"]*"|'[^']*'|\d[\d.]*(?:px|%|em|rem|s)?)/g,
    (match, sel, prop, val) => {
      if (sel) return span(CODE_COLORS.attr, sel);
      if (prop) return span(CODE_COLORS.attr, prop);
      if (val) return span(CODE_COLORS.str, val);
      return match;
    },
  );
}

function highlightDataUrl(raw: string): string {
  if (!raw.startsWith('data:')) return raw.replace(/&/g, '&amp;');
  const semi = raw.indexOf(';');
  const prefix = raw.slice(0, 5);
  const mime = raw.slice(5, semi);
  const rest = raw.slice(semi);
  return span(CODE_COLORS.kw, prefix) + span(CODE_COLORS.tag, mime) + rest.replace(/&/g, '&amp;');
}

const JSX_KEYWORDS = ['import', 'export', 'from', 'default', 'const', 'let', 'var', 'return'];
const VUE_KEYWORDS = [...JSX_KEYWORDS, 'setup', 'defineComponent'];

function highlightCode(raw: string, format: CopyFormat): string {
  switch (format) {
    case 'svg':
    case 'html':
      return highlightXml(raw);
    case 'jsx':
      return highlightXmlKw(raw, JSX_KEYWORDS);
    case 'vue':
      return highlightXmlKw(raw, VUE_KEYWORDS);
    case 'css':
      return highlightCss(raw);
    case 'dataurl':
      return highlightDataUrl(raw);
    case 'base64':
      return raw.replace(/&/g, '&amp;');
    default:
      return highlightXml(raw);
  }
}

/**
 * YIQ luminance test — port of the check in motvin-icons.js:2265-2268. Any
 * unrecognised value (currentColor, gradient, empty) is treated as light so
 * the default dark grid stays visible.
 */
function isDarkColor(hex: string): boolean {
  const raw = (hex || '').replace('#', '');
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw;
  if (!/^[0-9a-f]{6}$/i.test(full)) return false;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
}

/**
 * Grid line colour paired to the canvas background — mirrors legacy so the
 * grid stays legible against every swatch:
 *   dark bg  → white lines at 15% alpha
 *   light bg → ink lines at 8% alpha
 * `null` = hide the grid entirely (used for the transparent checkerboard).
 */
function gridColorFor(bg: string): string | null {
  if (bg === 'transparent') return null;
  return isDarkColor(bg) ? 'rgba(255, 255, 255, 0.15)' : 'rgba(15, 17, 22, 0.08)';
}

/** Licence terms the attribution block spells out, as the original did. */
function licenceTerms(license: string) {
  const l = license.toLowerCase();
  let attribution = 'Required';
  let commercial = 'Allowed';

  if (l.includes('cc0') || l === 'free' || l === 'wtfpl') {
    attribution = 'Not required';
  } else if (
    l.includes('mit') ||
    l.includes('isc') ||
    l.includes('apache') ||
    l.includes('ofl') ||
    l.includes('zlib')
  ) {
    attribution = 'Required (in source)';
  }
  if (l.includes('nc') || l.includes('non-commercial') || l.includes('noncommercial')) {
    commercial = 'Not allowed';
  }
  return { attribution, commercial };
}

type SliderProps = {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  presets?: readonly number[];
  presetAttr?: string;
  onChange: (value: number) => void;
};

function EditorSlider({
  id,
  label,
  value,
  min,
  max,
  step = 1,
  presets,
  presetAttr,
  onChange,
}: SliderProps) {
  const percent = ((value - min) / (max - min)) * 100;
  return (
    <div className="mi-new-ctrl" id={`grp-${id}`}>
      <div className="mi-new-ctrl-top">
        <span>{label}</span>
        <span id={`${id}-val`}>{value}</span>
      </div>
      <div className="mi-rp-slider-wrapper">
        <input
          type="range"
          id={`ctrl-${id}`}
          className="mi-rp-slider-invisible"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-label={label}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <div className="mi-rp-slider-container">
          <div className="mi-rp-slider-track">
            <div
              className="mi-rp-slider-fill"
              id={`ctrl-${id}-fill`}
              style={{ width: `${percent}%` }}
            />
          </div>
          <div
            className="mi-rp-slider-thumb"
            id={`ctrl-${id}-thumb`}
            style={{ left: `${percent}%` }}
          />
        </div>
      </div>
      {presets && (
        <div className="mi-new-quick">
          {presets.map((preset) => (
            <button
              key={preset}
              className={value === preset ? 'is-active' : undefined}
              {...(presetAttr ? { [presetAttr]: preset } : {})}
              onClick={() => onChange(preset)}
            >
              {preset}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ColorControl({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="mi-new-ctrl" id={`grp-${id}`}>
      <div className="mi-new-ctrl-top">
        <span>{label}</span>
      </div>
      <div className="mi-new-color-input">
        <input
          type="color"
          id={`ctrl-${id}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <input
          type="text"
          id={`ctrl-${id}-hex`}
          className="mi-new-hex"
          value={value}
          onChange={(e) => {
            const next = e.target.value;
            // Commit only a complete hex so the canvas doesn't flicker through
            // partial values as they're typed.
            if (/^#[0-9a-f]{6}$/i.test(next)) onChange(next);
          }}
        />
      </div>
      <div className="mi-new-swatches">
        {COLOR_SWATCHES.map((swatch) => (
          <button
            key={swatch}
            style={{ background: swatch }}
            data-color={swatch}
            aria-label={swatch}
            onClick={() => onChange(swatch)}
          />
        ))}
      </div>
    </div>
  );
}

export function DetailModal({
  item,
  config,
  globals,
  saved,
  items,
  savedIds,
  query,
  onClose,
  onToggleSave,
  onNavigate,
  onToast,
  onOpen,
  onCopyCard,
  onCategoryClick,
  onTagClick,
}: Props) {
  const [editor, setEditor] = useState<EditorState>(DEFAULT_EDITOR);
  // Reference defaults the grid overlay ON when the modal opens; G toggles it.
  const [showGrid, setShowGrid] = useState(true);
  const [copyFormat, setCopyFormat] = useState<CopyFormat>('svg');
  const [pngSize, setPngSize] = useState<number>(512);
  const [formatMenuOpen, setFormatMenuOpen] = useState(false);
  const [pngMenuOpen, setPngMenuOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [promoHidden, setPromoHidden] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  // Reset the editor whenever a different item opens.
  const itemId = item?.id ?? null;
  const [lastItemId, setLastItemId] = useState<string | null>(null);
  if (itemId !== lastItemId) {
    setLastItemId(itemId);
    setEditor(item ? editorFromGlobals(item, globals) : DEFAULT_EDITOR);
  }

  const patch = useCallback(
    (changes: Partial<EditorState>) => setEditor((prev) => ({ ...prev, ...changes })),
    [],
  );

  useEffect(() => {
    if (!item) return;
    const onKeyDown = (e: KeyboardEvent) => {
      // Modifier keys carry other meanings (undo, save-page, etc.) — pass.
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'ArrowLeft') {
        onNavigate(-1);
        return;
      }
      if (e.key === 'ArrowRight') {
        onNavigate(1);
        return;
      }
      // Single-key shortcuts fire only when nothing text-like has focus.
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const editableTags = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if (editableTags || target?.isContentEditable) return;

      const key = e.key.toLowerCase();
      switch (key) {
        case 'c':
          document.getElementById('btn-copy-svg')?.click();
          break;
        case 'd':
          document.getElementById('btn-download-svg')?.click();
          break;
        case 'p':
          document.getElementById('btn-download-png')?.click();
          break;
        case 's':
          onToggleSave(item);
          break;
        case 'f':
          document.getElementById('similar-row')?.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
          });
          onToast('Similar shown');
          break;
        case 'e':
          setExpanded((on) => !on);
          break;
        case 'g':
          setShowGrid((on) => !on);
          break;
        case 'r':
          setEditor(editorFromGlobals(item, globals));
          onToast('Reset');
          break;
        default:
          if (e.key === '?') setHelpOpen((on) => !on);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [item, onClose, onNavigate, onToggleSave, onToast, globals]);

  // Lock page scroll behind the modal.
  useEffect(() => {
    if (!item) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [item]);

  // Check the promo dismissal window every time the modal opens, not once at
  // module load, so the choice keeps effect for future opens without a reload.
  useEffect(() => {
    if (!item) return;
    try {
      const until = Number(localStorage.getItem(PROMO_HIDDEN_KEY) || '0');
      setPromoHidden(Number.isFinite(until) && Date.now() < until);
    } catch {
      setPromoHidden(false);
    }
  }, [item]);

  // Expand toggles body.mi-full and writes ?icon=<id> into the URL so the
  // page-view is shareable. Both must be undone on collapse or unmount.
  useEffect(() => {
    if (!item) return;
    if (expanded) {
      document.body.classList.add('mi-full');
      const url = new URL(window.location.href);
      url.searchParams.set('icon', item.id);
      window.history.replaceState(null, '', url.toString());
    } else {
      document.body.classList.remove('mi-full');
      const url = new URL(window.location.href);
      if (url.searchParams.has('icon')) {
        url.searchParams.delete('icon');
        window.history.replaceState(null, '', url.toString());
      }
    }
    return () => {
      document.body.classList.remove('mi-full');
    };
  }, [expanded, item]);

  // Different item opens as a fresh page — collapse if it was expanded, and
  // update the URL to the new id if it wasn't.
  useEffect(() => {
    if (!item) {
      setExpanded(false);
      return;
    }
    if (expanded) {
      const url = new URL(window.location.href);
      url.searchParams.set('icon', item.id);
      window.history.replaceState(null, '', url.toString());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only respond to item change
  }, [item?.id]);

  const svgSource = useMemo(
    () => (item ? currentSvgString(item, editor, config.slug) : ''),
    [item, editor, config.slug],
  );

  /**
   * Similar rail — port of renderSimilar() in motvin-icons.js. Scored against
   * the current page's items, not the full library (matches legacy).
   *
   * Scoring: exact name match 100, same category 40, same style 20, +4 per
   * shared tag. Percentage shown per legacy: min(99, 70 + s/3).
   */
  const similar = useMemo(() => {
    if (!item) return [];
    return items
      .filter((candidate) => candidate.id !== item.id)
      .map((candidate) => {
        let score = 0;
        if (candidate.name === item.name) score += 100;
        if (candidate.category === item.category) score += 40;
        if (candidate.style === item.style) score += 20;
        for (const tag of candidate.tags) if (item.tags.includes(tag)) score += 4;
        return { candidate, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map(({ candidate, score }) => ({
        candidate,
        percent: Math.min(99, 70 + Math.round(score / 3)),
      }));
  }, [item, items]);

  /**
   * Matching grid — port of renderMatchingIcons(). Ranks against the current
   * page's items, term-tokenised query (or the item's name when the toolbar
   * has none), top 18.
   */
  const matchingQuery = (query.trim() || item?.name || '').toLowerCase();
  const matching = useMemo(() => {
    if (!item) return [];
    const terms = matchingQuery.split(/[\s_-]+/).filter(Boolean);
    return items
      .filter((candidate) => candidate.id !== item.id)
      .map((candidate) => {
        const name = candidate.name.toLowerCase();
        const tags = (candidate.tags || []).map((tag) => tag.toLowerCase());
        let score = candidate.name === item.name ? 1000 : 0;
        for (const term of terms) {
          if (name === term) score += 500;
          else if (name.startsWith(term)) score += 200;
          else if (name.includes(term)) score += 100;
          if (tags.some((tag) => tag.includes(term))) score += 60;
        }
        if (candidate.category === item.category) score += 40;
        if (candidate.style === item.style) score += 20;
        return { candidate, score };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 18)
      .map(({ candidate }) => candidate);
  }, [item, items, matchingQuery]);

  /** Small-preview SVG for a card in the Similar rail or Matching grid. */
  const previewSvg = useCallback(
    (candidate: LibraryItem, size: number): string =>
      renderForCategory(
        config.slug,
        candidate,
        { size, stroke: 1.75, color: '#0F1116' },
      ),
    [config.slug],
  );

  // The code preview text follows the selected format. Base64 rasterises
  // through canvas, so this is asynchronous; a token guards against a stale
  // async result overwriting a newer one.
  const [codeText, setCodeText] = useState('');
  useEffect(() => {
    if (!item || !svgSource) {
      setCodeText('');
      return;
    }
    let cancelled = false;
    formatCode(svgSource, copyFormat, item.name, pngSize)
      .then((text) => {
        if (!cancelled) setCodeText(text);
      })
      .catch(() => {
        if (!cancelled) setCodeText('');
      });
    return () => {
      cancelled = true;
    };
  }, [svgSource, copyFormat, pngSize, item]);

  const copy = useCallback(
    async (text: string, what: string) => {
      try {
        await navigator.clipboard.writeText(text);
        onToast(`${what} copied`);
      } catch {
        onToast('Copy failed — clipboard unavailable');
      }
    },
    [onToast],
  );

  /**
   * PNG image copy — write an `image/png` ClipboardItem, not text. Falls back
   * to a toast rather than surprising the user with SVG text on the clipboard.
   */
  const copyPng = useCallback(async () => {
    if (!svgSource) return;
    try {
      const dataUrl = await toPngDataUrl(svgSource, pngSize);
      const blob = await (await fetch(dataUrl)).blob();
      // ClipboardItem is Chromium-only for image/png; guard for other engines.
      if (typeof ClipboardItem === 'undefined' || !navigator.clipboard.write) {
        throw new Error('image clipboard unavailable');
      }
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      onToast('PNG copied');
    } catch {
      onToast('Copy PNG failed — try Download PNG');
    }
  }, [svgSource, pngSize, onToast]);

  /** Web Share where available, clipboard-link fallback everywhere else. */
  const share = useCallback(async () => {
    if (!item) return;
    const url = new URL(window.location.href);
    url.searchParams.set('icon', item.id);
    const shareUrl = url.toString();
    const shareData = { title: item.name, url: shareUrl };
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share(shareData);
        return;
      }
      await navigator.clipboard.writeText(shareUrl);
      onToast('Share link copied');
    } catch (err) {
      // The share sheet's cancel throws AbortError — silence that, only
      // surface real failures.
      if ((err as { name?: string }).name === 'AbortError') return;
      onToast('Share failed');
    }
  }, [item, onToast]);

  /** Two-day snooze; the check on open reads the same key. */
  const dismissPromo = useCallback(() => {
    try {
      localStorage.setItem(PROMO_HIDDEN_KEY, String(Date.now() + PROMO_HIDE_MS));
    } catch {
      // Private mode or storage quota — the banner just stays visible.
    }
    setPromoHidden(true);
  }, []);

  const download = useCallback((href: string, filename: string) => {
    const link = document.createElement('a');
    link.href = href;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }, []);

  if (!item) return null;

  const terms = licenceTerms(item.license);
  // The colour and stroke controls do nothing for multi-colour artwork, which
  // keeps its native palette through the render pipeline.
  const recolourable = !isColorStyle(item.style);

  return (
    <ModalPortal>
    <div className="mi-modal is-open" id="detail-modal" role="dialog" aria-modal="true">
      <div
        className="mi-modal-backdrop"
        onClick={onClose}
        // Legacy forwards wheel events on the backdrop into the modal's
        // scroll area so the user can scroll the modal even when the pointer
        // is over the dim area beside it.
        onWheel={(e) => {
          const scrollArea = e.currentTarget.parentElement?.querySelector<HTMLElement>(
            '.mi-new-scroll-area',
          );
          if (scrollArea) {
            e.preventDefault();
            scrollArea.scrollBy({ top: e.deltaY });
          }
        }}
      />

      {/* Reference ships two distinct asset files rather than one rotated
          image; keep parity so the visual weight and cap of the arrows
          match exactly. */}
      <button
        className="mi-detail-nav-btn mi-detail-nav-btn--previous"
        id="btn-detail-previous"
        aria-label={`Previous ${config.noun}`}
        onClick={() => onNavigate(-1)}
      >
        <img src="/ASSET/Icons/previous-arrow.svg" alt="" />
      </button>
      <button
        className="mi-detail-nav-btn mi-detail-nav-btn--next"
        id="btn-detail-next"
        aria-label={`Next ${config.noun}`}
        onClick={() => onNavigate(1)}
      >
        <img src="/ASSET/Icons/next-arrow.svg" alt="" />
      </button>

      {/* Floating close outside the card — legacy adds `.float-close` and uses
          a slightly thinner stroke with round caps. */}
      <button
        className="mi-new-topbtn mi-new-close-btn float-close"
        data-close=""
        aria-label="Close"
        onClick={onClose}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 6L20 20M20 6L6 20" />
        </svg>
      </button>

      {helpOpen && (
        <div
          className="mi-help-popover"
          role="dialog"
          aria-label="Keyboard shortcuts"
          style={{
            position: 'fixed',
            top: 60,
            right: 24,
            zIndex: 1000,
            background: 'var(--surface-page, #fff)',
            color: 'var(--text-primary, #111)',
            border: '1px solid var(--surface-border, #e5e7eb)',
            borderRadius: 12,
            padding: '14px 16px',
            boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
            minWidth: 220,
            font: '13px/1.6 var(--font-inter), sans-serif',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <strong>Shortcuts</strong>
            <button
              type="button"
              aria-label="Close"
              onClick={() => setHelpOpen(false)}
              style={{ background: 'transparent', border: 0, cursor: 'pointer', fontSize: 18, lineHeight: 1 }}
            >
              ×
            </button>
          </div>
          {[
            ['C', 'Copy SVG'],
            ['D', 'Download SVG'],
            ['P', 'Download PNG'],
            ['S', 'Save / Unsave'],
            ['F', 'Find similar'],
            ['E', 'Expand'],
            ['G', 'Toggle grid'],
            ['R', 'Reset'],
            ['←/→', 'Prev / Next'],
            ['Esc', 'Close'],
            ['?', 'This help'],
          ].map(([key, label]) => (
            <div key={key} style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
              <span style={{ opacity: 0.75 }}>{label}</span>
              <kbd
                style={{
                  padding: '1px 6px',
                  border: '1px solid currentColor',
                  borderRadius: 4,
                  opacity: 0.6,
                  fontFamily: 'inherit',
                  fontSize: 12,
                }}
              >
                {key}
              </kbd>
            </div>
          ))}
        </div>
      )}

      <div className="mi-modal-card mi-new-modal">
        <div className="mi-new-topbar">
          <nav className="mi-new-crumbs" id="crumbs" aria-label="Breadcrumb">
            {/* Root crumb — closes modal and lands the user on the plain
                library route. Kept as a real link so cmd/ctrl-click opens
                the URL in a new tab. */}
            <a
              href={categoryHref(config.slug)}
              className="mi-new-crumb"
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey) return;
                e.preventDefault();
                onClose();
              }}
            >
              {config.nounPlural[0].toUpperCase() + config.nounPlural.slice(1)}
            </a>
            <span className="mi-new-crumb-sep">
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                <path
                  d="M2.5 1.5L5.5 4L2.5 6.5"
                  stroke="#6B7280"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            {/* Category crumb — legacy filters results to this category and
                scrolls the grid into view; without a parent callback we render
                the source name as a plain crumb instead. */}
            {item.category && onCategoryClick ? (
              <a
                href="#"
                className="mi-new-crumb"
                id="crumb-category"
                onClick={(e) => {
                  e.preventDefault();
                  onCategoryClick(item.category!);
                }}
              >
                {item.category}
              </a>
            ) : (
              <span className="mi-new-crumb" id="crumb-category">
                {item.sourceName}
              </span>
            )}
            <span className="mi-new-crumb-sep">
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                <path
                  d="M2.5 1.5L5.5 4L2.5 6.5"
                  stroke="#6B7280"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className="mi-new-crumb mi-new-crumb--current" id="crumb-name">
              {item.name}
            </span>
          </nav>
          <div className="mi-new-topbar-actions">
            <button
              className="mi-new-topbtn"
              id="btn-share"
              aria-label="Share"
              onClick={share}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
              </svg>
            </button>
            <button
              className="mi-new-topbtn"
              id="btn-help"
              aria-label="Keyboard shortcuts"
              onClick={() => setHelpOpen((on) => !on)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </button>
            <button
              className="mi-new-topbtn"
              id="btn-expand"
              aria-label={expanded ? 'Collapse' : 'Open as page'}
              aria-pressed={expanded}
              onClick={() => setExpanded((on) => !on)}
            >
              {/* Two icons; only one is visible per state. Legacy toggles them
                  via body.mi-full CSS, but inline styles here are self-contained. */}
              <svg
                className="mi-icon-expand"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ display: expanded ? 'none' : undefined }}
              >
                <polyline points="15 3 21 3 21 9" />
                <polyline points="9 21 3 21 3 15" />
                <line x1="21" y1="3" x2="14" y2="10" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </svg>
              <svg
                className="mi-icon-collapse"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ display: expanded ? undefined : 'none' }}
              >
                <polyline points="4 14 10 14 10 20" />
                <polyline points="20 10 14 10 14 4" />
                <line x1="14" y1="10" x2="21" y2="3" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            </button>
            <button
              className="mi-new-topbtn topbar-close"
              data-close
              aria-label="Close"
              onClick={onClose}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 6L20 20M20 6L6 20" />
              </svg>
            </button>
          </div>
        </div>

        <div className="mi-new-scroll-area">
          <div className="mi-new-body">
            {/* Left: editor controls */}
            <div className="mi-new-left">
              <div className="mi-new-left-content">
                <details className="mi-new-section" open>
                  <summary className="mi-new-section-header mi-new-summary">
                    <svg
                      width="8"
                      height="8"
                      viewBox="0 0 8 8"
                      fill="none"
                      className="mi-new-section-icon"
                    >
                      <path
                        d="M2.5 1.5L5.5 4L2.5 6.5"
                        stroke="#6B7280"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span>Customize</span>
                  </summary>
                  <div className="mi-new-ctrl-group">
                    <EditorSlider
                      id="size"
                      label="Size"
                      value={editor.size}
                      min={12}
                      max={128}
                      presets={SIZE_PRESETS}
                      presetAttr="data-size"
                      onChange={(size) => patch({ size })}
                    />

                    {recolourable && (
                      <EditorSlider
                        id="stroke"
                        label="Stroke"
                        value={editor.stroke}
                        min={0}
                        max={4}
                        step={0.25}
                        presets={STROKE_PRESETS}
                        presetAttr="data-stroke"
                        onChange={(stroke) => patch({ stroke })}
                      />
                    )}

                    {recolourable && (
                      <ColorControl
                        id="color"
                        label="Color"
                        value={editor.color}
                        onChange={(color) => patch({ color })}
                      />
                    )}

                    {recolourable && (
                      <div className="mi-new-ctrl" id="grp-fill-mode">
                        <div className="mi-new-ctrl-top">
                          <span>Fill</span>
                        </div>
                        <div className="mi-new-seg">
                          {(['none', 'solid'] as const).map((mode) => (
                            <button
                              key={mode}
                              className={`mi-new-seg-btn${editor.fillMode === mode ? ' is-active' : ''}`}
                              data-fill={mode}
                              onClick={() => patch({ fillMode: mode })}
                            >
                              {mode === 'none' ? 'None' : 'Solid'}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {recolourable && editor.fillMode === 'solid' && (
                      <ColorControl
                        id="fill-color"
                        label="Fill color"
                        value={editor.fillColor}
                        onChange={(fillColor) => patch({ fillColor })}
                      />
                    )}

                    {/* Background paints the canvas behind the artwork; not
                        part of the export, only the preview surface. */}
                    <div className="mi-new-ctrl" id="grp-bg">
                      <div className="mi-new-ctrl-top">
                        <span>Background</span>
                      </div>
                      <div className="mi-new-color-input">
                        <input
                          type="color"
                          id="ctrl-bg"
                          value={editor.bg === 'transparent' ? '#ffffff' : editor.bg}
                          onChange={(e) => patch({ bg: e.target.value })}
                        />
                        <input
                          type="text"
                          id="ctrl-bg-hex"
                          className="mi-new-hex"
                          value={editor.bg}
                          onChange={(e) => {
                            const next = e.target.value;
                            if (next === 'transparent' || /^#[0-9a-f]{6}$/i.test(next))
                              patch({ bg: next });
                          }}
                        />
                      </div>
                      <div className="mi-new-swatches">
                        {BG_SWATCHES.map((swatch) => (
                          <button
                            key={swatch.value}
                            style={
                              swatch.isChecker
                                ? {
                                    background:
                                      'repeating-conic-gradient(#eee 0% 25%, white 0% 50%) 50% / 12px 12px',
                                    borderColor: '#EAEAEE',
                                  }
                                : { background: swatch.value, borderColor: '#EAEAEE' }
                            }
                            data-bg={swatch.value}
                            aria-label={swatch.label}
                            onClick={() => patch({ bg: swatch.value })}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </details>

                {recolourable && item.style === 'outline' && (
                  <>
                    <div className="mi-new-divider" id="grp-stroke-divider" />

                    <details className="mi-new-section" id="grp-stroke-section" open>
                      <summary className="mi-new-section-header mi-new-summary">
                        <svg
                          width="8"
                          height="8"
                          viewBox="0 0 8 8"
                          fill="none"
                          className="mi-new-section-icon"
                        >
                          <path
                            d="M2.5 1.5L5.5 4L2.5 6.5"
                            stroke="#6B7280"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        <span>Stroke</span>
                      </summary>
                      <div className="mi-new-ctrl-group">
                        <div className="mi-new-ctrl">
                          <div className="mi-new-ctrl-top">
                            <span>Cap</span>
                          </div>
                          <div className="mi-new-seg">
                            {(['round', 'butt', 'square'] as const).map((cap) => (
                              <button
                                key={cap}
                                className={`mi-new-seg-btn${editor.cap === cap ? ' is-active' : ''}`}
                                data-cap={cap}
                                onClick={() => patch({ cap })}
                              >
                                {cap[0].toUpperCase() + cap.slice(1)}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="mi-new-ctrl">
                          <div className="mi-new-ctrl-top">
                            <span>Join</span>
                          </div>
                          <div className="mi-new-seg">
                            {(['round', 'bevel', 'miter'] as const).map((join) => (
                              <button
                                key={join}
                                className={`mi-new-seg-btn${editor.join === join ? ' is-active' : ''}`}
                                data-join={join}
                                onClick={() => patch({ join })}
                              >
                                {join[0].toUpperCase() + join.slice(1)}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="mi-new-ctrl">
                          <div className="mi-new-ctrl-top">
                            <span>Pattern</span>
                          </div>
                          <div className="mi-new-seg">
                            {(['solid', 'dashed', 'dotted'] as const).map((pattern) => (
                              <button
                                key={pattern}
                                className={`mi-new-seg-btn${editor.pattern === pattern ? ' is-active' : ''}`}
                                data-pattern={pattern}
                                onClick={() => patch({ pattern })}
                              >
                                {pattern[0].toUpperCase() + pattern.slice(1)}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </details>
                  </>
                )}

                <div className="mi-new-divider" />

                <details className="mi-new-section">
                  <summary className="mi-new-section-header mi-new-summary">
                    <svg
                      width="8"
                      height="8"
                      viewBox="0 0 8 8"
                      fill="none"
                      className="mi-new-section-icon"
                    >
                      <path
                        d="M2.5 1.5L5.5 4L2.5 6.5"
                        stroke="#6B7280"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span>Transform</span>
                  </summary>
                  <div className="mi-new-ctrl-group">
                    <EditorSlider
                      id="rot"
                      label="Rotation"
                      value={editor.rotation}
                      min={-180}
                      max={180}
                      onChange={(rotation) => patch({ rotation })}
                    />
                    <EditorSlider
                      id="pad"
                      label="Padding"
                      value={editor.padding}
                      min={0}
                      max={24}
                      onChange={(padding) => patch({ padding })}
                    />
                    <div className="mi-new-ctrl">
                      <div className="mi-new-ctrl-top">
                        <span>Flip</span>
                      </div>
                      <div className="mi-new-seg">
                        {(
                          [
                            ['none', 'None'],
                            ['h', 'Horizontal'],
                            ['v', 'Vertical'],
                          ] as const
                        ).map(([value, label]) => (
                          <button
                            key={value}
                            className={`mi-new-seg-btn${editor.flip === value ? ' is-active' : ''}`}
                            onClick={() => patch({ flip: value })}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </details>

                <div className="mi-new-divider" />

                <details className="mi-new-section">
                  <summary className="mi-new-section-header mi-new-summary">
                    <svg
                      width="8"
                      height="8"
                      viewBox="0 0 8 8"
                      fill="none"
                      className="mi-new-section-icon"
                    >
                      <path
                        d="M2.5 1.5L5.5 4L2.5 6.5"
                        stroke="#6B7280"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span>Effects</span>
                  </summary>
                  <div className="mi-new-ctrl-group">
                    <EditorSlider
                      id="opa"
                      label="Opacity"
                      value={editor.opacity}
                      min={0}
                      max={100}
                      onChange={(opacity) => patch({ opacity })}
                    />
                    <EditorSlider
                      id="shd"
                      label="Shadow"
                      value={editor.shadow}
                      min={0}
                      max={20}
                      onChange={(shadow) => patch({ shadow })}
                    />
                  </div>
                </details>

                <div className="mi-new-divider" />

                <details className="mi-new-section">
                  <summary className="mi-new-section-header mi-new-summary">
                    <svg
                      width="8"
                      height="8"
                      viewBox="0 0 8 8"
                      fill="none"
                      className="mi-new-section-icon"
                    >
                      <path
                        d="M2.5 1.5L5.5 4L2.5 6.5"
                        stroke="#6B7280"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span>Background shape</span>
                  </summary>
                  <div className="mi-new-ctrl-group">
                    <div className="mi-new-ctrl">
                      <div className="mi-new-seg">
                        {(
                          [
                            ['none', 'None'],
                            ['circle', 'Circle'],
                            ['rect', 'Square'],
                            ['rounded', 'Rounded'],
                          ] as const
                        ).map(([value, label]) => (
                          <button
                            key={value}
                            className={`mi-new-seg-btn${editor.shape === value ? ' is-active' : ''}`}
                            onClick={() => patch({ shape: value })}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {editor.shape !== 'none' && (
                      <>
                        <ColorControl
                          id="shape-color"
                          label="Shape color"
                          value={editor.shapeColor}
                          onChange={(shapeColor) => patch({ shapeColor })}
                        />
                        <EditorSlider
                          id="icon-inset"
                          label="Inset"
                          value={editor.iconInset}
                          min={0}
                          max={8}
                          onChange={(iconInset) => patch({ iconInset })}
                        />
                        {editor.shape === 'rounded' && (
                          <EditorSlider
                            id="shape-radius"
                            label="Corner radius"
                            value={editor.shapeRadius}
                            min={0}
                            max={12}
                            onChange={(shapeRadius) => patch({ shapeRadius })}
                          />
                        )}
                      </>
                    )}
                  </div>
                </details>

              </div>

              <button
                className="mi-new-reset-btn"
                id="btn-reset"
                onClick={() => setEditor(editorFromGlobals(item, globals))}
              >
                Reset
              </button>
            </div>

            {/* Centre: canvas */}
            <div className="mi-new-center">
              <div
                className="mi-new-canvas-box"
                id="canvas"
                style={{
                  // Transparent shows the checkerboard; anything else paints
                  // the ink under the artwork. Padding pushes the SVG inwards
                  // in the preview box; exports get the same padding baked in
                  // through the render pipeline.
                  background:
                    editor.bg === 'transparent'
                      ? 'repeating-conic-gradient(#eee 0% 25%, #fff 0% 50%) 50% / 24px 24px'
                      : editor.bg,
                  padding: `${editor.padding}px`,
                }}
              >
                {/* Reference always renders the grid overlay; the G shortcut
                    toggles its visibility. Line colour follows the background
                    (dark bg → white lines, light bg → ink lines, transparent
                    → hidden) so the grid stays legible on every swatch. See
                    motvin-icons.js:2242-2272 for the source of these rules. */}
                {(() => {
                  const gridColor = gridColorFor(editor.bg);
                  const gridVisible = showGrid && gridColor !== null;
                  return (
                    <div
                      className="mi-new-canvas-grid"
                      id="canvas-grid"
                      style={
                        {
                          opacity: gridVisible ? 1 : 0,
                          // Consumed by `.mi-new-canvas-grid` background-image
                          // gradients at library.css:5133-5140.
                          ['--canvas-grid-color' as string]: gridColor ?? 'transparent',
                        } as React.CSSProperties
                      }
                    />
                  );
                })()}
                <div
                  className="mi-new-canvas-inner"
                  id="canvas-inner"
                  dangerouslySetInnerHTML={{
                    // Scaled up for the preview; exports use editor.size.
                    __html: renderEditorSvg(item, editor, Math.max(editor.size, 160), config.slug),
                  }}
                />
                {/* Reference ships this button hidden — the grid is toggled
                    only via the keyboard G shortcut (wired in the effect
                    above). Kept in DOM so anything selecting `#btn-toggle-grid`
                    still finds it, but not visible. */}
                <button
                  id="btn-toggle-grid"
                  style={{ display: 'none' }}
                  onClick={() => setShowGrid((on) => !on)}
                  aria-hidden="true"
                  tabIndex={-1}
                />
              </div>

              <div className="mi-new-center-info">
                <div className="mi-new-title-group">
                  <h2 id="detail-name">{item.name}</h2>
                  <div className="mi-new-badges">
                    <span id="detail-source" className="mi-new-badge-primary">
                      {item.sourceName}
                    </span>
                    <span id="detail-license" className="mi-new-badge-secondary">
                      {item.license}
                    </span>
                  </div>
                </div>
                <div className="mi-new-action-group">
                  <button
                    className="mi-new-btn-save-collection"
                    id="btn-save-collection"
                    onClick={() => onToggleSave(item)}
                  >
                    <img
                      src={
                        saved
                          ? '/ASSET/Icons/edit-modal-saved.svg'
                          : '/ASSET/Icons/edit-modal-unsave.svg'
                      }
                      alt=""
                      id="save-collection-icon"
                      data-saved={saved ? 'true' : 'false'}
                    />
                    <span id="save-collection-text">{saved ? 'Saved' : 'Save'}</span>
                  </button>
                  <button className="mi-new-btn" id="btn-find-similar">
                    Find Similar
                  </button>
                </div>
              </div>

              {item.tags.length > 0 && (
                <div className="mi-new-tags" id="tags-row">
                  {item.tags.slice(0, 12).map((tag) =>
                    onTagClick ? (
                      <button
                        key={tag}
                        className="mi-new-tag"
                        type="button"
                        onClick={() => onTagClick(tag)}
                      >
                        {tag}
                      </button>
                    ) : (
                      <span key={tag} className="mi-new-tag">
                        {tag}
                      </span>
                    ),
                  )}
                </div>
              )}

              {/* Similar rail — scored against the current page's items,
                  matching legacy. Clicking a chip opens that item in the same
                  modal (parent handles the state change). */}
              <div className="mi-new-similar-block">
                <h3>Similar {config.nounPlural}</h3>
                <div className="mi-new-similar" id="similar-row">
                  {similar.map(({ candidate, percent }) => (
                    <button
                      key={candidate.id}
                      className="mi-similar-item"
                      type="button"
                      data-id={candidate.id}
                      title={`${candidate.name} — ${candidate.sourceName}`}
                      onClick={() => onOpen?.(candidate)}
                      dangerouslySetInnerHTML={{
                        __html: `${previewSvg(candidate, 24)}<span class="mi-similar-match">${percent}%</span>`,
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Right: promo banner + export + code + attribution */}
            <div className="mi-new-right">
              <div className="mi-new-right-inner">
                {!promoHidden && (
                <section className="mi-new-banner" aria-label="Motvin Icons promotion">
                  <div className="mi-new-banner-img-inner">
                    <img src="/ASSET/svg/motvin-edit-pannel-logo.svg" alt="Motvin Icons" />
                  </div>
                  <div className="mi-new-banner-text">
                    <div className="mi-new-banner-copy">
                      <h4>
                        <span className="mi-new-banner-title-icon">
                          <img src="/ASSET/Icons/global.svg" alt="" />
                        </span>
                        World Largest Free Library
                      </h4>
                      <p>Explore millions of icons to bring every creative idea to life.</p>
                    </div>
                    <button className="mi-new-btn-white" type="button">
                      <img src="/ASSET/Icons/bell.svg" alt="" />
                      <span>Follow for updates</span>
                    </button>
                  </div>
                  <button
                    className="mi-new-banner-close"
                    type="button"
                    aria-label="Dismiss promotion"
                    onClick={dismissPromo}
                  >
                    <img src="/ASSET/Icons/motvin-edit-pannel-promo-close.svg" alt="" />
                  </button>
                </section>
                )}

                <div className="mi-new-export">
                  <h3>Export settings</h3>
                  <div className="mi-new-export-grid">
                    {/* SVG row: green pill "Copy [Format]" + format chevron,
                        gray Download SVG. The green pill label follows the
                        selected format so it always advertises what will
                        actually land on the clipboard. */}
                    <div className="mi-new-export-row">
                      <div className="mi-new-split-btn mi-svg-group">
                        <button
                          className="mi-new-btn-green"
                          id="btn-copy-svg"
                          onClick={() => copy(codeText, COPY_FORMAT_SHORT[copyFormat])}
                        >
                          <span id="svg-fmt-label">Copy {COPY_FORMAT_SHORT[copyFormat]}</span>
                        </button>
                        <button
                          id="btn-svg-format"
                          className="mi-new-btn-green-icon"
                          aria-expanded={formatMenuOpen}
                          onClick={() => setFormatMenuOpen((open) => !open)}
                        >
                          <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path
                              d="M4 6L8 10L12 6"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>
                        <div
                          className={`mi-category-menu${formatMenuOpen ? ' is-open' : ''}`}
                          id="svg-dropdown"
                        >
                          <div className="mi-category-menu-inner">
                            {COPY_FORMATS.map((format) => (
                              <button
                                key={format}
                                className={`mi-category-menu-item${copyFormat === format ? ' is-active' : ''}`}
                                data-fmt={format}
                                onClick={() => {
                                  setCopyFormat(format);
                                  setFormatMenuOpen(false);
                                }}
                              >
                                {COPY_FORMAT_LABELS[format]}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                      <button
                        className="mi-new-btn-gray"
                        id="btn-download-svg"
                        onClick={() => download(toDataUrl(svgSource), `${item.name}.svg`)}
                      >
                        Download SVG
                      </button>
                    </div>

                    {/* PNG row: PNG download button + size chooser, plus the
                        "Copy PNG" button which writes an actual image/png to
                        the clipboard (not text). Size choice applies to both. */}
                    <div className="mi-new-export-row">
                      <div className="mi-new-split-btn">
                        <button
                          className="mi-new-btn-white-border"
                          id="btn-download-png"
                          onClick={async () => {
                            try {
                              const href = await toPngDataUrl(svgSource, pngSize);
                              download(href, `${item.name}-${pngSize}.png`);
                            } catch {
                              onToast('PNG export failed');
                            }
                          }}
                        >
                          PNG
                        </button>
                        <div className="mi-new-btn-white-icon mi-new-select-box mi-png-group">
                          <button
                            id="btn-png-size"
                            className="mi-new-btn-white-border-right"
                            aria-expanded={pngMenuOpen}
                            onClick={() => setPngMenuOpen((open) => !open)}
                          >
                            <span id="png-size-label">{pngSize}px</span>{' '}
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path
                                d="M3 4.5L6 7.5L9 4.5"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </button>
                          <div
                            className={`mi-category-menu${pngMenuOpen ? ' is-open' : ''}`}
                            id="png-dropdown"
                          >
                            <div className="mi-category-menu-inner">
                              {PNG_SIZES.map((size) => (
                                <button
                                  key={size}
                                  className={`mi-category-menu-item${pngSize === size ? ' is-active' : ''}`}
                                  data-png={size}
                                  onClick={() => {
                                    setPngSize(size);
                                    setPngMenuOpen(false);
                                  }}
                                >
                                  {size}px
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="mi-new-select-box mi-copy-group" style={{ flex: 1 }}>
                        <button
                          className="mi-new-btn-white-border"
                          style={{ width: '100%', borderRadius: '10px' }}
                          id="btn-copy-fmt"
                          onClick={copyPng}
                        >
                          <span id="copy-fmt-label">Copy PNG</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mi-new-code">
                  <div className="mi-new-code-header">
                    <span id="code-preview-title">
                      {copyFormat === 'svg' ? 'SVG code' : `${COPY_FORMAT_LABELS[copyFormat]} code`}
                    </span>
                    <button
                      id="btn-copy-code"
                      className="mi-new-copy-mini"
                      onClick={() => copy(codeText, COPY_FORMAT_SHORT[copyFormat])}
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path
                          d="M6 6V4C6 3.44772 6.44772 3 7 3H12C12.5523 3 13 3.44772 13 4V9C13 9.55228 12.5523 10 12 10H10M6 6H4C3.44772 6 3 6.44772 3 7V12C3 12.5523 3.44772 13 4 13H9C9.55228 13 10 12.5523 10 12V10M6 6H10V10"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>{' '}
                      Copy
                    </button>
                  </div>
                  {/* mask-image is the anchor point for the legacy scroll-fade
                      behaviour; ship it inline as `none` so a follow-up hook
                      that toggles it (top / bottom / both) can flip the value
                      without needing to add the property itself.

                      Inner is set via dangerouslySetInnerHTML so the highlighter's
                      <span style="color:…"> markup renders as real DOM. Input
                      is escaped inside each highlight* helper before any spans
                      go in, so this is safe against arbitrary SVG content. */}
                  <pre
                    id="code-preview"
                    className="mi-new-code-pre"
                    style={{ maskImage: 'none', WebkitMaskImage: 'none' }}
                  >
                    <code
                      dangerouslySetInnerHTML={{
                        __html: codeText ? highlightCode(codeText, copyFormat) : '',
                      }}
                    />
                  </pre>
                </div>

                <div className="mi-new-divider" />

                <div className="mi-new-attrib">
                  <h3>License &amp; Attribution</h3>
                  <div className="mi-new-attrib-content">
                    <div className="mi-new-attr-row">
                      <span>Source &amp; License</span>
                      <span className="mi-new-attr-license">
                        <span>
                          <span id="attr-source">{item.sourceName}</span>,
                        </span>{' '}
                        {/* Uses the per-source `licenseUrl` that comes with
                            every item from the API (normalize.ts:99 —
                            item.licenseUrl || collection.licenseUrl). Reference
                            does the same: motvin-icons.js:2011-2013 sets
                            `#attr-license-link.href = sourceObj.licenseUrl`
                            and removes the href entirely when that field is
                            empty. */}
                        <a
                          href={item.licenseUrl || undefined}
                          id="attr-license-link"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <span id="attr-license">{item.license}</span>
                          <img src="/ASSET/Icons/Motvin/license-arrow.svg" alt="" />
                        </a>
                      </span>
                    </div>
                    <div className="mi-new-attr-row">
                      <span>Attribution</span>
                      <span id="attr-attribution">{terms.attribution}</span>
                    </div>
                    <div className="mi-new-attr-row">
                      <span>Commercial Use</span>
                      <span id="attr-commercial">{terms.commercial}</span>
                    </div>
                  </div>
                  <div className="mi-new-attrib-note">
                    <img src="/ASSET/Icons/Motvin/license-note.svg" alt="" />
                    <p>
                      Third-party asset. Copyright and license remain with the original creator.
                      Motvin does not claim ownership of third-party artwork.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Matching grid — top 18 items scored against the current query
              (or the item's name if none). Each card has Copy-SVG and Save
              actions that mirror the main grid's ItemCard behaviour, and the
              card itself opens the item in this modal. */}
          <div className="mi-new-bottom">
            <div className="mi-new-bottom-header">
              <h2 id="matching-icons-title">
                More {config.nounPlural} matching &quot;{matchingQuery}&quot;
              </h2>
            </div>
            <div className="mi-new-bottom-grid" id="matching-icons-grid">
              {matching.map((candidate) => {
                const isSaved = savedIds.has(candidate.id);
                return (
                  <button
                    key={candidate.id}
                    className="mi-card"
                    type="button"
                    data-id={candidate.id}
                    title={`${candidate.name} - ${candidate.sourceName}`}
                    onClick={() => onOpen?.(candidate)}
                  >
                    <span className="mi-card-actions">
                      <span
                        className="mi-card-act"
                        data-act="copy"
                        title="Copy SVG"
                        role="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onCopyCard?.(candidate);
                        }}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="9" y="9" width="13" height="13" rx="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                      </span>
                      <span
                        className={`mi-card-act${isSaved ? ' is-active' : ''}`}
                        data-act="save"
                        title="Save"
                        role="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleSave(candidate);
                        }}
                      >
                        <svg
                          viewBox="0 0 24 24"
                          fill={isSaved ? 'currentColor' : 'none'}
                          stroke="currentColor"
                          strokeWidth="1.75"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                        </svg>
                      </span>
                    </span>
                    <div
                      className="mi-card-preview"
                      dangerouslySetInnerHTML={{
                        __html: previewSvg(candidate, globals.size),
                      }}
                    />
                    <div className="mi-card-name">{candidate.name}</div>
                    <div className="mi-card-source">
                      <span>{candidate.sourceName}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}
