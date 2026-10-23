import { fail, verifyAdmin } from '@/lib/server/adminAuth';
import { activeJob, startJob } from '@/lib/server/ingestJobs';

/**
 * POST /api/crawler/sync-folders — `{ appId, platform, version, name? }`: put
 * one version's files in the folders its flow tree names, after the admin
 * renamed or moved a flow. Runs as a job like the others, so it shows in the
 * dock and never overlaps a recording being read.
 */
export async function POST(request: Request) {
  const admin = await verifyAdmin(request);
  if (!admin) return fail('This account may not administer the library.', 403);
  const running = activeJob();
  if (running) return fail(`A run is already in progress (${running.title}).`, 409);
  let body: { appId?: string; platform?: string; version?: string; name?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail('The request could not be read.', 400);
  }
  const appId = String(body.appId ?? '').trim();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(appId)) return fail('appId must be a slug.', 400);
  const platform = String(body.platform ?? 'ios').trim();
  if (!['ios', 'webapp', 'web'].includes(platform)) return fail('platform must be ios, webapp or web.', 400);
  const version = String(body.version ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(version)) return fail('version must be a date, YYYY-MM-DD.', 400);
  const job = startJob({
    title: `Lining up ${body.name?.trim() || appId}’s folders`,
    sizeBytes: null,
    startedBy: admin.email,
    workDir: null,
    args: ['sync-folders', '--app-id', appId, '--platform', platform, '--version', version],
    mode: 'research',
  });
  return Response.json({ success: true, jobId: job.id, job }, { headers: { 'Cache-Control': 'no-store' } });
}
