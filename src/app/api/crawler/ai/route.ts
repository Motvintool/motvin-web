import type { AiSettingsInput } from '@/lib/inspirations/ingestJobs';
import { fail, verifyAdmin } from '@/lib/server/adminAuth';
import { aiStatus, forgetAiStatus, writeSettings } from '@/lib/server/ai';
import { forgetAgentModel } from '@/lib/server/agent';

/**
 * GET /api/crawler/ai — which free AI the crawler will use and whether it
 * answers right now: provider, model, the models the server lists, and a
 * reason when it cannot be used.
 *
 * PUT /api/crawler/ai — choose another: `{ provider, url, model, key?,
 * enabled }`. Saved beside the crawler, so the terminal uses it too. Returns
 * the standing afterwards, so the page can say at once whether the choice
 * connects.
 */
export async function GET(request: Request) {
  const admin = await verifyAdmin(request);
  if (!admin) return fail('This account may not administer the library.', 403);
  try {
    return Response.json(await aiStatus(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return fail((error as Error).message, 500);
  }
}

export async function PUT(request: Request) {
  const admin = await verifyAdmin(request);
  if (!admin) return fail('This account may not administer the library.', 403);
  let input: AiSettingsInput;
  try {
    input = (await request.json()) as AiSettingsInput;
  } catch {
    return fail('The settings could not be read.', 400);
  }
  if (typeof input.provider !== 'string' || typeof input.url !== 'string' || typeof input.model !== 'string') {
    return fail('provider, url and model are required.', 400);
  }
  if (input.enabled !== false && input.url && !/^https?:\/\//.test(input.url.trim())) return fail('The server URL must start with http:// or https://.', 400);
  try {
    writeSettings(input);
    forgetAiStatus();
    forgetAgentModel();
    return Response.json(await aiStatus(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return fail((error as Error).message, 500);
  }
}
