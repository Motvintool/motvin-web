import { fail, verifyAdmin } from '@/lib/server/adminAuth';
import { claudeCli } from '@/lib/server/batch';
import { PROTECT_KINDS, controlProtectJob, createProtectJob, listProtectJobs, protectApps, startProtectRunner, type ProtectAction, type ProtectBox, type ProtectKind, type ProtectSettings } from '@/lib/server/protect';

/**
 * /api/crawler/protect — Protect screens (lib/server/protect.ts).
 *
 * GET    ?platform=   every check, the platform's apps (screens, and how many not checked yet), and
 *                     whether the agent can run here.
 * POST   a new check: { settings, appIds }.
 * PATCH  ?id=&action=pause|resume|stop|clear|approve|skip|approve-all|boxes[&screen=]; boxes sends { boxes }.
 */

const PLATFORMS = ['ios', 'webapp', 'web'] as const;
const ACTIONS: ProtectAction[] = ['pause', 'resume', 'stop', 'clear', 'approve', 'skip', 'approve-all', 'boxes'];
const denied = () => fail('This account may not administer the library.', 403);
const platformOf = (value: unknown): ProtectSettings['platform'] => (PLATFORMS.includes(value as ProtectSettings['platform']) ? (value as ProtectSettings['platform']) : 'ios');

export async function GET(request: Request) {
  if (!(await verifyAdmin(request))) return denied();
  startProtectRunner();
  const platform = platformOf(new URL(request.url).searchParams.get('platform'));
  return Response.json({ jobs: listProtectJobs(), apps: protectApps(platform), agent: Boolean(claudeCli()) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const admin = await verifyAdmin(request);
  if (!admin) return denied();
  const body = (await request.json().catch(() => null)) as { settings?: Partial<ProtectSettings>; appIds?: unknown } | null;
  const appIds = Array.isArray(body?.appIds) ? body.appIds.filter((id): id is string => typeof id === 'string' && /^[a-z0-9-]{1,80}$/.test(id)) : [];
  const raw = body?.settings ?? {};
  const kinds = Array.isArray(raw.kinds) ? raw.kinds.filter((k): k is ProtectKind => PROTECT_KINDS.includes(k as ProtectKind)) : [];
  if (!appIds.length) return fail('Pick at least one app.', 400);
  if (!kinds.length) return fail('Pick at least one kind of thing to hide.', 400);
  const settings: ProtectSettings = {
    platform: platformOf(raw.platform),
    kinds,
    mode: raw.mode === 'auto' ? 'auto' : 'review',
    style: raw.style === 'box' ? 'box' : 'blur',
    onlyNew: raw.onlyNew !== false,
  };
  return Response.json({ success: true, job: createProtectJob({ createdBy: admin.email, settings, appIds }) });
}

export async function PATCH(request: Request) {
  if (!(await verifyAdmin(request))) return denied();
  const params = new URL(request.url).searchParams;
  const action = params.get('action') as ProtectAction;
  if (!ACTIONS.includes(action)) return fail('Unknown action.', 400);
  const body = action === 'boxes' ? ((await request.json().catch(() => null)) as { boxes?: ProtectBox[] } | null) : null;
  const job = await controlProtectJob(params.get('id') ?? '', action, params.get('screen') ?? undefined, body?.boxes);
  if (!job) return fail('No such check.', 404);
  return Response.json({ success: true, job });
}
