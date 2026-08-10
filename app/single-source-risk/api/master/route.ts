import { NextResponse } from "next/server";
import { getSampleDataset } from "@/lib/server/sample-data-source";

/**
 * Route-local raw-row endpoint for the Single Source Risk dashboard —
 * see app/payment-terms/api/master/route.ts for why this exists instead of
 * a queryWidgetData()-based loader: fact_po_items's 50,000 rows exceed both
 * the query cap and what IDataProvider.getDatasets() can return.
 */
export const dynamic = "force-static";

export async function GET() {
  const dataset = getSampleDataset("fact_po_items");
  return NextResponse.json({ rows: dataset?.rows ?? [] });
}
