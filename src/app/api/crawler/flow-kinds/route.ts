import { fail, verifyAdmin } from '@/lib/server/adminAuth';
import { tagUntaggedFlows } from '@/lib/server/flowKinds';
import { fillScreenGaps } from '@/lib/server/screenGaps';

/**
 * /api/crawler/flow-kinds — POST, after a Manual Upload: gives every flow without a standard kind its kind
 * (lib/server/flowKinds.ts), so the upload's flows join the search's Flows groups; with { screens: true } (the
 * details were typed in, not left to the AI) it also fills any screen left with no UI elements or no type
 * (lib/server/screenGaps.ts). In the background, a few seconds on so the library has picked the upload up.
 * Agent Upload does the same by itself when it finishes an app.
 */
export async function POST(request: Request) {
  if (!(await verifyAdmin(request))) return fail('This account may not administer the library.', 403);
  const body = (await request.json().catch(() => null)) as { screens?: unknown } | null;
  const screens = body?.screens === true;
  setTimeout(() => void tagUntaggedFlows().then(() => (screens ? fillScreenGaps() : undefined)), 5_000);
  return Response.json({ success: true });
}
