// Cloud snapshots — saved dashboard view states in dbo.snapshots.
//
//   GET  /api/v1/snapshots?dashboardId=…&limit=…   newest first
//   POST /api/v1/snapshots                         { name, dashboardId, createdBy?, data }
//
// Unlike /api/v1/query there is no sample fallback: a snapshot's whole point is
// cloud persistence, so without a configured database the routes answer 503 with
// the setup step rather than pretending an in-memory write counts as saved.
//
// Responses:
//   200 { success: true,  data: SnapshotRecord | SnapshotRecord[] }
//   400 { success: false, error }   malformed body, bad limit
//   503 { success: false, error }   no database configured / unreachable
//   500 { success: false, error }   anything else

import {
  createSnapshot,
  listSnapshots,
  SnapshotValidationError,
} from "@/lib/server/snapshots";
import { SqlUnavailableError } from "@/lib/server/sql-client";

export const runtime = "nodejs";

function failure(error: string, status: number): Response {
  return Response.json({ success: false, error }, { status });
}

function fromError(err: unknown): Response {
  if (err instanceof SnapshotValidationError) return failure(err.message, err.status);
  if (err instanceof SqlUnavailableError) return failure(err.message, err.status);
  const message = err instanceof Error ? err.message : "Unexpected snapshot error.";
  console.error("/api/v1/snapshots failed:", message);
  return failure(message, 500);
}

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const dashboardId = url.searchParams.get("dashboardId") ?? undefined;
    const rawLimit = url.searchParams.get("limit");
    let limit: number | undefined;
    if (rawLimit !== null) {
      limit = Number(rawLimit);
      if (!Number.isInteger(limit)) return failure("`limit` must be an integer.", 400);
    }
    const snapshots = await listSnapshots(dashboardId, limit);
    return Response.json({ success: true, data: snapshots });
  } catch (err) {
    return fromError(err);
  }
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return failure("Request body must be valid JSON.", 400);
  }
  try {
    const snapshot = await createSnapshot(body);
    return Response.json({ success: true, data: snapshot }, { status: 201 });
  } catch (err) {
    return fromError(err);
  }
}
