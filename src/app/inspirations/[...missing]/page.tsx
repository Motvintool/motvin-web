import { notFound } from 'next/navigation';

/**
 * Any address under /inspirations that no route matches: Inspirations' own
 * 404 (../not-found.tsx), inside its shell, rather than the site-wide one.
 */
export default function MissingInspirationsPage() {
  notFound();
}
