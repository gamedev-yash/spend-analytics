import { NextResponse } from "next/server";
import { getSampleDataset } from "@/lib/server/sample-data-source";

/**
 * Route-local raw-row endpoint for the Payment Terms dashboard, mirroring
 * app/supplier-fragmentation/api/master/route.ts.
 *
 * Every widget lib/page-data/*-from-provider.ts loader elsewhere issues
 * grouped queryWidgetData() calls, because those pages work off supplier/
 * category/month aggregates. This page's client-side model (selectors.ts)
 * instead filters a flat per-invoice row list — fact_payments's full 45,000
 * rows — which queryWidgetData()'s 1,000-row cap (and IDataProvider.
 * getDatasets(), which always reports rows: [] for a server-backed dataset;
 * see AzureSqlAdapter.getDatasets()) has no way to return. A dedicated route
 * that reads the same sample dataset server-side and ships it whole sidesteps
 * both caps, the same way Supplier Fragmentation's route already does.
 */
export const dynamic = "force-static";

export async function GET() {
  const dataset = getSampleDataset("fact_payments");
  return NextResponse.json({ rows: dataset?.rows ?? [] });
}
