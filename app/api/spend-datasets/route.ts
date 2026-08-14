// GET /api/spend-datasets?datasetId=... — raw platform spend rows for the
// "Spend Analytics Data" branch of Generate Custom Dashboard.
//
// Same route-local raw-row pattern as app/payment-terms/api/master/route.ts,
// and for the same reason: the dashboard generator profiles and charts
// row-level data in the browser, which neither /api/v1/query (grouped
// aggregates, 1,000-row cap) nor /api/v1/datasets (metadata only, rows: [])
// can hand it. Everything served here is the bundled sample extract read
// through getSampleDataset — there is no SAP or warehouse path in this flow.
//
// Rows are stride-sampled down to MAX_ROWS first. A generated dashboard embeds
// its rows in localStorage (lib/generated-dashboard/store.ts) and the largest
// sample table is 50,000 rows, which no browser will store — the store would
// hit its quota and drop dashboards one by one. Stride rather than head-N
// because a head slice of a date-ordered extract truncates the time span, and
// a trend over the first month of a three-year dataset is worse than no trend.

import { NextResponse } from "next/server";
import { findSpendSource } from "@/lib/generated-dashboard/spend-sources";
import { getSampleDataset } from "@/lib/server/sample-data-source";

export const runtime = "nodejs";

/** Kept in step with what localStorage will actually hold once columns are projected away. */
const MAX_ROWS = 4_000;

export interface SpendRowsResponse {
  rows: Record<string, unknown>[];
  /** Rows in the underlying table, before sampling. */
  totalRows: number;
  sampled: boolean;
}

/** Evenly spaced pick of `max` rows, preserving the source order. */
function strideSample<T>(rows: T[], max: number): T[] {
  if (rows.length <= max) return rows;
  const stride = rows.length / max;
  const sampled: T[] = [];
  for (let i = 0; i < max; i++) sampled.push(rows[Math.floor(i * stride)]);
  return sampled;
}

export function GET(request: Request): Response {
  const datasetId = new URL(request.url).searchParams.get("datasetId") ?? "";

  const source = findSpendSource(datasetId);
  if (!source) {
    return NextResponse.json(
      {
        error: datasetId
          ? `"${datasetId}" is not one of the available spend datasets.`
          : "A `datasetId` query parameter is required.",
      },
      { status: 400 }
    );
  }

  const dataset = getSampleDataset(source.id);
  if (!dataset || dataset.rows.length === 0) {
    return NextResponse.json(
      { error: `No spend data is available for ${source.label}.` },
      { status: 404 }
    );
  }

  const totalRows = dataset.rows.length;
  const rows = strideSample(dataset.rows, MAX_ROWS);

  return NextResponse.json({
    rows,
    totalRows,
    sampled: rows.length < totalRows,
  } satisfies SpendRowsResponse);
}
