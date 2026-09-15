import type { SVGProps } from 'react';

/**
 * Inline icon set for the Inspirations UI. 1.5px strokes on a 24 grid so
 * they sit quietly next to 13–14px labels. Every icon is decorative by
 * default (aria-hidden); wrap in a labelled button for meaning.
 */

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 16, ...rest }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    ...rest,
  };
}

export const SearchIcon = (p: IconProps) => (
  <svg {...base(p)}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
);
export const BookmarkIcon = ({ filled, ...p }: IconProps & { filled?: boolean }) => (
  <svg {...base(p)} fill={filled ? 'currentColor' : 'none'}><path d="M6 4h12v17l-6-4-6 4z" /></svg>
);
export const PlusIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M12 5v14M5 12h14" /></svg>
);
export const MoreIcon = (p: IconProps) => (
  <svg {...base(p)} fill="currentColor" stroke="none"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
);
export const CloseIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M6 6l12 12M18 6 6 18" /></svg>
);
export const ChevronDownIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="m6 9 6 6 6-6" /></svg>
);
export const ChevronRightIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="m9 6 6 6-6 6" /></svg>
);
export const ChevronLeftIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="m15 6-6 6 6 6" /></svg>
);
export const ArrowLeftIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
);
export const ArrowRightIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);
export const ExternalIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" /></svg>
);
export const SparklesIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM5 18l.7 1.8L7.5 20.5l-1.8.7L5 23l-.7-1.8L2.5 20.5l1.8-.7zM19 15l.6 1.4L21 17l-1.4.6L19 19l-.6-1.4L17 17l1.4-.6z" /></svg>
);
export const LayersIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="m12 3 9 5-9 5-9-5z" /><path d="m3 13 9 5 9-5" /><path d="m3 17.5 9 5 9-5" /></svg>
);
export const CopyIcon = (p: IconProps) => (
  <svg {...base(p)}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></svg>
);
export const DownloadIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M12 4v11M7 11l5 5 5-5M4 20h16" /></svg>
);
export const UploadIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M12 16V5M7 10l5-5 5 5M4 20h16" /></svg>
);
export const CheckIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="m5 12 5 5L20 7" /></svg>
);
export const GridIcon = (p: IconProps) => (
  <svg {...base(p)}><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></svg>
);
export const MenuIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M4 7h16M4 12h16M4 17h16" /></svg>
);
export const SlidersIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>
);
export const FolderIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
);
export const FlowIcon = (p: IconProps) => (
  <svg {...base(p)}><rect x="3" y="4" width="6" height="6" rx="1.5" /><rect x="15" y="14" width="6" height="6" rx="1.5" /><path d="M9 7h4a2 2 0 0 1 2 2v5" /></svg>
);
export const ScanIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M4 12h16" /></svg>
);
export const TrashIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" /></svg>
);
export const CommandIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z" /></svg>
);
export const ImageIcon = (p: IconProps) => (
  <svg {...base(p)}><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="8.5" cy="10" r="1.5" /><path d="m21 15-5-5-9 9" /></svg>
);
export const PencilIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M4 20h4l10-10-4-4L4 16z" /><path d="m13 7 4 4" /></svg>
);
