/**
 * The panel's icons. Where motvin.com has the icon, it is the site's own file (SITE above); the rest are
 * drawn here (24×24, stroke = currentColor) in the site's style: solid lines at its weight, with square
 * ends and sharp corners.
 */

import close from './site-icons/close.svg';
import filter from './site-icons/filter.svg';
import history from './site-icons/history.svg';
import menu from './site-icons/menu.svg';
import search from './site-icons/search.svg';
import sun from './site-icons/sun.svg';

/**
 * motvin.com's own icons (copied from motvin-web public/ASSET), used wherever the site has one, so the
 * plugin's icons are the website's: their fixed colours become the text colour, and their clip paths,
 * fixed sizes and faded groups are dropped so they size and tint like the drawn icons below. The site's
 * open-link arrow is not used: it is a solid shape on a smaller grid and stood out beside line icons.
 */
function siteIcon(svg: string): string {
  return svg
    .replace(/<defs>[\s\S]*?<\/defs>/g, '')
    .replace(/\s(?:clip-path|opacity|width|height|style|preserveAspectRatio|overflow)="[^"]*"/g, '')
    .replace(/(stroke|fill)="(?!none)[^"]*"/g, '$1="currentColor"')
    .replace(/stroke="currentColor"(\s+stroke-width="0\.\d+")/g, 'stroke="none"$1')
    .replace('<svg', '<svg width="100%" height="100%"');
}

const SITE = {
  close: siteIcon(close),
  filter: siteIcon(filter),
  history: siteIcon(history),
  menu: siteIcon(menu),
  search: siteIcon(search),
  // The site's sun is drawn finer (1.25) than its other icons; brought to their weight to sit beside them.
  sun: siteIcon(sun).replace(/stroke-width="1\.25"/g, 'stroke-width="1.7"'),
};

const paths = {
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.3 15.3 20 20" /></>,
  chevron: <path d="m6 9 6 6 6-6" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon: <><path d="M19.5 14.6A8 8 0 0 1 9.4 4.5a8 8 0 1 0 10.1 10.1Z" /><path d="M16.5 3.5v3M15 5h3" /></>,
  auto: <><circle cx="12" cy="12" r="8" /><path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor" /></>,
  menu: <path d="M4 7h16M7 12h13M10 17h10" />,
  filter: <path d="M4 6h16M7 12h10M10 18h4" />,
  reset: <><path d="M19.5 12a7.5 7.5 0 0 1-13.4 4.6" /><path d="M6 20v-4h4" /><path d="M4.5 12a7.5 7.5 0 0 1 13.4-4.6" /><path d="M18 4v4h-4" /></>,
  screens: <rect x="7" y="3" width="10" height="18" rx="2.5" />,
  flows: <><rect x="3" y="6" width="6" height="12" rx="1.5" /><rect x="15" y="6" width="6" height="12" rx="1.5" /><path d="M10.5 12h3" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="M5 12l5 5L20 7" />,
  // The classic paste clipboard, in the sharp style: a square board and the clip at its top.
  clipboard: <><path d="M15.5 4.5H19V21H5V4.5h3.5" /><path d="M8.5 3h7v3.5h-7Z" /></>,
  // A hexagon with a centre circle (the shape chosen for Settings), in the sharp style of the rest.
  settings: <><path d="M12 2.5 20.5 7.25v9.5L12 21.5l-8.5-4.75v-9.5Z" /><circle cx="12" cy="12" r="3" /></>,
  history: <><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.5" /><path d="M4 4v4.5h4.5" /><path d="M12 8v4l3 2" /></>,
  external: <><path d="M11 4.5H4.5v15h15V13" /><path d="M14 4.5h5.5V10" /><path d="M19.5 4.5 11 13" /></>,
  login: <><path d="M14 4.5h5.5v15H14" /><path d="M10 8l4 4-4 4" /><path d="M3.5 12H14" /></>,
  logout: <><path d="M14 4.5h5.5v15H14" /><path d="M8.5 8 4.5 12l4 4" /><path d="M4.5 12H15" /></>,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  // Quick actions in the bottom bar.
  // Select several: a box with a pointer at its corner, like selecting in Figma.
  select: <><path d="M3.5 3.5h16v7.5" /><path d="M3.5 3.5v16H11" /><path d="M14 14 21 16.4 18 17.6 16.6 20.8Z" stroke-miterlimit="10" /></>,
  // Shuffle: the crossed arrows, with straight lines and sharp turns instead of curves.
  shuffle: <><path d="M3 17h4.5l9-10H21" /><path d="M3 7h4.5l2.6 2.9" /><path d="M13.9 14.1l2.6 2.9H21" /><path d="m18 4 3 3-3 3" /><path d="m18 14 3 3-3 3" /></>,
  // Match selection: three corners of a frame with a magnifier inside: search based on this frame.
  match: <><path d="M4 9V4h5M15 4h5v5M4 15v5h5" /><circle cx="14" cy="14" r="3.5" /><path d="m16.6 16.6 3.4 3.4" /></>,
  up: <path d="M12 19V5M6 11l6-6 6 6" />,
  play: <path d="M7 4.5v15L19.5 12Z" />,
  grid: <><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></>,
  empty: <><rect x="4" y="3" width="16" height="18" rx="3" /><path d="M9 9h6M9 13h3" /><circle cx="16.5" cy="16.5" r="3.5" fill="none" /><path d="m19 19 2 2" /></>,
};

export type IconName = keyof typeof paths;

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const site = SITE[name as keyof typeof SITE];
  if (site) return <span class="icon site-icon" style={{ width: size, height: size }} aria-hidden="true" dangerouslySetInnerHTML={{ __html: site }} />;
  return (
    <svg class="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}
