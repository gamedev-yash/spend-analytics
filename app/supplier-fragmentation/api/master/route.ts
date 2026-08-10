import { NextResponse } from "next/server";
import { getSampleDataset } from "@/lib/server/sample-data-source";
import type { MasterPayload, MasterRow } from "../../lib/types";

/**
 * Route-local master-data endpoint for the Supplier Fragmentation dashboard.
 *
 * Serves the denormalised PO-line rows (fact_po_items joined to the vendor /
 * category / plant dimensions — the equivalent of the Python prototype's
 * data_loader.load_master) so the client can run every fragmentation metric
 * in-browser. The HHI math needs supplier-level spend shares per category,
 * which the declarative widget-query seam cannot express — hence raw rows.
 *
 * Reads the same warehouse sample dataset every other core dashboard's
 * provider path reads (lib/server/sample-data-source.ts) rather than the
 * bundled data/sap/*.json this route used before — see metadata-registry.ts
 * for the ten unified tables. The response is still fully static and
 * cacheable; only the source moved.
 */
export const dynamic = "force-static";

export async function GET() {
  const dataset = getSampleDataset("fact_po_items");
  const rows: MasterRow[] = [];
  let dateMin = "";
  let dateMax = "";

  for (const item of dataset?.rows ?? []) {
    const poDate = String(item.po_date ?? "");
    const plantCode = String(item.plant_code ?? "");

    rows.push({
      po: String(item.po_number ?? ""),
      vendor: String(item.vendor_id ?? ""),
      vendorName: String(item.vendor_name ?? item.vendor_id ?? ""),
      parent: item.parent_company_name === null ? null : String(item.parent_company_name),
      active: item.vendor_is_active === 1,
      l1: String(item.category_l1_name ?? "Unknown"),
      l2: String(item.category_l2_name ?? "Unknown"),
      plant: plantCode,
      plantName: String(item.plant_name ?? plantCode),
      date: poDate,
      value: Number(item.net_order_value_inr) || 0,
    });

    if (!dateMin || poDate < dateMin) dateMin = poDate;
    if (!dateMax || poDate > dateMax) dateMax = poDate;
  }

  // fact_po_items already excludes deleted lines (sample-data-source.ts) and
  // spans every plant in dim_plant, so plant options are just its distinct
  // (code, name) pairs — no separate dimension fetch needed.
  const plantOptions = [...new Map(rows.map((row) => [row.plant, row.plantName])).entries()]
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const l1Options = [...new Set(rows.map((row) => row.l1))].sort((a, b) => a.localeCompare(b));

  const payload: MasterPayload = { rows, plantOptions, l1Options, dateMin, dateMax };
  return NextResponse.json(payload);
}
