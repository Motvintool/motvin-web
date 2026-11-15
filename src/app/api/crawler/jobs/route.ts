import { fail, verifyAdmin } from '@/lib/server/adminAuth';
import { listJobs } from '@/lib/server/ingestJobs';

/**
 * GET /api/crawler/jobs — every recent run, newest first, with its current
 * stage, message, log tail and result. Polled by the admin dock while a run
 * is in progress, so the same run shows on whichever page is open.
 */
export async function GET(request: Request) {
  const admin = await verifyAdmin(request);
  if (!admin) return fail('This account may not administer the library.', 403);
  return Response.json({ jobs: listJobs() }, { headers: { 'Cache-Control': 'no-store' } });
}
