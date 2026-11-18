'use client';

import { useEffect, useId, useState, useSyncExternalStore } from 'react';
import { MCP_ICONS, type McpIconId } from '@/lib/mcp/clients';
import { mcpServerUrl } from '@/lib/mcp/oauth';

/** Small pieces shared by the /mcp page and the client guides. */

const PRODUCTION_URL = 'https://api.motvin.com/api/mcp';
const noSubscription = () => () => {};

/**
 * The server address shown and copied: the real one on motvin.com, the local
 * backend while developing. The server renders the real one; the browser
 * corrects it once it knows where it is.
 */
export function useServerUrl(): string {
  return useSyncExternalStore(noSubscription, mcpServerUrl, () => PRODUCTION_URL);
}

const COPY_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="9" width="12" height="12" rx="2.5" />
    <path d="M5 15a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2" />
  </svg>
);

const CHECK_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);

/** `icon` draws a copy glyph (a tick once copied) instead of the word. */
export function CopyButton({
  value,
  label = 'Copy',
  className = '',
  icon = false,
}: {
  value: string;
  label?: string;
  className?: string;
  icon?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);
  return (
    <button
      type="button"
      className={`mcpp-copy${copied ? ' is-copied' : ''}${className ? ` ${className}` : ''}`}
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => setCopied(true));
      }}
      aria-live="polite"
      aria-label={icon ? (copied ? 'Copied' : label) : undefined}
      title={icon ? label : undefined}
    >
      {icon ? (copied ? CHECK_ICON : COPY_ICON) : copied ? 'Copied' : label}
    </button>
  );
}

/** Figma's own five-colour mark (blue, green, coral, red, purple). */
const FIGMA_PARTS = [
  { d: 'M19 28.5a9.5 9.5 0 1 1 19 0 9.5 9.5 0 0 1-19 0z', fill: '#1ABCFE' },
  { d: 'M0 47.5A9.5 9.5 0 0 1 9.5 38H19v9.5a9.5 9.5 0 1 1-19 0z', fill: '#0ACF83' },
  { d: 'M19 0v19h9.5a9.5 9.5 0 1 0 0-19H19z', fill: '#FF7262' },
  { d: 'M0 9.5A9.5 9.5 0 0 0 9.5 19H19V0H9.5A9.5 9.5 0 0 0 0 9.5z', fill: '#F24E1E' },
  { d: 'M0 28.5A9.5 9.5 0 0 0 9.5 38H19V19H9.5A9.5 9.5 0 0 0 0 28.5z', fill: '#A259FF' },
];

/**
 * The Codex cloud, traced from the app icon: eight lobes of slightly
 * different sizes, turned a little so it reads organic rather than a flower.
 */
const CODEX_RADII = [4.7, 5.0, 5.1, 4.9, 5.0, 5.0, 4.8, 4.6];
const CODEX_LOBES = CODEX_RADII.map((r, i) => {
  const angle = ((-70 + i * 45) * Math.PI) / 180;
  return { cx: 12 + 6 * Math.cos(angle), cy: 12.2 + 6 * Math.sin(angle), r };
});

/**
 * Codex's mark: the cloud in a lavender-to-blue gradient with a `>_` prompt
 * cut out of it. `mono` draws the cloud in the current colour instead.
 */
function CodexMark({ size, className, mono }: { size: number; className?: string; mono: boolean }) {
  const uid = useId().replace(/:/g, '');
  const fill = mono ? 'currentColor' : `url(#codex-g-${uid})`;
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id={`codex-g-${uid}`} x1="12" y1="1" x2="12" y2="23" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ABA3F6" />
          <stop offset="0.5" stopColor="#7393FF" />
          <stop offset="1" stopColor="#3B53FF" />
        </linearGradient>
        <mask id={`codex-m-${uid}`}>
          <rect width="24" height="24" fill="#fff" />
          <path d="M6.9 9.3 9.2 12.4 6.9 15.5M12.4 15.5h4.6" fill="none" stroke="#000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </mask>
      </defs>
      <g mask={`url(#codex-m-${uid})`} fill={fill}>
        <circle cx="12" cy="12.2" r="6.6" />
        {CODEX_LOBES.map((lobe, i) => (
          <circle key={i} cx={lobe.cx} cy={lobe.cy} r={lobe.r} />
        ))}
      </g>
    </svg>
  );
}

/**
 * A client's mark, drawn in the current text colour. Figma keeps its own
 * colours unless `mono` asks for a single colour (the quiet sidebar list).
 */
export function McpIcon({ id, size = 24, className, mono = false }: { id: McpIconId; size?: number; className?: string; mono?: boolean }) {
  if (id === 'codex') return <CodexMark size={size} className={className} mono={mono} />;
  if (id === 'figma') {
    return (
      <svg className={className} width={size} height={size} viewBox="-9.5 0 57 57" aria-hidden="true">
        {FIGMA_PARTS.map((part) => (
          <path key={part.fill} d={part.d} fill={mono ? 'currentColor' : part.fill} />
        ))}
      </svg>
    );
  }
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="currentColor" fillRule="evenodd" aria-hidden="true">
      <path d={MCP_ICONS[id]} />
    </svg>
  );
}
