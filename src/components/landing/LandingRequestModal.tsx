'use client';

import { RequestAppModal } from '@/components/inspirations/RequestAppModal';
import '@/styles/inspirations.css';

/**
 * The library's "Request an app" form, for the landing-style pages (landing,
 * About, Updates). Loaded on demand by Navbar, so the Inspirations styles it
 * needs are only fetched once someone opens it. Everything in that stylesheet
 * is scoped to .ins-* classes, so it leaves the landing page's own look alone.
 */
export default function LandingRequestModal({ onClose }: { onClose: () => void }) {
  return <RequestAppModal initialName="" initialPlatform="ios" onClose={onClose} />;
}
