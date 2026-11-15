import { fail, verifyAdmin } from '@/lib/server/adminAuth';
import type { AdminOp, Expect } from '@/lib/inspirations/admin-chatbot/assistantActions';
import { answerQuestion, type HistoryLine } from '@/lib/server/assistant';

/**
 * POST /api/crawler/assistant — `{ question }` in; newline-delimited JSON out:
 *
 *   {"type":"token","text":"..."}                a piece of a model answer, as written
 *   {"type":"fold"}                              the pieces so far were the assistant working, not answering — move them to its thread
 *   {"type":"step","text":"…","detail":"…"}      one thing the assistant did on the way: a lookup, a check
 *   {"type":"done", text, source, actions, …}    the whole answer — the last line
 *   {"type":"error", message}                    it failed — the last line
 *
 * Questions about runs, timing and the AI are answered from the job list at
 * once (one "done" line); the rest go to the free AI with those facts as
 * context, and its words stream back as it writes them.
 */
export async function POST(request: Request) {
  const admin = await verifyAdmin(request);
  if (!admin) return fail('This account may not administer the library.', 403);
  let body: { question?: string; history?: HistoryLine[]; pending?: string | null; heldImage?: string | null; lastOp?: AdminOp | null; expecting?: Expect | null };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail('The question could not be read.', 400);
  }
  const question = String(body.question ?? '').trim().slice(0, 600);
  if (!question) return fail('Ask something.', 400);
  const authorization = request.headers.get('authorization');
  const encoder = new TextEncoder();
  // Closing the response — the admin pressed Stop — stops the model too,
  // rather than leaving it to finish an answer nobody will read.
  const aborter = new AbortController();
  request.signal.addEventListener('abort', () => aborter.abort(), { once: true });
  const stream = new ReadableStream<Uint8Array>({
    cancel() {
      aborter.abort();
    },
    start(controller) {
      let closed = false;
      const send = (event: object) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          closed = true;
        }
      };
      const history = Array.isArray(body.history)
        ? body.history.filter((line) => line && (line.role === 'user' || line.role === 'assistant') && typeof line.text === 'string').slice(-6).map((line) => ({ role: line.role, text: line.text.slice(0, 400) }))
        : [];
      const pending = typeof body.pending === 'string' ? body.pending.slice(0, 120) : null;
      const heldImage = typeof body.heldImage === 'string' ? body.heldImage.slice(0, 120) : null;
      const lastOp = body.lastOp && typeof body.lastOp === 'object' && typeof body.lastOp.kind === 'string' ? body.lastOp : null;
      const expecting = body.expecting && typeof body.expecting === 'object' && body.expecting.kind === 'update-app' && typeof body.expecting.appId === 'string' ? body.expecting : null;
      answerQuestion({ question, authorization, history, pending, heldImage, lastOp, expecting, signal: aborter.signal }, (piece, control) => send(!control ? { type: 'token', text: piece } : control.kind === 'fold' ? { type: 'fold' } : { type: 'step', text: control.text, detail: control.detail }))
        .then((answer) => send({ type: 'done', ...answer }))
        .catch((error: Error) => send({ type: 'error', message: error.message }))
        .finally(() => {
          try {
            controller.close();
          } catch {
            // Already gone.
          }
        });
    },
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' },
  });
}
