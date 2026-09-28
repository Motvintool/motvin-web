import { fail, verifyAdmin } from '@/lib/server/adminAuth';
import { clearChat, readChat, writeChat } from '@/lib/server/assistantChat';

/**
 * GET    /api/crawler/assistant/history — the conversation, as last saved.
 * PUT    /api/crawler/assistant/history — save it (`{ messages, pending }`).
 * DELETE /api/crawler/assistant/history — start afresh.
 */
export async function GET(request: Request) {
  if (!(await verifyAdmin(request))) return fail('This account may not administer the library.', 403);
  return Response.json(readChat(), { headers: { 'Cache-Control': 'no-store' } });
}

export async function PUT(request: Request) {
  if (!(await verifyAdmin(request))) return fail('This account may not administer the library.', 403);
  let body: { messages?: unknown[]; pending?: unknown; expecting?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail('The conversation could not be read.', 400);
  }
  if (!Array.isArray(body.messages)) return fail('messages must be a list.', 400);
  return Response.json(writeChat({ messages: body.messages, pending: body.pending ?? null, expecting: body.expecting ?? null }));
}

export async function DELETE(request: Request) {
  if (!(await verifyAdmin(request))) return fail('This account may not administer the library.', 403);
  clearChat();
  return Response.json({ success: true });
}
