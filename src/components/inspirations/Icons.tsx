import { useId, type SVGProps } from 'react';

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
export const MinusIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M5 12h14" /></svg>
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
export const PlayIcon = (p: IconProps) => (
  <svg {...base(p)} fill="currentColor" stroke="none"><path d="M8 5.5v13l11-6.5z" /></svg>
);
/** Figma node 1183:54088 ("Frame") — the open-flow button's icon on the
 * Flows tab's own flow row (node 1180:53708): an outlined play triangle,
 * not PlayIcon's solid fill. */
export const PlayOutlineIcon = (p: IconProps) => (
  <svg {...base(p)} viewBox="0 0 16 16">
    <path
      strokeWidth={1.2}
      d="M3.3332 3.33373C3.33313 3.09912 3.39497 2.86865 3.51246 2.66559C3.62995 2.46252 3.79894 2.29406 4.00237 2.17719C4.2058 2.06033 4.43646 1.99921 4.67106 2.00001C4.90567 2.0008 5.13591 2.06349 5.33854 2.18173L13.3365 6.84706C13.5384 6.96418 13.7059 7.13223 13.8225 7.3344C13.939 7.53657 14.0005 7.76579 14.0007 7.99915C14.0009 8.23252 13.9398 8.46184 13.8237 8.66422C13.7075 8.86659 13.5402 9.03493 13.3385 9.1524L5.33854 13.8191C5.13591 13.9373 4.90567 14 4.67106 14.0008C4.43646 14.0016 4.2058 13.9405 4.00237 13.8236C3.79894 13.7067 3.62995 13.5383 3.51246 13.3352C3.39497 13.1321 3.33313 12.9017 3.3332 12.6671V3.33373Z"
    />
  </svg>
);
export const PencilIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M4 20h4l10-10-4-4L4 16z" /><path d="m13 7 4 4" /></svg>
);
export const ExpandIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" /></svg>
);
export const AppleIcon = (p: IconProps) => (
  <svg {...base(p)} fill="currentColor" stroke="none">
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M18.7102 19.5C17.8802 20.74 17.0002 21.95 15.6602 21.97C14.3202 22 13.8902 21.18 12.3702 21.18C10.8402 21.18 10.3702 21.95 9.10017 22C7.79017 22.05 6.80017 20.68 5.96017 19.47C4.25017 17 2.94017 12.45 4.70017 9.39C5.57017 7.87 7.13017 6.91 8.82017 6.88C10.1002 6.86 11.3202 7.75 12.1102 7.75C12.8902 7.75 14.3702 6.68 15.9202 6.84C16.5702 6.87 18.3902 7.1 19.5602 8.82C19.4702 8.88 17.3902 10.1 17.4102 12.63C17.4402 15.65 20.0602 16.66 20.0902 16.67C20.0602 16.74 19.6702 18.11 18.7102 19.5ZM13.0002 3.5C13.7302 2.67 14.9402 2.04 15.9402 2C16.0702 3.17 15.6002 4.35 14.9002 5.19C14.2102 6.04 13.0702 6.7 11.9502 6.61C11.8002 5.46 12.3602 4.26 13.0002 3.5Z"
    />
  </svg>
);
export const WebIcon = (p: IconProps) => (
  <svg {...base(p)} fill="currentColor" stroke="none">
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M9.4815 3.35567C7.73495 3.86235 6.1823 4.88152 5.02609 6.28022C3.86989 7.67891 3.16382 9.39218 3 11.1965H7.13081C7.3716 8.4508 8.17095 5.78261 9.48021 3.35438M7.13081 12.8035H3C3.16348 14.6079 3.86924 16.3214 5.02522 17.7203C6.1812 19.1192 7.73371 20.1387 9.48021 20.6456C8.17095 18.2174 7.3716 15.5492 7.13081 12.8035ZM11.5508 20.9889C9.98569 18.5168 9.02614 15.7129 8.74957 12.8035H15.2491C14.9726 15.7129 14.013 18.5168 12.4479 20.9889C12.1491 21.0037 11.8496 21.0037 11.5508 20.9889ZM14.5198 20.6444C16.2661 20.1375 17.8185 19.1182 18.9744 17.7195C20.1304 16.3208 20.8363 14.6077 21 12.8035H16.8692C16.6284 15.5492 15.829 18.2174 14.5198 20.6456M16.8692 11.1978H21C20.8365 9.3934 20.1308 7.67996 18.9748 6.28104C17.8188 4.88211 16.2663 3.86265 14.5198 3.35567C15.829 5.7839 16.6284 8.45209 16.8692 11.1978ZM11.5508 3.01113C11.8501 2.99629 12.1499 2.99629 12.4492 3.01113C14.0139 5.48331 14.973 8.28721 15.2491 11.1965H8.75086C9.03098 8.26922 9.99269 5.46276 11.5508 3.01113Z"
    />
  </svg>
);
/** Android's dome silhouette with its antenna lines and eyes cut out via an
 * SVG mask (luminance masking is the SVG default, so it needs no extra
 * declaration) rather than painted on top — a painted-on background color
 * would only match a plain white host and break on anything else. */
export const AndroidIcon = (p: IconProps) => {
  const { size = 16, ...rest } = p;
  const maskId = useId();
  return (
    <svg
      width={size}
      height={size * (13.7224 / 22.1227)}
      viewBox="0 0 22.1227 13.7224"
      fill="currentColor"
      stroke="none"
      aria-hidden
      {...rest}
    >
      <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="23" height="14">
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M21.0116 12.6113H1.11112C1.61262 7.5578 5.87612 3.6113 11.0611 3.6113C16.2471 3.6113 20.5101 7.5578 21.0116 12.6113Z"
          fill="white"
          stroke="white"
          strokeWidth="2.22222"
          strokeLinejoin="round"
        />
        <path d="M6.06164 4.6113L4.06164 1.1113M15.5616 4.6113L17.5616 1.1113" stroke="white" strokeWidth="2.22222" strokeLinecap="round" strokeLinejoin="round" />
        <path fillRule="evenodd" clipRule="evenodd" d="M6.56164 10.1113C7.11392 10.1113 7.56164 9.66359 7.56164 9.1113C7.56164 8.55902 7.11392 8.1113 6.56164 8.1113C6.00935 8.1113 5.56164 8.55902 5.56164 9.1113C5.56164 9.66359 6.00935 10.1113 6.56164 10.1113Z" fill="black" />
        <path fillRule="evenodd" clipRule="evenodd" d="M15.5616 10.1113C16.1139 10.1113 16.5616 9.66359 16.5616 9.1113C16.5616 8.55902 16.1139 8.1113 15.5616 8.1113C15.0094 8.1113 14.5616 8.55902 14.5616 9.1113C14.5616 9.66359 15.0094 10.1113 15.5616 10.1113Z" fill="black" />
      </mask>
      <g mask={`url(#${maskId})`}>
        <path fillRule="evenodd" clipRule="evenodd" d="M-0.937712 -5.3887H23.0623V18.6113H-0.937712V-5.3887Z" />
      </g>
    </svg>
  );
};
