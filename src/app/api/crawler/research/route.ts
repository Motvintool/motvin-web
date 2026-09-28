import { fail, verifyAdmin } from '@/lib/server/adminAuth';
import { activeJob, startJob } from '@/lib/server/ingestJobs';

/**
 * POST /api/crawler/research — `{ appId, name? }`: have the AI rewrite an
 * app's flow and screen names from its stored screens. Runs as a job like a
 * video ingest, so the dock shows it and it survives a page change.
 */
export async function POST(request: Request) {
  const admin = await verifyAdmin(request);
  if (!admin) return fail('This account may not administer the library.', 403);
  const running = activeJob();
  if (running) return fail(`A run is already in progress (${running.title}).`, 409);
  let body: { appId?: string; name?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail('The request could not be read.', 400);
  }
  const appId = String(body.appId ?? '').trim();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(appId)) return fail('appId must be a slug.', 400);
  const job = startJob({
    title: `Rewriting ${body.name?.trim() || appId}’s names`,
    sizeBytes: null,
    startedBy: admin.email,
    workDir: null,
    args: ['research', '--app-id', appId],
    mode: 'research',
  });
  return Response.json({ success: true, jobId: job.id, job }, { headers: { 'Cache-Control': 'no-store' } });
}
