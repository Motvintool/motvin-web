import { EmptyState } from '@/components/inspirations/EmptyState';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';

/**
 * Inspirations' own 404, inside its shell (header, search): an app that
 * doesn't exist (`notFound()` in app/[slug]) or any unknown address under
 * /inspirations (the
 * [...missing] catch-all). The playful empty state, so the balls still lead
 * back into the library.
 */
export default function InspirationsNotFound() {
  return (
    <EmptyState
      play
      title="This page doesn't exist"
      description="The link may be mistyped, or the app has moved. Pick one below, or head back to Explore."
      action={{ label: 'Back to Explore', href: INSPIRATIONS_ROUTES.explore }}
    />
  );
}
