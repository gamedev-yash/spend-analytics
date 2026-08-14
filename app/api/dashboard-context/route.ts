// POST /api/dashboard-context — register (or refresh) a generated dashboard's
// data with the assistant for this server process.
//
// WHY THIS EXISTS AT ALL, AND WHY IT IS NOT A SECOND CHAT ENDPOINT: a generated
// dashboard is stored in the browser (lib/generated-dashboard/store.ts →
// localStorage), so the server has no way to load one by id. Something has to
// hand it over. This route is that handover and nothing else: no Claude call, no
// prompt, no tools, no conversation memory — it validates a payload and puts it
// in lib/ai/custom-dashboard-registry.ts. Chat and Report Mode keep using
// /api/dashboard-chat and /api/assistant-actions exactly as they do for a
// built-in dashboard.
//
// WHY NOT SEND THE ROWS WITH EVERY MESSAGE: it would put a full dataset on the
// wire per turn for no benefit. Rows are registered once per dashboard per
// process; each chat request then names the dashboard by id. When this process
// has no snapshot (restart, second tab, eviction) the chat/report routes answer
// 409 + needsDashboardSync and the client calls this route and retries — which
// is also why nothing here needs to be durable.
//
// WHAT THIS DOES NOT DO: it does not send rows to Claude. The model only ever
// sees the schema block and the capped result of a query it composed, the same
// as on a built-in dashboard (lib/ai/dashboard-data-context.ts).

import { putCustomDashboard, MAX_SNAPSHOT_ROWS } from "@/lib/ai/custom-dashboard-registry";

export const runtime = "nodejs";

interface RegisterBody {
  dashboard?: unknown;
}

// NOTE ON PERMISSIONS, same as app/api/assistant-actions/route.ts: this
// application has no user, session, or authorization layer of any kind, so there
// is nothing for a route to consult. What that means specifically HERE, stated
// plainly rather than left implicit: a client that knows a dashboard id can
// replace what this process holds under it, and the assistant would then answer
// from those rows. Generated ids are randomUUIDs held in one browser's
// localStorage, so knowing one already implies access to that browser — but this
// is the line an ownership check goes on when auth lands, and it is the reason
// nothing here is durable.
export async function POST(request: Request): Promise<Response> {
  let body: RegisterBody;
  try {
    body = (await request.json()) as RegisterBody;
  } catch {
    return Response.json({ ok: false, error: "Request body must be JSON." }, { status: 400 });
  }

  // Every field is validated inside putCustomDashboard — id shape, row/column
  // bounds, the presence of the plan and profile the metadata block reads —
  // rather than trusted here, because this payload arrives from a client.
  const result = putCustomDashboard(body.dashboard);
  if (!result.ok) {
    return Response.json({ ok: false, error: result.error ?? "That dashboard could not be registered." }, { status: 400 });
  }

  // The version lets the client skip a redundant re-registration on the next
  // message; the row cap is echoed so a client can report the real limit rather
  // than guessing at one.
  return Response.json({ ok: true, version: result.version, maxRows: MAX_SNAPSHOT_ROWS });
}
