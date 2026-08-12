// GET /api/assistant-actions/artifacts/[artifactId] — download a generated
// report file.
//
// THE ENTIRE SECURITY ARGUMENT FOR THIS ROUTE IS THAT IT CANNOT DO ANYTHING
// ELSE. It performs one operation: a Map lookup by the id in the URL
// (lib/ai/reports/artifact-store.ts). There is no filesystem access, no path
// construction, no user-supplied filename, and no way to express a path
// traversal in a value that is only ever used as a Map key. §20's "do not
// expose internal server file paths" is satisfied by there being no path.
//
// Unknown and expired ids return the identical 404 with the identical body,
// so a caller cannot use response differences to learn whether an id ever
// existed.
//
// The filename in Content-Disposition was slugged server-side at generation
// time (safeFilename) from the report title — never supplied by the client.

import { getArtifact } from "@/lib/ai/reports/artifact-store";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ artifactId: string }> }
): Promise<Response> {
  const { artifactId } = await params;
  const artifact = getArtifact(artifactId);

  if (!artifact) {
    return Response.json(
      {
        success: false,
        error: "That report file is no longer available. Generate the report again to get a fresh download.",
      },
      { status: 404 }
    );
  }

  // Copied into a fresh ArrayBuffer: the stored Uint8Array is retained for
  // other downloads of the same artifact, and handing its backing buffer
  // straight to the response body risks it being detached/transferred.
  const body = artifact.bytes.slice().buffer as ArrayBuffer;

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": artifact.contentType,
      "Content-Length": String(artifact.bytes.byteLength),
      "Content-Disposition": `attachment; filename="${artifact.filename}"`,
      // Artifacts are per-generation and short-lived; a cached copy in a
      // shared proxy would outlive the server-side entry it names.
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
