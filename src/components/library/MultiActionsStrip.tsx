'use client';

import { useEffect, useRef, useState } from 'react';
import type { LibraryItem } from '@/lib/api/normalize';
import type { CategoryConfig } from '@/lib/config/categories';
import {
  BULK_COPY_FORMATS,
  formatSvg,
  joinFormatted,
  type BulkCopyFormat,
} from '@/lib/export/formats';
import { downloadFiles, dataUrlToBytes, type ZipFile } from '@/lib/export/zip';
import {
  editorFromGlobals,
  exportSvgFor,
  toPngDataUrl,
} from '@/lib/render/editor';
import { combineSvgs } from '@/lib/render/flatten';
import { useRequireLogin } from './useRequireLogin';

/**
 * Bulk-selection strip — port of motvin-ui/COMPONENT/Multi Actions Strip.js.
 *
 * Appears once anything is selected. Copy and Download are split buttons: the
 * main half acts with the current format, the chevron opens the format menu.
 *
 * Downloads go through the ZIP writer, which drops to a plain file when only
 * one item is selected rather than handing over a one-entry archive.
 */

type Props = {
  config: CategoryConfig;
  items: LibraryItem[];
  selectedIds: ReadonlySet<string>;
  totalResults: number;
  query: string;
  globals: { size: number; stroke: number; color: string };
  onToggleAll: () => void;
  onClear: () => void;
  onSaveSelection: () => void;
  onToast: (message: string) => void;
};

export function MultiActionsStrip({
  config,
  items,
  selectedIds,
  totalResults,
  query,
  globals,
  onToggleAll,
  onClear,
  onSaveSelection,
  onToast,
}: Props) {
  const [copyFormat, setCopyFormat] = useState<BulkCopyFormat>('svg');
  const [downloadFormat, setDownloadFormat] = useState<'svg' | 'png'>('svg');
  const [openMenu, setOpenMenu] = useState<'copy' | 'download' | 'more' | null>(null);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const requireLogin = useRequireLogin();

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpenMenu(null);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  const selected = items.filter((item) => selectedIds.has(item.id));
  if (selected.length === 0) return null;

  const allOnPageSelected = items.length > 0 && items.every((i) => selectedIds.has(i.id));
  const toggleLabel = allOnPageSelected ? 'Clear selection' : 'Select all visible icons';

  const svgFor = (item: LibraryItem): Promise<string> =>
    exportSvgFor(item, editorFromGlobals(item, globals), config.slug);

  const handleCopy = async () => {
    // Mirrors motvin-icons.js:1677 — bulk copy requires sign-in.
    if (!requireLogin()) return;
    // Reference note (bulk-export.js:12): concatenated <svg> roots are not a
    // valid SVG document, so Figma / Illustrator / a saved .svg keep the first
    // root and drop the rest. Merge them into one document instead.
    const rendered = await Promise.all(
      selected.map(async (item) => ({ name: item.name, svg: await svgFor(item) })),
    );
    const payload =
      copyFormat === 'svg'
        ? combineSvgs(rendered)
        : joinFormatted(
            rendered.map(({ svg }, i) => formatSvg(svg, copyFormat, selected[i])),
            copyFormat,
          );
    try {
      await navigator.clipboard.writeText(payload);
      onToast(`${selected.length} copied`);
    } catch {
      onToast('Copy failed — clipboard unavailable');
    }
    setOpenMenu(null);
  };

  const handleDownload = async () => {
    // Mirrors motvin-icons.js:1720 — bulk download requires sign-in.
    if (!requireLogin()) return;
    setBusy(true);
    setOpenMenu(null);
    try {
      let files: ZipFile[];
      if (downloadFormat === 'png') {
        files = await Promise.all(
          selected.map(async (item) => ({
            name: `${item.name}.png`,
            data: dataUrlToBytes(await toPngDataUrl(await svgFor(item), 512)),
            type: 'image/png',
          })),
        );
      } else {
        files = await Promise.all(
          selected.map(async (item) => ({
            name: `${item.name}.svg`,
            data: await svgFor(item),
            type: 'image/svg+xml' as const,
          })),
        );
      }

      const written = downloadFiles(files, `motvin-${config.nounPlural}.zip`);
      // Match reference message shape (motvin-icons.js:1766-1770 / 1788-1790)
      // so `/downloaded/i` in Toast routes this through the stack toast.
      // Defer the toast a beat so the browser can paint the download UI
      // first — otherwise React re-renders and the toast animates in
      // before the download indicator, making it look like the toast
      // fires before the download starts.
      const kind = downloadFormat.toUpperCase();
      const message =
        written === 1 ? `${kind} downloaded` : `Downloaded ${written} ${kind}s as a ZIP`;
      window.setTimeout(() => onToast(message), 150);
    } catch {
      onToast('Download failed');
    } finally {
      setBusy(false);
    }
  };

  const menu = (which: 'copy' | 'download' | 'more', children: React.ReactNode) => (
    <div
      className={`mi-category-menu mi-bulk-${which}-menu${openMenu === which ? ' is-open' : ''}`}
      role="menu"
    >
      <div className="mi-category-menu-inner">{children}</div>
    </div>
  );

  return (
    <div className="mi-bulk-actions-container" id="bulk-actions-container" ref={rootRef}>
      <div className="mi-bulk-summary">
        <button
          className="mi-bulk-check"
          data-bulk-action="toggle-all"
          type="button"
          title={toggleLabel}
          aria-label={toggleLabel}
          onClick={onToggleAll}
        >
          <span className="mi-bulk-partial" aria-hidden="true" />
        </button>
        <div className="mi-bulk-summary-content">
          <strong>{selected.length} Selected</strong>
          <img src="/ASSET/Icons/bulk-summary-divider.svg" alt="" />
          <span>
            <b>{totalResults.toLocaleString()}</b>{' '}
            {query ? `results for "${query}"` : `${config.nounPlural} found`}
          </span>
        </div>
      </div>

      <div className="mi-bulk-controls">
        <div className="mi-bulk-copy-group">
          <div className="mi-bulk-split-button mi-bulk-copy">
            <button
              className="mi-bulk-copy-main"
              data-bulk-action="copy"
              type="button"
              onClick={handleCopy}
            >
              Copy {BULK_COPY_FORMATS.find((f) => f.value === copyFormat)?.label}
            </button>
            <button
              className="mi-bulk-copy-toggle"
              data-bulk-action="copy-toggle"
              type="button"
              aria-label="Choose copy format"
              aria-expanded={openMenu === 'copy'}
              onClick={() => setOpenMenu(openMenu === 'copy' ? null : 'copy')}
            >
              <img src="/ASSET/Icons/bulk-chevron-white.svg" alt="" />
            </button>
          </div>
          {menu(
            'copy',
            BULK_COPY_FORMATS.map((format) => (
              <button
                key={format.value}
                className={`mi-category-menu-item${copyFormat === format.value ? ' is-active' : ''}`}
                data-copy-format={format.value}
                role="menuitem"
                onClick={() => {
                  setCopyFormat(format.value);
                  setOpenMenu(null);
                }}
              >
                {format.label}
              </button>
            )),
          )}
        </div>

        <div className="mi-bulk-download-group">
          <div className="mi-bulk-split-button mi-bulk-download">
            <button
              className="mi-bulk-download-main"
              data-bulk-action="download"
              type="button"
              disabled={busy}
              onClick={handleDownload}
            >
              {busy ? 'Preparing…' : `Download ${downloadFormat.toUpperCase()}`}
            </button>
            <button
              className="mi-bulk-download-toggle"
              data-bulk-action="download-toggle"
              type="button"
              aria-label="Choose download format"
              aria-expanded={openMenu === 'download'}
              onClick={() => setOpenMenu(openMenu === 'download' ? null : 'download')}
            >
              <img src="/ASSET/Icons/bulk-chevron-black.svg" alt="" />
            </button>
          </div>
          {menu(
            'download',
            (['svg', 'png'] as const).map((format) => (
              <button
                key={format}
                className={`mi-category-menu-item${downloadFormat === format ? ' is-active' : ''}`}
                data-download-format={format}
                role="menuitem"
                onClick={() => {
                  setDownloadFormat(format);
                  setOpenMenu(null);
                }}
              >
                Download {format.toUpperCase()}
              </button>
            )),
          )}
        </div>

        <div className="mi-bulk-more-group">
          <button
            className="mi-bulk-more"
            data-bulk-action="more"
            type="button"
            title="Selection options"
            aria-label="Selection options"
            aria-expanded={openMenu === 'more'}
            onClick={() => setOpenMenu(openMenu === 'more' ? null : 'more')}
          >
            <img src="/ASSET/Icons/bulk-more.svg" alt="" />
          </button>
          {menu(
            'more',
            <>
              <button
                className="mi-category-menu-item"
                data-bulk-more-action="add-to-collection"
                role="menuitem"
                onClick={() => {
                  onSaveSelection();
                  setOpenMenu(null);
                }}
              >
                Save to collection
              </button>
              <button
                className="mi-category-menu-item"
                data-bulk-more-action="clear"
                role="menuitem"
                onClick={() => {
                  onClear();
                  setOpenMenu(null);
                }}
              >
                Clear selection
              </button>
            </>,
          )}
        </div>
      </div>
    </div>
  );
}
