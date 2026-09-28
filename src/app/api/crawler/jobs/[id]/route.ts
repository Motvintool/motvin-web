import { fail, verifyAdmin } from '@/lib/server/adminAuth';
import { dismissJob, getJob } from '@/lib/server/ingestJobs';

/**
 * GET    /api/crawler/jobs/:id — one run.
 * DELETE /api/crawler/jobs/:id — take a finished run off the list. The
 *        screens it published stay where they are; only the card goes.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await verifyAdmin(request);
  if (!admin) return fail('This account may not administer the library.', 403);
  const { id } = await context.params;
  const job = getJob(id);
  if (!job) return fail('No such run.', 404);
  return Response.json({ job }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await verifyAdmin(request);
  if (!admin) return fail('This account may not administer the library.', 403);
  const { id } = await context.params;
  if (!dismissJob(id)) return fail('No such run.', 404);
  return Response.json({ success: true });
}
