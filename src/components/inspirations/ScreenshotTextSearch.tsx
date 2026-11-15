'use client';

import { useEffect, useRef, useState } from 'react';
import { CloseIcon, SearchIcon } from './Icons';

/**
 * "Search text in screenshot": an icon that opens a small search box. Typing applies the text after a short
 * pause (`onApply`), closing it (×, Esc) drops it. Shared by the search page and the Screens / UI Elements
 * toolbar, the same control an app page has.
 *
 * `applied` is the text currently in force (from the URL); `prefill` is what the box starts with when opened.
 */
export function ScreenshotTextSearch({
  applied,
  prefill = '',
  onApply,
}: {
  applied: string;
  prefill?: string;
  onApply: (text: string | undefined) => void;
}) {
  const [open, setOpen] = useState(Boolean(applied));
  const [value, setValue] = useState(applied || prefill);
  // Cleared from elsewhere ("Clear all"): close the box too.
  const [seen, setSeen] = useState(applied);
  if (seen !== applied) {
    setSeen(applied);
    if (!applied) setOpen(false);
  }

  const onApplyRef = useRef(onApply);
  useEffect(() => {
    onApplyRef.current = onApply;
  });
  useEffect(() => {
    if (!open) return;
    const next = value.trim();
    if (next === applied) return;
    const timer = setTimeout(() => onApplyRef.current(next || undefined), 400);
    return () => clearTimeout(timer);
  }, [open, value, applied]);

  const close = () => {
    setOpen(false);
    onApply(undefined);
  };

  if (!open) {
    return (
      <button
        type="button"
        className="ins-text-search-trigger"
        aria-label="Search text in screenshots"
        title="Search text in screenshots"
        onClick={() => {
          setValue(applied || prefill);
          setOpen(true);
        }}
      >
        <img alt="" width={20} height={20} src="/ASSET/Icons/Motvin/text-in-screenshot.svg" />
      </button>
    );
  }

  return (
    <div className="ins-text-search">
      <SearchIcon size={16} />
      <input
        type="text"
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search text in screenshot..."
        aria-label="Search text in screenshot"
        onKeyDown={(e) => {
          if (e.key === 'Escape') close();
        }}
      />
      <button type="button" className="ins-text-search-close" aria-label="Close text search" onClick={close}>
        <CloseIcon size={12} />
      </button>
    </div>
  );
}
