import type { Metadata } from 'next';
import { AdminGate } from '@/components/inspirations/admin/AdminGate';
import { AdminView } from '@/components/inspirations/admin/AdminView';

/**
 * /inspirations/admin — uploading and editing the library.
 *
 * The page is reachable by anyone who types the URL; that is deliberate and
 * safe. AdminGate decides what renders, and the backend's AdminGuard decides
 * what can be written, so a visitor who is not the library owner sees a refusal
 * and can do nothing.
 */

export const metadata: Metadata = {
  title: 'Library admin — Motvin Inspirations',
  // Keep the back office out of search results.
  robots: { index: false, follow: false },
};

export default function InspirationsAdminPage() {
  return (
    <AdminGate>
      <AdminView />
    </AdminGate>
  );
}
