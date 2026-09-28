import { fail, verifyAdmin } from '@/lib/server/adminAuth';
import { dismissJob, getJob, stopJob } from '@/lib/server/ingestJobs';

/**
 * GET    /api/crawler/jobs/:id — one run.
 * DELETE /api/crawler/jobs/:id — take a finished run off the list. The
 *        screens it published stay where they are; only the card goes.
 *        With ?stop=1, end a running job instead.
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
  // ?stop=1 ends a running job; otherwise a finished one is taken off the list.
  if (new URL(request.url).searchParams.get('stop') === '1') {
    if (!stopJob(id)) return fail('That run is not running.', 409);
    return Response.json({ success: true, stopped: true });
  }
  if (!dismissJob(id)) return fail('No such run.', 404);
  return Response.json({ success: true });
}
