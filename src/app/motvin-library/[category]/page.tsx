import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/config/share';
import { notFound } from 'next/navigation';
import { getCategoryConfig, isCategory } from '@/lib/config/categories';
import { LibraryView } from '@/components/library/LibraryView';
import { loadInitialLibrary } from '@/lib/api/initialLibrary';
import '@/styles/theme.css';
import '@/styles/global.css';
import '@/styles/library.css';
import '@/styles/bulk-strip.css';
import '@/styles/skeleton-loader.css';
import '@/styles/tooltip.css';
import '@/styles/profile-menu.css';
import '@/styles/mobile-menu.css';
import '@/styles/buddy-guide.css';
import '@/styles/library-buddy.css';

/**
 * One dynamic route for the three library pages, mounted at /motvin-library:
 *
 *   /motvin-library/icons          → LibraryView with CATEGORY_CONFIG.icons
 *   /motvin-library/logos          → LibraryView with CATEGORY_CONFIG.logos
 *   /motvin-library/illustrations  → LibraryView with CATEGORY_CONFIG.illustrations
 *
 * The static site shipped these as three near-duplicate pages (icons.html,
 * logos.html, illustrations.html); the React port collapses them into one
 * route driven by CategoryConfig. Anything genuinely per-category lives in
 * the config rather than the components.
 */

export function generateStaticParams() {
  return [
    { category: 'icons' },
    { category: 'logos' },
    { category: 'illustrations' },
  ];
}

export async function generateMetadata({
  params,
}: PageProps<'/motvin-library/[category]'>): Promise<Metadata> {
  const { category } = await params;
  if (!isCategory(category)) return {};
  const config = getCategoryConfig(category);
  // Served at the short address (/icons), which next.config.ts rewrites to this folder.
  return pageMetadata(config.title, config.description, `/${category}`);
}

export default async function CategoryPage({
  params,
  searchParams,
}: PageProps<'/motvin-library/[category]'>) {
  const { category } = await params;
  if (!isCategory(category)) notFound();
  const config = getCategoryConfig(category);
  // The first page and the filter counts ride in the HTML, so cards show the
  // moment the page does instead of after its JavaScript has loaded. Reading
  // the query string makes this render per request; null falls back to the
  // browser loading as before. See lib/api/initialLibrary.ts.
  const initial = await loadInitialLibrary(category, await searchParams);
  return <LibraryView config={config} initial={initial} />;
}
