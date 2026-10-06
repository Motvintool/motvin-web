import { fail, verifyAdmin } from '@/lib/server/adminAuth';
import { resumeJob } from '@/lib/server/ingestJobs';
import type { ReviewDecision } from '@/lib/inspirations/admin-chatbot/ingestJobs';

/**
 * POST /api/crawler/jobs/:id/resume — the admin's answer to a run that
 * paused after capture: `{ mode: "automatic" }` or `{ mode: "manual",
 * excluded: [candidateId, …] }`. Finishes the same job, picking up from the
 * staging dir it left behind — see `resumeJob` and `tools/ios-crawler`'s
 * `resume`.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await verifyAdmin(request);
  if (!admin) return fail('This account may not administer the library.', 403);
  const { id } = await context.params;

  let body: { mode?: string; excluded?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail('The decision could not be read.', 400);
  }

  let decision: ReviewDecision;
  if (body.mode === 'manual') {
    const excluded = Array.isArray(body.excluded) ? body.excluded.filter((id): id is string => typeof id === 'string') : [];
    decision = { mode: 'manual', excluded };
  } else if (body.mode === 'automatic') {
    decision = { mode: 'automatic' };
  } else {
    return fail('mode must be "automatic" or "manual".', 400);
  }

  const job = resumeJob(id, decision);
  if (!job) return fail('That run is not waiting for a decision — it may already have been resumed, or finished some other way.', 409);
  return Response.json({ success: true, job }, { headers: { 'Cache-Control': 'no-store' } });
}
